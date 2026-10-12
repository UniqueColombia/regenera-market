-- Lo mínimo de Supabase que las migraciones dan por hecho, sobre un Postgres
-- cualquiera (17, el de Supabase hoy).
--
-- Tiene dos usos, y por eso vive en el repositorio y no en una carpeta temporal:
--
-- 1. Las pruebas de la base (`npm run test:base`) lo aplican antes de las
--    migraciones en un Postgres desechable.
-- 2. Es el CONTRATO de portabilidad: la lista exacta de lo que hay que darle a
--    un Postgres propio (una VPS, RDS, Neon…) para que `0001`…`NNNN` corran sin
--    cambiar una línea. Ver `docs/PORTABILIDAD.md`.
--
-- Si una migración nueva usa algo de Supabase que no está aquí, las pruebas
-- fallan al aplicarla: es la alarma de que el acoplamiento creció. Se agrega
-- aquí, imitando lo que hace Supabase, y se anota en PORTABILIDAD.md.
--
-- Las funciones de `auth` leen el mismo ajuste que PostgREST escribe en cada
-- petición (`request.jwt.claims`). Por eso una prueba entra «como» un usuario
-- igual que lo hace la aplicación: `set local role authenticated` más los
-- claims. Ver `comoUsuario()` en `arnes.ts`.

-- ---------------------------------------------------------------------------
-- Roles. En Supabase existen antes de la primera migración.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  -- `bypassrls`: es la clave de servicio, la que se salta toda política.
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant anon, authenticated, service_role to current_user;

-- Supabase da a los tres roles acceso a todo lo que se cree en `public`; la
-- seguridad la ponen las políticas, no los grants. Las migraciones cuentan con
-- eso: casi ninguna hace `grant select` sobre sus tablas.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Extensiones. Supabase las instala en el esquema `extensions`.
-- ---------------------------------------------------------------------------
create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- auth: solo las columnas que leen las migraciones.
-- ---------------------------------------------------------------------------
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              varchar(255),
  phone              text,
  raw_user_meta_data jsonb not null default '{}',
  email_confirmed_at timestamptz,
  last_sign_in_at    timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb;
$$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    auth.jwt() ->> 'sub'
  )::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    auth.jwt() ->> 'role'
  )::text;
$$;

grant execute on function auth.jwt(), auth.uid(), auth.role()
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- storage: los buckets y la tabla de objetos sobre la que van las políticas.
-- Los archivos en sí no viven en Postgres; ver `src/lib/almacenamiento.ts`.
-- ---------------------------------------------------------------------------
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id         text primary key,
  name       text not null unique,
  public     boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text,
  owner      uuid,
  metadata   jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table storage.objects enable row level security;
grant all on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;

-- La misma definición que Supabase: las carpetas de la ruta, sin el archivo.
create or replace function storage.foldername(name text)
returns text[]
language plpgsql
immutable
as $$
declare
  _partes text[];
begin
  select string_to_array(name, '/') into _partes;
  return _partes[1 : array_length(_partes, 1) - 1];
end;
$$;
