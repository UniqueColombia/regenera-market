-- 0016 — Nadie se beneficia a sí mismo, y las cifras del panel salen de la base.
--
-- Jesús aprobó el 2026-10-12 bloquear que una empresa se compre, se entregue y
-- se reseñe a sí misma, «y si encuentras algo más similar que se pueda
-- explotar, bloquéalo también». Una auditoría de todos los caminos que dan
-- puntos, sellos o reputación encontró, además, dos huecos peores. Todo lo que
-- dice «reproducido» se ejecutó contra las 15 migraciones antes de escribir
-- esto, y tiene su prueba en `supabase/pruebas/autobeneficio.test.ts`.
--
-- Aditiva y re-ejecutable: no borra tablas ni columnas. Sí corrige datos en un
-- caso (5): oculta las reseñas de compras ya devueltas, que no deberían contar.
--
-- 1. **Una empresa se aprobaba sola su evaluación de sostenibilidad**
--    (reproducido). `assessments_write` dejaba insertar cualquier fila de la
--    propia empresa, también con `status = 'approved'` y `score = 100`, y el
--    trigger `sustainability_approved` la tomaba como aprobada: sello «Green
--    Watching» (que abre la categoría y el giro de consultoría) y 250 puntos.
--    Ahora una empresa solo escribe borradores o envíos a revisión, y el trigger
--    solo actúa si aprueba el equipo (o el SQL Editor, sin sesión).
--
-- 2. **Una empresa publicaba certificaciones como verificadas** (reproducido):
--    insertaba la suya con `verified_at = now()` y salía pública como
--    comprobada. Ahora `verified_at` y `verified_by` solo los escribe el equipo.
--
-- 3. **Comprarse a sí mismo** (reproducido, aprobado por Jesús). Una empresa
--    compraba lo suyo, marcaba la entrega y se ponía 5 estrellas: 200 puntos y
--    promedio perfecto. Ahora:
--    - `crear_orden()` rechaza la línea de una empresa que gestiona quien
--      compra (`compra-propia`);
--    - `calificar()` rechaza reseñar lo que vende la empresa de uno
--      (`item-propio`), aunque la compra viniera de antes de esta migración.
--
-- 4. **El vendedor ya no marca «entregado» lo que va por transportadora.**
--    Cerrar el pedido da puntos y abre el camino del pago al vendedor; con un
--    paquete en manos de un tercero, quien sabe si llegó es quien lo recibe.
--    Lo confirma el comprador o el equipo. Lo que el vendedor lleva en mano lo
--    sigue confirmando él (`entrega-del-comprador` si lo intenta).
--
-- 5. **Devolver una venta no quitaba todo lo que dio.** Se quedaban
--    `primera_venta` (120) y `resena_positiva` (30), y la reseña seguía en el
--    promedio. Con un comprador cómplice, «comprar, reseñar y devolver» dejaba
--    puntos y nota. Ahora, al devolver: se ocultan las reseñas de esa orden (y
--    con eso salen del promedio y pierden sus puntos, por 6), y `primera_venta`
--    se quita si el proveedor ya no tiene ninguna otra venta cumplida. Antes
--    solo se revertía si la orden venía de `fulfilled`; ahora desde cualquier
--    estado, porque un ítem entregado se puede reseñar con la orden en curso.
--
-- 6. **Ocultar una reseña no le quitaba los puntos al vendedor**, y bajarla de
--    5 a 1 estrella tampoco. Ahora los puntos de `resena_positiva` siguen a la
--    reseña: se quitan si se oculta o baja de 4, y vuelven si el equipo la
--    muestra otra vez con 4 o más.
--
-- 7. **Despublicar una publicación de la Comunidad no revertía sus puntos**
--    (solo al borrarla). Ahora también cuando deja de estar aprobada.
--
-- 8. `crear_orden()` toma los candados de las ofertas en orden de `uuid` y no
--    de texto, el mismo que usa `orders_liberar_reservas` (invariante 27). Con
--    un `listing_id` en mayúsculas los dos órdenes no coincidían.
--
-- 9. `admin_resumen_ordenes()`: cuántas órdenes hay en cada estado y cuánto
--    suman, para el panel. Desde que `/admin/ordenes` pagina, sumar en la
--    aplicación daría solo lo de la página visible.
--
-- Fuera, a propósito: reservar todo el stock de un competidor con pedidos sin
-- pagar. Es otro tipo de abuso (contra otro, no a favor de uno) y cualquier
-- tope afecta también a compradores reales. Queda como decisión en el hito.

