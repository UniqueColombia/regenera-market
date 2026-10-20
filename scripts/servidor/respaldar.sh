#!/bin/bash
# La copia diaria de Seregenera: la base de producción y las fotos, cifradas.
#
# Corre EN EL SERVIDOR, desde un cron de la cuenta de Hostinger. Lo instala
# `node --env-file=.env scripts/respaldos.mts instalar` en ~/respaldos/, y deja ahí:
#
#   base-AAAA-MM-DD.sql.gz.cms   mariadb-dump completo (tablas, datos, rutinas, triggers y vistas), cifrado
#   fotos-AAAA-MM-DD.tar.gz.cms  la carpeta de ALMACEN_CARPETA, con las fechas de cada archivo, cifrada
#
# Las fechas de las fotos importan: son la versión de su URL (`src/lib/almacen-disco.ts`),
# y `tar` las conserva. Se guardan los últimos 14 días. Cómo se restaura, en
# docs/MODO-MYSQL.md («Copias de seguridad»).
#
# **El cifrado es con llave pública** (CMS de OpenSSL, AES-256 para los datos y
# RSA para la llave de cada archivo). En el servidor solo está el certificado
# (`~/respaldos/respaldos.crt`), que cifra pero no descifra: la llave privada
# vive en el PC y en el gestor de contraseñas. Quien se lleve una copia —del
# servidor, del PC o de donde se guarde fuera— no la puede leer sin esa llave.
# Sin certificado el script se niega: una copia en claro no es un respaldo que
# queramos tener por accidente.
#
# La clave de la base no está aquí ni en el cron: se lee del .env donde Hostinger
# guarda las variables de la app, y pasa a mariadb-dump por MYSQL_PWD, que no se
# ve en la lista de procesos.
set -euo pipefail
umask 077

ENV="$HOME/domains/seregenera.com/hbuilds/config/.env"
DIR="$HOME/respaldos"
CERT="$DIR/respaldos.crt"
DIAS=14

leer() {
  local v
  v=$(grep -E "^$1=" "$ENV" | head -n1 | cut -d= -f2-)
  v=${v%$'\r'}
  # Hostinger guarda entre comillas simples el valor que lleva `$` (la clave de
  # la base) y entre dobles el resto: quitar solo las dobles mandaba la clave
  # con sus comillas, y la base contestaba «Access denied».
  case "$v" in
    \'*\' | \"*\") v=${v:1:${#v}-2} ;;
  esac
  printf '%s' "$v"
}

# Cifra $1 en $2 para el certificado. `-stream`: una sola pasada, sin cargar el
# archivo en memoria (las fotos crecen).
cifrar() {
  openssl cms -encrypt -binary -aes256 -stream -outform DER -in "$1" -out "$2" "$CERT"
}

command -v openssl >/dev/null || { echo "ERROR: no hay openssl en el servidor" >&2; exit 1; }
[ -s "$CERT" ] || { echo "ERROR: falta $CERT; súbelo con «respaldos.mts instalar»" >&2; exit 1; }

FECHA=$(date -u +%F)
mkdir -p "$DIR"
cd "$DIR"
# Los intermedios en claro no sobreviven a una corrida que falla.
trap 'rm -f "$DIR"/*.gz.tmp' EXIT
find "$DIR" -maxdepth 1 -name '*.tmp' -mmin +60 -delete

export MYSQL_PWD
MYSQL_PWD=$(leer MYSQL_PASSWORD)
mariadb-dump --host=127.0.0.1 --user="$(leer MYSQL_USER)" \
  --single-transaction --routines --triggers --hex-blob \
  --default-character-set=utf8mb4 "$(leer MYSQL_DATABASE)" \
  | gzip -9 > "base-$FECHA.sql.gz.tmp"
# mariadb-dump cierra con «-- Dump completed»: sin esa línea, la copia está cortada.
# Se comprueba antes de cifrar, que después ya no se puede leer aquí.
if ! zcat "base-$FECHA.sql.gz.tmp" | tail -n 1 | grep -q "Dump completed"; then
  echo "ERROR: el volcado de la base salió incompleto" >&2
  exit 1
fi
cifrar "base-$FECHA.sql.gz.tmp" "base-$FECHA.sql.gz.cms.tmp"
rm -f "base-$FECHA.sql.gz.tmp"
mv "base-$FECHA.sql.gz.cms.tmp" "base-$FECHA.sql.gz.cms"

FOTOS=$(leer ALMACEN_CARPETA)
tar -czf "fotos-$FECHA.tar.gz.tmp" -C "$(dirname "$FOTOS")" "$(basename "$FOTOS")"
ARCHIVOS=$(tar -tzf "fotos-$FECHA.tar.gz.tmp" | grep -vc '/$' || true)
cifrar "fotos-$FECHA.tar.gz.tmp" "fotos-$FECHA.tar.gz.cms.tmp"
rm -f "fotos-$FECHA.tar.gz.tmp"
mv "fotos-$FECHA.tar.gz.cms.tmp" "fotos-$FECHA.tar.gz.cms"

# También las viejas sin cifrar, de antes de 2026-10-20, que así caducan solas.
find "$DIR" -maxdepth 1 \( -name 'base-*.sql.gz*' -o -name 'fotos-*.tar.gz*' \) -mtime +"$DIAS" -delete

echo "respaldo $FECHA (cifrado): base $(du -h "base-$FECHA.sql.gz.cms" | cut -f1), fotos $(du -h "fotos-$FECHA.tar.gz.cms" | cut -f1) ($ARCHIVOS archivos); copias cifradas guardadas: $(ls -1 base-*.sql.gz.cms | wc -l)"
