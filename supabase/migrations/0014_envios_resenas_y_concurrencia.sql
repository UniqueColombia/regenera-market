-- ===========================================================================
-- 0014 — Envíos, reseñas, y que ninguna operación cuente dos veces
--
-- Seis cosas, cada una en su sección:
--
--   1. Cómo se despacha una oferta: quién la lleva (el vendedor o una
--      transportadora que él elige), cuánto cuesta el envío y en cuántos días
--      llega. Lo decide quien la publica.
--   2. A dónde va un pedido, y el envío congelado en cada ítem, con su guía y
--      su estado (pendiente → despachado → entregado).
--   3. `crear_orden()` cobra el envío, **descuenta el stock** (hasta hoy solo lo
--      comprobaba) y serializa los intentos de una misma persona.
--   4. Cancelar o devolver un pedido **devuelve el stock y el cupo** — una sola
--      vez —, y los pedidos sin pagar vencen a las 72 horas.
--   5. Despachar y confirmar la entrega, con candado sobre la orden.
--   6. Reseñas de quien compró y recibió, una por ítem, editables.
--
-- Y una séptima, transversal: `listings.version`, para que dos personas que
-- editan la misma oferta a la vez no se pisen sin enterarse.
--
-- ## Idempotencia y concurrencia, las dos palabras de esta migración
--
-- **Idempotencia**: repetir la misma operación —doble clic, un reintento tras
-- un corte, un correo que se reenvía— produce su efecto una sola vez. Aquí la
-- dan: la llave `id` de la orden (ya desde la 0012), el `unique` de
-- `reviews.order_item_id` con `on conflict`, los estados que solo avanzan
-- (`where envio_estado = 'pendiente'`), y las marcas `stock_descontado` y
-- `cupo_descontado`, que dicen si a un ítem le queda algo por devolver.
--
-- **Concurrencia**: dos operaciones distintas sobre el mismo recurso al mismo
-- tiempo no se pisan. Aquí la dan: los `update ... where stock >= qty` que
-- descuentan dentro de la condición (la segunda compra del último ítem no
-- encuentra stock), el candado `for update` sobre la orden antes de tocar sus
-- ítems (despachar, entregar y cancelar se turnan), el candado consultivo por
-- comprador en `crear_orden()`, el orden fijo en que se recorren las líneas
-- (dos compras cruzadas no se bloquean mutuamente) y `listings.version`.
--
-- ## Orden de aplicación
--
-- **Se puede aplicar antes o después de desplegar el código.** La aplicación
-- pregunta si la 0014 está (`logisticaDisponible()` en `src/lib/repo.ts`) y,
-- si no, se comporta como antes: sin envío, sin reseñas, comprando por la
-- `crear_orden()` de la 0012.
--
-- ## Lo que tiene de destructivo, dicho en voz alta
--
--   - La vista `listings_publicos` se borra y se vuelve a crear, por lo mismo
--     que en la 0012: Postgres congela el `l.*` al crearla.
--   - `crear_orden()` de la 0012 se borra y se crea con más parámetros. Con
--     `create or replace` quedarían las dos versiones y PostgREST no sabría a
--     cuál llamar.
--   - Las políticas `reviews_author_write` y `reviews_author_update` se borran:
--     la reseña se escribe por `calificar()`, que comprueba lo que una política
--     no sabe (que el ítem se entregó). No hay ninguna reseña escrita hoy.
--   - Una corrección de datos (sección 4.0): los cupos de pedidos ya cancelados
--     que la 0012 descontó y nadie devolvió vuelven a quedar libres.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Cómo se despacha una oferta
--
-- Solo los productos físicos se despachan. Las experiencias y los servicios
-- dejan las cinco columnas en null.
--
--   despacho          'vendedor': lo lleva el propio vendedor (moto, carro,
--                     mensajero propio). 'transportadora': lo manda por una
--                     empresa de envíos que él elige.
--   transportadora    Cuál, en texto: Aveonline, Servientrega, Coordinadora,
--                     Interrapidísimo… Texto y no lista cerrada: la elige el
--                     vendedor y la lista de transportadoras cambia más rápido
--                     que el esquema.
--   envio_cop         Lo que cobra por enviar ese producto, una vez por pedido
--                     sin importar cuántas unidades. 0 es envío gratis. Null es
--                     una oferta de antes de esta migración, que no lo declaró.
--   entrega_dias_*    En cuántos días hábiles llega después de confirmado el
--                     pago, como rango («de 2 a 5 días»).
-- ---------------------------------------------------------------------------

alter table listings add column if not exists despacho text;
alter table listings add column if not exists transportadora text;
alter table listings add column if not exists envio_cop int;
alter table listings add column if not exists entrega_dias_min int;
alter table listings add column if not exists entrega_dias_max int;

alter table listings drop constraint if exists listings_envio_valido;
alter table listings
  add constraint listings_envio_valido check (
    (despacho is null or despacho in ('vendedor', 'transportadora'))
    and (transportadora is null or char_length(transportadora) between 2 and 60)
    and (envio_cop is null or envio_cop between 0 and 10000000)
    and (entrega_dias_min is null or entrega_dias_min between 0 and 90)
    and (entrega_dias_max is null or entrega_dias_max between 1 and 90)
    and (entrega_dias_min is null or entrega_dias_max is null
         or entrega_dias_min <= entrega_dias_max)
  );

comment on column listings.envio_cop is
  'Costo de envío por pedido de esta oferta, en COP. 0 = gratis. Lo paga el comprador y no lleva comisión.';

-- 1.b La versión de la fila
--
-- **El problema que resuelve es la escritura perdida.** El formulario de una
-- oferta manda la fila entera, stock incluido. Si un administrador abre la
-- oferta, mientras tanto el proveedor la edita (o una compra descuenta una
-- unidad), y el administrador guarda, su formulario viejo pisa lo nuevo sin
-- que nadie se entere: el stock vuelve al número de antes y se puede vender lo
-- que ya no existe.
--
-- Con la versión, quien guarda dice «esto lo edité sobre la versión 7»; si la
-- fila ya va por la 8, el `update` no encuentra fila y la aplicación lo dice.
-- La sube un trigger y no la aplicación: así la sube también la compra que
-- descuenta stock, que no pasa por ningún formulario.
alter table listings add column if not exists version int not null default 1;

