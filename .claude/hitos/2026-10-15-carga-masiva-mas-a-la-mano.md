# Carga masiva a un clic, y fotos sin escribir nombres de archivo

- **Fecha:** 2026-10-15
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-acceso-directo-carga-masiva` y `feat/js-fotos-carga-masiva` (entrega directa)
- **Fase del roadmap:** 3 (proveedores reales); sigue a [la carga desde Excel](2026-10-14-fotos-excel-contactar-pagos-y-envios.md)

## Qué se hizo

La carga desde Excel del 14-10 funcionaba, pero casi nadie iba a llegar a ella:
había que entrar a «Ver todas» → «Cargar desde Excel», y quien abría «Nueva
oferta» con veinte productos por subir llenaba el formulario veinte veces. Y una
vez dentro, las fotos pedían escribir en la planilla el nombre de cada archivo.

1. **A un clic.** `ElegirCantidadOfertas` («Una oferta | Varias desde Excel») arriba
   de «Nueva oferta» y de «Cargar desde Excel», en el panel de la empresa y en el
   de administración. «Cargar varias desde Excel» junto a «Nueva oferta» en
   `/cuenta/empresa`. Enlace en el catálogo para quien ya es proveedor. Y la
   pantalla «Tu empresa ya está registrada», que decía «ya puedes publicar» sin
   ningún botón para hacerlo, ahora trae «Publicar mi primera oferta» y «Cargar
   varias desde Excel»; `/vender` lo menciona en el primer beneficio.
2. **Fotos de tres maneras** (`importar-ofertas.tsx`): «Agregar fotos» en la
   propia fila, sin escribir nada en la planilla; una foto llamada como el
   título de la oferta se une sola (`coincideConTitulo()`); y la columna
   «Fotos» de siempre (nombres de archivo o enlaces). Se juntan en ese orden
   hasta seis.

## Por qué así

**Un selector y no un «¿una o varias?» en medio.** Quien sube una sola oferta no
debe dar un clic de más; quien tiene veinte ve la otra puerta desde la pantalla
en la que ya está. Por eso son enlaces en las dos pantallas y no una página
intermedia.

**La miniatura es una imagen diminuta hecha al agregar la foto**, no un
`createObjectURL` con su efecto de limpieza: con 300 filas de 6 fotos no se
guardan 1.800 originales en memoria, y no hay `setState` dentro de un efecto
(lo prohíbe el lint del repo).

**Por título solo si el nombre es el título más un número.** `cacao.jpg` no se
une a «Cacao Arhuaco»: un nombre que solo *contiene* parte del título uniría la
foto de otra oferta sin que nadie lo note.

## Qué quedó pendiente

- [ ] Las fotos unidas por título o por la columna «Fotos» cuentan en «N fotos»
      pero no muestran miniatura; solo las agregadas en la fila la muestran.
- [ ] Un ZIP con todas las fotos, o fotos desde un enlace a una carpeta, no se
      hizo. Word y PDF siguen sin leerse.

## Qué se rompe si tocas esto

- **`fotosDeFila()` decide qué se sube**, y lo que cuenta en pantalla («2 fotos»)
  sale de la misma función. Si se separan, la pantalla dirá una cosa y se subirá
  otra.
- **`coincideConTitulo()` y `claveDeArchivo()`** comparten criterio con la
  columna «Fotos». Cambiar uno sin el otro empareja distinto según el camino.

## Verificación

- `npm run build`, `npx tsc --noEmit`, `npx eslint .` (0 errores; los avisos son
  de scripts de terceros) y `npm test` (60: las tres de `coincideConTitulo` son
  nuevas).
- Con Playwright, en local y con una página temporal que usaba el componente
  con acciones de mentira (ya borrada): un CSV con las tres ofertas de ejemplo,
  una foto por título, dos fotos en la fila de la segunda oferta y ninguna en la
  tercera. Resultado al cargar: 2, 2 y 0 fotos enviadas a `guardar`, sin errores
  de consola.
- **No verificado**: con sesión real de empresa ni de administrador, y la subida
  de fotos contra Storage (la prueba usó una acción de mentira).
