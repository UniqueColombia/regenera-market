-- ===========================================================================
-- 0012 — Las empresas publican lo suyo, declaran su giro, y comprar es una
--        sola transacción
--
-- Cinco cosas, cada una en su sección:
--
--   1. `providers.giros`: qué es y qué ofrece la empresa, con un tope por nivel.
--   2. Las categorías nuevas del catálogo, la subcategoría y el impacto en las
--      dos direcciones (lo que aporta y lo que cuesta) en `listings`.
--   3. Lo que un proveedor NO puede hacer con sus propias ofertas: publicarse
--      solo, destacarse, o vender consultoría sin el sello verificado.
--   4. Las filas que ya existen, pasadas a las categorías nuevas.
--   5. `crear_orden()`: la orden, sus ítems y el descuento de cupo en una sola
--      transacción, con idempotencia, sin la clave de servicio.
--
-- ## Orden de aplicación
--
-- **Se aplica antes de desplegar el código de esta tanda**, como la 0006. El
-- catálogo nuevo lee columnas que hasta ahora no existían (`subcategory`,
-- `aporte_ambiental`, `giros`…) y sin ellas responde 500.
--
-- Lo único que no rompe si va por detrás es la compra: `src/app/carrito/
-- actions.ts` detecta que `crear_orden()` no existe y cae al camino anterior.
--
-- ## Lo que tiene de destructivo, dicho en voz alta
--
-- Una sola cosa: **la vista `listings_publicos` se borra y se vuelve a crear**
-- (sección 2.c). No hay datos en una vista, pero es un `drop`, y la skill
-- `supabase-schema` pide decirlo. Hace falta porque la vista es `l.*`, y
-- Postgres congela el `*` al crearla: sin recrearla, las columnas nuevas no
-- llegarían al catálogo. `create or replace` no sirve — las columnas nuevas
-- quedarían en medio de las del proveedor y Postgres lo rechaza.
--
-- Y una conversión de datos (sección 4): `listings.category` pasa de etiquetas
-- sueltas («Amenities») a los `id` de `src/lib/taxonomy.ts` («habitacion»). No
-- se pierde nada: la etiqueta vieja queda en el comentario de rollback.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. El giro de la empresa
--
-- Qué es y qué ofrece: una ecoposada es alojamiento, restaurante, transporte y
-- tours a la vez; un taller de jabones es solo «productos». Espeja `GIROS` de
-- `src/lib/taxonomy.ts`.
--
-- **Cuántos caben lo decide el nivel.** Ofrecerlo todo —alojar, dar de comer,
-- llevar y guiar— es lo que hace un proveedor con recorrido, y el nivel es
-- justamente la medida del recorrido. Semilla declara dos, Raíz tres, Bosque
-- todos. Y `consultoria` exige la evaluación verificada, por lo mismo que la
-- categoría del mismo nombre (sección 3).
-- ---------------------------------------------------------------------------

alter table providers
  add column if not exists giros text[] not null default '{}';

alter table providers drop constraint if exists providers_giros_validos;
alter table providers
  add constraint providers_giros_validos check (
    giros <@ array[
      'alojamiento', 'restaurante', 'transporte', 'tours', 'turismo',
      'productos', 'servicios', 'consultoria'
    ]::text[]
  );

comment on column providers.giros is
  'Qué es y qué ofrece la empresa. Espeja GIROS de src/lib/taxonomy.ts. El tope por nivel lo impone providers_limitar_giros.';

-- Gemelo de `GIROS_POR_NIVEL` en `src/lib/taxonomy.ts`. `unverified` cuenta como
-- Semilla: ante la duda, el límite estrecho.
create or replace function limite_de_giros(_tier tier)
returns int
language sql
immutable
as $$
  select case _tier
    when 'raiz'   then 3
    when 'bosque' then 8
    else 2
  end;
$$;