create or replace function listings_subir_version()
returns trigger
language plpgsql
as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;

drop trigger if exists listings_version on listings;
create trigger listings_version
  before update on listings
  for each row execute function listings_subir_version();

-- 1.c El trigger de la 0012, otra vez, con `version` fuera de la comparación.
--
-- Compara la fila nueva con la vieja para devolver a revisión una oferta
-- publicada que cambió. La versión no es contenido: si contara, cualquier
-- escritura —también la de stock— la devolvería a revisión. Mismo cuerpo que en
-- la 0012 salvo esa palabra.
create or replace function listings_proteger_proveedor()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  _verificada boolean;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.featured := false;
    if new.status not in ('draft', 'pending_review') then
      new.status := 'pending_review';
    end if;
  else
    new.featured := old.featured;
    new.provider_id := old.provider_id;

    if new.status is distinct from old.status
       and new.status not in ('draft', 'pending_review') then
      new.status := old.status;
    end if;

    if old.status = 'approved'
       and new.status = 'approved'
       and (to_jsonb(new) - array['status', 'featured', 'stock', 'busqueda', 'impacto', 'version'])
           is distinct from
           (to_jsonb(old) - array['status', 'featured', 'stock', 'busqueda', 'impacto', 'version'])
    then
      new.status := 'pending_review';
    end if;
  end if;

  if new.category = 'consultoria' then
    select sustainability_verified_at is not null
      into _verificada
      from providers
     where id = new.provider_id;

    if not coalesce(_verificada, false) then
      raise exception 'categoria-avanzada'
        using hint = 'Consultoría e implementación exige la evaluación verificada por Seregenera.';
    end if;
  end if;

  return new;
end;
$$;

-- 1.d La vista del catálogo, otra vez: es `l.*` y Postgres congela el `*`.
drop view if exists listings_publicos;
create view listings_publicos
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
-- 2. A dónde va un pedido, y cómo va cada ítem
-- ---------------------------------------------------------------------------

alter table orders add column if not exists envio_total_cop int not null default 0;
alter table orders add column if not exists envio_departamento text;
alter table orders add column if not exists envio_ciudad text;
alter table orders add column if not exists envio_direccion text;
alter table orders add column if not exists envio_indicaciones text;

alter table orders drop constraint if exists orders_envio_valido;
alter table orders
  add constraint orders_envio_valido check (
    envio_total_cop >= 0
    and (envio_departamento is null or char_length(envio_departamento) <= 60)
    and (envio_ciudad is null or char_length(envio_ciudad) <= 80)
    and (envio_direccion is null or char_length(envio_direccion) <= 200)
    and (envio_indicaciones is null or char_length(envio_indicaciones) <= 300)
  );

comment on column orders.envio_total_cop is
  'Suma del envío de los ítems. total_cop = subtotal_cop + envio_total_cop. La comisión no se calcula sobre el envío.';

-- Lo de la oferta se congela en el ítem, como el título y el precio
-- (invariante 6): si mañana el vendedor sube el envío o cambia de
-- transportadora, el pedido de hoy sigue diciendo lo que se aceptó.
alter table order_items add column if not exists envio_cop int not null default 0;
alter table order_items add column if not exists despacho text;
alter table order_items add column if not exists transportadora text;
alter table order_items add column if not exists entrega_dias_min int;
alter table order_items add column if not exists entrega_dias_max int;
-- null: no se despacha (experiencia, servicio, o ítem anterior a la 0014).
alter table order_items add column if not exists envio_estado text;
alter table order_items add column if not exists guia text;
alter table order_items add column if not exists despachado_at timestamptz;
alter table order_items add column if not exists entregado_at timestamptz;
-- ¿Le queda algo por devolver a este ítem si el pedido se cancela? Es lo que
-- hace que devolver sea idempotente: se devuelve y se apaga, y una segunda
-- cancelación no encuentra nada que devolver.
alter table order_items add column if not exists stock_descontado boolean not null default false;
alter table order_items add column if not exists cupo_descontado boolean not null default false;

alter table order_items drop constraint if exists order_items_envio_valido;
alter table order_items
  add constraint order_items_envio_valido check (
    envio_cop >= 0
    and (envio_estado is null or envio_estado in ('pendiente', 'despachado', 'entregado'))
    and (guia is null or char_length(guia) <= 80)
    and (transportadora is null or char_length(transportadora) <= 60)
  );

create index if not exists order_items_envio_pendiente_idx
  on order_items (provider_id, envio_estado)
  where envio_estado is not null;


-- ---------------------------------------------------------------------------
-- 3. `crear_orden()`, con envío y stock
--
-- Cambia respecto de la 0012:
--
--   - **Descuenta el stock**, con la misma forma que el cupo:
--     `update ... set stock = stock - qty where stock >= qty`. La condición va
--     dentro del `update`, no en un `select` previo: dos compras a la vez de
--     la última unidad se turnan en esa fila y la segunda no la encuentra.
--     Antes solo se comprobaba, y las dos pasaban (invariante 10).
--   - **Cobra el envío** de cada producto físico y pide el destino si hay
--     alguno. El total es subtotal + envío; la comisión sigue siendo sobre el
--     subtotal (invariantes 2 y 3).
--   - **Recorre las líneas en orden de oferta y fecha.** Dos cestas con las
--     mismas dos ofertas en distinto orden tomarían los candados de las filas
--     cruzados y Postgres abortaría una por interbloqueo. En el mismo orden,
--     la segunda espera.
--   - **Un candado consultivo por comprador** al principio. Hace exactos el
--     límite de pedidos por minuto y la comprobación de idempotencia: dos
--     intentos de la misma persona se ejecutan uno detrás del otro, y el
--     segundo encuentra la orden del primero ya escrita.
-- ---------------------------------------------------------------------------

