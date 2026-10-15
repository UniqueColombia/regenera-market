-- 0017 — El envío según a dónde va y cuántas unidades son.
--
-- Pedido de Jesús el 2026-10-14: «cada proveedor debe darnos los costos de
-- envíos nacionales por tamaño, cantidad». Se eligió, entre tres opciones, la
-- que un proveedor puede llenar sin una tabla de tarifas delante:
--
--   envío = (tarifa local si el destino es el mismo departamento de donde sale,
--            si no la nacional)
--         + tarifa por unidad adicional × (unidades − 1)
--
-- Hasta la 0016 el envío era una tarifa fija por línea, la misma para una
-- bolsa de café que para doce y para Santa Marta que para Leticia. Eso obligaba
-- al vendedor a cobrar de más a unos para no perder con otros.
--
-- **Peso y medidas se piden ya, opcionales, aunque hoy no se usen para cobrar.**
-- Son lo que pide cualquier transportadora para cotizar (Aveonline, el convenio
-- en conversación). El día que haya API, la cotización reemplaza la tarifa
-- declarada detrás de una interfaz (skill `nueva-integracion`) y no hay que
-- volver a pedirle a cada proveedor que edite sus productos.
--
-- Aditiva y re-ejecutable. **Va después de la 0016**: reemplaza la
-- `crear_orden()` de la 0016 (con su «sin compra propia» y sus candados por
-- uuid), no la de la 0014. Aplicarla antes devolvería la versión sin esos
-- arreglos.
--
-- Lo que no cambia:
-- - `envio_cop` sigue existiendo y sigue mandando: es la tarifa **nacional**,
--   la de cualquier destino si no hay local. Un producto que solo declaró
--   `envio_cop` cobra exactamente lo mismo que antes —con una unidad o con
--   cien—, porque sin `envio_adicional_cop` la parte por unidad es cero.
-- - El envío no lleva comisión y se le pasa entero al vendedor (invariante 3).
-- - Se congela en `order_items.envio_cop` como el precio (invariante 6).
--
-- Gemela en TypeScript: `envioDeLinea()` en `src/lib/envios.ts`. La compara
-- `supabase/pruebas/gemelos.test.ts`.

-- ---------------------------------------------------------------------------
-- 1. Las columnas
-- ---------------------------------------------------------------------------
alter table listings add column if not exists envio_local_cop int;
alter table listings add column if not exists envio_adicional_cop int;
alter table listings add column if not exists peso_kg numeric(8, 2);
alter table listings add column if not exists largo_cm int;
alter table listings add column if not exists ancho_cm int;
alter table listings add column if not exists alto_cm int;

alter table listings drop constraint if exists listings_envio_zona_valido;
alter table listings
  add constraint listings_envio_zona_valido check (
        (envio_local_cop is null or envio_local_cop between 0 and 10000000)
    and (envio_adicional_cop is null or envio_adicional_cop between 0 and 10000000)
    and (peso_kg is null or (peso_kg > 0 and peso_kg <= 10000))
    and (largo_cm is null or largo_cm between 1 and 1000)
    and (ancho_cm is null or ancho_cm between 1 and 1000)
    and (alto_cm is null or alto_cm between 1 and 1000)
  );

comment on column listings.envio_local_cop is
  'Envío cuando el destino está en el mismo departamento de donde sale (listings.department). '
  'Null = no hay tarifa local y se cobra la nacional (envio_cop). Desde la 0017.';
comment on column listings.envio_adicional_cop is
  'Lo que suma cada unidad después de la primera. Null o 0 = el envío no depende de la cantidad. Desde la 0017.';
comment on column listings.peso_kg is
  'Peso de una unidad empacada, en kg. Opcional; para cotizar con una transportadora. Desde la 0017.';

