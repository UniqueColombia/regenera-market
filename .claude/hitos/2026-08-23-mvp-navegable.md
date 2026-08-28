# MVP navegable de Regenera Market

- **Fecha:** 2026-08-23
- **Autor:** Ivan Duarte (`UniqueColombia`)
- **Rama / PR:** commit `d649aa5` directo a `main` (antes de que existiera el flujo de ramas)
- **Fase del roadmap:** 0 — Prototipo navegable

> **Nota:** este hito se escribió de forma retroactiva el 2026-08-23, reconstruido
> desde el código y el `README.md`, para que el historial no empiece en blanco.
> Las decisiones son las que documenta el propio repositorio; si alguna
> interpretación quedó corta, Ivan puede corregirla con un hito nuevo.

## Qué se hizo

Marketplace multi-proveedor de productos, experiencias y servicios regenerativos
para el sector turístico colombiano (operado por Dimension Natural SAS),
completamente navegable sin credenciales: portada, catálogo con filtros,
fichas de oferta, directorio y perfil de proveedores, metodología de
verificación con autodiagnóstico, postulación de proveedores, y carrito
multi-proveedor con checkout y confirmación.

Stack: Next.js 16.3.1 (App Router), React 19, Tailwind 4, TypeScript, Zod.
El esquema completo de Postgres con RLS quedó escrito en
`supabase/migrations/0001_init.sql` — 491 líneas, sin aplicar todavía.

## Por qué así

**Datos semilla en memoria antes que base de datos.** `src/data/` sirve el
catálogo, así que el MVP es navegable y demostrable a un hotel el mismo día, sin
esperar a que exista un proyecto de Supabase ni una cuenta de comercio. El costo
es que órdenes y postulaciones se pierden al reiniciar el servidor; se aceptó a
cambio de poder mostrar el producto.

**`src/lib/repo.ts` como única puerta a los datos, con firmas `async` desde el
primer día.** No hacía falta que fueran async para leer de memoria: lo son para
que el cambio a Supabase reemplace cuerpos de función sin tocar ninguna página.

**Pasarela detrás de una interfaz, con modo manual como implementación real.**
`PaymentGateway` + `ManualGateway` (transferencia con referencia y confirmación
humana) permite cobrar de verdad las primeras órdenes mientras se abre la cuenta
de Wompi. `getGateway()` es el único punto que cambia después.

**Los roles en su propia tabla, no en `profiles`.** Si el usuario pudiera
actualizar su fila de perfil, se autoasignaría `admin`. Las funciones
`has_role()` / `is_admin()` son `security definer` para que las políticas
consulten roles sin entrar en recursión con la RLS de `user_roles`.

**El puntaje de sostenibilidad lo escribe un trigger.** El proveedor responde el
cuestionario; el puntaje se deriva. Cinco dimensiones ponderadas más
certificaciones con tope: un taller sin plata para certificarse puede llegar a
Raíz por prácticas reales, y una certificación comprada no basta sola.

**La comisión se guarda por ítem y sale de lo que recibe el proveedor.** Una
orden se reparte entre varios proveedores y cada uno debe poder auditar lo que se
le descontó a sus ítems; el comprador paga el precio de lista.

**Filtros de catálogo como formulario GET.** Cada combinación es una URL
compartible e indexable, en vez de estado de cliente invisible para el buscador.

## Qué quedó pendiente

Lo que el `README.md` lista como "Qué falta", y sigue vigente:

- [ ] Proyecto de Supabase: aplicar la migración, sembrar `src/data/`, reemplazar
      el cuerpo de `repo.ts` por consultas reales
- [ ] Autenticación, panel de proveedor y panel de administración
- [ ] `WompiGateway` + webhook de confirmación con verificación de firma
- [ ] Cupos e inventario transaccionales (hoy el checkout no descuenta nada —
      dos compradores simultáneos pueden sobrevender)
- [ ] Carga de imágenes por el proveedor (hoy `listing-media.tsx` dibuja un
      tapiz derivado del título)
- [ ] Persistencia de órdenes y postulaciones (hoy en memoria del servidor)
- [ ] Interfaz de reseñas (la tabla y su política ya existen)

## Qué se rompe si tocas esto

- **`src/lib/repo.ts`:** cambiar una firma obliga a tocar páginas. Reemplaza
  cuerpos, no contratos.
- **`src/lib/pricing.ts`:** `totalCop === subtotalCop` es intencional (la
  comisión no se suma al comprador). "Corregirlo" cambia el precio que ve el
  comprador respecto a la ficha.
- **`supabase/migrations/0001_init.sql`:** aún no aplicada, así que todavía se
  puede corregir en sitio. En cuanto corra contra cualquier base, se vuelve
  inmutable y todo cambio va en `0002_`.
- **`src/data/`:** proveedores ficticios de demostración. No usarlos como reales
  en material comercial.

## Verificación

```bash
npm install
npm run dev        # http://localhost:3000, navegable sin credenciales
npx tsc --noEmit
npx eslint .
```
