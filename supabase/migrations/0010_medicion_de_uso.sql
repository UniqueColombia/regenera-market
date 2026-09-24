-- ---------------------------------------------------------------------------
-- 0010 — Medición de uso propia, y solo con permiso
--
-- ## Qué se quiere saber
--
-- Cuánta gente entra, qué páginas mira, desde dónde llega y con qué aparato.
-- Es lo que necesita el panel `/admin/analiticas` para contestar «¿está
-- sirviendo lo que publicamos?» sin adivinar.
--
-- ## Por qué propia y no una herramienta de terceros
--
-- 1. **Los datos no salen de la base que ya declaramos.** La política de
--    privacidad enumera a Supabase y Vercel como encargados; una herramienta de
--    analítica sería un encargado más, con su propio tratamiento, su propia
--    transferencia internacional y su propio costo. Decidir eso es de un humano
--    (`CLAUDE.md`, «Límites duros»), y esto se puede hacer sin decidirlo.
-- 2. **Se guarda lo mínimo, y se ve qué es.** Cinco columnas, ninguna es un
--    dato de contacto, y la IP no se guarda nunca.
--
-- ## Qué se guarda por cada página vista
--
-- - `path`: la ruta, **sin la query**. `/catalogo?q=jabon` se guarda como
--   `/catalogo`: lo que alguien busca es asunto suyo.
-- - `referrer_host`: el dominio de donde llegó (`google.com`), nunca la URL
--   entera. `null` cuando llegó directo o navegando dentro del sitio.
-- - `visitor`: el SHA-256 de un identificador aleatorio que vive en la cookie
--   `sgr_visitante`. Sirve para contar visitantes distintos y nada más: no se
--   cruza con `auth.users` ni con `profiles`, ni aquí ni en ninguna consulta.
-- - `device`: móvil, tableta o escritorio, deducido del navegador.
-- - `country`: el país que resuelve Vercel por la IP (`x-vercel-ip-country`).
--   La IP en sí no llega a la base.
--
-- ## Quién escribe y quién lee
--
-- **Nadie escribe directo.** La tabla no tiene política de `insert`: solo la
-- toca `registrar_visita()`, que valida cada campo. El route handler
-- `/api/medicion` es quien la llama, y **solo si la cookie de consentimiento
-- dice que sí** — esa es la barrera que importa, y vive en el servidor.
--
-- Alguien con la clave anon podría llamar a `registrar_visita()` a mano. Lo
-- peor que consigue es ensuciar las cifras del panel; no lee nada ni toca datos
-- de nadie. Es el mismo riesgo que tiene cualquier contador de visitas.
--
-- **Lee solo un administrador**, y en agregado: `admin_analiticas()` devuelve
-- totales y rankings, nunca filas.
--
-- ## Cuánto se guarda
--
-- Trece meses, para poder comparar un mes con el mismo del año anterior.
-- `registrar_visita()` borra lo más viejo de vez en cuando (una llamada de cada
-- quinientas), así que no hace falta ningún trabajo programado.
--
-- ## Cómo se aplica
--
-- Solo agrega: una tabla nueva y dos funciones. **Se puede aplicar antes o
-- después de desplegar.** Mientras no esté aplicada, el sitio no se rompe: la
-- medición falla en silencio y el panel dice que falta esta migración.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0010_medicion_de_uso.sql
-- ---------------------------------------------------------------------------

create table if not exists page_views (
  id bigint generated always as identity primary key,
  path text not null check (path ~ '^/' and char_length(path) <= 200),
  referrer_host text check (char_length(referrer_host) <= 100),
  visitor text not null check (visitor ~ '^[0-9a-f]{64}$'),
  device text not null check (device in ('movil', 'tableta', 'escritorio')),
  country text check (country ~ '^[A-Z]{2}$'),
  created_at timestamptz not null default now()
);

comment on table page_views is
  'Una fila por página vista, solo con consentimiento de medición. Sin IP ni datos de contacto. Ver la cabecera de 0010.';

create index if not exists page_views_created_idx on page_views (created_at);

alter table page_views enable row level security;

-- La única política es de lectura y solo para administración. Sin política de
-- escritura, nadie inserta salvo `registrar_visita()`, que es security definer.
drop policy if exists page_views_admin_read on page_views;
create policy page_views_admin_read on page_views
  for select using (is_admin());

-- ---------------------------------------------------------------------------
-- Registrar una visita
-- ---------------------------------------------------------------------------