-- ---------------------------------------------------------------------------
-- 2. envio_de_linea(): la regla, en un solo sitio
--
-- Pura e inmutable, sin acceso a tablas: la llama `crear_orden()` y la compara
-- la prueba de gemelos. El origen es el departamento **de la oferta**, no el
-- del proveedor: una empresa de Bogotá puede producir en el Huila, y lo que se
-- despacha sale de donde está el producto. Sin departamento de origen no hay
-- tarifa local que aplicar (el formulario lo exige cuando se declara una).
--
-- Los departamentos se comparan sin tildes ni mayúsculas, con `sin_tildes()`
-- (0003): el de la oferta y el del destino salen de la misma lista
-- (`DEPARTMENTS`), pero una fila escrita a mano o por script puede traer
-- «Bogota» por «Bogotá».
-- ---------------------------------------------------------------------------
create or replace function envio_de_linea(
  _nacional int,
  _local int,
  _adicional int,
  _origen text,
  _destino text,
  _qty int
)
returns int
language sql
immutable
parallel safe
set search_path = public
as $$
  select case
    when base is null then 0
    else base + coalesce(_adicional, 0) * greatest(coalesce(_qty, 1) - 1, 0)
  end
  from (
    select case
      when _local is not null
       and nullif(trim(coalesce(_origen, '')), '') is not null
       and sin_tildes(trim(_origen)) = sin_tildes(trim(coalesce(_destino, '')))
      then _local
      else _nacional
    end as base
  ) t;
$$;

comment on function envio_de_linea(int, int, int, text, text, int) is
  'Envío de una línea: tarifa local si el destino es el departamento de origen, si no la nacional, '
  'más la tarifa por unidad adicional. Gemela de envioDeLinea() en src/lib/envios.ts.';

-- ---------------------------------------------------------------------------
-- 3. crear_orden(): cobra el envío con envio_de_linea()
--
-- Mismo cuerpo que en la 0016; el único cambio va marcado con «0017».
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
      -- 0017: según el destino y las unidades, no una tarifa fija por línea.
      _envio := envio_de_linea(
        _l.envio_cop, _l.envio_local_cop, _l.envio_adicional_cop,
        _l.department, _departamento, _qty
      );
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

-- `create or replace` conserva los permisos; se repiten por si alguien aplica
-- esta sobre una base donde la función no existía.
revoke execute on function crear_orden(uuid, jsonb, text, text, text, uuid, text, text, text, text, text, text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function crear_orden(uuid, jsonb, text, text, text, uuid, text, text, text, text, text, text) from anon;
    grant execute on function crear_orden(uuid, jsonb, text, text, text, uuid, text, text, text, text, text, text) to authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Comprobación después de aplicarla (las dos en 1):
--
--   select count(*) from pg_proc where proname = 'envio_de_linea' and pronamespace = 'public'::regnamespace;
--   select count(*) from information_schema.columns where table_name = 'listings' and column_name = 'envio_local_cop';
--
-- Y la regla, a mano: 10.000 nacional, 6.000 local, 2.000 por unidad adicional.
--
--   select envio_de_linea(10000, 6000, 2000, 'Magdalena', 'Magdalena', 3);  -- 10000 (6000 + 2 × 2000)
--   select envio_de_linea(10000, 6000, 2000, 'Magdalena', 'Antioquia', 3);  -- 14000 (10000 + 2 × 2000)
--   select envio_de_linea(10000, null, null, 'Magdalena', 'Magdalena', 3);  -- 10000, como antes de la 0017
--
-- Rollback (en el papel): volver a correr la definición de crear_orden de la
-- 0016, y:
--   drop function if exists envio_de_linea(int, int, int, text, text, int);
--   alter table listings drop constraint if exists listings_envio_zona_valido,
--     drop column if exists envio_local_cop, drop column if exists envio_adicional_cop,
--     drop column if exists peso_kg, drop column if exists largo_cm,
--     drop column if exists ancho_cm, drop column if exists alto_cm;
-- ---------------------------------------------------------------------------
