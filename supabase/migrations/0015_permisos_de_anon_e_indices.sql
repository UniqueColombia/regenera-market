-- 0015 — Lo que un visitante sin sesión no debe poder llamar, y los índices
-- que pide el volumen.
--
-- Sale de la revisión del 2026-10-12, la primera hecha con las pruebas de la
-- base (`npm run test:base`). Aditiva y re-ejecutable: no borra tablas,
-- columnas ni filas. Se puede pegar entera en el SQL Editor y volver a pegar.
--
-- 1. `vencer_pedidos_sin_pago()` dejaba pasar a un anónimo.
--    Su guarda era `if auth.uid() is not null and not is_admin()`: pensada para
--    dejar entrar al cron (que no tiene sesión), pero con la clave anon tampoco
--    hay `auth.uid()`. Cualquiera con la clave pública —que va en el navegador—
--    podía llamar `rpc('vencer_pedidos_sin_pago', {_horas: 24})` y cancelar
--    todos los pedidos de más de un día sin pagar, devolviendo su stock y su
--    cupo para que otro los comprara. El cron se distingue porque no trae
--    claims de PostgREST: `auth.role()` es null. Un anónimo trae `anon`.
--
-- 2. `anon` ejecutaba funciones que exigen sesión.
--    Supabase concede `execute` a `anon` sobre toda función nueva de `public`
--    (`alter default privileges`), y `revoke … from public` no la quita: hay
--    que nombrar el rol. Las de abajo ya se defendían por dentro (miran
--    `auth.uid()` o `is_admin()`); quitarles el permiso es la segunda puerta,
--    la que no depende de que nadie se olvide de la primera. Las de recontar
--    no se defendían: `recontar_todas_las_publicaciones()` toma candado sobre
--    cada publicación de la Comunidad, y un anónimo podía llamarla en bucle.
--
--    Se quedan con `anon`, a propósito: las que llama la aplicación sin sesión
--    (`registrar_visita`, `postular_proveedor`, `avatares_publicos`) y las que
--    evalúan las políticas de lectura pública (`is_admin`, `has_role`,
--    `manages_*`, `owns_*`, `carpeta_es_*`) — una política corre con los
--    permisos de quien consulta, y sin `execute` el catálogo dejaría de leerse.
--    La lista exacta la vigila `supabase/pruebas/migraciones.test.ts`.
--
-- 3. Las reseñas públicas exponían identificadores internos.
--    La política filtra filas, no columnas: un anónimo leía `author_id` y
--    `order_item_id` por PostgREST. Ahora solo ve las columnas que pinta la
--    ficha (`COLUMNAS_RESENA` en `src/lib/repo.ts`) más `oculta`, que hace
--    falta para filtrar. Quien tiene sesión sigue leyendo todas: «Mis reseñas»
--    busca por `author_id` y `order_item_id`.
--
-- 4. La política pública de reseñas llamaba `auth.uid()` e `is_admin()` una
--    vez por fila. Envueltas en `(select …)`, Postgres las calcula una vez por
--    consulta. Con miles de reseñas, las vistas de promedio lo notan.
--
-- 6. `puede_resenar()` devolvía NULL en vez de false.
--    Con un pedido pagado de algo sin envío y sin fecha (un servicio, una
--    experiencia sin fecha), `_envio_estado = 'entregado'` es NULL, y
--    `true and (NULL or false)` es NULL. `calificar()` pregunta
--    `if not puede_resenar(…)`, y `not NULL` tampoco lanza: se podía reseñar un
--    servicio recién pagado, antes de recibirlo (invariante 23). Lo encontró la
--    prueba que compara esta función con su gemela `puedeResenar()`.
--
-- 5. Índices para lo que crece: el panel de órdenes y «Mis pedidos» ordenan
--    por fecha; el vencimiento busca pedidos sin pagar por antigüedad; cada
--    política «escritura del dueño» busca en `provider_members` por `user_id`
--    (la clave primaria empieza por `provider_id` y no sirve); devolver una
--    venta borra eventos de experiencia por `referencia`.

-- ---------------------------------------------------------------------------
-- 1. El vencimiento solo lo dispara el cron o un administrador
-- ---------------------------------------------------------------------------
create or replace function vencer_pedidos_sin_pago(_horas int default 72)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  _vencidos int;
begin
  -- El cron corre como `postgres` sin claims: `auth.role()` es null. Toda
  -- llamada por PostgREST trae `anon` o `authenticated`, y de esas solo pasa un
  -- administrador.
  if auth.role() is not null and not is_admin() then
    raise exception 'solo-admin';
  end if;

  with vencidos as (
    update orders
       set status = 'cancelled',
           notes = left(concat_ws(E'\n', notes,
             format('Cancelado solo: sin pago en %s horas.', greatest(_horas, 24))), 1000)
     where status = 'pending_payment'
       and created_at < now() - make_interval(hours => greatest(_horas, 24))
    returning 1
  )
  select count(*) into _vencidos from vencidos;
  return _vencidos;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Lo que exige sesión, fuera del alcance de anon
