# Las tarjetas responden al dedo, y la última fila de una rejilla sale centrada

- **Fecha:** 2026-10-23
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `fix/js-portada-detalles` (entrega directa, sin PR)
- **Fase del roadmap:** —

Sigue a [2026-10-23-movimiento-en-las-tarjetas-de-la-portada.md](2026-10-23-movimiento-en-las-tarjetas-de-la-portada.md).

## Qué se hizo

- **Foco con el dedo.** En el teléfono no había nada: el brillo y el foco eran
  solo de `:hover`. Ahora `EfectosPuntero` marca con `data-foco` la tarjeta
  `[data-brillo]` que está bajo el dedo (también al deslizar por encima) y
  `data-con-foco` en su tanda del carrusel. Lo usan las tarjetas de la portada,
  las del catálogo y las de `/proveedores`.
- **`rejilla-centrada`** (`globals.css`): una rejilla `flex-wrap` cuya última
  fila incompleta sale centrada, con `--cols` y `--gap` por anchura. Se usa en
  el carrusel, el catálogo, las relacionadas de la ficha, las ofertas de un
  proveedor, `/proveedores`, `/comunidad` y la Comunidad de la portada.
- **Portada:** sin las píldoras de verticales en «Soluciones» (al catálogo se
  entra por el menú), menos aire entre secciones (`py-6`, paginador a `mt-4`) y
  un paginador más visible: píldora blanca, flechas en verde lleno, punto
  activo estirado y la cuenta «2 / 4».
- **El paginador del catálogo** sigue el mismo estilo.

## Por qué así

- **`data-foco` y no `:hover` en táctil:** `:hover` se queda pegado al último
  toque hasta el siguiente. `data-foco` lo pone y lo quita el script (450 ms
  después de levantar el dedo, lo que tarda el destello).
- **`elementFromPoint` y no `event.target`:** al deslizar, el `target` sigue
  siendo la tarjeta donde empezó el toque.
- **Flex y no Grid:** Grid no sabe centrar una fila suelta. El precio es que
  cada hijo mide lo que mediría su columna (`flex-basis` calculado).

## Qué se rompe si tocas esto

- Una rejilla `rejilla-centrada` no lleva `grid` ni `gap-*`: su `display: flex`
  está fuera de las capas de Tailwind y gana. El hueco va en `--gap`.
- El carrusel calcula la ola de la cascada con `COLUMNAS`: tiene que coincidir
  con sus `--cols`.

## Verificación

Build, `tsc`, `eslint src` y `npm test` (106) en limpio; las variantes
`data-foco:` y `[--cols:*]` están en el CSS compilado. Lo visual, en el
navegador de Jesús.
