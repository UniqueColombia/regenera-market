# Roadmap — Seregenera

El camino de aquí a una plataforma que sostiene varios clientes y varios
servicios. Cada fase tiene **criterio de salida verificable**: mientras no se
cumpla, la fase no está cerrada, aunque el código exista.

Este documento se actualiza cuando cambia el plan, no cuando avanza una tarea
(para eso están `hitos/` y los PRs). Una fase que se cierra deja su hito.

Versionado: cada fase cerrada sube `MINOR` en el tag de `main` (`v0.2.0`,
`v0.3.0`, …). `v1.0.0` cuando la Fase 4 esté cerrada.

---

## Fase 0 — Prototipo navegable ✅

**Estado:** cerrada (2026-08-23) · `hitos/2026-08-23-mvp-navegable.md`

Marketplace completo y navegable sobre datos semilla en memoria, sin
credenciales. Esquema Postgres con RLS escrito. Pagos en modo manual.

**Criterio de salida:** `npm run dev` con `.env.local` vacío permite recorrer
portada → catálogo → ficha → carrito → orden. ✅

---

## Fase 1 — Persistencia real

> Las Fases 1 y 2 son la **beta gratuita**. Su plan de ejecución paso a paso
> —quién hace cada bloque, cómo, y con qué trampas— está en `docs/BETA.md`.

**Objetivo:** que nada se pierda al reiniciar el servidor.

- Crear el proyecto de Supabase (dev y prod separados) — ver `docs/DEPLOY.md`
- Aplicar `0001_init.sql`
- `scripts/seed.ts`: cargar `src/data/` con la service role key
- Reemplazar los cuerpos de `src/lib/repo.ts` por consultas reales, uno a uno
- Persistir órdenes y postulaciones (hoy en `src/lib/orders.ts` y
  `src/app/vender/actions.ts`, en memoria)
- Índices para cada filtro del catálogo

**Skills:** `supabase-schema`, `dominio-regenera`

**Criterio de salida:** `repo.ts` no importa nada de `src/data/`; una orden
sobrevive a `npm run dev` reiniciado; el catálogo se sirve desde Postgres con el
mismo orden por defecto y la misma normalización de tildes.

**Riesgo:** es la fase que más superficie toca. Se hace función por función,
corriendo la app entre cada una, no en un PR gigante.

---

## Fase 2 — Identidad y paneles

**Objetivo:** que proveedores y administración operen sin que nosotros toquemos
la base a mano.

- Auth de Supabase (email + magic link) y middleware de sesión
- Panel de proveedor: gestionar ofertas, ver sus órdenes, responder cotizaciones
- Panel de administración: aprobar proveedores, revisar evidencia de la
  evaluación, verificar certificaciones, confirmar pagos manuales
- Probar cada política RLS **con el rol equivocado**

**Skills:** `supabase-schema`, `dominio-regenera`

**Criterio de salida:** un proveedor nuevo se aprueba, publica una oferta y la ve
en catálogo sin que nadie escriba SQL. Un `buyer` no puede leer órdenes de otro;
un `provider` no puede leer órdenes que no incluyen sus ítems.

**Punto de atención:** el puntaje y el nivel los escribe el trigger. Ninguna
pantalla del panel de proveedor puede editarlos.

---

## Fase 3 — Cobrar de verdad

**Objetivo:** dinero real sin intervención manual.

- `WompiGateway` implementando `PaymentGateway`
- Webhook `src/app/api/webhooks/wompi/route.ts`: firma verificada con
  `WOMPI_EVENTS_SECRET`, idempotente, monto validado contra la orden
- Cupos e inventario **transaccionales** — el descuento en la misma transacción
  que la orden
- Reporte de liquidación por proveedor (qué se le debe, qué comisión se retuvo)

**Skills:** `nueva-integracion`, `dominio-regenera`

**Criterio de salida:** una orden se paga con Wompi en sandbox y pasa a `paid`
sola; el mismo evento reenviado tres veces no cambia nada; dos compras
simultáneas del último cupo no sobrevenden.

**Bloqueante externo:** cuenta de comercio de Wompi a nombre de Dimension
Natural SAS.

---

## Fase 4 — Operable

**Objetivo:** que el marketplace se pueda operar comercialmente.

- Imágenes subidas por el proveedor (Supabase Storage), retirando el tapiz de
  `listing-media.tsx`
- Interfaz de reseñas (tabla y política ya existen)
- Correo transaccional: confirmación de orden, aviso al proveedor, cambios de
  estado
- Primer lote real de onboarding, reemplazando `src/data/` como fuente de verdad
- SEO y metadata por oferta y por proveedor

**Skills:** `nueva-integracion`

**Criterio de salida:** una orden real de un hotel real, de principio a fin, sin
que nadie del equipo intervenga a mano. → `v1.0.0`

---

## Fase 5 — Multi-cliente

**Objetivo:** lo que motiva toda la arquitectura anterior — varios clientes o
servicios sobre la misma plataforma.

Aquí es donde se decide, con datos en la mano y no antes:

- **Comisión diferenciada por tipo de oferta.** Ya está previsto en el comentario
  de `COMMISSION_RATE`: las experiencias soportan más que los productos físicos,
  que ya cargan logística. Requiere que la orden guarde la tasa aplicada, no solo
  el monto.
- **Aislamiento por cliente.** Un hotel que sincroniza inventario o facturación
  no puede ver datos de otro. Se garantiza con RLS, no con un `where` en el
  código. Sus credenciales van en base cifradas, no en `.env`.
- **API pública o integraciones punto a punto**, según lo que pidan los primeros
  tres clientes. No se construye una API genérica antes de tener tres casos
  reales: se construye la abstracción equivocada.
- **Facturación electrónica** (obligación DIAN cuando el volumen lo exija).

**Skills:** `nueva-integracion`, `supabase-schema`

**Criterio de salida:** se define al entrar en la fase. Hoy sería adivinar.

---

## Fuera de alcance por ahora

Se dicen explícitamente para no volver a discutirlas cada sprint:

- **App móvil nativa.** El sitio es responsive; una app no aporta hasta tener
  compradores recurrentes.
- **Multi-idioma.** El comprador es turismo colombiano. Cuando entre demanda
  internacional se reevalúa.
- **Multi-moneda.** Todo es COP entero. Meter moneda ahora contamina cada
  cálculo de dinero del proyecto.
- **Micro-servicios.** Dos personas. Un Next.js.
