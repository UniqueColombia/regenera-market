#!/bin/bash
# La copia diaria de Seregenera: la base de producción y las fotos.
#
# Corre EN EL SERVIDOR, desde un cron de la cuenta de Hostinger. Lo instala
# `node --env-file=.env scripts/respaldos.mts instalar` en ~/respaldos/, y deja ahí:
#
#   base-AAAA-MM-DD.sql.gz   mariadb-dump completo: tablas, datos, rutinas, triggers y vistas
#   fotos-AAAA-MM-DD.tar.gz  la carpeta de ALMACEN_CARPETA, con las fechas de cada archivo
#
# Las fechas de las fotos importan: son la versión de su URL (`src/lib/almacen-disco.ts`),
# y `tar` las conserva. Se guardan los últimos 14 días. Cómo se restaura, en
# docs/MODO-MYSQL.md («Copias de seguridad»).
#
# La clave de la base no está aquí ni en el cron: se lee del .env donde Hostinger
# guarda las variables de la app, y pasa a mariadb-dump por MYSQL_PWD, que no se
# ve en la lista de procesos.
set -euo pipefail
umask 077

ENV="$HOME/domains/seregenera.com/hbuilds/config/.env"
DIR="$HOME/respaldos"
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

FECHA=$(date -u +%F)
mkdir -p "$DIR"
cd "$DIR"
# Lo que quedó a medias de una corrida que falló.
find "$DIR" -maxdepth 1 -name '*.tmp' -mmin +60 -delete

export MYSQL_PWD
MYSQL_PWD=$(leer MYSQL_PASSWORD)
mariadb-dump --host=127.0.0.1 --user="$(leer MYSQL_USER)" \
  --single-transaction --routines --triggers --hex-blob \
  --default-character-set=utf8mb4 "$(leer MYSQL_DATABASE)" \
  | gzip -9 > "base-$FECHA.sql.gz.tmp"
# mariadb-dump cierra con «-- Dump completed»: sin esa línea, la copia está cortada.
if ! zcat "base-$FECHA.sql.gz.tmp" | tail -n 1 | grep -q "Dump completed"; then
  echo "ERROR: el volcado de la base salió incompleto" >&2
  exit 1
fi
mv "base-$FECHA.sql.gz.tmp" "base-$FECHA.sql.gz"

FOTOS=$(leer ALMACEN_CARPETA)
tar -czf "fotos-$FECHA.tar.gz.tmp" -C "$(dirname "$FOTOS")" "$(basename "$FOTOS")"
mv "fotos-$FECHA.tar.gz.tmp" "fotos-$FECHA.tar.gz"

find "$DIR" -maxdepth 1 \( -name 'base-*.sql.gz' -o -name 'fotos-*.tar.gz' \) -mtime +"$DIAS" -delete

echo "respaldo $FECHA: base $(du -h "base-$FECHA.sql.gz" | cut -f1), fotos $(du -h "fotos-$FECHA.tar.gz" | cut -f1) ($(tar -tzf "fotos-$FECHA.tar.gz" | grep -vc '/$') archivos); copias guardadas: $(ls -1 base-*.sql.gz | wc -l)"