-- No es `security definer` por lo mismo que `providers_proteger_derivados`
-- (0008): tiene que ver el `current_user` de verdad para saber si escribe una
-- sesión del sitio o la propia base.
create or replace function providers_limitar_giros()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  _tier tier;
  _verificada timestamptz;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if is_admin() then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.giros is not distinct from old.giros then
    return new;
  end if;

  -- Del valor viejo y no del nuevo: en el mismo `update` alguien podría mandar
  -- `tier = 'bosque'` junto con ocho giros, y aunque `providers_proteger_
  -- derivados` le devuelve el nivel real, corre DESPUÉS de este (orden
  -- alfabético de los triggers del mismo momento: «limitar» < «proteger»).
  if tg_op = 'UPDATE' then
    _tier := old.tier;
    _verificada := old.sustainability_verified_at;
  else
    _tier := 'semilla';
    _verificada := null;
  end if;

  if cardinality(new.giros) > limite_de_giros(_tier) then
    raise exception 'giros-limite'
      using hint = format('Con nivel %s caben %s giros.', _tier, limite_de_giros(_tier));
  end if;

  if 'consultoria' = any(new.giros) and _verificada is null then
    raise exception 'giros-verificacion'
      using hint = 'La consultoría exige la evaluación verificada por Seregenera.';
  end if;

  return new;
end;
$$;

drop trigger if exists providers_limitar_giros on providers;
create trigger providers_limitar_giros
  before insert or update of giros on providers
  for each row execute function providers_limitar_giros();


-- ---------------------------------------------------------------------------
-- 2. Categorías, subcategorías e impacto en las dos direcciones
-- ---------------------------------------------------------------------------

-- 2.a Subcategoría. Texto libre validado por la aplicación, como `category`:
-- la taxonomía cambia más rápido que el esquema, y una restricción aquí
-- obligaría a una migración por cada subcategoría nueva.
alter table listings add column if not exists subcategory text;

-- 2.b Lo que aporta y lo que cuesta.
--
-- Las métricas de 0001 (`co2_kg_saved`, `water_liters_saved`,
-- `waste_kg_reduced`) dicen lo que la oferta **evita**. Faltaba la otra mitad:
-- lo que **cuesta**. Un producto regenerativo no es uno sin huella —no existe—
-- sino uno que la declara, y una ficha que solo cuenta lo bueno se lee como
-- publicidad.
--
-- Son nullable porque las filas de antes no las tienen. El formulario del
-- proveedor (`/cuenta/empresa/ofertas`) las exige para toda oferta nueva.
alter table listings add column if not exists aporte_ambiental text;
alter table listings add column if not exists consecuencia_ambiental text;
alter table listings add column if not exists huella_co2_kg numeric(10,2);

alter table listings drop constraint if exists listings_huella_positiva;
alter table listings
  add constraint listings_huella_positiva check (huella_co2_kg is null or huella_co2_kg >= 0);

alter table listings drop constraint if exists listings_textos_ambientales;
alter table listings
  add constraint listings_textos_ambientales check (
    (aporte_ambiental is null or char_length(aporte_ambiental) <= 1000)
    and (consecuencia_ambiental is null or char_length(consecuencia_ambiental) <= 1000)
  );

create index if not exists listings_subcategory_idx on listings (subcategory);

