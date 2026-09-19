-- ---------------------------------------------------------------------------
-- 0007 — La Comunidad: publicaciones de usuarios y proveedores
--
-- ## Qué faltaba
--
-- `otorgar_experiencia()` (migración 0006) ya sabía dar puntos por
-- `articulo_publicado` y `articulo_destacado`, y `src/lib/niveles.ts` ya los
-- tenía en su tabla. **No existía dónde publicar.** `/niveles` los ocultaba con
-- una lista `AUN_NO` precisamente por eso: anunciar puntos por algo que no se
-- puede hacer es prometer de más.
--
-- Esta migración crea ese sitio. A partir de aquí los dos eventos dejan de ser
-- teoría y `AUN_NO` desaparece de `src/app/niveles/page.tsx`.
--
-- ## Qué es la Comunidad, y qué no
--
-- Un muro donde **cualquiera con cuenta** cuenta algo: una práctica que le
-- funcionó, una noticia del sector, cómo le fue con un pedido. Se puede publicar
-- a título personal o **en nombre de una empresa que gestionas**, y esa segunda
-- forma es la que suma experiencia — el nivel mide actividad de la empresa, no
-- del individuo.
--
-- No hay comentarios. Hay una reacción única por persona y publicación
-- («me sirve»), que es suficiente para ordenar lo útil arriba sin abrir un hilo
-- que haya que moderar. Cuando exista herramienta de moderación se reconsidera;
-- hoy no la hay, y un hilo sin moderación es una deuda que se paga en público.
--
-- ## Las tres decisiones que conviene no deshacer
--
-- 1. **Se publica al instante, con `status = 'approved'`.** Es la misma decisión
--    que tomó la 0006 con los proveedores: el control es una palanca (suspender,
--    que es reversible) y no una puerta (aprobar, que convierte al equipo en el
--    cuello de botella de su propio crecimiento).
-- 2. **Se reutiliza el enum `review_status`** en vez de crear uno nuevo. Agregar
--    un valor a un enum de Postgres obliga a partir la migración en dos archivos
--    —no se puede *usar* el valor nuevo en la transacción que lo crea—, y aquí
--    `approved` / `suspended` dicen exactamente lo que hace falta.
-- 3. **`reaction_count` es una columna, no un `count(*)`.** El muro pinta 20
--    tarjetas por página y ordenarlas por reacciones con una subconsulta por
--    fila es la consulta que se vuelve lenta justo cuando la sección empieza a
--    usarse. La mantiene un trigger, nunca la aplicación.
--
-- ## Cómo se aplica
--
-- Es aditiva: dos tablas, una columna de contador dentro de una de ellas, sus
-- políticas y tres triggers. No toca nada de 0001–0006.
--
-- **Hay que aplicarla ANTES de desplegar el código de esta tanda**, igual que la
-- 0006: `/comunidad` consulta `community_posts`, y sin la tabla la página
-- responde error en vez de vacío.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0007_comunidad.sql
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Las publicaciones
--
-- `author_id` es siempre la persona: quién escribió esto no se delega nunca.
-- `provider_id` es opcional y significa «lo firma esta empresa». Las dos cosas
-- conviven porque la ficha pública muestra «Ana, de Cooperativa X», no una ni la
-- otra.
--
-- `on delete cascade` en el autor y `on delete set null` en la empresa: si una
-- persona borra su cuenta se lleva lo que escribió, pero si una empresa se da de
-- baja la publicación sigue siendo de su autora y no desaparece del hilo de la
-- Comunidad dejando un hueco.
-- ---------------------------------------------------------------------------

