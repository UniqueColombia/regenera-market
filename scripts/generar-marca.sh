#!/usr/bin/env bash
#
# Deriva todos los archivos de marca a partir de los SVG de public/img/marca/.
#
#   bash scripts/generar-marca.sh
#
# Nada de lo que produce se edita a mano: si hay que cambiar la marca, se cambia
# el SVG y se vuelve a correr esto. Es la única forma de que el favicon, el
# avatar de LinkedIn y la tarjeta de WhatsApp sigan siendo el mismo logo dentro
# de un año.
#
# Los tamaños y las zonas seguras de cada red están razonados en
# docs/IMAGENES.md; aquí solo se ejecutan.
set -euo pipefail

cd "$(dirname "$0")/.."

if command -v magick >/dev/null 2>&1; then
  IM="magick"
else
  IM="C:/Program Files/ImageMagick-7.1.2-Q16-HDRI/magick.exe"
fi
"$IM" -version >/dev/null 2>&1 || { echo "No encuentro ImageMagick." >&2; exit 1; }

# Fraunces se sirve desde Google Fonts y no está instalada en el sistema, así
# que para lo rasterizado se usa Georgia — el respaldo que ya declara
# globals.css para --font-display. En un banner se nota poco; en el logotipo
# vectorial, que sí lleva Fraunces, no se nota nada.
SERIF="C:/Windows/Fonts/georgiab.ttf"
[ -f "$SERIF" ] || SERIF="Georgia-Bold"

VERDE="#1b5b3d"     # brand-700
VERDE_OSCURO="#0f3221"  # brand-900
CREMA="#faf8f4"     # cream

MARCA="public/img/marca"
REDES="$MARCA/redes"
mkdir -p "$REDES"

# --- Variantes de color del vector -------------------------------------------
# currentColor sirve dentro del sitio, pero un SVG suelto que alguien abre en
# Illustrator o pega en un Word necesita el color escrito.
for base in isotipo isotipo-compacto logotipo-horizontal; do
  sed 's/currentColor/#ffffff/g' "$MARCA/$base.svg" > "$MARCA/$base-blanco.svg"
  sed 's/currentColor/#000000/g' "$MARCA/$base.svg" > "$MARCA/$base-negro.svg"
  sed "s/currentColor/$VERDE/g"  "$MARCA/$base.svg" > "$MARCA/$base-verde.svg"
done
echo "  ok variantes de color del vector (9 archivos)"

# --- Utilidades ---------------------------------------------------------------

# Renderiza un isotipo a PNG transparente de la altura pedida, en el color dado.
# Se rasteriza al cuádruple y se reduce: el renderizador SVG de ImageMagick deja
# los bordes duros si se le pide el tamaño final directamente.
iso_png() {
  local svg="$1" color="$2" alto="$3" salida="$4"
  sed "s/currentColor/$color/g" "$MARCA/$svg.svg" > "$TMP/iso.svg"
  "$IM" -background none -density 1200 "$TMP/iso.svg" \
    -resize "x$((alto * 4))" -resize "x$alto" "$salida"
}

# Isotipo + palabra sobre fondo transparente, alineados por su centro óptico.
lockup() {
  local color="$1" alto="$2" salida="$3"
  iso_png isotipo-compacto "$color" "$alto" "$TMP/lock-iso.png"
  "$IM" -background none -fill "$color" -font "$SERIF" \
    -pointsize "$((alto * 62 / 100))" label:"Seregenera" "$TMP/lock-txt.png"
  "$IM" "$TMP/lock-iso.png" "$TMP/lock-txt.png" \
    -background none -gravity center +append \
    -bordercolor none -border "$((alto / 8))x0" "$salida"
}