drop function if exists crear_orden(uuid, jsonb, text, text, text, uuid, text, text);

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

  -- Un intento a la vez por comprador. Se suelta solo al terminar la
  -- transacción. Ver la cabecera de la sección.
  perform pg_advisory_xact_lock(hashtextextended('crear_orden:' || _uid::text, 0));

  -- Idempotencia: el mismo intento devuelve la misma orden.
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
    -- El candado consultivo ya lo hace casi imposible; queda por si la orden
    -- llegó por otro camino (`saveOrder()`) con el mismo `id`.
    select id, reference, buyer_id into _previa from orders where id = _id;
    if found and _previa.buyer_id = _uid then
      return jsonb_build_object('reference', _previa.reference, 'repetida', true);
    end if;
    raise;
  end;

  for _linea in
    select value from jsonb_array_elements(_lineas)
     order by value ->> 'listing_id', value ->> 'date'
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

    -- El stock se descuenta aquí. La condición dentro del `update` es la que
    -- impide vender dos veces la última unidad.
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

    -- Envío: solo los productos físicos, una vez por línea. Sin comisión.
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

  -- Un producto físico necesita a dónde ir. Se comprueba al final porque hasta
  -- recorrer las líneas no se sabe si hay alguno; el `raise` deshace todo, el
  -- stock descontado incluido.
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
         -- El comprador paga el precio de lista más el envío. La comisión sale
         -- de lo que recibe el proveedor (invariante 3) y no toca el envío.
         total_cop            = _subtotal + _envio_total,
         co2_kg_saved         = nullif(_co2, 0),
         water_liters_saved   = nullif(_agua, 0),
         waste_kg_reduced     = nullif(_residuos, 0),
         -- Sin nada que despachar, el destino no significa nada.
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

revoke all on function crear_orden(uuid, jsonb, text, text, text, uuid, text, text, text, text, text, text) from public;
grant execute on function crear_orden(uuid, jsonb, text, text, text, uuid, text, text, text, text, text, text) to authenticated;


-- ---------------------------------------------------------------------------
-- 4. Lo que se reservó vuelve, una sola vez
--
-- Desde que `crear_orden()` descuenta stock, un pedido que no se paga retiene
-- unidades. Y desde la 0012 retenía cupos de experiencias que nadie devolvía
-- al cancelar. Esto lo cierra.
-- ---------------------------------------------------------------------------

-- 4.0 Lo que la 0012 descontó y nadie devolvió
--
-- La 0012 se aplicó el 2026-09-26. Desde entonces cada experiencia con fechas
-- descontó su cupo al comprarse, y cancelar no lo devolvía. Se marca qué ítems
-- de pedidos vivos lo descontaron (para que 4.a sepa devolverlo si se cancelan)
-- y se devuelve ya el de los pedidos que están cancelados.
--
-- **Solo corre la primera vez.** La señal es que el trigger de 4.a todavía no
-- existe: se crea justo debajo. Sin esa guarda, aplicar la migración dos veces
-- devolvería dos veces el cupo de cada pedido cancelado.
do $$
begin
  if exists (select 1 from pg_trigger where tgname = 'orders_liberar_reservas') then
    return;
  end if;

  update order_items oi
     set cupo_descontado = true
    from orders o
   where o.id = oi.order_id
     and o.status not in ('cancelled', 'refunded')
     and oi.date is not null
     and o.created_at >= '2026-09-26'
     and exists (
       select 1 from listing_availability la
        where la.listing_id = oi.listing_id and la.date = oi.date
     );

  update listing_availability la
     set slots_taken = greatest(la.slots_taken - x.qty, 0)
    from (
      select oi.listing_id, oi.date, sum(oi.qty)::int as qty
        from order_items oi
        join orders o on o.id = oi.order_id
       where o.status in ('cancelled', 'refunded')
         and oi.date is not null
         and oi.date >= (now() at time zone 'America/Bogota')::date
         and o.created_at >= '2026-09-26'
       group by 1, 2
    ) x
   where la.listing_id = x.listing_id
     and la.date = x.date;
end;
$$;

-- 4.a Al cancelar o devolver: se devuelve lo que no salió.
--
-- - Stock: si el ítem lo descontó y todavía no se despachó. Lo que ya va en
--   camino o se entregó no vuelve al estante por cambiar un estado.
-- - Cupo: si el ítem lo descontó y la fecha no pasó. Una plaza de ayer no le
--   sirve a nadie.
--
-- Al reabrir (cancelada → esperando pago) se vuelve a reservar, con la misma
-- condición que al comprar: si ya no hay, la reapertura falla con su motivo en
-- vez de dejar un pedido vivo sobre unidades que ya se vendieron a otro.
--
-- Corre dentro del mismo `update` que cambia el estado, y ese `update` tiene la
-- fila de la orden bloqueada: dos cancelaciones a la vez se turnan, y la
-- segunda ya no ve el cambio de estado (pasa de cancelada a cancelada) y no
-- devuelve nada. Las marcas del ítem son la segunda red.
create or replace function orders_liberar_reservas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _i record;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status in ('cancelled', 'refunded')
     and old.status not in ('cancelled', 'refunded') then
    for _i in
      select id, listing_id, qty, date, envio_estado, stock_descontado, cupo_descontado
        from order_items
       where order_id = new.id
       order by listing_id, date
         for update
    loop
      if _i.stock_descontado and coalesce(_i.envio_estado, 'pendiente') = 'pendiente' then
        update listings
           set stock = stock + _i.qty
         where id = _i.listing_id
           and stock is not null;
        update order_items set stock_descontado = false where id = _i.id;
      end if;

      if _i.cupo_descontado and _i.date >= (now() at time zone 'America/Bogota')::date then
        update listing_availability
           set slots_taken = greatest(slots_taken - _i.qty, 0)
         where listing_id = _i.listing_id
           and date = _i.date;
        update order_items set cupo_descontado = false where id = _i.id;
      end if;
    end loop;

  elsif old.status = 'cancelled' and new.status = 'pending_payment' then
    for _i in
      select oi.id, oi.listing_id, oi.qty, oi.date, oi.title_snapshot,
             oi.stock_descontado, oi.cupo_descontado, l.stock, l.kind
        from order_items oi
        left join listings l on l.id = oi.listing_id
       where oi.order_id = new.id
       order by oi.listing_id, oi.date
         for update of oi
    loop
      if _i.listing_id is null then
        continue;
      end if;

      if not _i.stock_descontado and _i.stock is not null then
        update listings
           set stock = stock - _i.qty
         where id = _i.listing_id
           and stock >= _i.qty;
        if not found then
          raise exception 'sin-stock' using hint = _i.title_snapshot;
        end if;
        update order_items set stock_descontado = true where id = _i.id;
      end if;

      if not _i.cupo_descontado and _i.date is not null and exists (
        select 1 from listing_availability
         where listing_id = _i.listing_id and date = _i.date
      ) then
        update listing_availability
           set slots_taken = slots_taken + _i.qty
         where listing_id = _i.listing_id
           and date = _i.date
           and slots_taken + _i.qty <= slots_total;
        if not found then
          raise exception 'sin-cupo' using hint = _i.title_snapshot;
        end if;
        update order_items set cupo_descontado = true where id = _i.id;
      end if;
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists orders_liberar_reservas on orders;
create trigger orders_liberar_reservas
  after update of status on orders
  for each row execute function orders_liberar_reservas();