create table if not exists community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users on delete cascade,
  -- El nombre se copia aquí y no se lee de `profiles` al pintar el muro. Dos
  -- razones, y la primera es que sin esto no habría nombre: `profiles` solo es
  -- legible por su dueño y por un administrador (`profiles_own`), así que un
  -- visitante anónimo vería «alguien» en cada tarjeta. La segunda es que quien
  -- firmó algo en público lo firmó con el nombre que tenía ese día.
  --
  -- **Lo escribe un trigger, nunca quien publica.** Aceptarlo del formulario
  -- convertiría el muro en un suplantador: basta una petición a PostgREST para
  -- publicar firmando con el nombre de otro.
  author_name text not null default '',
  provider_id uuid references providers on delete set null,
  title text not null check (char_length(trim(title)) between 6 and 140),
  body text not null check (char_length(trim(body)) between 80 and 4000),
  -- Para qué sirve lo que se cuenta. Texto con check y no enum, por lo mismo
  -- que se explica arriba: agregar un tema no debe obligar a partir un archivo.
  topic text not null default 'experiencia'
    check (topic in ('experiencia', 'noticia', 'practica', 'pregunta')),
  status review_status not null default 'approved',
  -- Lo pone el equipo desde /admin. Dispara `articulo_destacado`.
  featured boolean not null default false,
  -- Denormalizado a propósito: ver la decisión 3 de la cabecera.
  reaction_count int not null default 0 check (reaction_count >= 0),
  created_at timestamptz not null default now()
);

comment on table community_posts is
  'Muro de la Comunidad. Se publica al instante; el equipo suspende, no aprueba.';
comment on column community_posts.provider_id is
  'Empresa que firma la publicación, si se publicó en su nombre. Solo entonces '
  'suma experiencia: el nivel mide actividad de la empresa, no de la persona.';
comment on column community_posts.reaction_count is
  'Reacciones «me sirve». Lo escribe el trigger community_reactions_contador; '
  'ninguna política permite escribirlo a mano.';

-- El muro se lee siempre por fecha y filtrando lo aprobado. Índice parcial: las
-- suspendidas no se listan nunca, así que no tienen por qué ocupar el índice.
create index if not exists community_posts_recientes_idx
  on community_posts (created_at desc)
  where status = 'approved';

create index if not exists community_posts_provider_idx
  on community_posts (provider_id);

create index if not exists community_posts_author_idx
  on community_posts (author_id);

-- ---------------------------------------------------------------------------
-- 2. Las reacciones
--
-- La clave primaria compuesta **es** la regla de negocio: una persona reacciona
-- una vez a una publicación. Imponerlo aquí y no en la aplicación es lo que hace
-- que dos pulsaciones seguidas desde un teléfono con mala señal no cuenten dos.
-- ---------------------------------------------------------------------------