create or replace function registrar_visita(
  _path text,
  _referrer_host text,
  _visitor text,
  _device text,
  _country text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Lo que no cumple el formato se descarta sin error: el navegador no espera
  -- respuesta, y un error aquí solo llenaría los registros de ruido.
  if _path is null or _path !~ '^/' or char_length(_path) > 200 then return; end if;
  if _visitor is null or _visitor !~ '^[0-9a-f]{64}$' then return; end if;
  if _device not in ('movil', 'tableta', 'escritorio') then return; end if;

  insert into page_views (path, referrer_host, visitor, device, country)
  values (
    _path,
    nullif(left(lower(_referrer_host), 100), ''),
    _visitor,
    _device,
    case when _country ~ '^[A-Z]{2}$' then _country end
  );

  -- La retención, sin cron: de vez en cuando, quien registra una visita barre
  -- lo que pasó de trece meses. El índice por fecha hace que sea barato.
  if random() < 0.002 then
    delete from page_views where created_at < now() - interval '13 months';
  end if;
end;
$$;

revoke all on function registrar_visita(text, text, text, text, text) from public;
grant execute on function registrar_visita(text, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- El resumen del panel
-- ---------------------------------------------------------------------------
--
-- Todo en una llamada y en un jsonb: el panel lo pinta tal cual, y así la
-- agregación la hace Postgres en vez de traer miles de filas a Node.
--
-- Los días se cuentan en hora de Colombia porque es donde está el equipo que
-- lee el panel. Una visita a las 22:00 de Bogotá es del mismo día, no del
-- siguiente en UTC.
--
-- Además del tráfico devuelve cuatro cifras del negocio en el mismo periodo
-- —cuentas nuevas, postulaciones, órdenes y publicaciones—, porque una visita
-- sola no dice nada: lo que interesa es si las visitas acaban en algo.

create or replace function admin_analiticas(_dias int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _zona constant text := 'America/Bogota';
  _hoy date := (now() at time zone _zona)::date;
  _desde date;
  _antes date;
  _resultado jsonb;
begin
  if not is_admin() then
    raise exception 'solo-admin';
  end if;

  _dias := greatest(1, least(coalesce(_dias, 30), 365));
  _desde := _hoy - (_dias - 1);
  _antes := _desde - _dias;

  with
    periodo as (
      select *, (created_at at time zone _zona)::date as dia
      from page_views
      where created_at >= (_desde::timestamp at time zone _zona)
    ),
    anterior as (
      select *
      from page_views
      where created_at >= (_antes::timestamp at time zone _zona)
        and created_at < (_desde::timestamp at time zone _zona)
    )
  select jsonb_build_object(
    'dias', _dias,
    'desde', _desde,
    'hasta', _hoy,
    'visitas', (select count(*) from periodo),
    'visitantes', (select count(distinct visitor) from periodo),
    'visitas_antes', (select count(*) from anterior),
    'visitantes_antes', (select count(distinct visitor) from anterior),
    'por_dia', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'dia', d.dia::date, 'visitas', coalesce(p.visitas, 0), 'visitantes', coalesce(p.visitantes, 0)
      ) order by d.dia), '[]'::jsonb)
      from generate_series(_desde, _hoy, interval '1 day') as d(dia)
      left join (
        select dia, count(*) as visitas, count(distinct visitor) as visitantes
        from periodo group by dia
      ) p on p.dia = d.dia::date
    ),
    'paginas', (
      select coalesce(jsonb_agg(x order by x.visitas desc, x.clave), '[]'::jsonb)
      from (
        select path as clave, count(*) as visitas, count(distinct visitor) as visitantes
        from periodo group by path order by count(*) desc, path limit 10
      ) x
    ),
    'origenes', (
      select coalesce(jsonb_agg(x order by x.visitas desc, x.clave), '[]'::jsonb)
      from (
        select coalesce(referrer_host, '') as clave, count(*) as visitas,
               count(distinct visitor) as visitantes
        from periodo group by 1 order by count(*) desc, 1 limit 8
      ) x
    ),
    'dispositivos', (
      select coalesce(jsonb_agg(x order by x.visitas desc), '[]'::jsonb)
      from (
        select device as clave, count(*) as visitas, count(distinct visitor) as visitantes
        from periodo group by device
      ) x
    ),
    'paises', (
      select coalesce(jsonb_agg(x order by x.visitas desc, x.clave), '[]'::jsonb)
      from (
        select coalesce(country, '') as clave, count(*) as visitas,
               count(distinct visitor) as visitantes
        from periodo group by 1 order by count(*) desc, 1 limit 8
      ) x
    ),
    'negocio', jsonb_build_object(
      'cuentas', (
        select count(*) from auth.users
        where created_at >= (_desde::timestamp at time zone _zona)
      ),
      'postulaciones', (
        select count(*) from provider_applications
        where created_at >= (_desde::timestamp at time zone _zona)
      ),
      'ordenes', (
        select count(*) from orders
        where created_at >= (_desde::timestamp at time zone _zona)
      ),
      'ordenes_cop', (
        select coalesce(sum(total_cop), 0) from orders
        where created_at >= (_desde::timestamp at time zone _zona)
          and status not in ('cancelled', 'refunded')
      ),
      'publicaciones', (
        select count(*) from community_posts
        where created_at >= (_desde::timestamp at time zone _zona)
      )
    )
  ) into _resultado;

  return _resultado;
end;
$$;

revoke all on function admin_analiticas(int) from public;
grant execute on function admin_analiticas(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
--
--   drop function if exists admin_analiticas(int);
--   drop function if exists registrar_visita(text, text, text, text, text);
--   drop table if exists page_views;