# Foto de fondo oscurecida al tamaño exacto, para que el logo blanco encima
# cumpla contraste. El 45 % de verde oscuro mas la bajada de brillo es lo que
# hace que el blanco pase AA sobre cualquiera de las fotos de secciones.
fondo() {
  local foto="$1" w="$2" h="$3" salida="$4"
  "$IM" "$foto" -resize "${w}x${h}^" -gravity center -extent "${w}x${h}" \
    -fill "$VERDE_OSCURO" -colorize 45 -brightness-contrast -18x0 "$salida"
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# --- Iconos de la aplicación ---------------------------------------------------
# Fondo verde macizo y marca en crema: en una fila de pestañas casi todas
# blancas, un favicon de fondo claro desaparece.
icono_app() {
  local px="$1" salida="$2"
  iso_png isotipo-compacto "$CREMA" "$((px * 58 / 100))" "$TMP/icono.png"
  "$IM" -size "${px}x${px}" "xc:$VERDE" "$TMP/icono.png" \
    -gravity center -composite "$salida"
}

icono_app 512 src/app/icon.png
icono_app 180 src/app/apple-icon.png
icono_app 256 "$TMP/ico-fuente.png"
"$IM" "$TMP/ico-fuente.png" -define icon:auto-resize=48,32,16 src/app/favicon.ico
echo "  ok src/app/{icon.png,apple-icon.png,favicon.ico}"

# --- Avatares de redes ---------------------------------------------------------
# Instagram, X, LinkedIn, WhatsApp y TikTok los recortan en círculo. El símbolo
# se queda dentro del 58 % central, que sobrevive al recorte con margen.
for px in 1080 800 640 400 200; do
  icono_app "$px" "$REDES/avatar-$px.png"
done
echo "  ok $REDES/avatar-{1080,800,640,400,200}.png"

# --- Tarjeta al compartir (Open Graph) -----------------------------------------
# Es la imagen más vista del proyecto: sale cada vez que alguien pega el enlace
# en WhatsApp o Slack.
og() {
  local salida="$1"
  fondo public/img/secciones/hero-home.webp 1200 630 "$TMP/og-fondo.png"
  lockup "#ffffff" 116 "$TMP/og-marca.png"
  "$IM" "$TMP/og-fondo.png" "$TMP/og-marca.png" \
    -gravity center -geometry +0-40 -composite \
    -gravity center -font "$SERIF" -pointsize 40 -fill "#d6ecdf" \
    -annotate +0+80 "Marketplace regenerativo para el turismo colombiano" \
    "$salida"
}
# JPG y no PNG: es una fotografía a 1200x630. En PNG pesa un mega, en JPG
# ochenta kilos, y ningún ojo distingue los dos en una tarjeta de WhatsApp.
og src/app/opengraph-image.jpg
cp src/app/opengraph-image.jpg src/app/twitter-image.jpg
echo "  ok src/app/{opengraph-image.jpg,twitter-image.jpg}"

# --- Banners -------------------------------------------------------------------
# LinkedIn de empresa es una franja de 191 px de alto: no cabe nada más que el
# logotipo. Se hace sobre verde macizo, no sobre foto, porque una foto a esa
# altura se ve como una tira sin sujeto.
lockup "#ffffff" 96 "$TMP/lock-96.png"
"$IM" -size 1128x191 "xc:$VERDE_OSCURO" "$TMP/lock-96.png" \
  -gravity west -geometry +72+0 -composite "$REDES/banner-linkedin-empresa.png"

# En LinkedIn personal y en X el avatar tapa la esquina inferior izquierda, así
# que la marca va a la derecha.
lockup "#ffffff" 104 "$TMP/lock-104.png"
fondo public/img/secciones/hero-home.webp 1584 396 "$TMP/f-li.png"
"$IM" "$TMP/f-li.png" "$TMP/lock-104.png" \
  -gravity east -geometry +110+0 -composite -quality 88 "$REDES/banner-linkedin-personal.jpg"

fondo public/img/secciones/hero-proveedores.webp 1500 500 "$TMP/f-x.png"
"$IM" "$TMP/f-x.png" "$TMP/lock-104.png" \
  -gravity east -geometry +120+0 -composite -quality 88 "$REDES/banner-x.jpg"

# Facebook recorta a los 1200x630 centrales en móvil; YouTube garantiza solo
# 1546x423 en el centro. En los dos, la marca va centrada.
lockup "#ffffff" 132 "$TMP/lock-132.png"
fondo public/img/secciones/hero-vender.webp 1640 856 "$TMP/f-fb.png"
"$IM" "$TMP/f-fb.png" "$TMP/lock-132.png" \
  -gravity center -composite -quality 88 "$REDES/banner-facebook.jpg"

lockup "#ffffff" 180 "$TMP/lock-180.png"
fondo public/img/secciones/hero-verificacion.webp 2560 1440 "$TMP/f-yt.png"
"$IM" "$TMP/f-yt.png" "$TMP/lock-180.png" \
  -gravity center -composite -quality 88 "$REDES/banner-youtube.jpg"
echo "  ok $REDES/banner-* (1 png plano + 4 jpg con foto)"

# --- Firma de correo -----------------------------------------------------------
# Fondo blanco a propósito, no transparente: Outlook pinta de gris lo que tenga
# canal alfa y el logo aparece sucio.
lockup "$VERDE" 48 "$TMP/lock-firma.png"
"$IM" -size 320x80 xc:white "$TMP/lock-firma.png" \
  -gravity center -composite "$REDES/firma-correo.png"
echo "  ok $REDES/firma-correo.png"

echo
echo "Marca regenerada. Peso de $MARCA: $(du -sh "$MARCA" | cut -f1)"
