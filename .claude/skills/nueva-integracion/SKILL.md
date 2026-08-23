---
name: nueva-integracion
description: Patrón para conectar un servicio externo a Seregenera — pasarela de pagos (Wompi), correo transaccional, WhatsApp, facturación electrónica, o el sistema de un cliente hotelero. Cárgala antes de agregar un SDK, una variable de entorno nueva, un webhook o un cliente HTTP. Define cómo se aísla el proveedor detrás de una interfaz para que la plataforma pueda tener varios sin reescribirse.
---

# Conectar un servicio externo

Seregenera va a integrar varios servicios y, más adelante, sistemas de
clientes distintos. La regla que hace eso posible sin reescribir la app cada vez
es una sola: **el resto del código nunca conoce el nombre del proveedor.**

`src/lib/payments.ts` ya es el ejemplo canónico. Cópialo.

## El patrón, en cuatro piezas

**1. Una interfaz que describe la capacidad, no el proveedor.**

```ts
export interface PaymentGateway {
  readonly name: string;
  createIntent(order: Order): Promise<PaymentIntent>;
}
```

La interfaz habla de "cobrar", no de "Wompi". Si el tipo de retorno menciona un
campo que solo existe en un proveedor, la abstracción está mal.

**2. Una implementación por proveedor**, más una de fallback que funcione sin
credenciales. `ManualGateway` permite operar las primeras órdenes con
transferencia mientras se abre la cuenta de comercio — y permite que cualquiera
clone el repo y navegue la app sin secretos. **Toda integración nueva mantiene
esa propiedad: `npm run dev` con `.env.local` vacío tiene que seguir levantando.**

**3. Un selector único.**

```ts
export function getGateway(): PaymentGateway {
  return new ManualGateway();
}
```

Un solo lugar decide. Cuando entre Wompi:

```ts
export function getGateway(): PaymentGateway {
  if (process.env.WOMPI_PRIVATE_KEY) return new WompiGateway();
  return new ManualGateway();
}
```

La app degrada a manual sola si falta la credencial. Nunca lanza en import-time
por una variable ausente: eso tumba el build en un entorno donde el servicio no
aplica.

**4. `process.env` se lee solo dentro del módulo de integración.** Ningún otro
archivo del proyecto lee una variable de un servicio externo. Si un componente
necesita saber si hay pasarela, expón `getGateway().name`, no la variable.

## Variables de entorno

Toda variable nueva se documenta en `.env.example` **en el mismo commit**, con:
qué es, dónde se obtiene, y qué pasa si está vacía. Nunca el valor.

`NEXT_PUBLIC_` significa **"esto va a estar en el bundle del navegador y
cualquiera lo puede leer"**. Una clave privada con ese prefijo es una fuga, no un
descuido de nombres. Si dudas: ¿me importaría que esto apareciera en un pastebin?

Si el servicio no funciona sin la clave, degrada a un modo reducido y **dilo en
pantalla**. Que el comprador vea "pago por transferencia" es honesto; que el
botón de pagar dé error 500 no.

## Webhooks

Un webhook es un endpoint público que cambia tu base de datos. Tratarlo como
cualquier otra ruta es un botón de "marcar como pagado" abierto a internet.

Orden obligatorio dentro del handler:

1. **Verificar la firma primero.** Wompi: `WOMPI_EVENTS_SECRET`. Si no valida,
   `401` y no se toca nada. Sin excepciones para "probar rápido".
2. **Idempotencia.** La pasarela reintenta. El mismo evento debe poder llegar
   tres veces y producir el mismo estado final. Guarda el id del evento y
   descarta repetidos.
3. **No confiar en el monto que llega.** Compara contra el total guardado en la
   orden. Si no cuadra, no confirmes: registra y alerta.
4. **Transición de estado válida.** Una orden `cancelled` no vuelve a `paid`
   porque llegó un webhook viejo.
5. Responder `200` rápido. El trabajo pesado va aparte.

Ubicación: `src/app/api/webhooks/<servicio>/route.ts`.

## Llamadas salientes

- **Timeout siempre.** Un `fetch` sin `AbortSignal.timeout()` cuelga la petición
  de un usuario hasta que el otro lado se digne responder.
- **Reintento solo si la operación es idempotente.** Reintentar un cobro cobra
  dos veces.
- **Falla de un servicio externo ≠ error 500 de nuestra app.** Si el correo de
  confirmación no sale, la orden ya existe: regístralo y sigue.
- **No logees el cuerpo completo de una respuesta.** Trae tokens y datos
  personales de compradores.

## Cuando la integración es "un cliente"

Un hotel que quiere sincronizar su inventario o su facturación es el mismo
patrón, con dos exigencias extra:

- **Aislamiento de datos.** El cliente A jamás lee datos del cliente B. Eso se
  garantiza con RLS en Postgres (skill `supabase-schema`), no con un `where` en
  el código de aplicación. Un `where` olvidado es una fuga; una política RLS
  olvidada es un error de acceso.
- **La credencial es del cliente, no global.** No metas la llave de un hotel en
  `.env`. Va en base de datos, cifrada, asociada a su fila.

## Antes de abrir el PR

- [ ] Interfaz definida y al menos dos implementaciones (real + fallback)
- [ ] Un solo `get<Servicio>()` decide cuál se usa
- [ ] `npm run dev` levanta y la app es navegable con `.env.local` vacío
- [ ] Variables documentadas en `.env.example`, sin valores
- [ ] Ningún secreto con prefijo `NEXT_PUBLIC_`
- [ ] Si hay webhook: firma verificada, idempotente, monto validado
- [ ] `npm run build`, luego `npx tsc --noEmit`, luego `npx eslint .` — los tres en limpio
- [ ] Hito registrado (skill `registrar-hito`) — una integración siempre es hito