create table if not exists community_reactions (
  post_id uuid not null references community_posts on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

comment on table community_reactions is
  'Una reacción «me sirve» por persona y publicación. La unicidad la impone la '
  'clave primaria, no el cliente.';

-- ---------------------------------------------------------------------------
-- 3. RLS
--
-- Las dos tablas se activan en la misma migración que las crea. Una tabla sin
-- RLS y con la clave anon es una fuga silenciosa; con RLS y sin políticas es un
-- error ruidoso que se arregla en cinco minutos.
-- ---------------------------------------------------------------------------

alter table community_posts enable row level security;
alter table community_reactions enable row level security;

-- Lectura: lo aprobado lo ve cualquiera, incluido quien no tiene cuenta — es un
-- muro público y es parte de lo que atrae proveedores. Lo suspendido lo sigue
-- viendo su autor, para que sepa que sigue ahí y por qué no aparece.
drop policy if exists community_posts_read on community_posts;
create policy community_posts_read on community_posts
  for select using (
    status = 'approved'
    or author_id = auth.uid()
    or is_admin()
  );

-- Escritura: solo con sesión, solo en nombre propio, y solo firmando con una
-- empresa que de verdad gestionas.
--
-- **`manages_provider(provider_id)` no es cosmético.** Sin esa condición,
-- cualquiera con cuenta podría publicar firmando como Cooperativa X —y, peor,
-- regalarle 30 puntos de experiencia, que son dinero: el nivel baja la comisión.
drop policy if exists community_posts_insert on community_posts;
create policy community_posts_insert on community_posts
  for insert with check (
    author_id = auth.uid()
    and (provider_id is null or manages_provider(provider_id))
  );

-- Corregir lo que escribiste, mientras no esté suspendido. El `with check`
-- repite el dueño para que un update no pueda cambiar de autor.
--
-- `status`, `featured` y `reaction_count` quedan fuera del alcance del autor por
-- los triggers de la sección 5, no por esta política: PostgREST no sabe limitar
-- una política a ciertas columnas.
drop policy if exists community_posts_update_own on community_posts;
create policy community_posts_update_own on community_posts
  for update using (author_id = auth.uid() and status = 'approved')
  with check (author_id = auth.uid());

drop policy if exists community_posts_delete_own on community_posts;
create policy community_posts_delete_own on community_posts
  for delete using (author_id = auth.uid());

drop policy if exists community_posts_admin on community_posts;
create policy community_posts_admin on community_posts
  for all using (is_admin()) with check (is_admin());

-- Reacciones: el conteo es público (está en la tarjeta), pero **quién reaccionó
-- solo lo ve esa persona**. Una lista pública de quién apoyó qué es un dato
-- social que nadie pidió publicar.
drop policy if exists community_reactions_read_own on community_reactions;
create policy community_reactions_read_own on community_reactions
  for select using (user_id = auth.uid() or is_admin());

drop policy if exists community_reactions_write_own on community_reactions;
create policy community_reactions_write_own on community_reactions
  for insert with check (user_id = auth.uid());

drop policy if exists community_reactions_delete_own on community_reactions;
create policy community_reactions_delete_own on community_reactions
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. El contador de reacciones
--
-- Sube y baja con la fila, en la misma transacción. Si se calculara desde la
-- aplicación, un fallo entre el insert y el update dejaría el número mintiendo
-- para siempre y nadie se enteraría.
-- ---------------------------------------------------------------------------

-- `app.derivados` es una marca de transacción que le dice al trigger de la
-- sección 5 «este update lo hace la base, no una persona». Sin ella, el update
-- de abajo pasaría por `community_proteger_derivados()`, que al no ver un
-- administrador devolvería `reaction_count` a su valor anterior — y el contador
-- se quedaría clavado en cero sin que nada fallara. El tercer argumento `true`
-- la hace local a la transacción: no se filtra a la siguiente petición del pool.
create or replace function community_recontar_reacciones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.derivados', 'on', true);

  if tg_op = 'INSERT' then
    update community_posts
       set reaction_count = reaction_count + 1
     where id = new.post_id;
    perform set_config('app.derivados', 'off', true);
    return new;
  end if;

  update community_posts
     set reaction_count = greatest(0, reaction_count - 1)
   where id = old.post_id;
  perform set_config('app.derivados', 'off', true);
  return old;
end;
$$;

drop trigger if exists community_reactions_contador on community_reactions;
create trigger community_reactions_contador
  after insert or delete on community_reactions
  for each row execute function community_recontar_reacciones();

-- ---------------------------------------------------------------------------
-- 5. Quién firma, y lo que el autor no puede escribir
--
-- Dos trabajos en un trigger porque son la misma idea: **si el usuario se
-- beneficia del valor, lo escribe la base.** Es la invariante 13 de
-- `dominio-regenera` llevada al muro.
--
-- Al insertar, `author_name` se sella desde `profiles`. Al actualizar, los
-- campos derivados vuelven a su valor anterior si quien edita no es
-- administrador: `community_posts_update_own` permite el update entero porque
-- una política de Postgres no distingue columnas, y `featured` da 80 puntos de
-- experiencia — o sea que es dinero, no una medalla.
-- ---------------------------------------------------------------------------

create or replace function community_proteger_derivados()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- `coalesce` y no un error: una cuenta recién creada por un administrador
    -- puede no tener fila en `profiles` todavía, y quedarse sin publicar por un
    -- nombre que falta sería un fallo desproporcionado. La tarjeta muestra
    -- «Alguien de la comunidad» y sigue funcionando.
    new.author_name := coalesce(
      nullif(trim((select full_name from profiles where id = new.author_id)), ''),
      'Alguien de la comunidad'
    );
    return new;
  end if;

  -- El contador de reacciones lo escribe la sección 4, que se identifica con
  -- esta marca. Sin esta rama, este trigger desharía su propio incremento.
  if coalesce(current_setting('app.derivados', true), 'off') = 'on' then
    return new;
  end if;

  if is_admin() then
    return new;
  end if;

  new.status         := old.status;
  new.featured       := old.featured;
  new.reaction_count := old.reaction_count;
  new.author_id      := old.author_id;
  new.author_name    := old.author_name;
  new.created_at     := old.created_at;
  return new;
end;
$$;

drop trigger if exists community_posts_derivados on community_posts;
create trigger community_posts_derivados
  before insert or update on community_posts
  for each row execute function community_proteger_derivados();

-- ---------------------------------------------------------------------------
-- 6. Experiencia por publicar y por ser destacado
--
-- Los dos eventos ya existían en `otorgar_experiencia()`. Aquí se les ata el
-- hecho que los dispara, en su misma transacción — que es la regla que la 0006
-- fijó para todos los demás.
--
-- **Solo suma lo que se publica en nombre de una empresa.** Una publicación
-- personal no tiene a quién darle puntos, y no debe: el nivel dice qué tan
-- activa es la empresa en el marketplace.
--
-- El tope de `articulo_publicado` lo pone la referencia: `otorgar_experiencia()`
-- inserta en `experience_events` con `on conflict do nothing` sobre
-- (provider_id, clave, referencia), así que el id de la publicación garantiza
-- que borrar y volver a publicar la misma no repite puntos. Publicar cien
-- entradas distintas sí los daría — si eso llega a ser un problema, el tope va
-- en `otorgar_experiencia()` junto al de ofertas, no aquí.
-- ---------------------------------------------------------------------------

create or replace function experiencia_por_publicacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.provider_id is not null and new.status = 'approved' then
      perform otorgar_experiencia(new.provider_id, 'articulo_publicado', new.id::text);
    end if;
    return new;
  end if;

  -- Destacar es un acto del equipo y ocurre después, en un update.
  if new.provider_id is not null and new.featured and not old.featured then
    perform otorgar_experiencia(new.provider_id, 'articulo_destacado', new.id::text);
  end if;
  return new;
end;
$$;

-- `after`, no `before`: los puntos se apuntan cuando la fila ya existe, para que
-- `referencia` apunte a algo real. Y después del trigger de derivados, que corre
-- `before` — si corriera al revés, destacar una publicación se desharía antes de
-- otorgar el punto.
drop trigger if exists community_posts_experiencia on community_posts;
create trigger community_posts_experiencia
  after insert or update on community_posts
  for each row execute function experiencia_por_publicacion();

-- ---------------------------------------------------------------------------
-- Rollback
--
--   drop trigger if exists community_posts_experiencia on community_posts;
--   drop trigger if exists community_posts_derivados on community_posts;
--   drop trigger if exists community_reactions_contador on community_reactions;
--   drop function if exists experiencia_por_publicacion();
--   drop function if exists community_proteger_derivados();
--   drop function if exists community_recontar_reacciones();
--   drop table if exists community_reactions;
--   drop table if exists community_posts;
--
-- **Revertir borra lo que la gente escribió.** Los puntos de experiencia ya
-- otorgados NO se van con ella: `experience_events` conserva las filas de
-- `articulo_publicado` y `articulo_destacado` apuntando a publicaciones que ya
-- no existen, y `providers.experience_points` no baja nunca por diseño. Si de
-- verdad hay que revertir, exportar `community_posts` antes.
-- ---------------------------------------------------------------------------
