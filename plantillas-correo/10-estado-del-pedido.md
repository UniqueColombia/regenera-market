# 10 · Cambio de estado del pedido

**Plantilla de Supabase:** ninguna — **este correo lo manda la aplicación.**
**Se dispara cuando:** el equipo mueve una orden de estado desde `/admin/ordenes`.

> **Conectado.** Lo manda `avisarCambioDeOrden()`
> (`src/lib/correo/notificaciones.ts`) desde `cambiarEstadoOrden()` en
> `src/app/admin/ordenes/actions.ts`, **después** de guardar el cambio. Le llega
> al comprador, al correo de la orden. Si el correo falla, el estado queda
> cambiado igual.

Hoy el pago se confirma a mano, así que **el correo «Recibimos tu pago» es lo que
le dice a quien transfirió que su dinero llegó.**

## Qué estados avisan

| Estado | Asunto | Qué dice |
|---|---|---|
| `paid` | Confirmamos el pago de tu pedido · {ref} | Ya confirmamos el pago; los proveedores pueden empezar a preparar |
| `in_progress` | Tu pedido está en preparación · {ref} | Los proveedores ya lo están preparando |
| `fulfilled` | Tu pedido fue entregado · {ref} | Marcamos tu pedido como entregado |
| `cancelled` | Cancelamos tu pedido · {ref} | Quedó cancelado y no se cobra nada por él |
| `refunded` | Devolvimos tu pedido · {ref} | Quedó marcado como devuelto |

**`pending_payment` no avisa a propósito:** se llega a él al volver atrás una
cancelación, que es una corrección del equipo y no una novedad para el comprador.

Todos llevan un botón «Ver mi pedido» a `{sitio}/orden/{referencia}`.

## Qué se rompe si se toca

- **El texto de `cancelled` dice «no se te cobrará nada».** Es cierto mientras el
  pago sea manual y se cancele lo que no se pagó. Si algún día se cancela una
  orden ya cobrada, ese estado es `refunded` y no este. Revisa la frase si cambia
  `TRANSICIONES` en `src/lib/order-status.ts`.
- **El texto de `refunded` no promete plazo ni medio de devolución**, porque hoy
  no hay uno definido. Si se define, se agrega aquí.
- Los estados que avisan son el tipo `EstadoAvisable` de `plantillas.ts`: si se
  agrega un estado nuevo a las órdenes, hay que decidir si avisa y añadirlo ahí.