-- 2.c La vista, otra vez. Ver la cabecera: es un `drop` y es a propósito.
-- Mismo cuerpo que en 0003, y el mismo `security_invoker` que no es opcional.
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
-- 3. Lo que un proveedor no puede hacer con sus propias ofertas
--
-- `listings_provider_write` (0001) deja a quien gestiona la empresa escribir
-- **cualquier columna** de sus ofertas. Mientras solo escribía el panel de
-- administración daba igual; desde esta tanda el proveedor publica desde
-- `/cuenta/empresa/ofertas`, y con la clave anon —pública por diseño— podría:
--
--   - ponerse `status = 'approved'` y saltarse la revisión, que es justo lo que
--     sostiene la frase «cifras declaradas por el proveedor y revisadas por
--     nuestro equipo» del certificado del comprador;
--   - ponerse `featured = true` y salir primero en el catálogo y la portada;
--   - mudar una oferta a otra empresa cambiando `provider_id`;
--   - vender consultoría sin el sello.
--
-- Es el mismo razonamiento de `providers_proteger_derivados` (0008): una
-- política no distingue columnas, un trigger sí.
--
-- **Editar una oferta publicada la devuelve a revisión.** Lo que se revisó fue
-- un texto y unas cifras concretas; si cambian, lo revisado ya no existe. Se
-- excluyen el estado, el destacado y el stock, que no son lo que ve el
-- comprador como promesa, y las dos columnas generadas de 0003, que en un
-- trigger `before` todavía no están calculadas y harían que todo pareciera
-- cambiado.
-- ---------------------------------------------------------------------------

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

    -- Retirar (a borrador) o pedir revisión sí; publicarse, rechazarse o
    -- suspenderse, no.
    if new.status is distinct from old.status
       and new.status not in ('draft', 'pending_review') then
      new.status := old.status;
    end if;

    if old.status = 'approved'
       and new.status = 'approved'
       and (to_jsonb(new) - array['status', 'featured', 'stock', 'busqueda', 'impacto'])
           is distinct from
           (to_jsonb(old) - array['status', 'featured', 'stock', 'busqueda', 'impacto'])
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

drop trigger if exists listings_proteger_proveedor on listings;
create trigger listings_proteger_proveedor
  before insert or update on listings
  for each row execute function listings_proteger_proveedor();


-- ---------------------------------------------------------------------------
-- 4. Las ofertas que ya existen, a las categorías nuevas
--
-- Primero la subcategoría (que se deduce de la categoría VIEJA) y después la
-- categoría: al revés, la segunda consulta ya no sabría de dónde venía cada
-- fila. Solo toca filas cuya categoría todavía no es un `id` nuevo, así que
-- aplicarla dos veces no cambia nada.
--
-- Corre como `postgres`, así que el trigger de la sección 3 no la frena — la
-- oferta de acompañamiento a la NTS-TS pasa a «consultoría» aunque su
-- proveedor sembrado no tenga el sello. Es lo correcto: el trigger vigila lo
-- que un proveedor escriba desde hoy, no reescribe el catálogo que el equipo
-- ya revisó.
-- ---------------------------------------------------------------------------

update listings set subcategory = case
    when title ilike '%agua%'                         then 'ahorro-agua'
    when title ilike '%compost%'                      then 'compostaje'
    when title ilike '%aceite%'                       then 'aceite-usado'
    when title ilike '%ilumin%'                       then 'iluminacion'
    when title ilike '%solar%'                        then 'paneles-solares'
    when title ilike '%bienvenida%'                   then 'kits-bienvenida'
    when category = 'Amenities'                       then 'amenities'
    when category in ('Mobiliario', 'Equipamiento')   then 'mobiliario'
    when title ilike '%vajilla%'                      then 'vajilla'
    when category = 'Empaques'                        then 'empaques'
    when title ilike '%aire%'                         then 'calidad-aire'
    when title ilike '%limpieza%'                     then 'limpieza-vehiculos'
    when title ilike '%coral%'                        then 'restauracion'
    when category = 'Marketing'                       then 'artesanias'
    when category = 'Capacitación'                    then 'educacion-ambiental'
    when category = 'Experiencias'                    then 'experiencias-comunitarias'
    when title ilike '%certific%'                     then 'certificaciones'
    else subcategory
  end
where category not in (
  'agua', 'energia', 'residuos', 'habitacion', 'gastronomia', 'territorio',
  'movilidad', 'consultoria'
);

