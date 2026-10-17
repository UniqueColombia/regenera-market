-- Espejo del catálogo en el MariaDB de Hostinger — experimento MySQL, etapa 1.
--
-- **No es una migración: es un espejo desechable.** `scripts/mysql/espejo.mts`
-- lo aplica entero (borra y vuelve a crear) y después copia desde Supabase. La
-- fuente de verdad sigue siendo Postgres; aquí no se escribe nada que no venga
-- de allá. Por eso empieza con `drop`.
--
-- Solo están las tablas y columnas que lee `/catalogo` (`consultarOfertas()` en
-- `src/lib/repo.ts`), con los tipos de producción leídos de
-- `information_schema` el 2026-10-17. De `providers`, solo lo que la vista
-- expone: nada de correos, NIT ni datos de pago.
--
-- Traducciones de Postgres que hay que conocer:
--   uuid         → char(36) ascii_bin. Compara byte a byte, como Postgres: el
--                  desempate `order by id` tiene que dar el mismo orden o la
--                  paginación repite y salta ofertas.
--   text[]/enum[]→ json. El `@>` de Postgres pasa a ser json_contains().
--   timestamptz  → datetime(6) en UTC. La conexión fija time_zone = '+00:00'.
--   sin_tildes() → nada: la colación uca1400_ai_ci ya compara sin tildes ni
--                  mayúsculas, así que `busqueda` es el texto tal cual. Si se
--                  cambia la colación, la búsqueda deja de encontrar «Nariño»
--                  al escribir «narino».
--   category, subcategory y department van en utf8mb4_bin: el catálogo filtra
--                  por igualdad exacta, como Postgres. Con la colación de la
--                  tabla, «Nariño» = «narino» y el filtro traería de más.
--   La vista congela su `l.*` igual que en Postgres (ver la 0020): una columna
--   nueva en `listings` obliga a recrearla.

-- Sin revisar llaves foráneas mientras se borra: `permisos-de-ofertas.sql`
-- cuelga tablas de `providers`, y se rehacen justo después.
set foreign_key_checks = 0;
drop view if exists listings_publicos;
drop table if exists listing_availability;
drop table if exists listings;
drop table if exists providers;
set foreign_key_checks = 1;

create table providers (
  id                   char(36) character set ascii collate ascii_bin not null primary key,
  slug                 varchar(200) collate utf8mb4_bin not null unique,
  name                 text not null,
  status               enum('draft','pending_review','approved','rejected','suspended') not null default 'draft',
  sustainability_score int not null default 0,
  tier                 enum('unverified','semilla','raiz','bosque') not null default 'unverified',
  -- El sello de la evaluación verificada: público (sale en el perfil) y lo
  -- exige la consultoría (`permisos-de-ofertas.sql`).
  sustainability_verified_at datetime(6),
  busqueda             text generated always as (coalesce(name, '')) stored
) engine = innodb default charset = utf8mb4 collate = utf8mb4_uca1400_ai_ci;

create table listings (
  id                     char(36) character set ascii collate ascii_bin not null primary key,
  slug                   varchar(200) collate utf8mb4_bin not null unique,
  provider_id            char(36) character set ascii collate ascii_bin not null,
  kind                   enum('product','experience','service') not null,
  title                  text not null,
  summary                text not null default '',
  description            text not null default '',
  category               varchar(100) collate utf8mb4_bin not null,
  verticals              json not null default ('[]'),
  images                 json not null default ('[]'),
  price_cop              int not null,
  wholesale_price_cop    int,
  wholesale_min_qty      int,
  unit                   varchar(100) not null default 'unidad',
  quote_only             boolean not null default false,
  stock                  int,
  co2_kg_saved           decimal(10,2),
  water_liters_saved     decimal(10,2),
  waste_kg_reduced       decimal(10,2),
  certifications         json not null default ('[]'),
  department             varchar(100) collate utf8mb4_bin,
  city                   varchar(100),
  status                 enum('draft','pending_review','approved','rejected','suspended') not null default 'draft',
  featured               boolean not null default false,
  duration_hours         int,
  min_people             int,
  max_people             int,
  meeting_point          text,
  includes               json,
  delivery_time          text,
  scope                  json,
  created_at             datetime(6) not null default current_timestamp(6),
  -- 0012
  subcategory            varchar(100) collate utf8mb4_bin,
  aporte_ambiental       text,
  consecuencia_ambiental text,
  huella_co2_kg          decimal(10,2),
  -- 0014
  despacho               varchar(100),
  transportadora         varchar(255),
  envio_cop              int,
  entrega_dias_min       int,
  entrega_dias_max       int,
  version                int not null default 1,
  -- 0017
  envio_local_cop        int,
  envio_adicional_cop    int,
  peso_kg                decimal(8,2),
  largo_cm               int,
  ancho_cm               int,
  alto_cm                int,
  -- Las dos generadas de la 0003, con la misma fórmula.
  busqueda               text generated always as (
                           concat_ws(' ', coalesce(title, ''), coalesce(summary, ''),
                                     coalesce(description, ''), coalesce(category, ''))
                         ) stored,
  impacto                decimal(20,6) generated always as (
                           coalesce(co2_kg_saved, 0) + coalesce(water_liters_saved, 0) / 100
                           + coalesce(waste_kg_reduced, 0) * 2
                         ) stored,
  key listings_estado_proveedor (status, provider_id),
  key listings_categoria (category),
  key listings_impacto (impacto),
  constraint listings_proveedor foreign key (provider_id) references providers (id) on delete cascade
) engine = innodb default charset = utf8mb4 collate = utf8mb4_uca1400_ai_ci;

create table listing_availability (
  id          char(36) character set ascii collate ascii_bin not null primary key,
  listing_id  char(36) character set ascii collate ascii_bin not null,
  `date`      date not null,
  slots_total int not null,
  slots_taken int not null default 0,
  key disponibilidad_oferta (listing_id, `date`),
  constraint disponibilidad_oferta foreign key (listing_id) references listings (id) on delete cascade
) engine = innodb default charset = utf8mb4 collate = utf8mb4_uca1400_ai_ci;

create view listings_publicos as
select
  l.*,
  p.slug                 as provider_slug,
  p.name                 as provider_name,
  p.sustainability_score as provider_score,
  p.tier                 as provider_tier,
  p.busqueda             as provider_busqueda
from listings l
join providers p on p.id = l.provider_id
where l.status = 'approved'
  and p.status = 'approved';
