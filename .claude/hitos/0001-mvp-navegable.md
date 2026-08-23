# 0001 — MVP navegable con catálogo, carrito y checkout en memoria

- **Fecha:** 2026-08-17
- **Estado:** Cerrado
- **Commits:** `d649aa5` — «MVP navegable de Regenera Market» (52 archivos)
- **Ramas / PR:** directo a `main` (antes de que existiera el flujo de PR)

## Qué cambió

Nació el proyecto: Next.js 16 + React 19 + Tailwind 4, con las nueve rutas
públicas del marketplace navegables de punta a punta —portada, catálogo con
filtros, ficha de oferta, directorio y perfil de proveedor, verificación,
portal de proveedores, carrito, checkout y confirmación de orden.

El catálogo se sirve desde datos semilla en memoria (`src/data/`), así que la
aplicación corre sin credenciales. El esquema completo de Supabase quedó escrito
con RLS (`supabase/migrations/0001_init.sql`) pero **nunca se ejecutó contra una
base**.

## Por qué

Existía un prototipo previo en Lovable (React + Vite + Supabase) que resultó ser
un **catálogo B2B de cotizaciones de un solo vendedor**, no el marketplace
multi-proveedor que se quería. Se decidió migrar a Next.js por dos razones
concretas: SEO —el catálogo tiene que indexarse— y manejo de pagos en servidor,
que Vite del lado del cliente no puede sostener.

Del prototipo se conservaron marca, textos, taxonomía de cinco verticales y el
modelo de impacto (CO₂, agua, residuos). Se reconstruyó desde cero el modelo de
datos: proveedores, órdenes y pagos no existían.

## Decisiones tomadas

- **Marketplace transaccional, no directorio.** La plataforma retiene comisión
  sobre cada venta. Dimension Natural opera, no vende. *(usuario)*
- **B2C y B2B desde el inicio**, con precio minorista y mayorista por oferta.
  *(usuario)*
- **Proyecto de Supabase nuevo y limpio**, no se reutiliza el de Lovable.
  *(usuario)*
- **El precio nunca lo calcula el cliente.** El carrito guarda identificadores y
  cantidades; el servidor los valoriza contra el catálogo en cada cambio.
  *(Claude)*
- **La comisión se guarda por ítem, no sobre el total**, para que cada proveedor
  de una orden repartida pueda auditar su descuento. *(Claude)*
- **Título y precio se congelan en la orden**, para que el histórico diga lo que
  el comprador aceptó. *(Claude)*
- **Los roles viven en su propia tabla**, no en el perfil: si el usuario pudiera
  actualizar su fila de perfil, podría autoasignarse `admin`. *(Claude)*
- **El puntaje de sostenibilidad lo escribe un trigger**, no el proveedor. Las
  certificaciones suman con tope, para que un taller sin plata para certificarse
  llegue a Raíz por prácticas reales y una certificación comprada no baste sola.
  *(Claude)*
- **Pagos abstraídos tras `getGateway()`**, hoy en modo manual, con Wompi como
  destino. *(Claude, sin confirmar explícitamente)*
- **Alojamiento fuera del MVP**; los tipos de oferta son experiencias con
  reserva, productos físicos y servicios B2B. *(Claude, sin confirmar
  explícitamente)*
- **Español y COP**, con i18n y multi-moneda preparados pero no activados.
  *(Claude, sin confirmar explícitamente)*

## Qué tocar si esto se cambia

- `src/lib/repo.ts` — única capa de acceso a datos. Sus firmas ya son `async`
  a propósito: cambiar semillas por Supabase no debe tocar ninguna página.
- `src/lib/types.ts` — modelo de dominio; cualquier cambio se propaga a todo.
- `src/lib/sustainability.ts` — pesos y umbrales de los niveles. Debe quedar en
  sintonía con el trigger de `supabase/migrations/0001_init.sql`.
- `src/lib/payments.ts` — `getGateway()` es el único punto a cambiar para entrar
  a Wompi.
- `src/data/` — semillas de demostración: proveedores ficticios sobre los quince
  productos del prototipo. Se reemplazan al entrar el primer lote de onboarding.

## Queda abierto

- [ ] Crear el proyecto de Supabase, aplicar la migración, cargar `src/data/`
      como semilla y reemplazar el cuerpo de `src/lib/repo.ts`
- [ ] Autenticación, panel de proveedor y panel de administración
- [ ] `WompiGateway` sobre la interfaz de `src/lib/payments.ts` y su webhook
- [ ] Cupos e inventario transaccionales — el checkout no descuenta nada y
      puede sobrevender
- [ ] Persistencia de órdenes y postulaciones: hoy viven en memoria del servidor
      (`src/lib/orders.ts`, `src/app/vender/actions.ts`) y se pierden al
      reiniciar
- [ ] Subida de imágenes por el proveedor; mientras tanto
      `src/components/listing-media.tsx` dibuja un tapiz derivado del título
- [ ] Interfaz de reseñas — la tabla y su política ya existen