update listings set category = case
    when title ilike '%agua%'                                       then 'agua'
    when title ilike '%compost%' or title ilike '%aceite%'
      or title ilike '%recicl%'                                     then 'residuos'
    when category = 'Energía' or title ilike '%solar%'
      or title ilike '%ilumin%'                                     then 'energia'
    when category = 'Mantenimiento' or title ilike '%bus%'
      or title ilike '%flota%'                                      then 'movilidad'
    when category in ('Amenities', 'Mobiliario', 'Equipamiento')    then 'habitacion'
    when category = 'Empaques'                                      then 'gastronomia'
    when category = 'Servicios'                                     then 'consultoria'
    else 'territorio'
  end
where category not in (
  'agua', 'energia', 'residuos', 'habitacion', 'gastronomia', 'territorio',
  'movilidad', 'consultoria'
);


-- ---------------------------------------------------------------------------
-- 5. Comprar es una sola transacción
--
-- ## Qué había antes, y por qué no bastaba
--
-- `saveOrder()` (`src/lib/orders.ts`) escribía la orden y después sus ítems,
-- **en dos llamadas y con la clave de servicio**. Tres problemas:
--
--   1. **No era una transacción.** Si fallaba la segunda, quedaba una orden sin
--      líneas.
--   2. **No descontaba cupo.** Dos compradores a la vez podían llevarse la
--      última plaza de una experiencia — la invariante 10 de
--      `dominio-regenera`, anotada como la deuda más peligrosa del proyecto.
--   3. **No era idempotente.** Un doble clic, o un reintento tras un corte de
--      red, creaba dos órdenes iguales.
--
-- Y uno de diagnóstico: era **el único sitio de la aplicación que usaba la
-- clave de servicio en producción**. Si esa variable está mal puesta en Vercel,
-- lo único que se rompe es comprar, y nada más en el sitio lo delata.
--
-- ## Cómo lo resuelve esto
--
-- Todo ocurre dentro de esta función, que Postgres ejecuta en una transacción:
-- si algo falla —una fecha sin cupo, una oferta agotada— no queda nada escrito.
--
-- **Los precios se calculan aquí, contra el catálogo, y no llegan de fuera.**
-- Es lo que RLS no sabía expresar («los totales los calculó mi código») y la
-- razón por la que antes hacía falta la clave de servicio: la función recibe
-- identificadores y cantidades, igual que `priceCart()`, y valoriza ella. Quien
-- la llame directo contra PostgREST no puede fijar ningún precio.
--
-- **Es el gemelo de `src/lib/pricing.ts`**, como la 0006 lo es de
-- `src/lib/niveles.ts`: precio mayorista por umbral de cantidad (invariante 4),
-- comisión por ítem según el nivel del proveedor y redondeada al peso
-- (invariantes 2 y 5), y lo que es solo cotización fuera de todo total
-- (invariante 7). Si uno cambia sin el otro, el carrito promete un total y la
-- orden cobra otro — `checkout()` compara los dos y lo apunta si divergen.
--
-- **La idempotencia la da el `id`**: lo genera el navegador una vez por cesta
-- y lo reenvía en cada intento. Si ya existe una orden con ese `id` y es de
-- quien llama, se devuelve esa en vez de crear otra. Si es de otra persona, se
-- rechaza sin decir de quién: un `uuid` no se adivina, pero tampoco se regala
-- la confirmación.
--
-- **Exige sesión.** Comprar pasó a pedir cuenta en esta tanda, y eso es lo que
-- deja escribir `buyer_id` desde `auth.uid()` en vez de fiarse de un correo
-- escrito en un formulario.
-- ---------------------------------------------------------------------------

alter table orders
  add column if not exists buyer_provider_id uuid references providers on delete set null;

comment on column orders.buyer_provider_id is
  'La empresa en cuyo nombre se compró, si se compró como empresa. La elige quien la gestiona; crear_orden() lo comprueba.';

