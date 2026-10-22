# Fechas de las experiencias: las abre la empresa o las elige quien reserva

- **Fecha:** 2026-10-22
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-fechas-de-experiencias` → `staging` → `main` (entrega directa), tag `v0.13.0`
- **Fase del roadmap:** Bloque 4 (panel de proveedor)
- **Sigue a:** [2026-10-20-copias-cifradas-monitor-y-dependabot.md](2026-10-20-copias-cifradas-monitor-y-dependabot.md)

## Por qué

Al editar una experiencia, el formulario decía en el panel «las fechas con cupo
viven en la tabla `listing_availability` y hoy se siembran con el script», y a la
empresa «las cargamos nosotros: escríbenos cuáles quieres abrir». Las dos frases
eran ciertas: `listing_availability` solo se llenaba con `scripts/seed.mts` y no
había pantalla para editarla. Una experiencia nueva se reservaba sin fecha y la
fecha se acordaba después, fuera del sitio.

Lo que se pidió: que la empresa elija entre **abrir ella las fechas, con cupo**,
o **dejar que quien reserva elija el día**, y que el pedido le llegue con esa
fecha para organizarse.

## Qué se hizo

| Pieza | Qué hace |
|---|---|
| `src/lib/fechas.ts` | Los dos modos, `revisarPlan()` (valida lo que manda el editor) y `escribirFechas()` (lo escribe sin pisar reservas: cada `delete`/`update` lleva su condición dentro) |
| `src/components/fechas-de-experiencia.tsx` | El editor, debajo del formulario en `/cuenta/empresa/ofertas/[id]` y `/admin/ofertas/[id]`, con su propio botón |
| `guardarFechasDeEmpresa()` / `guardarFechas()` | Las acciones de la empresa y del panel. La de la empresa saca la empresa de la sesión y tiene freno |
| `getFechasDeOferta()` en `repo.ts` | Lo que lee el editor: modo, fechas de hoy en adelante, cupo y reservados |
| `add-to-cart.tsx` | Sin fechas propias, la persona elige el día (desde mañana, hasta dos años). Con fechas propias y ninguna abierta, no se puede reservar |
| `crear_orden()` (`rpc.ts`) | Rechaza una fecha pasada (`fecha-pasada`) y una mal escrita (`cesta-invalida`), en los dos modos |

## Decisiones

- **El modo no es una columna.** Es «la oferta tiene filas en
  `listing_availability`», la misma pregunta que ya hacía `crear_orden()` para
  exigir fecha y descontar cupo. Así no hubo que tocar el esquema de producción
  y la base y la pantalla no se pueden contradecir. Consecuencia: pasar a «elige
  quien reserva» borra todas las filas, también las pasadas. Las reservas ya
  hechas conservan su fecha en `order_items`.
- **Las fechas se guardan aparte del formulario** para que abrir una fecha no
  devuelva a revisión una experiencia publicada: el trigger
  `listings_proteger_proveedor` lo hace con cualquier `update` de `listings`, y
  el calendario no es lo que el equipo aprueba.
- **Una fecha con reservas no se quita y su cupo no baja de lo reservado.** Una
  fecha guardada no cambia de día: se quita y se abre otra.
- **Las fechas pasadas ya no se ofrecen** en la ficha (`aListing()`), y
  `crear_orden()` tampoco las vende aunque les quede cupo.
- **El servidor acepta todavía una experiencia sin fecha** cuando no hay fechas
  propias: una cesta guardada antes de este cambio no tiene fecha. La ficha ya
  la exige.

## Pruebas

- `src/lib/fechas.test.ts` (unitarias): fechas válidas, plan de cada modo,
  cupos y errores.
- `mysql/pruebas/compras.test.ts`: el día elegido por quien compra queda en el
  ítem sin tocar cupos; una fecha pasada o inexistente se rechaza, también con
  fechas abiertas.

## Lo que queda

- Los **servicios** siguen con «tiempo de entrega» y sin fecha. Si alguno
  necesita agenda, este mismo modelo sirve.
- El correo del pedido a la empresa no menciona la fecha; la ve en
  `/cuenta/empresa/pedidos` («para el …»).
