-- 0020 — La vista del catálogo, con las columnas de la 0017.
--
-- **Arregla lo que rompió la 0017 el 2026-10-14.** La 0017 agregó a `listings`
-- la tarifa local, la de cada unidad adicional, el peso y las medidas, pero no
-- recreó `listings_publicos`. Esa vista es `l.*`, y **Postgres congela el `*`
-- al crear la vista**: las columnas que llegan después no aparecen en ella. La
-- 0012 y la 0014 lo sabían y la recrearon; la 0017 no.
--
-- El código preguntaba a la tabla si existían las columnas, la tabla decía que
-- sí, y se las pedía a la vista, que no las tenía: el catálogo salía vacío, la
-- portada respondía 500 y las fichas no cargaban, hasta que el código pasó a
-- preguntarle a la vista (`enviosPorZonaDisponible()` en `src/lib/repo.ts`).
-- Desde entonces el sitio funciona sin esta migración, con la tarifa fija; al
-- aplicarla se enciende el envío por zona.
--
-- Lo que impide que vuelva a pasar es una prueba, no este comentario:
-- `supabase/pruebas/vista-del-catalogo.test.ts` falla si la vista o la tabla no
-- tienen alguna de las columnas que el código les pide
-- (`src/lib/columnas-ofertas.ts`). **Toda migración que agregue una columna a
-- `listings` y quiera leerla en el catálogo tiene que recrear la vista**, como
-- esta.
--
-- Misma definición que en la 0014. `drop` + `create` y no `create or replace`:
-- las columnas nuevas quedan en medio de `l.*`, antes de las del proveedor, y
-- `create or replace view` solo deja agregar columnas al final. El SQL Editor
-- corre todo el archivo en una sola transacción: si algo falla, la vista vieja
-- se queda como estaba.

drop view if exists listings_publicos;
create view listings_publicos
with (security_invoker = true) as
select
  l.*,
  p.slug                as provider_slug,
  p.name                as provider_name,
  p.sustainability_score as provider_score,
  p.tier                as provider_tier,
  p.busqueda            as provider_busqueda
from listings l
join providers p on p.id = l.provider_id
where l.status = 'approved'
  and p.status = 'approved';

grant select on listings_publicos to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Comprobación después de aplicarla (tiene que dar 1):
--
--   select count(*) from information_schema.columns
--    where table_name = 'listings_publicos' and column_name = 'envio_local_cop';
--
-- Rollback: no hace falta. Es la misma vista con más columnas; el código
-- anterior no las pide.
-- ---------------------------------------------------------------------------