-- 4.b Los pedidos sin pagar vencen a las 72 horas
--
-- El pago es por transferencia y lo confirma una persona; tres días alcanzan
-- para transferir y no dejan un producto «agotado» por un pedido que nadie va
-- a pagar. Cancelar dispara 4.a, que devuelve el stock y el cupo.
--
-- Se cancela de a uno con `where status = 'pending_payment'`: si en ese
-- instante un administrador confirma el pago, gana quien llegue primero a la
-- fila y el otro no la encuentra. Nunca se cancela un pedido recién pagado.
create or replace function vencer_pedidos_sin_pago(_horas int default 72)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  _vencidos int;
begin
  -- La llama el cron (sin sesión, como `postgres`) o un administrador.
  if auth.uid() is not null and not is_admin() then
    raise exception 'solo-admin';
  end if;

  with vencidos as (
    update orders
       set status = 'cancelled',
           notes = left(concat_ws(E'\n', notes,
             format('Cancelado solo: sin pago en %s horas.', _horas)), 1000)
     where status = 'pending_payment'
       and created_at < now() - make_interval(hours => greatest(_horas, 24))
    returning 1
  )
  select count(*) into _vencidos from vencidos;
  return _vencidos;
end;
$$;

revoke all on function vencer_pedidos_sin_pago(int) from public;
grant execute on function vencer_pedidos_sin_pago(int) to authenticated;

-- Cada hora, si el proyecto tiene `pg_cron`. Si no lo tiene, la migración no
-- falla: el panel de órdenes llama a la función al abrirse, y la extensión se
-- puede activar después desde Database → Extensions y volver a correr este
-- bloque.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule('vencer-pedidos-sin-pago')
    where exists (select 1 from cron.job where jobname = 'vencer-pedidos-sin-pago');
  perform cron.schedule(
    'vencer-pedidos-sin-pago', '17 * * * *',
    'select public.vencer_pedidos_sin_pago()'
  );
exception when others then
  raise notice 'pg_cron no disponible (%): los pedidos vencen al abrir /admin/ordenes', sqlerrm;
end;
$$;



-- ---------------------------------------------------------------------------
-- 5. Despachar y confirmar la entrega
--
-- Las dos funciones toman primero el candado de la **orden** y después el del
-- ítem, siempre en ese orden — el mismo que usa un cambio de estado del panel
-- (que bloquea la orden y, por el trigger de 4.a, sus ítems). Así:
--
--   - dos personas de la misma empresa que despachan el mismo ítem se turnan,
--     y la segunda recibe «ya estaba despachado» en vez de pisar la guía;
--   - despachar mientras el equipo cancela: la que llega segunda ve el estado
--     que dejó la primera (no se despacha un pedido cancelado; no se devuelve
--     al estante algo que ya salió);
--   - dos ítems de la misma orden que se confirman a la vez: sin el candado de
--     la orden, cada uno vería al otro todavía en camino y ninguno cerraría el
--     pedido. Con él, el segundo ve al primero entregado y lo cierra.
--
-- Las dos son idempotentes: repetirlas devuelve `cambiado: false` y no
-- vuelve a mandar correos (la aplicación solo avisa si `cambiado` es true).
-- ---------------------------------------------------------------------------

create or replace function despachar_item(
  _item_id uuid,
  _transportadora text default null,
  _guia text default null
)
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
  _g text := nullif(left(trim(coalesce(_guia, '')), 80), '');
  _t text := nullif(left(trim(coalesce(_transportadora, '')), 60), '');
begin
  if auth.uid() is null then
    raise exception 'sin-sesion';
  end if;

  select order_id, provider_id into _orden, _proveedor
    from order_items where id = _item_id;
  -- Se comprueba antes de bloquear nada: quien no gestiona la empresa no
  -- llega a tomar el candado de una orden ajena.
  if not found or not (manages_provider(_proveedor) or is_admin()) then
    raise exception 'item-ajeno';
  end if;

  select status into _estado from orders where id = _orden for update;
  select * into _i from order_items where id = _item_id for update;

  if _i.envio_estado is null then
    raise exception 'sin-envio';
  end if;

  if _i.envio_estado in ('despachado', 'entregado') then
    -- Repetido. Lo único que se acepta es corregir la guía de algo que va en
    -- camino: es el error más común al cargarla.
    if _i.envio_estado = 'despachado'
       and ((_g is not null and _g is distinct from _i.guia)
         or (_t is not null and _t is distinct from _i.transportadora)) then
      update order_items
         set guia = coalesce(_g, guia),
             transportadora = coalesce(_t, transportadora)
       where id = _item_id;
    end if;
    return jsonb_build_object('cambiado', false, 'estado', _i.envio_estado, 'orden_id', _orden);
  end if;

  if _estado not in ('paid', 'in_progress') then
    raise exception 'orden-no-despachable';
  end if;
  -- Lo que va por transportadora lleva guía: sin ella el comprador no puede
  -- seguir su envío y nadie puede reclamar a la transportadora.
  if _i.despacho = 'transportadora' and _g is null then
    raise exception 'falta-guia';
  end if;

  update order_items
     set envio_estado   = 'despachado',
         guia           = _g,
         transportadora = coalesce(_t, transportadora),
         despachado_at  = now()
   where id = _item_id;

  -- El primer despacho pone el pedido «en preparación». Condicional: si ya lo
  -- estaba, o si el equipo lo movió, no se toca.
  update orders set status = 'in_progress' where id = _orden and status = 'paid';

  return jsonb_build_object('cambiado', true, 'estado', 'despachado', 'orden_id', _orden);
