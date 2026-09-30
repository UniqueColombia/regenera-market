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
-- No hace falta nada nuevo: `community_posts_delete_own` (la 0007) deja al autor
-- borrar lo suyo y `community_posts_admin` deja al equipo borrar cualquiera. Las
-- reacciones caen solas (`on delete cascade`). Borrar es definitivo y no deja
-- rastro, a propósito.
--
-- **Los puntos no se devuelven ni se repiten.** `experience_events` guarda el
-- hecho con su propia clave: borrar una publicación no quita los puntos que dio
-- y volver a publicar no los suma otra vez por encima del tope mensual.
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
-- Rollback
--
--   alter table community_posts drop column if exists edited_at;
--   -- y volver a crear community_proteger_derivados() con el cuerpo de la 0008.
-- ---------------------------------------------------------------------------
