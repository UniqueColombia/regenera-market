-- 0013 — Editar y eliminar publicaciones de la Comunidad
--
-- ## Qué cambia
--
-- 1. `community_posts.edited_at`: cuándo se modificó por última vez el contenido
--    (título, texto o tema). La tarjeta del muro enseña «editada» con esa fecha.
--    No se guardan las versiones anteriores: con saber que se editó, y cuándo,
--    basta para que nadie cambie el sentido de lo que ya tiene reacciones sin que
--    se note, y no se acumula basura.
-- 2. El trigger `community_proteger_derivados()` sella `edited_at` él solo: el
--    autor no lo escribe (un valor que el usuario fija es un valor que miente) y
--    solo cambia si de verdad cambió título, texto o tema. Un administrador que
--    oculta o destaca no marca la publicación como editada.
-- 3. El autor tampoco puede cambiar `provider_id` en un update: firmar como una
--    empresa se decide al publicar y lo comprueba `community_posts_insert`; sin
--    esto, un update directo a PostgREST saltaba esa comprobación.
--
-- ## Eliminar
--
-- `community_posts_delete_own` (la 0007) deja al autor borrar lo suyo y
-- `community_posts_admin` deja al equipo borrar cualquiera. Las reacciones caen
-- solas (`on delete cascade`). Borrar es definitivo y no deja rastro de la
-- publicación, a propósito. Dos cosas se añaden aquí:
--
-- 4. **Borrar quita los puntos que la publicación dio.** Un trigger `before
--    delete` (`community_revertir_experiencia`) borra de `experience_events` los
--    eventos `articulo_publicado` y `articulo_destacado` de esa publicación y
--    resta su suma de `providers.experience_points` (nunca por debajo de 0). El
--    nivel se recalcula solo (`providers_tier_por_experiencia`), así que puede
--    bajar, y con él subir la comisión. La aplicación avisa antes, con el número.
--    Esto cambia la regla de la 0006 («los puntos no bajan nunca») en un solo
--    caso: los puntos de algo que ya no existe.
--
-- 5. **Borrar no libera cupo de publicación.** Los topes de la 0011 (30 s, 3 al
--    día, 10 al mes) contaban filas de `community_posts`, así que borrar una
--    devolvía el cupo y se podía publicar y borrar sin fin. Ahora cuentan
--    `community_post_log`: una fila mínima (autor y hora) por publicación creada,
--    que sobrevive a borrar la publicación y se poda sola a los 30 días. No guarda
--    título, texto ni nada de lo borrado; acotada a ≤ 10 filas por persona.
--
-- Idempotente: se puede correr dos veces.
-- ---------------------------------------------------------------------------

alter table community_posts
  add column if not exists edited_at timestamptz;

comment on column community_posts.edited_at is
  'Última vez que cambió el título, el texto o el tema. Lo sella el trigger '
  'community_proteger_derivados; nadie lo escribe a mano.';

create or replace function community_proteger_derivados()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.author_name := coalesce(
      nullif(trim((select full_name from profiles where id = new.author_id)), ''),
      'Alguien de la comunidad'
    );
    new.edited_at := null;
    return new;
  end if;

  -- Marca de transacción: el contador de reacciones se actualiza con ella.
  if coalesce(current_setting('app.derivados', true), 'off') = 'on' then
    return new;
  end if;

  if is_admin() then
    return new;
  end if;

  new.status          := old.status;
  new.featured        := old.featured;
  new.reaction_count  := old.reaction_count;
  new.reaction_counts := old.reaction_counts;
  new.author_id       := old.author_id;
  new.author_name     := old.author_name;
  new.provider_id     := old.provider_id;
  new.created_at      := old.created_at;

  -- «Editada» solo si cambió lo que se lee. Comparar con `is distinct from`
  -- para no marcar como editada una publicación guardada sin cambios.
  if (new.title, new.body, new.topic) is distinct from (old.title, old.body, old.topic) then
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Borrar una publicación quita los puntos que dio
--
-- `before delete` y no `after`: mientras la fila existe, `referencia` todavía
-- apunta a algo real. `security definer` para poder tocar `experience_events` y
-- `providers.experience_points`, que el usuario no puede escribir.
--
-- Solo se quitan los eventos que este post generó (`referencia` = su id). Si
-- el tope mensual impidió que diera puntos, no hay evento y no se resta nada.
-- ---------------------------------------------------------------------------

create or replace function community_revertir_experiencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _puntos int;
begin
  if old.provider_id is null then
    return old;
  end if;

  with borrados as (
    delete from experience_events
     where provider_id = old.provider_id
       and referencia = old.id::text
       and clave in ('articulo_publicado', 'articulo_destacado')
    returning puntos
  )
  select coalesce(sum(puntos), 0) into _puntos from borrados;

  if _puntos > 0 then
    update providers
       set experience_points = greatest(0, experience_points - _puntos)
     where id = old.provider_id;
  end if;

  return old;
end;
$$;

drop trigger if exists community_posts_revertir_experiencia on community_posts;
create trigger community_posts_revertir_experiencia
  before delete on community_posts
  for each row execute function community_revertir_experiencia();

-- ---------------------------------------------------------------------------
-- 5. Borrar no libera cupo de publicación
--
-- Sin políticas: con RLS activada y ninguna política, nadie lee ni escribe la
-- tabla desde PostgREST; solo la toca `community_posts_limites()`, que es
-- `security definer`.
-- ---------------------------------------------------------------------------

create table if not exists community_post_log (
  author_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists community_post_log_autor_fecha_idx
  on community_post_log (author_id, created_at desc);

alter table community_post_log enable row level security;

comment on table community_post_log is
  'Una fila por publicación creada (autor y hora), para que borrar no libere el '
  'cupo de publicación. Se poda a los 30 días. No guarda contenido.';

-- Las publicaciones de los últimos 30 días ya cuentan desde el primer momento.
insert into community_post_log (author_id, created_at)
select author_id, created_at
  from community_posts
 where created_at > now() - interval '30 days'
   and not exists (select 1 from community_post_log);

create or replace function community_posts_limites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _ultima timestamptz;
  _hoy int;
  _mes int;
begin
  if is_admin() then
    return new;
  end if;

  -- Poda: lo de más de 30 días ya no cuenta para ningún tope.
  delete from community_post_log
   where author_id = new.author_id
     and created_at < now() - interval '30 days';

  select max(created_at) into _ultima
    from community_post_log
   where author_id = new.author_id;

  if _ultima is not null and _ultima > now() - interval '30 seconds' then
    raise exception 'limite-ritmo' using errcode = 'P0001';
  end if;

  select
    count(*) filter (where created_at > now() - interval '1 day'),
    count(*) filter (where created_at > now() - interval '30 days')
    into _hoy, _mes
    from community_post_log
   where author_id = new.author_id;

  if _hoy >= 3 then
    raise exception 'limite-diario' using errcode = 'P0001';
  end if;

  if _mes >= 10 then
    raise exception 'limite-mensual' using errcode = 'P0001';
  end if;

  insert into community_post_log (author_id) values (new.author_id);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rollback
--
--   drop trigger if exists community_posts_revertir_experiencia on community_posts;
--   drop function if exists community_revertir_experiencia();
--   drop table if exists community_post_log;
--   alter table community_posts drop column if exists edited_at;
--   -- y volver a crear community_proteger_derivados() con el cuerpo de la 0008 y
--   -- community_posts_limites() con el de la 0011.
-- ---------------------------------------------------------------------------