end;
$$;

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
  -- La confirma quien compró («ya me llegó») o quien vende (lo entregó en
  -- mano), o el equipo.
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

  update order_items
     set envio_estado  = 'entregado',
         entregado_at  = now(),
         despachado_at = coalesce(despachado_at, now())
   where id = _item_id;

  -- ¿Era lo último? Solo se cierra solo un pedido que es todo de productos
  -- físicos: una experiencia o un servicio no se «entregan» por aquí, y esos
  -- pedidos los sigue cerrando el equipo.
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

revoke all on function despachar_item(uuid, text, text) from public;
revoke all on function confirmar_entrega(uuid) from public;
grant execute on function despachar_item(uuid, text, text) to authenticated;
grant execute on function confirmar_entrega(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 6. Reseñas
--
-- La tabla existe desde la 0001 y el trigger que da puntos por una reseña de 4
-- o 5 estrellas desde la 0006. Faltaba poder escribirlas y verlas.
--
-- **Solo reseña quien compró, y cuando ya tiene lo que compró**: un producto
-- físico entregado, una experiencia cuya fecha pasó, o un pedido que el equipo
-- dio por cumplido. Es `puede_resenar()`, gemela de `puedeResenar()` en
-- `src/lib/resenas.ts`.
--
-- **Una por ítem comprado, y se puede corregir.** El `unique (order_item_id)`
-- de la 0001 más `on conflict do update` hacen que mandarla dos veces —doble
-- clic, o volver a calificar— deje una sola reseña con lo último. Los puntos
-- del proveedor salen del `insert` (trigger de la 0006), así que corregir no
-- vuelve a sumar.
--
-- **El nombre se guarda abreviado y congelado** («Ana M.»): `profiles` no es
-- legible para un visitante, como pasa con la Comunidad, y el apellido entero
-- de un comprador no tiene por qué ser público.
-- ---------------------------------------------------------------------------

alter table reviews add column if not exists oculta boolean not null default false;
alter table reviews add column if not exists autor_nombre text;
alter table reviews add column if not exists updated_at timestamptz;

alter table reviews drop constraint if exists reviews_textos;
alter table reviews
  add constraint reviews_textos check (
    char_length(body) <= 2000
    and (autor_nombre is null or char_length(autor_nombre) <= 80)
  );

create index if not exists reviews_listing_idx on reviews (listing_id, created_at desc);

-- Se lee lo que no está oculto. El autor ve la suya aunque el equipo la haya
-- ocultado, para que no la vuelva a escribir creyendo que se perdió.
drop policy if exists reviews_public_read on reviews;
create policy reviews_public_read on reviews
  for select using (not oculta or author_id = auth.uid() or is_admin());

drop policy if exists reviews_author_write on reviews;
drop policy if exists reviews_author_update on reviews;

-- El equipo modera: oculta o vuelve a mostrar. No edita el texto de nadie.
drop policy if exists reviews_admin on reviews;
create policy reviews_admin on reviews
  for update using (is_admin()) with check (is_admin());

create or replace function puede_resenar(
  _orden_estado order_status,
  _envio_estado text,
  _fecha date
)
returns boolean
language sql
stable
as $$
  select _orden_estado in ('paid', 'in_progress', 'fulfilled')
     and (
       _envio_estado = 'entregado'
       or (_envio_estado is null and (
             _orden_estado = 'fulfilled'
             or (_fecha is not null and _fecha <= (now() at time zone 'America/Bogota')::date)
          ))
     );
$$;

-- «Ana María Gómez Ruiz» → «Ana R.». Sin nombre, «Comprador verificado».
create or replace function nombre_publico(_completo text)
returns text
language plpgsql
immutable
as $$
declare
  _partes text[] := regexp_split_to_array(trim(coalesce(_completo, '')), '\s+');
  _n int := coalesce(array_length(_partes, 1), 0);
begin
  if _n = 0 or _partes[1] = '' then
    return 'Comprador verificado';
  end if;
  if _n = 1 then
    return left(initcap(_partes[1]), 40);
  end if;
  return left(initcap(_partes[1]), 40) || ' ' || upper(left(_partes[_n], 1)) || '.';
end;
$$;

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

  select oi.listing_id, oi.date, oi.envio_estado, o.status as orden_estado, o.buyer_id
    into _i
    from order_items oi
    join orders o on o.id = oi.order_id
   where oi.id = _order_item_id;

  if not found or _i.buyer_id is distinct from _uid then
    raise exception 'item-ajeno';
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

revoke all on function calificar(uuid, int, text) from public;
grant execute on function calificar(uuid, int, text) to authenticated;

-- El promedio, por oferta y por proveedor. Vistas y no columnas en `listings`:
-- una columna que cambia con cada reseña haría que el trigger de 1.c viera la
-- oferta «editada» y la mandara a revisión, y subiría su `version` debajo del
-- formulario de quien la está editando.
create or replace view calificaciones_oferta
with (security_invoker = true) as
select listing_id,
       round(avg(rating)::numeric, 1) as promedio,
       count(*)::int as cantidad
  from reviews
 where not oculta
 group by listing_id;

create or replace view calificaciones_proveedor
with (security_invoker = true) as
select l.provider_id,
       round(avg(r.rating)::numeric, 1) as promedio,
       count(*)::int as cantidad
  from reviews r
  join listings l on l.id = r.listing_id
 where not r.oculta
 group by l.provider_id;

grant select on calificaciones_oferta, calificaciones_proveedor to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 7. El resto de la auditoría de idempotencia y concurrencia
--
-- Se revisaron todas las escrituras del proyecto (acciones, rutas, funciones y
-- triggers). Lo de dinero, stock y cupos está arriba. Esto es lo demás que la
-- base tiene que garantizar por sí sola, porque una comprobación hecha en la
-- aplicación —leer y después escribir— la pasan las dos peticiones que llegan
-- a la vez.
-- ---------------------------------------------------------------------------

-- 7.a Una orden solo se mueve por los saltos permitidos.
--
-- Gemela de `TRANSICIONES` en `src/lib/order-status.ts`. Hasta hoy la tabla
-- vivía solo en la aplicación, que la comprobaba sobre un estado leído antes:
-- dos administradores que confirman el pago y cancelan a la vez pasaban los
-- dos. Aquí la comprobación ve la fila ya bloqueada por el `update`, así que el
-- segundo encuentra el estado que dejó el primero.
create or replace function orders_validar_transicion()
returns trigger
language plpgsql
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if not (
       (old.status = 'pending_payment' and new.status in ('paid', 'cancelled'))
    or (old.status = 'paid'            and new.status in ('in_progress', 'fulfilled', 'refunded'))
    or (old.status = 'in_progress'     and new.status in ('fulfilled', 'refunded'))
    or (old.status = 'fulfilled'       and new.status = 'refunded')
    or (old.status = 'cancelled'       and new.status = 'pending_payment')
  ) then
    raise exception 'transicion-invalida'
      using hint = format('%s → %s', old.status, new.status);
  end if;
  return new;
end;
$$;

drop trigger if exists orders_transicion on orders;
create trigger orders_transicion
  before update of status on orders
  for each row execute function orders_validar_transicion();

-- 7.b Una venta devuelta deja de contar como entregada.
--
-- Los puntos de `venta_entregada` y `volumen_vendido` bajan la comisión del
-- proveedor (su nivel), así que una venta que se devolvió y los conserva es
-- dinero. Se quitan los eventos que esa orden generó, como hace la 0013 con una
-- publicación borrada. `primera_venta` se queda: ocurrió, y es una sola vez en
-- la vida.
--
-- Y los proveedores se recorren por `provider_id`: dos órdenes que se cierran a
-- la vez con los mismos dos proveedores tomaban sus filas en orden cualquiera,
-- y eso es un interbloqueo esperando fecha.
create or replace function experiencia_por_orden()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _fila record;
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

  elsif new.status = 'refunded' and old.status = 'fulfilled' then
    for _fila in
      with borrados as (
        delete from experience_events
         where clave in ('venta_entregada', 'volumen_vendido')
           and (referencia = new.id::text or referencia like new.id::text || '#%')
        returning provider_id, puntos
      )
      select provider_id, sum(puntos)::int as puntos
        from borrados
       group by provider_id
       order by provider_id
    loop
      update providers
         set experience_points = greatest(0, experience_points - _fila.puntos)
       where id = _fila.provider_id;
    end loop;
  end if;
  return new;
end;
$$;

-- 7.c Los topes de puntos, contados con la fila del proveedor bloqueada.
--
-- `experiencia_topada()` cuenta y después se inserta: dos ofertas aprobadas a
-- la vez contaban 4 las dos y pasaban el tope de 5 las dos. Bloquear la fila
-- del proveedor al principio pone en fila a todo lo que le da puntos a esa
-- empresa. `for no key update` y no `for update`: no choca con el candado que
-- toman las claves foráneas que apuntan a `providers`.
--
-- Mismo cuerpo que en la 0011 salvo esa línea.
create or replace function otorgar_experiencia(
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
  _total int;
  _topado boolean;
begin
  if _provider_id is null then
    return null;
  end if;

  _puntos := case _clave
    when 'perfil_completo'          then 40
    when 'oferta_publicada'         then 10
    when 'primera_venta'            then 120
    when 'venta_entregada'          then 40
    when 'volumen_vendido'          then 10
    when 'resena_positiva'          then 30
    when 'cotizacion_respondida'    then 5
    when 'evaluacion_aprobada'      then 250
    when 'certificacion_verificada' then 80
    when 'articulo_publicado'       then 10
    when 'articulo_destacado'       then 50
    else null
  end;

  if _puntos is null then
    raise exception 'otorgar_experiencia: evento desconocido %', _clave;
  end if;

  perform 1 from providers where id = _provider_id for no key update;

  _topado := case _clave
    when 'oferta_publicada'
      then experiencia_topada(_provider_id, _clave, 5, interval '30 days')
    when 'articulo_publicado'
      then experiencia_topada(_provider_id, _clave, 4, interval '30 days')
    when 'cotizacion_respondida'
      then experiencia_topada(_provider_id, _clave, 10, interval '30 days')
    when 'certificacion_verificada'
      then experiencia_topada(_provider_id, _clave, 3)
    else false
  end;

  if _topado then
    return (select experience_points from providers where id = _provider_id);
  end if;

  insert into experience_events (provider_id, clave, puntos, referencia)
  values (_provider_id, _clave, _puntos, _referencia)
  on conflict do nothing;

  if not found then
    return (select experience_points from providers where id = _provider_id);
  end if;

  update providers
     set experience_points = experience_points + _puntos
   where id = _provider_id
  returning experience_points into _total;

  return _total;
end;
$$;

revoke all on function otorgar_experiencia(uuid, text, text) from public;
do $$
declare
  _rol text;
begin
  foreach _rol in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = _rol) then
      execute format('revoke all on function otorgar_experiencia(uuid, text, text) from %I', _rol);
    end if;
  end loop;
end;
$$;

-- 7.d Las reacciones ya no se interbloquean.
--
-- Insertar una reacción toma sobre la publicación el candado de la clave
-- foránea (`for key share`). Después el trigger pedía `for update`, que choca
-- con ese candado: dos personas que reaccionaban a la misma publicación en el
-- mismo instante se esperaban mutuamente y Postgres abortaba a una («No
-- pudimos guardar tu reacción»). `for no key update` no choca con el de la
-- clave foránea y sigue poniendo en fila a los recuentos. Mismo cuerpo que en
-- la 0008 salvo esa palabra.
create or replace function recontar_publicacion(_post uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _por_tipo jsonb;
  _total int;
begin
  if _post is null then
    return;
  end if;

  perform 1 from community_posts where id = _post for no key update;

  select coalesce(jsonb_object_agg(t.kind, t.n), '{}'::jsonb),
         coalesce(sum(t.n), 0)
    into _por_tipo, _total
    from (
      select kind, count(*)::int as n
        from community_reactions
       where post_id = _post
       group by kind
    ) t;

  perform set_config('app.derivados', 'on', true);
  update community_posts
     set reaction_count  = _total,
         reaction_counts = _por_tipo
   where id = _post;
  perform set_config('app.derivados', 'off', true);
end;
$$;

-- 7.e Los topes de la Comunidad, contados de uno en uno por persona.
--
-- Contar y después insertar deja pasar a dos peticiones paralelas de la misma
-- persona. Un candado consultivo por autor las pone en fila. Mismos cuerpos que
-- en la 0013 y la 0011 salvo esa línea.
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

  perform pg_advisory_xact_lock(hashtextextended('publicar:' || new.author_id::text, 0));

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

create or replace function community_reactions_limites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('reaccionar:' || new.user_id::text, 0));
  if (
    select count(*) from community_reactions
     where user_id = new.user_id
       and created_at > now() - interval '1 hour'
  ) >= 60 then
    raise exception 'limite-reacciones' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- 7.f Nunca queda la plataforma sin administrador.
--
-- La acción del panel cuenta los administradores y después borra: dos que se
-- quitan el rol el uno al otro a la vez cuentan 2 los dos y se quedan en 0, y
-- recuperar el panel exige la clave de servicio. Aquí se cuenta con un candado
-- tomado, y sin contar la fila que se está borrando.
create or replace function user_roles_ultimo_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role <> 'admin' then
    return old;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('user_roles:admin', 0));
  if not exists (
    select 1 from user_roles
     where role = 'admin' and user_id <> old.user_id
  ) then
    raise exception 'ultimo-admin';
  end if;
  return old;