-- ---------------------------------------------------------------------------
-- 0. Quitar puntos de un evento: lo que ya hacían a mano tres funciones
-- ---------------------------------------------------------------------------
create or replace function revertir_experiencia(
  _provider_id uuid,
  _clave text,
  _referencia text default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  _puntos int;
begin
  if _provider_id is null then
    return 0;
  end if;
  -- Mismo candado que `otorgar_experiencia()`: dar y quitar a la vez sobre el
  -- mismo proveedor se turnan.
  perform 1 from providers where id = _provider_id for no key update;

  with borrados as (
    delete from experience_events
     where provider_id = _provider_id
       and clave = _clave
       and coalesce(referencia, '') = coalesce(_referencia, '')
    returning puntos
  )
  select coalesce(sum(puntos), 0)::int into _puntos from borrados;

  if _puntos > 0 then
    update providers
       set experience_points = greatest(0, experience_points - _puntos)
     where id = _provider_id;
  end if;
  return _puntos;
end;
$$;

revoke execute on function revertir_experiencia(uuid, text, text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function revertir_experiencia(uuid, text, text) from anon, authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. La evaluación la aprueba el equipo
-- ---------------------------------------------------------------------------
drop policy if exists assessments_write on sustainability_assessments;
create policy assessments_write on sustainability_assessments
  for insert with check (
    manages_provider(provider_id)
    and status in ('draft', 'pending_review')
  );

-- La política filtra qué estado se puede escribir; esto además limpia lo que
-- solo escribe quien revisa. Corre como quien escribe (no es `definer`), así
-- que `current_user` es `authenticated` cuando la petición viene de una
-- empresa por PostgREST, y el dueño cuando viene del SQL Editor o de otra
-- función de la base.
create or replace function assessments_proteger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') and not is_admin() then
    if new.status not in ('draft', 'pending_review') then
      raise exception 'solo-el-equipo-aprueba';
    end if;
    new.reviewed_by := null;
    new.reviewed_at := null;
    if tg_op = 'UPDATE' then
      new.reviewer_notes := old.reviewer_notes;
    else
      new.reviewer_notes := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists assessments_proteger on sustainability_assessments;
create trigger assessments_proteger
  before insert or update on sustainability_assessments
  for each row execute function assessments_proteger();

-- Mismo cuerpo que en la 0006, con la guarda: solo si aprueba el equipo o el
-- sistema (sin claims de PostgREST). Segunda puerta por si la primera falla.
create or replace function sync_provider_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and (auth.role() is null or is_admin()) then
    update providers
       set sustainability_score = new.score,
           sustainability_verified_at = coalesce(sustainability_verified_at, now())
     where id = new.provider_id;

    perform otorgar_experiencia(new.provider_id, 'evaluacion_aprobada');
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Una certificación la verifica el equipo
-- ---------------------------------------------------------------------------
drop policy if exists provider_certs_write on provider_certifications;
create policy provider_certs_write on provider_certifications
  for insert with check (
    manages_provider(provider_id)
    and verified_at is null
    and verified_by is null
  );

create or replace function provider_certs_proteger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') and not is_admin() then
    new.verified_at := case when tg_op = 'UPDATE' then old.verified_at end;
    new.verified_by := case when tg_op = 'UPDATE' then old.verified_by end;
  end if;
  return new;
end;
$$;

drop trigger if exists provider_certs_proteger on provider_certifications;
create trigger provider_certs_proteger
  before insert or update on provider_certifications
  for each row execute function provider_certs_proteger();

-- ---------------------------------------------------------------------------
-- 3 y 8. crear_orden(): sin compra propia, candados en orden de uuid
--
-- Mismo cuerpo que en la 0014; los dos cambios van marcados con «0016».
-- ---------------------------------------------------------------------------
create or replace function crear_orden(
  _id uuid,
  _lineas jsonb,
  _nombre text,
  _telefono text,
  _empresa text default null,
  _provider_id uuid default null,
  _notas text default null,
  _documento text default null,
  _departamento text default null,
  _ciudad text default null,
  _direccion text default null,
  _indicaciones text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _correo text;
  _previa record;
  _empresa_final text;
  _ref text;
  _intento int := 0;
  _linea jsonb;
  _l record;
  _qty int;
  _fecha date;
  _precio int;
  _sub int;
  _tasa numeric;
  _com int;
  _envio int;
  _con_stock boolean;
  _con_cupo boolean;
  _subtotal int := 0;
  _comision int := 0;
  _envio_total int := 0;
  _fisicos int := 0;
  _co2 numeric := 0;
  _agua numeric := 0;
  _residuos numeric := 0;
  _items int := 0;
begin
  if _uid is null then
    raise exception 'sin-sesion';
  end if;
  if _id is null then
    raise exception 'sin-clave';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('crear_orden:' || _uid::text, 0));

  select id, reference, buyer_id, total_cop into _previa from orders where id = _id;
  if found then
    if _previa.buyer_id is distinct from _uid then
      raise exception 'clave-ajena';
    end if;
    return jsonb_build_object('reference', _previa.reference, 'repetida', true);
  end if;

  if char_length(trim(coalesce(_nombre, ''))) < 3
     or char_length(trim(coalesce(_telefono, ''))) < 7 then
    raise exception 'contacto-incompleto';
  end if;

  if (select count(*) from orders
       where buyer_id = _uid and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'demasiados-pedidos';
  end if;
  if (select count(*) from orders
       where buyer_id = _uid and status = 'pending_payment') >= 10 then
    raise exception 'demasiados-pendientes';
  end if;

  if jsonb_typeof(_lineas) is distinct from 'array'
     or jsonb_array_length(_lineas) = 0
     or jsonb_array_length(_lineas) > 50 then
    raise exception 'cesta-invalida';
  end if;

  select email into _correo from auth.users where id = _uid;

  if _provider_id is not null then
    if not exists (
      select 1 from provider_members
       where provider_id = _provider_id and user_id = _uid
    ) then
      raise exception 'empresa-ajena';
    end if;
    select name into _empresa_final from providers where id = _provider_id;
  else
    _empresa_final := nullif(trim(coalesce(_empresa, '')), '');
  end if;

  loop
    _ref := 'SR-' || to_char(now() at time zone 'America/Bogota', 'YYMMDD')
            || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 4));
    exit when not exists (select 1 from orders where reference = _ref);
    _intento := _intento + 1;
    if _intento > 20 then
      raise exception 'sin-referencia';
    end if;
  end loop;

  begin
    insert into orders (
      id, reference, buyer_id, buyer_email, buyer_name, buyer_company,
      buyer_phone, buyer_provider_id, buyer_tax_id, status, notes,
      envio_departamento, envio_ciudad, envio_direccion, envio_indicaciones
    ) values (
      _id, _ref, _uid, coalesce(_correo, ''), left(trim(_nombre), 160),
      left(_empresa_final, 160), left(trim(_telefono), 40), _provider_id,
      left(nullif(trim(coalesce(_documento, '')), ''), 40),
      'pending_payment',
      left(nullif(trim(coalesce(_notas, '')), ''), 1000),
      left(nullif(trim(coalesce(_departamento, '')), ''), 60),
      left(nullif(trim(coalesce(_ciudad, '')), ''), 80),
      left(nullif(trim(coalesce(_direccion, '')), ''), 200),
      left(nullif(trim(coalesce(_indicaciones, '')), ''), 300)
    );
  exception when unique_violation then
    select id, reference, buyer_id into _previa from orders where id = _id;
    if found and _previa.buyer_id = _uid then
      return jsonb_build_object('reference', _previa.reference, 'repetida', true);
    end if;
    raise;
  end;

  for _linea in
    select value from jsonb_array_elements(_lineas)
     -- 0016: por uuid, como `orders_liberar_reservas`, no por texto.
     order by (value ->> 'listing_id')::uuid, value ->> 'date'
  loop
    _qty := nullif(_linea ->> 'qty', '')::int;
    if _qty is null or _qty < 1 or _qty > 10000 then
      raise exception 'cantidad-invalida';
    end if;
    _fecha := nullif(_linea ->> 'date', '')::date;

    select l.*, p.tier as proveedor_tier
      into _l
      from listings l
      join providers p on p.id = l.provider_id
     where l.id = (_linea ->> 'listing_id')::uuid
       and l.status = 'approved'
       and p.status = 'approved';

    if not found or _l.quote_only then
      continue;
    end if;

    -- 0016: una empresa no se compra a sí misma. Se rechaza el pedido entero
    -- y no solo la línea: saltarla en silencio cobraría otra cosa que lo que
    -- la persona vio en la cesta.
    if manages_provider(_l.provider_id) then
      raise exception 'compra-propia' using hint = _l.title;
    end if;

    _con_stock := false;
    if _l.stock is not null then
      update listings
         set stock = stock - _qty
       where id = _l.id
         and stock >= _qty;
      if not found then
        raise exception 'sin-stock' using hint = _l.title;
      end if;
      _con_stock := true;
    end if;

    _con_cupo := false;
    if _l.kind = 'experience'
       and exists (select 1 from listing_availability where listing_id = _l.id) then
      if _fecha is null then
        raise exception 'falta-fecha' using hint = _l.title;
      end if;
      update listing_availability
         set slots_taken = slots_taken + _qty
       where listing_id = _l.id
         and date = _fecha
         and slots_taken + _qty <= slots_total;
      if not found then
        raise exception 'sin-cupo' using hint = _l.title;
      end if;
      _con_cupo := true;
    end if;

    _precio := case
      when _l.wholesale_price_cop is not null
       and _l.wholesale_min_qty is not null
       and _qty >= _l.wholesale_min_qty
      then _l.wholesale_price_cop
      else _l.price_cop
    end;
    _sub := _precio * _qty;
    _tasa := comision_para_nivel(_l.proveedor_tier);
    _com := round(_sub * _tasa)::int;

    if _l.kind = 'product' then
      _envio := coalesce(_l.envio_cop, 0);
      _fisicos := _fisicos + 1;
    else
      _envio := 0;
    end if;

    insert into order_items (
      order_id, listing_id, provider_id, title_snapshot, unit_price_cop, qty,
      date, commission_cop, commission_rate,
      envio_cop, despacho, transportadora, entrega_dias_min, entrega_dias_max,
      envio_estado, stock_descontado, cupo_descontado
    ) values (
      _id, _l.id, _l.provider_id, _l.title, _precio, _qty, _fecha, _com, _tasa,
      _envio,
      case when _l.kind = 'product' then _l.despacho end,
      case when _l.kind = 'product' then _l.transportadora end,
      case when _l.kind = 'product' then _l.entrega_dias_min end,
      case when _l.kind = 'product' then _l.entrega_dias_max end,
      case when _l.kind = 'product' then 'pendiente' end,
      _con_stock, _con_cupo
    );

    _subtotal    := _subtotal + _sub;
    _comision    := _comision + _com;
    _envio_total := _envio_total + _envio;
    _co2      := _co2      + round(coalesce(_l.co2_kg_saved, 0) * _qty, 2);
    _agua     := _agua     + round(coalesce(_l.water_liters_saved, 0) * _qty, 2);
    _residuos := _residuos + round(coalesce(_l.waste_kg_reduced, 0) * _qty, 2);
    _items    := _items + 1;
  end loop;

  if _items = 0 then
    raise exception 'nada-comprable';
  end if;

  if _fisicos > 0 and (
       char_length(trim(coalesce(_departamento, ''))) < 3
    or char_length(trim(coalesce(_ciudad, ''))) < 2
    or char_length(trim(coalesce(_direccion, ''))) < 5
  ) then
    raise exception 'falta-destino';
  end if;

  update orders
     set subtotal_cop         = _subtotal,
         commission_total_cop = _comision,
         envio_total_cop      = _envio_total,
         total_cop            = _subtotal + _envio_total,
         co2_kg_saved         = nullif(_co2, 0),
         water_liters_saved   = nullif(_agua, 0),
         waste_kg_reduced     = nullif(_residuos, 0),
         envio_departamento   = case when _fisicos > 0 then envio_departamento end,
         envio_ciudad         = case when _fisicos > 0 then envio_ciudad end,
         envio_direccion      = case when _fisicos > 0 then envio_direccion end,
         envio_indicaciones   = case when _fisicos > 0 then envio_indicaciones end
   where id = _id;

  return jsonb_build_object(
    'reference', _ref,
    'repetida', false,
    'total_cop', _subtotal + _envio_total,
    'envio_cop', _envio_total
  );
end;
$$;

-- `create or replace` conserva los permisos de la 0015; se repiten por si
-- alguien aplica esta sobre una base donde la función no existía.
revoke execute on function crear_orden(uuid, jsonb, text, text, text, uuid, text, text, text, text, text, text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function crear_orden(uuid, jsonb, text, text, text, uuid, text, text, text, text, text, text) from anon;
    grant execute on function crear_orden(uuid, jsonb, text, text, text, uuid, text, text, text, text, text, text) to authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. calificar(): no se reseña lo que vende la empresa de uno
--
-- Mismo cuerpo que en la 0014, más la comprobación marcada.
-- ---------------------------------------------------------------------------
create or replace function calificar(
  _order_item_id uuid,
  _rating int,
  _comentario text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _i record;
  _nombre text;
  _fila record;
begin
  if _uid is null then
    raise exception 'sin-sesion';
  end if;
  if _rating is null or _rating < 1 or _rating > 5 then
    raise exception 'calificacion-invalida';
  end if;

  select oi.listing_id, oi.provider_id, oi.date, oi.envio_estado,
         o.status as orden_estado, o.buyer_id
    into _i
    from order_items oi
    join orders o on o.id = oi.order_id
   where oi.id = _order_item_id;

  if not found or _i.buyer_id is distinct from _uid then
    raise exception 'item-ajeno';
  end if;
  -- 0016: ni la propia empresa ni sus miembros, aunque la compra sea de antes
  -- de que `crear_orden()` lo impidiera.
  if manages_provider(_i.provider_id) then
    raise exception 'item-propio';
  end if;
  if _i.listing_id is null then
    raise exception 'oferta-retirada';
  end if;
  if not puede_resenar(_i.orden_estado, _i.envio_estado, _i.date) then
    raise exception 'todavia-no';
  end if;

  select nombre_publico(full_name) into _nombre from profiles where id = _uid;

  insert into reviews (listing_id, author_id, order_item_id, rating, body, autor_nombre)
  values (
    _i.listing_id, _uid, _order_item_id, _rating,
    left(trim(coalesce(_comentario, '')), 2000),
    coalesce(_nombre, 'Comprador verificado')
  )
  on conflict (order_item_id) do update
     set rating       = excluded.rating,
         body         = excluded.body,
         autor_nombre = excluded.autor_nombre,
         updated_at   = now()
   where reviews.author_id = _uid
  returning id, (xmax = 0) as nueva into _fila;

  if _fila.id is null then
    raise exception 'item-ajeno';
  end if;

  return jsonb_build_object('id', _fila.id, 'nueva', _fila.nueva);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. confirmar_entrega(): el vendedor solo confirma lo que lleva en mano
--
-- Mismo cuerpo que en la 0014, más la comprobación marcada.
-- ---------------------------------------------------------------------------
create or replace function confirmar_entrega(_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _orden uuid;
  _proveedor uuid;
  _estado order_status;
  _i record;
  _completa boolean := false;
begin
  if auth.uid() is null then
    raise exception 'sin-sesion';
  end if;

  select order_id, provider_id into _orden, _proveedor
    from order_items where id = _item_id;
  if not found
     or not (owns_order(_orden) or manages_provider(_proveedor) or is_admin()) then
    raise exception 'item-ajeno';
  end if;

  select status into _estado from orders where id = _orden for update;
  select * into _i from order_items where id = _item_id for update;

  if _i.envio_estado is null then
    raise exception 'sin-envio';
  end if;
  if _i.envio_estado = 'entregado' then
    return jsonb_build_object('cambiado', false, 'orden_completada', false, 'orden_id', _orden);
  end if;
  if _estado not in ('paid', 'in_progress') then
    raise exception 'orden-no-despachable';
  end if;
  -- 0016: lo que va por transportadora lo confirma quien lo recibe (o el
  -- equipo). El vendedor solo confirma lo que entrega él mismo.
  if _i.despacho is distinct from 'vendedor'
     and not owns_order(_orden) and not is_admin() then
    raise exception 'entrega-del-comprador';
  end if;

  update order_items
     set envio_estado  = 'entregado',
         entregado_at  = now(),
         despachado_at = coalesce(despachado_at, now())
   where id = _item_id;

  if not exists (
    select 1 from order_items
     where order_id = _orden
       and (envio_estado is null or envio_estado <> 'entregado')
  ) then
    update orders set status = 'fulfilled'
     where id = _orden and status in ('paid', 'in_progress');
    _completa := found;
  end if;

  return jsonb_build_object('cambiado', true, 'orden_completada', _completa, 'orden_id', _orden);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Devolver una venta deshace todo lo que dio
--
-- Mismo cuerpo que en la 0014 para `fulfilled`; la rama de `refunded` cambia.
-- ---------------------------------------------------------------------------
create or replace function experiencia_por_orden()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _fila record;
  _ref text;
begin
  if new.status = 'fulfilled' and old.status is distinct from 'fulfilled' then
    for _fila in
      select provider_id, sum(unit_price_cop * qty) as vendido
        from order_items
       where order_id = new.id
       group by provider_id
       order by provider_id
    loop
      perform otorgar_experiencia(_fila.provider_id, 'venta_entregada', new.id::text);
      perform otorgar_experiencia(_fila.provider_id, 'primera_venta');
      for _i in 1..least(floor(_fila.vendido / 500000)::int, 50) loop
        perform otorgar_experiencia(
          _fila.provider_id, 'volumen_vendido', new.id::text || '#' || _i::text);
      end loop;
    end loop;

  -- 0016: desde cualquier estado, no solo desde `fulfilled` (ver cabecera, 5).
  elsif new.status = 'refunded' and old.status is distinct from 'refunded' then
    -- Las reseñas de una compra devuelta no cuentan: se ocultan, y el trigger
    -- de la sección 6 les quita los puntos.
    update reviews
       set oculta = true
     where not oculta
       and order_item_id in (select id from order_items where order_id = new.id);

    for _fila in
      select distinct provider_id from order_items
       where order_id = new.id and provider_id is not null
       order by provider_id
    loop
      perform revertir_experiencia(_fila.provider_id, 'venta_entregada', new.id::text);
      -- Los tramos de volumen que esta orden haya dado («<orden>#1», «#2»…).
      for _ref in
        select referencia from experience_events
         where provider_id = _fila.provider_id
           and clave = 'volumen_vendido'
           and referencia like new.id::text || '#%'
      loop
        perform revertir_experiencia(_fila.provider_id, 'volumen_vendido', _ref);
      end loop;
      -- `primera_venta` se gana una vez; se quita solo si esta era la única
      -- venta cumplida que le queda.
      if not exists (
        select 1 from order_items oi
        join orders o on o.id = oi.order_id
         where oi.provider_id = _fila.provider_id
           and o.id <> new.id
           and o.status = 'fulfilled'
      ) then
        perform revertir_experiencia(_fila.provider_id, 'primera_venta');
      end if;
    end loop;
  end if;
  return new;
end;
$$;

-- Las reseñas de compras que ya están devueltas, ocultas desde ya (el trigger
-- de abajo, que se crea después, no les quita puntos: se hace aquí).
do $$
declare
  _r record;
begin
  for _r in
    select r.id, l.provider_id
      from reviews r
      join order_items oi on oi.id = r.order_item_id
      join orders o on o.id = oi.order_id
      join listings l on l.id = r.listing_id
     where o.status = 'refunded' and not r.oculta
  loop
    update reviews set oculta = true where id = _r.id;
    perform revertir_experiencia(_r.provider_id, 'resena_positiva', _r.id::text);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Los puntos de una reseña siguen a la reseña
-- ---------------------------------------------------------------------------
create or replace function experiencia_por_resena_cambio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _provider uuid;
  _cuenta boolean;
begin
  select provider_id into _provider from listings where id = new.listing_id;
  -- Cuenta si se ve, tiene 4 o más y la compra no se devolvió.
  _cuenta := not new.oculta and new.rating >= 4 and not exists (
    select 1 from order_items oi join orders o on o.id = oi.order_id
     where oi.id = new.order_item_id and o.status = 'refunded'
  );
  if _cuenta then
    perform otorgar_experiencia(_provider, 'resena_positiva', new.id::text);
  else
    perform revertir_experiencia(_provider, 'resena_positiva', new.id::text);
  end if;
  return new;
end;
$$;

drop trigger if exists reviews_experiencia_cambio on reviews;
create trigger reviews_experiencia_cambio
  after update of oculta, rating on reviews
  for each row
  when (old.oculta is distinct from new.oculta or old.rating is distinct from new.rating)
  execute function experiencia_por_resena_cambio();

-- ---------------------------------------------------------------------------
-- 7. Una publicación despublicada devuelve sus puntos
--
-- Mismo cuerpo que en la 0007, más la rama marcada.
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

  -- 0016: deja de estar publicada → se quitan sus puntos; vuelve → se dan
  -- otra vez (con el tope mensual de siempre).
  if new.provider_id is not null and old.status = 'approved' and new.status <> 'approved' then
    perform revertir_experiencia(new.provider_id, 'articulo_publicado', new.id::text);
    perform revertir_experiencia(new.provider_id, 'articulo_destacado', new.id::text);
    return new;
  end if;
  if new.provider_id is not null and new.status = 'approved' and old.status <> 'approved' then
    perform otorgar_experiencia(new.provider_id, 'articulo_publicado', new.id::text);
  end if;

  if new.provider_id is not null and new.status = 'approved' and new.featured and not old.featured then
    perform otorgar_experiencia(new.provider_id, 'articulo_destacado', new.id::text);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. El resumen del panel de órdenes, calculado en la base
-- ---------------------------------------------------------------------------
create or replace function admin_resumen_ordenes()
returns table (status order_status, cantidad int, total_cop bigint)
language sql
stable
security definer
set search_path = public
as $$
  select o.status, count(*)::int, coalesce(sum(o.total_cop), 0)::bigint
    from orders o
   where is_admin()
   group by o.status;
$$;

revoke execute on function admin_resumen_ordenes() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function admin_resumen_ordenes() from anon;
    grant execute on function admin_resumen_ordenes() to authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Antes de aplicarla, para saber si los huecos 1 y 2 se usaron (deberían dar 0
-- filas; si no, el equipo decide qué hacer con cada una):
--
--   select id, provider_id, score, created_at from sustainability_assessments
--    where status = 'approved' and reviewed_by is null;
--   select provider_id, certification_code, verified_at from provider_certifications
--    where verified_at is not null and verified_by is null;
--
-- Compras propias que ya existan (empresa que compró lo suyo):
--
--   select o.reference, o.status, oi.title_snapshot from order_items oi
--     join orders o on o.id = oi.order_id
--     join provider_members m on m.provider_id = oi.provider_id and m.user_id = o.buyer_id;
--
-- Comprobación después (las dos en 1):
--
--   select count(*) from pg_proc where proname in ('revertir_experiencia', 'admin_resumen_ordenes') and pronamespace = 'public'::regnamespace;
--   select count(*) from pg_trigger where tgname in ('assessments_proteger', 'provider_certs_proteger', 'reviews_experiencia_cambio');  -- 3
--
-- Rollback (en el papel): volver a correr las definiciones de la 0014 para
-- crear_orden, calificar, confirmar_entrega y experiencia_por_orden; la de la
-- 0007 para experiencia_por_publicacion; la de la 0006 para sync_provider_score;
-- y:
--   drop trigger if exists assessments_proteger on sustainability_assessments;
--   drop trigger if exists provider_certs_proteger on provider_certifications;
--   drop trigger if exists reviews_experiencia_cambio on reviews;
--   drop function if exists assessments_proteger(), provider_certs_proteger(),
--     experiencia_por_resena_cambio(), admin_resumen_ordenes(),
--     revertir_experiencia(uuid, text, text);
--   y las políticas `assessments_write` y `provider_certs_write` de la 0001.
-- ---------------------------------------------------------------------------
