# Solo Unique Colombia a la vista: las ofertas y proveedores de ejemplo, ocultos

- **Fecha:** 2026-10-23
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `chore/js-solo-unique-colombia` (entrega directa, sin PR)
- **Fase del roadmap:** —

## Qué se hizo

Pedido de Jesús: Unique Colombia es hoy el único cliente real, y el sitio
mostraba junto a él el catálogo de ejemplo. En la base de producción:

- **18 ofertas pasaron a borrador**: todas las publicadas de proveedores que no
  son Unique Colombia.
- **13 proveedores pasaron a suspendidos**: los 12 del catálogo de ejemplo
  (Aromas del Páramo, Bahareque Camping, Cacao Guane, Caña Limpia, Ciclo Cero,
  Coco Pacífico, Coralina Azul, Guadua Viva, Hidrotec Verde, Ruta Regenerativa,
  Selva Viva Expediciones, Solar Andina) y Test Sa.
- Quedan publicadas **las 15 ofertas de Unique Colombia**; es el único
  proveedor en `/proveedores`.
- **Tejido Wayúu Süchiimma** (esperando revisión) no se tocó: puede ser una
  postulación real y ya no se ve.

Se hizo con `scripts/sql-produccion.mts` (nuevo): corre un .sql contra
producción, en el servidor y por SSH, con las credenciales que la app ya tiene
allí.

## Por qué así

- **Borrador y suspendido, no borrar.** Todo vuelve desde el panel: «Publicar»
  en `/admin/ofertas` y «Aprobar» en `/admin/proveedores`. Pasar a borrador no
  quita puntos de experiencia (el trigger solo actúa al publicar).
- **Con seguro:** el SQL solo actuaba si había exactamente un proveedor
  aprobado con «Unique Colombia» en el nombre. Un nombre distinto habría
  ocultado el catálogo entero.
- Antes había copia cifrada del mismo día, probada.

## Qué se rompe si tocas esto

- El sembrado de ejemplo (`scripts/seed.mts`) vuelve a publicar ese catálogo
  si se corre contra producción. No correrlo ahí.
- Un proveedor nuevo y real se aprueba como siempre; no hay ninguna regla que
  oculte «lo que no es Unique Colombia».

## Verificación

`/catalogo`: 15 ofertas. `/proveedores`: solo `unique-colombia`. Portada con
sus tres secciones.