end;
$$;

drop trigger if exists user_roles_ultimo_admin on user_roles;
create trigger user_roles_ultimo_admin
  before delete on user_roles
  for each row execute function user_roles_ultimo_admin();

-- 7.g Aprobar una postulación, en una transacción.
--
-- La acción del panel lo hacía en cuatro escrituras sueltas, protegidas por una
-- lectura previa de `provider_id`: dos administradores (o dos pestañas) que
-- aprobaban a la vez creaban dos empresas para la misma postulación, y un
-- fallo a mitad dejaba una empresa sin enlazar que el reintento duplicaba.
-- Aquí la postulación se bloquea primero; la segunda aprobación espera y
-- encuentra la empresa ya creada.
create or replace function aprobar_postulacion(_id uuid, _notas text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _p record;
  _provider_id uuid;
  _slug text;
begin
  if not is_admin() then
    raise exception 'solo-admin';
  end if;

  select * into _p from provider_applications where id = _id for update;
  if not found then
    raise exception 'no-existe';
  end if;

  if _p.provider_id is not null then
    select slug into _slug from providers where id = _p.provider_id;
    return jsonb_build_object(
      'repetida', true, 'provider_id', _p.provider_id, 'slug', _slug,
      'sin_dueno', _p.user_id is null);
  end if;

  _slug := slug_unico_proveedor(_p.name);

  insert into providers (
    slug, name, tagline, description, country, department, city,
    email, phone, website, tax_id, status
  ) values (
    _slug, _p.name,
    left(split_part(_p.description, '. ', 1), 140),
    _p.description, coalesce(_p.country, 'Colombia'), _p.department, _p.city,
    _p.email, _p.phone, nullif(_p.website, ''), _p.tax_id,
    'approved'::review_status
  )
  returning id into _provider_id;

  if _p.user_id is not null then
    insert into provider_members (provider_id, user_id, is_owner)
    values (_provider_id, _p.user_id, true)
    on conflict do nothing;

    insert into user_roles (user_id, role)
    values (_p.user_id, 'provider')
    on conflict (user_id, role) do nothing;
  end if;

  update provider_applications
     set status = 'approved',
         provider_id = _provider_id,
         reviewer_notes = nullif(trim(coalesce(_notas, '')), ''),
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = _id;

  return jsonb_build_object(
    'repetida', false, 'provider_id', _provider_id, 'slug', _slug,
    'sin_dueno', _p.user_id is null);
end;
$$;

revoke all on function aprobar_postulacion(uuid, text) from public;
grant execute on function aprobar_postulacion(uuid, text) to authenticated;

-- 7.h Postular dos veces no da dos empresas ni dos correos.
--
-- Quien manda el formulario de `/vender` y no ve la respuesta (red lenta, doble
-- clic) lo manda otra vez. Con sesión, la segunda vez veía «ya gestionas una
-- empresa» solo si la primera había terminado; si llegaban juntas, las dos
-- creaban la suya. Sin sesión, cada envío era una postulación más que el
-- equipo podía aprobar dos veces.
--
-- Ahora: un candado por persona (o por correo, sin sesión), y si en los últimos
-- diez minutos ya llegó la misma postulación —mismo correo, mismo nombre de
-- empresa, misma persona— se devuelve esa con `repetida: true` y la aplicación
-- no manda el correo otra vez. Mismo cuerpo que en la 0009 en lo demás.
create or replace function postular_proveedor(
  _name text,
  _contact_name text,
  _email text,
  _phone text,
  _country text,
  _department text,
  _city text,
  _description text,
  _org_type text default null,
  _tax_id_kind text default null,
  _tax_id text default null,
  _website text default null,
  _categories text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _app_id uuid;
  _provider_id uuid;
  _slug text;
  _previa record;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'postular:' || coalesce(_uid::text, lower(trim(coalesce(_email, '')))), 0));

  select id, provider_id into _previa
    from provider_applications
   where lower(email) = lower(_email)
     and lower(name) = lower(_name)
     and user_id is not distinct from _uid
     and created_at > now() - interval '10 minutes'
   order by created_at desc
   limit 1;

  if found then
    select slug into _slug from providers where id = _previa.provider_id;
    return jsonb_build_object(
      'application_id', _previa.id,
      'activado', _previa.provider_id is not null,
      'provider_id', _previa.provider_id,
      'provider_slug', _slug,
      'repetida', true);
  end if;

  if _uid is null and (
    select count(*) from provider_applications
     where lower(email) = lower(_email)
       and user_id is null
       and created_at > now() - interval '1 day'
  ) >= 3 then
    raise exception 'limite-postulaciones' using errcode = 'P0001';
  end if;

  insert into provider_applications (
    user_id, name, contact_name, email, phone,
    country, department, city, website, description,
    org_type, tax_id_kind, tax_id, categories, consent_at, status
  ) values (
    _uid, _name, _contact_name, _email, _phone,
    _country, _department, _city, nullif(_website, ''), _description,
    _org_type, _tax_id_kind, _tax_id, coalesce(_categories, '{}'), now(),
    case when _uid is null then 'pending_review'::review_status
         else 'approved'::review_status end
  )
  returning id into _app_id;

  if _uid is null then
    return jsonb_build_object(
      'application_id', _app_id, 'activado', false, 'motivo', 'sin-sesion',
      'repetida', false);
  end if;

  select pm.provider_id into _provider_id
    from provider_members pm
   where pm.user_id = _uid and pm.is_owner
   limit 1;

  if _provider_id is null then
    _slug := slug_unico_proveedor(_name);

    insert into providers (
      slug, name, tagline, description, country, department, city,
      email, phone, website, tax_id, status
    ) values (
      _slug, _name,
      left(split_part(_description, '. ', 1), 140),
      _description, _country, _department, _city,
      _email, _phone, nullif(_website, ''), _tax_id,
      'approved'::review_status
    )
    returning id into _provider_id;

    insert into provider_members (provider_id, user_id, is_owner)
    values (_provider_id, _uid, true)
    on conflict do nothing;

    insert into user_roles (user_id, role)
    values (_uid, 'provider')
    on conflict (user_id, role) do nothing;
  else
    select slug into _slug from providers where id = _provider_id;
  end if;

  update provider_applications
     set provider_id = _provider_id
   where id = _app_id;

  return jsonb_build_object(
    'application_id', _app_id,
    'activado', true,
    'provider_id', _provider_id,
    'provider_slug', _slug,
    'repetida', false);
