-- ---------------------------------------------------------------------------
-- 0005 — Romper la recursión entre las políticas de órdenes y sus ítems
--
-- ## El fallo
--
--   ERROR 42P17: infinite recursion detected in policy for relation "orders"
--
-- Cualquier lectura de `orders` hecha por alguien que no sea el service role
-- revienta. No es un caso raro: es **toda** consulta de la aplicación.
--
-- ## Por qué
--
-- Dos políticas de `0001_init.sql` se llaman la una a la otra:
--
--   orders_provider_read  →  consulta order_items  (¿alguno de estos ítems es mío?)
--   order_items_read      →  consulta orders       (¿esta orden es de quien la pide?)
--
-- Para decidir si te deja leer una orden, Postgres tiene que leer sus ítems;
-- para decidir si te deja leer un ítem, tiene que leer su orden. No hay salida y
-- el planificador lo corta con ese error.
--
-- **Estuvo escrito así desde el primer día y nadie lo notó porque las órdenes
-- vivían en un `Map` en memoria**: ninguna consulta llegaba nunca a la tabla. El
-- día que `src/lib/orders.ts` pasó a Postgres (2026-09-13), apareció en la
-- primera visita a `/admin`. Las tablas de cotizaciones tienen exactamente el
-- mismo par cruzado y el mismo fallo esperando; se arreglan las dos aquí, aunque
-- todavía no se consulten, porque la próxima persona no debería descubrirlo del
-- mismo modo.
--
-- ## La salida
--
-- La misma que ya usaba `0001` para los roles: **una función `security definer`**.
-- `has_role()` e `is_admin()` existen exactamente por esto —sin ellas, la
-- política de `user_roles` entraría en recursión consigo misma—, así que esto no
-- introduce un patrón nuevo, lo aplica donde faltaba.
--
-- Una función `security definer` corre con los privilegios de su dueño, así que
-- la consulta de adentro **no vuelve a pasar por RLS** y el círculo se rompe. El
-- permiso no se relaja ni un milímetro: la condición que se comprueba es
-- literalmente la misma que antes, movida de sitio.
--
-- `set search_path = public` en todas, como en el resto del esquema: sin eso,
-- alguien podría crear un objeto homónimo en otro esquema y hacer que se ejecute
-- con estos privilegios.
--
-- Aditiva: no toca ninguna tabla ni columna. Solo reemplaza cuatro políticas de
-- lectura por otras equivalentes.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Las dos preguntas, cada una resuelta sin disparar la política de la otra
-- ---------------------------------------------------------------------------

/** ¿Esta orden es de quien la está pidiendo? */
create or replace function owns_order(_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from orders o
    where o.id = _order_id and o.buyer_id = auth.uid()
  );
$$;

/** ¿Alguno de los ítems de esta orden es de una empresa que yo gestiono? */
create or replace function manages_order(_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from order_items oi
    join provider_members pm on pm.provider_id = oi.provider_id
    where oi.order_id = _order_id and pm.user_id = auth.uid()
  );
$$;

/** Lo mismo, para cotizaciones. */
create or replace function owns_quotation(_quotation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from quotations q
    where q.id = _quotation_id and q.buyer_id = auth.uid()
  );
$$;

create or replace function manages_quotation(_quotation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from quotation_items qi
    join provider_members pm on pm.provider_id = qi.provider_id
    where qi.quotation_id = _quotation_id and pm.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Las políticas, con la misma condición de siempre
-- ---------------------------------------------------------------------------

-- Órdenes: las ve el comprador, el admin, y el proveedor cuyos ítems estén
-- dentro. Idéntico a 0001; lo único que cambia es quién resuelve la pregunta.
drop policy if exists orders_provider_read on orders;
create policy orders_provider_read on orders
  for select using (manages_order(id));

-- Ítems: los ve quien gestiona al proveedor del ítem, el comprador de la orden,
-- y el admin.
drop policy if exists order_items_read on order_items;
create policy order_items_read on order_items
  for select using (
    manages_provider(provider_id)
    or owns_order(order_id)
    or is_admin()
  );

drop policy if exists quotations_read on quotations;
create policy quotations_read on quotations
  for select using (
    buyer_id = auth.uid()
    or is_admin()
    or manages_quotation(id)
  );

drop policy if exists quotation_items_read on quotation_items;
create policy quotation_items_read on quotation_items
  for select using (
    manages_provider(provider_id)
    or owns_quotation(quotation_id)
    or is_admin()
  );

-- ---------------------------------------------------------------------------
-- Rollback
--
-- Volver a las políticas de `0001_init.sql` **reintroduce el fallo**: la
-- aplicación deja de poder leer una sola orden. Si hay que revertir algo de
-- 0005, revisa primero que no sea esto.
--
--   drop policy if exists orders_provider_read on orders;
--   create policy orders_provider_read on orders
--     for select using (exists (
--       select 1 from order_items oi
--       where oi.order_id = id and manages_provider(oi.provider_id)
--     ));
--   -- …y lo mismo con las otras tres, tal como están en 0001.
--   drop function if exists owns_order(uuid), manages_order(uuid),
--                           owns_quotation(uuid), manages_quotation(uuid);
-- ---------------------------------------------------------------------------
