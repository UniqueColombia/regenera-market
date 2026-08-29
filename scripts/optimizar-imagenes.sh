#!/usr/bin/env bash
#
# Convierte a WebP lo que haya en tools/img-originales/ y lo deja en public/img/,
# en la carpeta y al ancho que le toca según su nombre.
#
#   bash scripts/optimizar-imagenes.sh
#
# El destino sale del nombre del archivo, no de un argumento: así el encargo de
# docs/IMAGENES.md ("llámala igual que el slug") es lo único que hay que
# respetar al subir la imagen, y no hay una segunda lista que mantener.
#
# Los originales no se versionan (tools/img-originales/ está en .gitignore):
# pesan MB y solo sirven para reencuadrar más adelante. Guárdalos igual.
set -euo pipefail

cd "$(dirname "$0")/.."

# ImageMagick 7 no siempre está en el PATH en esta máquina.
if command -v magick >/dev/null 2>&1; then
  IM="magick"
else
  IM="C:/Program Files/ImageMagick-7.1.2-Q16-HDRI/magick.exe"
fi
if ! "$IM" -version >/dev/null 2>&1; then
  echo "No encuentro ImageMagick. Instálalo o exporta IM= con la ruta." >&2
  exit 1
fi

ORIGENES="tools/img-originales"
if [ ! -d "$ORIGENES" ] || [ -z "$(ls -A "$ORIGENES" 2>/dev/null)" ]; then
  echo "No hay nada en $ORIGENES/. Ver docs/IMAGENES.md."
  exit 0
fi

# Los slugs se leen del catálogo, no de una copia: si mañana entra una oferta
# nueva, el script la reconoce sin que nadie lo edite.
SLUGS="$(sed -n 's/.*slug: "\([^"]*\)".*/\1/p' src/data/listings.ts)"

es_slug_de_oferta() {
  printf '%s\n' "$SLUGS" | grep -qx "$1"
}

# Anchos: ver la tabla de docs/IMAGENES.md. 82 es donde WebP deja de notarse a
# simple vista; por debajo de 75 aparecen artefactos en los degradados.
CALIDAD=82
convertidas=0
ignoradas=0

for origen in "$ORIGENES"/*; do
  [ -f "$origen" ] || continue
  base="$(basename "$origen")"
  nombre="${base%.*}"

  case "$nombre" in
    hero-*)      carpeta="secciones"; ancho=2400 ;;
    vertical-*)  carpeta="secciones"; ancho=1600 ;;
    logo-*|isotipo*|logotipo-*)
                 carpeta="marca";     ancho=1024 ;;
    *)
      if es_slug_de_oferta "$nombre"; then
        carpeta="ofertas"; ancho=1600
      else
        echo "  ?  $base — el nombre no coincide con ningún slug ni prefijo conocido, la salto"
        ignoradas=$((ignoradas + 1))
        continue
      fi
      ;;
  esac

  destino="public/img/$carpeta/$nombre.webp"
  mkdir -p "public/img/$carpeta"

  # El '>' es lo que impide ampliar: si el original ya es más estrecho, se deja
  # como está. Sin él, ImageMagick escala hacia arriba y se ve peor que el
  # original. -strip quita EXIF, que en una foto de IA no aporta y pesa.
  "$IM" "$origen" -resize "${ancho}x>" -strip -quality "$CALIDAD" "$destino"

  peso="$(du -k "$destino" | cut -f1)"
  dim="$("$IM" identify -format '%wx%h' "$destino")"
  echo "  ok $destino  ${dim}  ${peso} KB"
  convertidas=$((convertidas + 1))
done

echo
echo "$convertidas convertidas, $ignoradas ignoradas."
if [ -d public/img ]; then
  echo "Peso total de public/img: $(du -sh public/img | cut -f1)"
fi
