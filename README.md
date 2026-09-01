# Seregenera

Marketplace multi-proveedor de productos, experiencias y servicios regenerativos
para el sector turístico colombiano. Operado por **Dimension Natural SAS**.

Hoteles, glampings, restaurantes, transportadores y operadores compran a
proveedores colombianos verificados uno por uno; la plataforma retiene comisión
sobre cada venta.

## Arranque

```bash
npm install
npm run dev          # http://localhost:3000
```

**No requiere credenciales para correr.** El catálogo se sirve desde datos
semilla en memoria (`src/data/`), así que la aplicación es navegable de
inmediato.

## Cómo está organizado

| Ruta | Qué hace |
|---|---|
| `/` | Portada: propuesta de valor, verticales, ofertas destacadas |
| `/catalogo` | Listado con filtros por tipo, vertical, categoría, departamento, nivel y certificación. Los filtros son un formulario GET, así que cada combinación es una URL compartible e indexable |
| `/oferta/[slug]` | Ficha de la oferta, con compra o solicitud de cotización |
| `/proveedores` · `/proveedor/[slug]` | Directorio y perfil público de proveedores |
| `/verificacion` | Metodología de verificación + autodiagnóstico interactivo |
| `/vender` | Propuesta para proveedores y formulario de postulación |
| `/carrito` · `/orden/[reference]` | Cesta multi-proveedor, checkout y confirmación |

| Módulo | Responsabilidad |
|---|---|
| `src/lib/types.ts` | Modelo de dominio |
| `src/lib/taxonomy.ts` | Verticales, categorías, niveles, certificaciones, departamentos |
| `src/lib/sustainability.ts` | Motor de puntaje: dimensiones, pesos y cálculo del nivel |
| `src/lib/repo.ts` | Acceso a datos. Funciones async a propósito, para que el cambio a Supabase no toque las páginas |
| `src/lib/pricing.ts` | Precio efectivo (minorista/mayorista), comisión e impacto agregado |
| `src/lib/payments.ts` | Capa de pasarela. Hoy modo manual; `getGateway()` es el único punto a cambiar |
| `supabase/migrations/0001_init.sql` | Esquema completo con RLS |

## Decisiones que conviene conocer

**El precio nunca lo calcula el cliente.** El carrito guarda solo
identificadores y cantidades; el servidor los valoriza contra el catálogo en
cada cambio. Un carrito guardado hace un mes no puede comprar al precio de hace
un mes.

**La comisión se guarda por ítem, no sobre el total.** Una orden puede
repartirse entre varios proveedores y cada uno tiene que poder auditar
exactamente lo que se le descontó.

**El título y el precio se congelan en la orden.** Si el proveedor los cambia
mañana, la orden histórica sigue diciendo lo que el comprador aceptó.

**Los roles viven en su propia tabla,** no en el perfil: si el usuario pudiera
actualizar su propia fila de perfil, podría autoasignarse `admin`.

**El puntaje de sostenibilidad lo escribe un trigger,** no el proveedor. Las
certificaciones suman con tope, para que un taller pequeño sin plata para
certificarse pueda llegar a Raíz por prácticas reales, y para que una
certificación comprada no baste sola.

## Qué falta

Estado real, sin adornos:

- [ ] **Proyecto de Supabase.** El esquema está escrito y con RLS, pero no se ha
      ejecutado contra ninguna base. Al crearlo: aplicar la migración, cargar
      `src/data/` como semilla y reemplazar el cuerpo de `src/lib/repo.ts` por
      consultas reales. Las firmas ya son async, así que ninguna página cambia.
- [ ] **Autenticación y paneles.** Sin Supabase no hay auth. Faltan el panel de
      proveedor (gestionar ofertas y órdenes) y el de administración (aprobar
      proveedores, revisar evidencia, confirmar pagos).
- [ ] **Pagos con Wompi.** Implementar `WompiGateway` con la interfaz de
      `src/lib/payments.ts` y el webhook de confirmación.
- [ ] **Cupos e inventario transaccionales.** El checkout todavía no descuenta
      cupo de experiencias ni stock. Necesita una transacción de base de datos
      para evitar sobreventa.
- [ ] **Imágenes.** Los proveedores aún no suben fotos; mientras tanto se dibuja
      un tapiz derivado del título (`src/components/listing-media.tsx`).
- [ ] **Persistencia de órdenes y postulaciones.** Hoy viven en memoria del
      servidor (`src/lib/orders.ts`, `src/app/vender/actions.ts`) y se pierden al
      reiniciar.
- [ ] **Reseñas.** La tabla y su política existen; falta la interfaz.

## Trabajar en este repo

Proyecto colaborativo entre **Ivan Duarte** (`UniqueColombia`) y **Jesús Seiler**
(`seiler18`), ambos con Claude Code.

| Ruta | Qué es |
|---|---|
| `CLAUDE.md` | Orquestador: quién trabaja aquí, dónde está cada cosa, qué skill cargar |
| `.claude/skills/` | Habilidades del proyecto (`flujo-git`, `dominio-regenera`, `supabase-schema`, `nueva-integracion`, `registrar-hito`, `prospeccion-proveedores`…) |
| `.claude/agents/` | Subagentes con encargo propio (`prospector-proveedores`) |
| `.claude/hitos/` | Trazabilidad: un archivo por hito, append-only |
| `docs/ROADMAP.md` | Fases del producto con criterio de salida |
| `docs/DEPLOY.md` | Stack de despliegue: GitHub + Vercel + Supabase, y por qué |

### Conseguir proveedores

El catálogo se llena con proveedores colombianos reales, y encontrarlos es
trabajo aparte del producto. `scripts/prospectar.mts` construye el universo de
candidatos desde el registro mercantil (RUES, dato abierto) y lo puntúa; el
subagente `prospector-proveedores` lo enriquece con contacto y criterio.

```bash
node scripts/prospectar.mts --listar-perfiles
node scripts/prospectar.mts --perfil amenities-ecologicos --camara BOGOTA
node scripts/exportar-excel.mts       # junta los CSV en un .xlsx categorizado
```

El Excel sale en `outputs/`: una hoja por vertical, una con todo, un resumen y
un diccionario que explica qué mide el puntaje y qué no. Lleva filtro
automático y la primera fila fijada.

No necesita credenciales. Las listas que produce **no se versionan**: son datos
de empresas identificables y este repositorio es público. El porqué de cada
fuente —y por qué LinkedIn no es una de ellas— está en la skill
`prospeccion-proveedores`.

Ramas: `main` es **producción** y no recibe commits directos; `staging` es
integración; el trabajo va en `feat/<iniciales>-<slug>` y entra por PR contra
`staging`. El detalle está en la skill `flujo-git`.

## Verificación

En este orden — `next build` genera los tipos de rutas (`PageProps`,
`LayoutProps`) que `tsc` necesita, así que en un clon limpio `tsc` sin build
previo falla con `TS2304` en cada `page.tsx`:

```bash
npm run build        # compila y genera tipos de rutas
npx tsc --noEmit     # tipos
npx eslint .         # lint
```

Los datos de `src/data/` son de demostración: proveedores ficticios construidos
sobre los quince productos del prototipo original. Se reemplazan por proveedores
reales en cuanto entre el primer lote de onboarding.
