# La portada en tres carruseles, y «Destacar» desde la lista del panel

- **Fecha:** 2026-10-23
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-portada-destacadas` (entrega directa, sin PR)
- **Fase del roadmap:** —

## Qué se hizo

La portada pasa de una rejilla de seis ofertas a tres carruseles de tarjetas
compactas, en tandas de dos filas (12 en escritorio, 4 en el teléfono) con
flechas, puntos y deslizar con el dedo:

1. **Soluciones para cada tipo de negocio**: productos y experiencias al azar,
   otros en cada visita (`getOfertasAlAzar`). Las verticales, que eran el
   contenido de esta sección, quedan como píldoras que llevan al catálogo
   filtrado.
2. **Lo más pedido**: las ofertas que más aparecen en órdenes y cotizaciones
   (`getOfertasMasPedidas`). Desaparece si no hay ninguna.
3. **Ofertas destacadas**: solo las que tienen `featured`, hasta 48
   (`getFeaturedListings`). Desaparece si no hay ninguna.

En `/admin/ofertas`, cada oferta publicada (o ya destacada) tiene al lado de
«Retirar» y «Editar» un botón **Destacar / Quitar destacado**
(`destacarOferta` en `actions.ts`).

## Por qué así

- **El fallo de origen:** `getFeaturedListings(6)` ordenaba por `featured` y
  luego por puntaje del proveedor y cortaba en seis, rellenando con no
  destacadas. Con más de seis destacadas, la de un proveedor nuevo (puntaje 0)
  no entraba nunca: se marcaba y la portada no cambiaba. Ahora solo entran las
  destacadas, de la más nueva a la más vieja, con un corte de cuatro tandas.
- **«Lo más pedido» cuenta veces, no unidades:** un pedido de quinientos kits
  taparía todo lo demás. Cuenta órdenes sin pagar y cotizaciones sin responder
  porque mide interés, no lo cobrado.
- **Lee `order_items` y `quotation_items` con el cliente de servicio.** RLS no
  deja que un visitante las vea; de la función solo sale el conteo por oferta y
  las filas pasan después por `listings_publicos`. Se descartó una RPC nueva:
  habría que escribirla dos veces (Postgres, que ya es historia, y `rpc.ts`)
  para lo mismo.
- **El azar se sortea en JavaScript**, no con `order by rand()`: la capa
  compatible con PostgREST no lo tiene. Primero los ids, después las filas.
- **Siempre dos filas, cambian las columnas.** Con doce fijas, el teléfono
  apilaba seis filas antes de llegar a las flechas.

## Qué quedó pendiente

- **No se vio en un navegador.** No hay MariaDB local; se comprobó con build,
  `tsc`, `eslint` y pruebas. Hay que mirarla a 375 px y en oscuro.
- «Lo más pedido» lee hasta 5000 líneas de cada tabla en cada visita. Sobra
  hoy; si las órdenes crecen, pasarlo a una vista agregada.

## Qué se rompe si tocas esto

- `COLUMNAS` de `carrusel-ofertas.tsx` y las clases `grid-cols-*` de la misma
  rejilla tienen que decir lo mismo, o la última fila de cada tanda queda coja.
- `getFeaturedListings` ya no rellena: si nadie destaca nada, la sección no sale.

## Verificación

`npm run build`, `npx tsc --noEmit`, `npx eslint .` (0 errores) y `npm test`
(106 pruebas) en limpio.
