# Movimiento en las tarjetas de la portada, y el sorteo toma todo el catálogo

- **Fecha:** 2026-10-23
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-portada-animaciones` (entrega directa, sin PR)
- **Fase del roadmap:** —

Sigue a [2026-10-23-portada-en-carruseles-y-destacar.md](2026-10-23-portada-en-carruseles-y-destacar.md).

## Qué se hizo

- **«Soluciones para cada tipo de negocio» sortea de todo el catálogo**, servicios
  incluidos. El hito anterior dejaba fuera los servicios; Jesús pidió que entraran.
- **«Ofertas destacadas»** cambia la bajada: de «Elegidas por el equipo de
  Seregenera» a «Lo mejor del catálogo, destacado para ti». Jesús pidió «algo
  como *Ofertas destacadas para ti*»; literal, repetía el título.
- **Cuatro efectos en las tarjetas compactas**, con ideas de React Bits:
  1. *Cascada* (Animated Content): entran en diagonal, de izquierda a derecha,
     al llegar a la sección y al cambiar de tanda (la siguiente por la derecha).
  2. *Foco* (Focus Cards): con el cursor en la tanda, la señalada salta y las
     demás se atenúan.
  3. *Borde que sigue al cursor* (Border Glow de Magic Bento).
  4. *Destello* (Glare Hover): un reflejo cruza la foto.

## Por qué así

- **Escritos a mano, no instalados.** Es lo mismo que se hizo en OPCIONES con
  «Glass Tiles»: los componentes de React Bits traen GSAP o Motion para lo que
  aquí resuelve CSS, y la skill `diseno-visual` pide CSS antes que una librería.
  Todo está en `globals.css`, bloque «Carrusel de ofertas».
- **La cascada en el `<li>` y el hover en el `<article>`.** La animación con
  `both` se queda con `transform` al terminar; si fueran en el mismo elemento,
  el salto y el foco del hover no responderían.
- **El foco se ata a la tanda, no a la tarjeta.** Atado a la tarjeta, el hueco
  entre dos devolvía todas a pleno un instante y parpadeaba.
- **Lo que ya se ve al cargar no se esconde**, como en `Revelar`: solo entra en
  cascada lo que estaba debajo del pliegue.

## Qué quedó pendiente

- **No se vio en un navegador** (no hay MariaDB local). Jesús lo revisa en
  escritorio, en el teléfono y en oscuro.

## Qué se rompe si tocas esto

- `--i` lo calcula el carrusel con `columnas`: si cambian las columnas de la
  rejilla sin tocar `COLUMNAS`, la ola deja de ir en diagonal.
- Hover y cascada respetan `prefers-reduced-motion` (no se anima nada) y el
  hover solo existe con ratón (`hover: hover` y `pointer: fine`).

## Verificación

`npm run build`, `npx tsc --noEmit`, `npx eslint src` y `npm test` (106) en
limpio; el CSS compilado trae `-webkit-mask-composite` para Safari.