create index if not exists orders_buyer_provider_idx on orders (buyer_provider_id);

-- Comprar como empresa es, sobre todo, poder facturarle a la empresa: sin su
-- identificación tributaria la factura sale a nombre de la persona.
alter table orders add column if not exists buyer_tax_id text;

alter table orders drop constraint if exists orders_buyer_tax_id_largo;
alter table orders
  add constraint orders_buyer_tax_id_largo check (buyer_tax_id is null or char_length(buyer_tax_id) <= 40);

-- Gemelo de `COMISION_POR_NIVEL` en `src/lib/niveles.ts`. Ante la duda, la tasa
-- alta: `unverified` y cualquier valor desconocido pagan la de Semilla.
create or replace function comision_para_nivel(_tier tier)
returns numeric
language sql
immutable
as $$
  select case _tier
    when 'raiz'   then 0.10
    when 'bosque' then 0.08
    else 0.12
  end;
$$;

create or replace function crear_orden(
  _id uuid,
  _lineas jsonb,
  _nombre text,
  _telefono text,
  _empresa text default null,
  _provider_id uuid default null,
  _notas text default null,
  _documento text default null
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
  _subtotal int := 0;
  _comision int := 0;
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

  -- Idempotencia: el mismo intento devuelve la misma orden.
  select id, reference, buyer_id into _previa from orders where id = _id;
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

  -- El freno, dentro de la base. **Hace falta aquí y no solo en la
  -- aplicación** porque esta función descuenta cupo: cualquiera con cuenta
  -- puede llamarla directo contra PostgREST, saltándose el límite de
  -- `src/lib/ritmo.ts`, y reservar todas las plazas de una experiencia con
  -- órdenes que nunca paga. Cinco pedidos en diez minutos y diez sin pagar a
  -- la vez es más de lo que hace nadie comprando de verdad.
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

  -- Comprar como empresa: solo en nombre de una que gestiones. El nombre sale
  -- de la ficha, no del formulario, para que «compró Hotel X» sea verdad.
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

  -- La referencia legible. La unicidad la da el `unique` de la columna; el bucle
  -- solo evita chocar con él (invariante 11).
  loop
    _ref := 'SR-' || to_char(now() at time zone 'America/Bogota', 'YYMMDD')
            || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 4));
    exit when not exists (select 1 from orders where reference = _ref);
    _intento := _intento + 1;
    if _intento > 20 then
      raise exception 'sin-referencia';
    end if;
  end loop;

  -- Si dos intentos con el mismo `id` llegan a la vez, el segundo espera al
  -- primero en el índice de la clave primaria y choca aquí. Se le devuelve la
  -- orden del primero en vez de un error.
  begin
    insert into orders (
      id, reference, buyer_id, buyer_email, buyer_name, buyer_company,
      buyer_phone, buyer_provider_id, buyer_tax_id, status, notes
    ) values (
      _id, _ref, _uid, coalesce(_correo, ''), left(trim(_nombre), 160),
      left(_empresa_final, 160), left(trim(_telefono), 40), _provider_id,
      left(nullif(trim(coalesce(_documento, '')), ''), 40),
      'pending_payment',
      left(nullif(trim(coalesce(_notas, '')), ''), 1000)
    );
  exception when unique_violation then
    select id, reference, buyer_id into _previa from orders where id = _id;
    if found and _previa.buyer_id = _uid then
      return jsonb_build_object('reference', _previa.reference, 'repetida', true);
    end if;
    raise;
  end;

  for _linea in select value from jsonb_array_elements(_lineas) loop
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

    -- Retirada del catálogo o solo cotización: no entra, igual que en el
    -- carrito (invariantes 7 y 17).
    if not found or _l.quote_only then
      continue;
    end if;

    if _l.stock is not null and _l.stock < _qty then
      raise exception 'sin-stock' using hint = _l.title;
    end if;

    -- El cupo se descuenta aquí, en la misma transacción que la orden. El
    -- `where` es lo que impide la sobreventa: dos compras a la vez de la última
    -- plaza se serializan en esta fila, y la segunda no encuentra cupo.
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

    insert into order_items (
      order_id, listing_id, provider_id, title_snapshot, unit_price_cop, qty,
      date, commission_cop, commission_rate
    ) values (
      _id, _l.id, _l.provider_id, _l.title, _precio, _qty, _fecha, _com, _tasa
    );

    _subtotal := _subtotal + _sub;
    _comision := _comision + _com;
    _co2      := _co2      + round(coalesce(_l.co2_kg_saved, 0) * _qty, 2);
    _agua     := _agua     + round(coalesce(_l.water_liters_saved, 0) * _qty, 2);
    _residuos := _residuos + round(coalesce(_l.waste_kg_reduced, 0) * _qty, 2);
    _items    := _items + 1;
  end loop;

  if _items = 0 then
    raise exception 'nada-comprable';
  end if;

  -- El total es el subtotal: la comisión sale de lo que recibe el proveedor,
  -- no se le suma al comprador (invariante 3).
  update orders
     set subtotal_cop         = _subtotal,
         commission_total_cop = _comision,
         total_cop            = _subtotal,
         co2_kg_saved         = nullif(_co2, 0),
         water_liters_saved   = nullif(_agua, 0),
         waste_kg_reduced     = nullif(_residuos, 0)
   where id = _id;

  return jsonb_build_object(
    'reference', _ref,
    'repetida', false,
    'total_cop', _subtotal
  );