end;
$$;

revoke all on function postular_proveedor(
  text, text, text, text, text, text, text, text, text, text, text, text, text[]
) from public;
grant execute on function postular_proveedor(
  text, text, text, text, text, text, text, text, text, text, text, text, text[]
) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- Comprobación, después de aplicarla
--
--   select count(*) from pg_proc where proname in
--     ('crear_orden', 'despachar_item', 'confirmar_entrega', 'calificar',
--      'vencer_pedidos_sin_pago', 'orders_liberar_reservas');            -- 6
--   select count(*) from pg_proc where proname = 'crear_orden';            -- 1
--   select column_name from information_schema.columns
--    where table_name = 'listings' and column_name in ('despacho', 'version'); -- 2
--   select jobname, schedule from cron.job;   -- si pg_cron está activo
--
-- ---------------------------------------------------------------------------
-- Rollback, si hiciera falta
--
--   drop view if exists calificaciones_proveedor, calificaciones_oferta;
--   drop function if exists calificar(uuid, int, text);
--   drop function if exists nombre_publico(text);
--   drop function if exists puede_resenar(order_status, text, date);
--   drop policy if exists reviews_admin on reviews;
--   -- y se recrean reviews_public_read, reviews_author_write y
--   -- reviews_author_update con el cuerpo de la 0001.
--   alter table reviews drop constraint if exists reviews_textos,
--     drop column if exists oculta, drop column if exists autor_nombre,
--     drop column if exists updated_at;
--   drop function if exists despachar_item(uuid, text, text);
--   drop function if exists confirmar_entrega(uuid);
--   select cron.unschedule('vencer-pedidos-sin-pago');
--   drop function if exists vencer_pedidos_sin_pago(int);
--   drop trigger if exists orders_liberar_reservas on orders;
--   drop function if exists orders_liberar_reservas();
--   drop function if exists crear_orden(uuid, jsonb, text, text, text, uuid, text, text, text, text, text, text);
--   -- y se vuelve a crear la crear_orden() de la 0012, sección 5.
--   alter table order_items drop constraint if exists order_items_envio_valido,
--     drop column if exists envio_cop, drop column if exists despacho,
--     drop column if exists transportadora, drop column if exists entrega_dias_min,
--     drop column if exists entrega_dias_max, drop column if exists envio_estado,
--     drop column if exists guia, drop column if exists despachado_at,
--     drop column if exists entregado_at, drop column if exists stock_descontado,
--     drop column if exists cupo_descontado;
--   alter table orders drop constraint if exists orders_envio_valido,
--     drop column if exists envio_total_cop, drop column if exists envio_departamento,
--     drop column if exists envio_ciudad, drop column if exists envio_direccion,
--     drop column if exists envio_indicaciones;
--   drop trigger if exists listings_version on listings;
--   drop function if exists listings_subir_version();
--   -- La vista primero: depende de las columnas de listings.
--   drop view if exists listings_publicos;
--   alter table listings drop constraint if exists listings_envio_valido,
--     drop column if exists despacho, drop column if exists transportadora,
--     drop column if exists envio_cop, drop column if exists entrega_dias_min,
--     drop column if exists entrega_dias_max, drop column if exists version;
--   -- Y se vuelven a crear la vista y listings_proteger_proveedor() con el
--   -- cuerpo de la 0012.
-- ---------------------------------------------------------------------------