--
-- En un `do` porque `anon` y `authenticated` son roles de Supabase: en un
-- Postgres pelado no existen y un `revoke` sobre un rol inexistente aborta la
-- migración entera (mismo motivo que en la 0011).
-- ---------------------------------------------------------------------------
do $$
declare
  _f text;
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    return;
  end if;

  foreach _f in array array[
    'vencer_pedidos_sin_pago(int)',
    'crear_orden(uuid, jsonb, text, text, text, uuid, text, text, text, text, text, text)',
    'calificar(uuid, int, text)',
    'despachar_item(uuid, text, text)',
    'confirmar_entrega(uuid)',
    'aprobar_postulacion(uuid, text)',
    'admin_analiticas(int)',
    'admin_listar_usuarios()'
  ] loop
    if to_regprocedure(_f) is not null then
      execute format('revoke execute on function %s from public, anon', _f);
    end if;
  end loop;

  -- Mantenimiento interno: los llaman los triggers y la migración que los
  -- creó. Nadie los llama por PostgREST, ni con sesión.
  foreach _f in array array[
    'recontar_publicacion(uuid)',
    'recontar_todas_las_publicaciones()',
    'slug_unico_proveedor(text)'
  ] loop
    if to_regprocedure(_f) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', _f);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Las reseñas públicas, sin identificadores internos
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    return;
  end if;
  revoke select on reviews from anon;
  grant select (id, listing_id, rating, body, autor_nombre, created_at, updated_at, oculta)
    on reviews to anon;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. La política pública de reseñas, evaluada una vez por consulta
-- ---------------------------------------------------------------------------
drop policy if exists reviews_public_read on reviews;
create policy reviews_public_read on reviews
  for select using (
    not oculta
    or author_id = (select auth.uid())
    or (select is_admin())
  );

-- ---------------------------------------------------------------------------
-- 6. Reseñar exige un sí, no la ausencia de un no
--
-- Mismo cuerpo que en la 0014, con cada comparación que puede dar NULL
-- envuelta en `coalesce(…, false)`. La firma no cambia: `calificar()` la
-- sigue llamando igual.
-- ---------------------------------------------------------------------------
create or replace function puede_resenar(
  _orden_estado order_status,
  _envio_estado text,
  _fecha date
)
returns boolean
language sql
stable
as $$
  select coalesce(
    _orden_estado in ('paid', 'in_progress', 'fulfilled')
    and (
      coalesce(_envio_estado = 'entregado', false)
      or (_envio_estado is null and (
            _orden_estado = 'fulfilled'
            or coalesce(_fecha <= (now() at time zone 'America/Bogota')::date, false)
         ))
    ),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. Índices
-- ---------------------------------------------------------------------------
create index if not exists orders_status_fecha_idx on orders (status, created_at desc);
create index if not exists orders_buyer_fecha_idx on orders (buyer_id, created_at desc);
create index if not exists orders_sin_pagar_idx on orders (created_at)
  where status = 'pending_payment';
create index if not exists provider_members_user_idx on provider_members (user_id);
create index if not exists experience_events_referencia_idx on experience_events (referencia)
  where referencia is not null;

-- ---------------------------------------------------------------------------
-- Comprobación (las tres en `false`, y el índice existe):
--
--   select has_function_privilege('anon', 'vencer_pedidos_sin_pago(int)', 'execute'),
--          has_function_privilege('anon', 'recontar_todas_las_publicaciones()', 'execute'),
--          has_column_privilege('anon', 'reviews', 'author_id', 'select');
--   select to_regclass('public.provider_members_user_idx');
--   select puede_resenar('paid', null, null);   -- false (antes: null)
--
-- Reseñas que pudieron entrar por el hueco del punto 6 (para revisarlas a
-- mano; ocultarlas o no lo decide el equipo):
--
--   select r.id, r.created_at, o.status, oi.envio_estado, oi.date
--     from reviews r
--     join order_items oi on oi.id = r.order_item_id
--     join orders o on o.id = oi.order_id
--    where not puede_resenar(o.status, oi.envio_estado, oi.date);
--
-- Rollback (en el papel; nada de esto borra datos):
--
--   grant execute on function vencer_pedidos_sin_pago(int) to authenticated;
--   -- y volver a poner el cuerpo de 4.b de la 0014 si se quiere la guarda vieja
--   grant select on reviews to anon;
--   drop policy if exists reviews_public_read on reviews;
--   create policy reviews_public_read on reviews
--     for select using (not oculta or author_id = auth.uid() or is_admin());
--   drop index if exists orders_status_fecha_idx, orders_buyer_fecha_idx,
--     orders_sin_pagar_idx, provider_members_user_idx, experience_events_referencia_idx;
--   -- Los `revoke` de 2 se deshacen con `grant execute … to anon` función por
--   -- función; no hace falta salvo que algo de la app deje de funcionar.
-- ---------------------------------------------------------------------------