end;
$$;

revoke all on function crear_orden(uuid, jsonb, text, text, text, uuid, text, text) from public;
grant execute on function crear_orden(uuid, jsonb, text, text, text, uuid, text, text) to authenticated;


-- ---------------------------------------------------------------------------
-- Comprobación, después de aplicarla
--
--   select count(*) from pg_proc where proname in ('crear_orden', 'limite_de_giros');   -- 2
--   select count(*) from information_schema.columns
--    where table_name = 'listings' and column_name in ('subcategory', 'aporte_ambiental');  -- 2
--   select category, count(*) from listings group by 1 order by 1;   -- solo ids nuevos
--
-- ---------------------------------------------------------------------------
-- Rollback, si hiciera falta
--
--   drop function if exists crear_orden(uuid, jsonb, text, text, text, uuid, text, text);
--   drop function if exists comision_para_nivel(tier);
--   alter table orders drop column if exists buyer_provider_id, drop column if exists buyer_tax_id;
--   drop trigger if exists listings_proteger_proveedor on listings;
--   drop function if exists listings_proteger_proveedor();
--   drop trigger if exists providers_limitar_giros on providers;
--   drop function if exists providers_limitar_giros();
--   drop function if exists limite_de_giros(tier);
--   alter table providers drop constraint if exists providers_giros_validos;
--   alter table providers drop column if exists giros;
--   -- La vista primero: depende de las columnas de listings.
--   drop view if exists listings_publicos;
--   alter table listings drop column if exists subcategory,
--     drop column if exists aporte_ambiental,
--     drop column if exists consecuencia_ambiental,
--     drop column if exists huella_co2_kg;
--   -- Y se vuelve a crear la vista con el cuerpo de 0003.
--   -- Las categorías viejas se recuperan así (aproximado: «Tecnología» se
--   -- repartió entre agua y movilidad y no se puede distinguir de vuelta):
--   --   update listings set category = case category
--   --     when 'agua' then 'Tecnología' when 'energia' then 'Energía'
--   --     when 'residuos' then 'Servicios' when 'habitacion' then 'Amenities'
--   --     when 'gastronomia' then 'Empaques' when 'movilidad' then 'Mantenimiento'
--   --     when 'consultoria' then 'Servicios' else 'Experiencias' end;
-- ---------------------------------------------------------------------------
