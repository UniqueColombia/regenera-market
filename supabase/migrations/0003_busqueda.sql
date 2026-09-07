-- ---------------------------------------------------------------------------
-- 0003 — Búsqueda sin tildes, vista pública del catálogo y certificaciones
--        visibles
--
-- Lo que habilita: que `src/lib/repo.ts` deje de leer de `src/data/` en memoria
-- y consulte Postgres sin perder ninguna de las tres cosas que la versión en
-- memoria hacía bien — encontrar "Amazonía" escribiendo "amazonia", ordenar por
-- relevancia premiando al proveedor evaluado, y filtrar por nivel hacia arriba.
--
-- Aditiva: no borra ni altera ninguna columna existente.
-- ---------------------------------------------------------------------------

-- Supabase instala las extensiones en el esquema `extensions`, no en `public`,
-- y su `search_path` ya lo incluye. Comprobado el 2026-09-05 contra el proyecto:
-- pgcrypto y uuid-ossp viven ahí. Si se instalaran en `public` chocarían con el
-- esquema de la aplicación.
create extension if not exists unaccent with schema extensions;
-- pg_trgm es lo que hace que un `ilike '%algo%'` pueda usar índice. Sin él, la
-- búsqueda del catálogo es un recorrido de toda la tabla.
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- La trampa del unaccent
--
-- `unaccent()` está declarada STABLE, no IMMUTABLE, porque su resultado depende
-- del diccionario instalado, que en teoría puede cambiar. Una columna generada
-- exige IMMUTABLE, así que la llamada directa se rechaza.
--
-- El envoltorio fija el diccionario explícitamente con `::regdictionary`, que
-- es lo que vuelve el resultado reproducible, y se declara IMMUTABLE. Es el
-- patrón estándar para este caso.
--
-- Todo va calificado con su esquema y NO se usa `set search_path`: una función
-- con cláusula SET no se puede inlinear y da problemas dentro de una columna
-- generada. Calificar da la misma protección contra secuestro de esquema.
-- ---------------------------------------------------------------------------
create or replace function public.sin_tildes(texto text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, texto));
$$;

comment on function public.sin_tildes(text) is
  'Minúsculas sin diacríticos. Espeja normalize() de src/lib/repo.ts: si una '
  'cambia, la otra también, o la búsqueda deja de encontrar lo mismo en '
  'servidor y en cliente.';

-- ---------------------------------------------------------------------------
-- Columna de búsqueda
--
-- Generada y almacenada, no calculada en cada consulta: la búsqueda del
-- catálogo es la consulta más frecuente del sitio.
--
-- No incluye el nombre del proveedor aunque la búsqueda sí lo cubra: una
-- columna generada solo puede leer columnas de su propia fila. Eso se resuelve
-- en la vista de más abajo.
-- ---------------------------------------------------------------------------
alter table listings
  add column if not exists busqueda text
  generated always as (
    public.sin_tildes(
      coalesce(title, '') || ' ' ||
      coalesce(summary, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(category, '')
    )
  ) stored;

create index if not exists listings_busqueda_idx
  on listings using gin (busqueda extensions.gin_trgm_ops);

-- Puntaje de impacto, con la misma fórmula que tenía `impactScore()` en
-- `src/lib/repo.ts`. Se materializa para poder decir `order by impacto desc`:
-- PostgREST no sabe ordenar por una expresión, y traerse el catálogo entero
-- para ordenarlo en JavaScript es justo lo que no se quiere.
--
-- Si la fórmula cambia, cambia aquí y en ningún otro sitio.
alter table listings
  add column if not exists impacto numeric
  generated always as (
    coalesce(co2_kg_saved, 0)
    + coalesce(water_liters_saved, 0) / 100
    + coalesce(waste_kg_reduced, 0) * 2
  ) stored;

create index if not exists listings_impacto_idx on listings (impacto desc);

alter table providers
  add column if not exists busqueda text
  generated always as (public.sin_tildes(coalesce(name, ''))) stored;

create index if not exists providers_busqueda_idx
  on providers using gin (busqueda extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Vista pública del catálogo
--
-- Existe por una limitación concreta de PostgREST: no sabe ordenar la tabla
-- padre por una columna de una tabla embebida. El orden por defecto del
-- catálogo es "destacados primero, luego mejor puntaje del proveedor", y ese
-- puntaje vive en `providers`. Sin la vista habría que traerse todo y ordenarlo
-- en JavaScript, que funciona con 18 ofertas y muere con 1.500.
--
-- De paso resuelve otras dos: el filtro por nivel («de este nivel hacia
-- arriba») pasa a ser un `>=` sobre una columna normal, y la búsqueda por
-- nombre de proveedor deja de necesitar una segunda consulta.
--
-- `security_invoker = true` NO es opcional. Por defecto una vista consulta con
-- los permisos de quien la creó, lo que dejaría a cualquier visitante leyendo a
-- través de ella lo que RLS le niega directamente. Con esta opción, las
-- políticas se evalúan como el usuario que consulta.
--
-- El `where` duplica lo que la política `listings_public_read` ya exige. No
-- sobra: la política es la barrera y esto es la intención declarada. Si algún
-- día la vista se consultara con otro rol, el filtro sigue puesto.
-- ---------------------------------------------------------------------------
create or replace view listings_publicos
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
-- Certificaciones de proveedor visibles
--
-- Hueco de 0001: `provider_certifications` solo se podía leer siendo el propio
-- proveedor o admin, pero la ficha pública las muestra y el catálogo filtra por
-- ellas. Sin esta política, los sellos desaparecen de las tarjetas en cuanto el
-- catálogo salga de la base, y nadie relacionaría el síntoma con RLS.
--
-- Solo se abren las verificadas: una certificación sin `verified_at` es una
-- afirmación del proveedor que nadie comprobó, y publicarla sería exactamente
-- lo que la plataforma promete no hacer.
-- ---------------------------------------------------------------------------
drop policy if exists provider_certs_public_read on provider_certifications;
create policy provider_certs_public_read on provider_certifications
  for select using (verified_at is not null);

-- ---------------------------------------------------------------------------
-- Rollback
--
--   drop policy if exists provider_certs_public_read on provider_certifications;
--   drop view if exists listings_publicos;
--   drop index if exists providers_busqueda_idx;
--   drop index if exists listings_impacto_idx;
--   drop index if exists listings_busqueda_idx;
--   alter table providers drop column if exists busqueda;
--   alter table listings  drop column if exists impacto;
--   alter table listings  drop column if exists busqueda;
--   drop function if exists public.sin_tildes(text);
--   -- las extensiones se dejan: otras cosas pueden depender de ellas
--
-- Revertir deja el catálogo sin poder servirse de Postgres. Solo tiene sentido
-- junto con revertir `src/lib/repo.ts`.
-- ---------------------------------------------------------------------------
