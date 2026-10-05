# Los avisos de ofertas y pedidos salen solos, y Ivan tiene la guía para el remitente

- **Fecha:** 2026-10-05
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `docs/js-guia-correos` → entrega directa (sin PR)
- **Fase del roadmap:** — (cierra el último pendiente de correo)

## Qué se hizo

Cuatro correos nuevos de la aplicación, ya conectados, y la guía para dejar el
correo entero en manos de Workspace.

| Correo | Lo manda | Desde dónde |
|---|---|---|
| Oferta en revisión | a quien la envió | `cuenta/empresa/ofertas/actions.ts` |
| Oferta publicada | a quien gestiona la empresa | `admin/ofertas/actions.ts` → `avisarOfertaPublicada()` |
| Cambio de estado del pedido | al comprador | `admin/ordenes/actions.ts` → `avisarCambioDeOrden()` |
| Pedido pagado | a cada empresa con productos en la orden, solo sus ítems | el mismo, cuando el estado es `paid` |

Los avisos que dependen de la base viven en `src/lib/correo/notificaciones.ts`; las
plantillas, en `plantillas.ts`. La guía es `docs/CORREOS.md`, y cada correo tiene su
archivo en `plantillas-correo/` (07 a 11; el 07 es la pestaña *Reauthentication* de
Supabase, que no se usa pero venía en inglés de fábrica).

## Por qué así

- **El aviso al proveedor es al pagar, no al comprar.** Antes del pago no hay nada
  que preparar, y avisar de una orden sin pagar invita a despachar algo que puede
  cancelarse. No lleva importes: los calcula la base.
- **`notificaciones.ts` nunca lanza** y se llama después de guardar, por la misma
  regla que el correo del pedido: un SMTP caído no puede deshacer lo guardado.
- **Usa el cliente de servicio solo para leer el correo** de quien gestiona una
  empresa, porque vive en `auth.users` y ninguna política RLS lo deja leer. Ninguna
  escritura. Es un cuarto uso del cliente de servicio, anotado en su cabecera.
- **`pending_payment` no avisa:** se llega a él al deshacer una cancelación, que es
  una corrección del equipo.

## Qué quedó pendiente

- **Ivan tiene que seguir `docs/CORREOS.md`**: remitente de Workspace en Supabase,
  las cinco `SMTP_*` en Vercel y SPF/DKIM del dominio. Sin las `SMTP_*`, ninguno de
  estos correos sale: se escriben en el registro del servidor.
- **Nada de esto se probó con un correo real**: se verificó que compila y que
  `tsc` y eslint pasan. La prueba de punta a punta está descrita en la guía.
- **«Oferta no aprobada» no existe**: el rechazo no guarda motivo. Pide una
  migración y es decisión de los dos.
- Las empresas sembradas no tienen `provider_members`, así que no reciben avisos.
- El enlace del aviso al proveedor apunta a `/cuenta/empresa` hasta que exista su
  pantalla de órdenes (Bloque 4).

## Qué se rompe si tocas esto

- Un estado nuevo de orden: hay que decidir si avisa y añadirlo a
  `EstadoAvisable` y a `TEXTO_ESTADO` en `plantillas.ts`.
- El texto de «cancelada» promete que no se cobra nada: revísalo si cambia
  `TRANSICIONES`.
