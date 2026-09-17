-- ---------------------------------------------------------------------------
-- 0006 — El proveedor entra solo, y el nivel se gana con actividad
--
-- Este archivo cambia el modelo de negocio, no solo el esquema. Conviene leer
-- el porqué antes de tocarlo: `src/lib/niveles.ts` y `docs/NIVELES.md`.
--
-- ## Lo que había
--
-- Un proveedor llegaba por `/vender`, su postulación quedaba en
-- `pending_review`, y un administrador la aprobaba a mano. Recién ahí existía
-- la empresa. El nivel (`tier`) salía de la evaluación de sostenibilidad: hasta
-- que alguien aprobara el cuestionario, el proveedor era `unverified` y no
-- aparecía en ningún filtro.
--
-- El equipo era el cuello de botella de su propio crecimiento.
--
-- ## Lo que hay a partir de aquí
--
-- 1. **Quien postula con sesión queda dado de alta en el acto**, con su empresa
--    creada, su vínculo de dueño y su rol. Sin pasar por nadie.
-- 2. **El nivel se gana con actividad.** Todos nacen en Semilla. Publicar,
--    vender, entregar y recibir reseñas suman puntos de experiencia, y los
--    puntos mueven el nivel: Semilla → Raíz (600) → Bosque (2.500).
-- 3. **La comisión baja con el nivel**: 12 % / 10 % / 8 %. Por eso
--    `order_items` pasa a guardar la tasa aplicada, no solo el monto.
-- 4. **La evaluación de sostenibilidad sigue existiendo**, es el evento que más
--    puntos da, y otorga un sello propio (`sustainability_verified_at`) que es
--    una cosa distinta del nivel.
-- 5. **`provider_applications` deja de ser colombiana**: país, tipo de
--    organización e identificación tributaria genérica.
-- 6. Se cierran de paso tres agujeros de RLS que venían de `0001`. Están en la
--    sección 8 y explicados uno por uno.
--
-- ## Cómo se aplica
--
-- Es aditiva: no borra columnas ni cambia tipos. Reemplaza el cuerpo de
-- `sync_provider_score()` (que deja de escribir `tier`) y la política
-- `providers_insert`.
--
-- **Hay que aplicarla ANTES de desplegar el código de esta tanda.** El
-- formulario de `/vender` llama a `postular_proveedor()`, que no existe hasta
-- que esto corra: sin la migración, postular responde error y la postulación se
-- pierde.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0006_niveles_por_experiencia_y_alta_directa.sql
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Puntos de experiencia en el proveedor
--
-- `experience_points` es la única fuente del nivel a partir de ahora.
-- `sustainability_verified_at` separa dos cosas que hasta hoy eran una sola: el
-- nivel (que se gana) y la evaluación verificada (que se aprueba). Un proveedor
-- puede llegar a Bosque vendiendo mucho sin haberla pasado; tendrá el nivel y
-- no tendrá el sello, y la ficha los muestra por separado a propósito.
-- ---------------------------------------------------------------------------

alter table providers
  add column if not exists experience_points int not null default 0
    check (experience_points >= 0);

alter table providers
  add column if not exists sustainability_verified_at timestamptz;

comment on column providers.experience_points is
  'Puntos de experiencia acumulados. Solo suben. Los escribe otorgar_experiencia(); '
  'un trigger deriva `tier` de aquí. Espeja EXPERIENCIA de src/lib/niveles.ts.';

comment on column providers.sustainability_verified_at is
  'Cuándo se le aprobó la primera evaluación de sostenibilidad. Es el sello, '
  'que NO es el nivel: el nivel sale de experience_points.';

-- ---------------------------------------------------------------------------
-- 2. De puntos a nivel
--
-- Los umbrales viven aquí y en `NIVELES` de `src/lib/niveles.ts`. **Son un
-- gemelo que hay que mantener de acuerdo**: si divergen, la barra de progreso le
-- promete al proveedor un nivel que la base no le da.
--
-- Manda esta función. La de TypeScript existe para poder pintar la barra sin
-- una consulta extra, no para decidir.
--
-- `unverified` no lo devuelve nunca: es un valor heredado del modelo viejo que
-- se queda en el enum por las filas que ya lo tienen.
-- ---------------------------------------------------------------------------

create or replace function nivel_para_puntos(_puntos int)
returns tier
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(_puntos, 0) >= 2500 then 'bosque'::tier
    when coalesce(_puntos, 0) >= 600  then 'raiz'::tier
    else 'semilla'::tier
  end;
$$;

-- El nivel se recalcula solo. Va en un trigger `before` y no en la aplicación
-- porque `tier` se lee desde la vista pública del catálogo: si lo escribiera el
-- código, bastaría un camino que se olvidara de hacerlo para dejar el filtro
-- mintiendo, y nada lo detectaría.
--
-- Efecto colateral buscado: **ya no se puede poner un nivel a mano**, ni siendo
-- administrador. Un `update providers set tier = 'bosque'` se pisa con el valor
-- derivado. Para subir a alguien, se le dan puntos.
create or replace function sync_tier_por_experiencia()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.tier := nivel_para_puntos(new.experience_points);
  return new;
end;
$$;

drop trigger if exists providers_tier_por_experiencia on providers;
create trigger providers_tier_por_experiencia
  before insert or update of experience_points, tier on providers
  for each row execute function sync_tier_por_experiencia();

-- ---------------------------------------------------------------------------
-- 3. El registro de lo que dio puntos
--
-- Cada suma queda apuntada con su motivo. No es auditoría por gusto: el
-- proveedor ve en pantalla de dónde salió cada punto, y sin esta tabla la única
-- respuesta a «¿por qué tengo 740?» sería «porque sí».
--
-- `referencia` es lo que hace la operación idempotente. El id de la orden, de la
-- reseña o de la oferta que causó el evento: si el mismo hecho se procesa dos
-- veces —un reintento, un webhook repetido— el índice único lo rechaza y no se
-- suma dos veces. Los eventos que solo pueden ocurrir una vez van sin
-- referencia, y el `coalesce` del índice los deja únicos por clave.
-- ---------------------------------------------------------------------------

create table if not exists experience_events (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references providers on delete cascade,
  -- Espeja las claves de EXPERIENCIA en src/lib/niveles.ts
  clave text not null,
  puntos int not null check (puntos > 0),
  referencia text,
  created_at timestamptz not null default now()
);

create unique index if not exists experience_events_unicos
  on experience_events (provider_id, clave, coalesce(referencia, ''));

create index if not exists experience_events_provider_idx
  on experience_events (provider_id, created_at desc);

alter table experience_events enable row level security;

-- Lo ve quien gestiona la empresa y el administrador. No es público: la lista
-- de lo que le dio puntos a un proveedor dice cuánto vendió y cuándo, y eso es
-- información comercial suya, no nuestra.
drop policy if exists experience_events_read on experience_events;
create policy experience_events_read on experience_events
  for select using (manages_provider(provider_id) or is_admin());

-- **No hay política de inserción, y es a propósito.** Los puntos los escribe
-- `otorgar_experiencia()`, que es `security definer`. Si hubiera una política
-- de insert, un proveedor podría regalarse experiencia contra PostgREST y
-- bajarse la comisión él solo — es dinero, no una medalla.

-- ---------------------------------------------------------------------------
-- 4. Otorgar experiencia
--
-- Único camino por el que suben los puntos.
--
-- Los valores están escritos aquí y no en una tabla de configuración porque son
-- reglas de negocio versionadas: cambiarlos tiene que dejar rastro en el
-- repositorio, no en una fila que alguien editó un martes.
--
-- Devuelve el total después de sumar, o el total intacto si el evento ya estaba
-- apuntado o si topó. **Nunca lanza por un evento repetido**: quien la llama lo
-- hace desde un trigger, y un error ahí tumbaría la operación real (la orden, la
-- reseña) por no poder anotar un punto.
-- ---------------------------------------------------------------------------

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
begin
  if _provider_id is null then
    return null;
  end if;

  _puntos := case _clave
    when 'perfil_completo'          then 80
    when 'oferta_publicada'         then 25
    when 'primera_venta'            then 150
    when 'venta_entregada'          then 50
    when 'volumen_vendido'          then 10
    when 'resena_positiva'          then 40
    when 'cotizacion_respondida'    then 15
    when 'evaluacion_aprobada'      then 300
    when 'certificacion_verificada' then 100
    when 'articulo_publicado'       then 30
    when 'articulo_destacado'       then 80
    else null
  end;

  -- Una clave desconocida SÍ lanza: es un error de programación nuestro, no un
  -- caso del dominio, y quedarse callado lo dejaría suelto durante meses.
  if _puntos is null then
    raise exception 'otorgar_experiencia: evento desconocido %', _clave;
  end if;

  -- Topes. Existen para que el puntaje mida oficio y no volumen de ruido: sin
  -- el de ofertas, publicar cien fichas vacías compra el nivel Raíz en una
  -- tarde. El de certificaciones es la invariante 15 de `dominio-regenera`
  -- llevada a los puntos: un taller sin plata para certificarse tiene que poder
  -- llegar arriba igual.
  if _clave = 'oferta_publicada' and (
    select count(*) from experience_events
     where provider_id = _provider_id
       and clave = 'oferta_publicada'
       and created_at > now() - interval '30 days'
  ) >= 10 then
    return (select experience_points from providers where id = _provider_id);
  end if;

  if _clave = 'certificacion_verificada' and (
    select count(*) from experience_events
     where provider_id = _provider_id and clave = 'certificacion_verificada'
  ) >= 3 then
    return (select experience_points from providers where id = _provider_id);
  end if;

  insert into experience_events (provider_id, clave, puntos, referencia)
  values (_provider_id, _clave, _puntos, _referencia)
  on conflict do nothing;

  -- Ya estaba apuntado: no se suma dos veces y no es un error.
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
-- Nadie la llama desde fuera. La invocan los triggers de abajo, que corren con
-- los permisos del propietario. Si algún día hace falta desde el panel, se le
-- da `execute` a `authenticated` y se le mete un `is_admin()` dentro.

-- ---------------------------------------------------------------------------
-- 5. Qué dispara puntos, automáticamente
--
-- Cada evento se ata al hecho de la base que lo causa, en la misma transacción.
-- Calcularlo desde la aplicación sería perder puntos el día que una ruta falle
-- a mitad, y nadie lo notaría hasta que un proveedor reclamara.
-- ---------------------------------------------------------------------------

-- 5.a Publicar una oferta aprobada
create or replace function experiencia_por_oferta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved'
     and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    perform otorgar_experiencia(new.provider_id, 'oferta_publicada', new.id::text);
  end if;
  return new;
end;
$$;

drop trigger if exists listings_experiencia on listings;
create trigger listings_experiencia
  after insert or update of status on listings
  for each row execute function experiencia_por_oferta();

-- 5.b Entregar un pedido
--
-- Se cuenta al quedar `fulfilled`, no al pagar: lo que demuestra oficio es
-- haber entregado. Una orden toca a varios proveedores, así que se itera por
-- sus ítems y cada uno cobra su parte — incluido el volumen, a razón de un
-- punto por cada 200.000 COP entregados de SU parte.
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
    loop
      perform otorgar_experiencia(_fila.provider_id, 'venta_entregada', new.id::text);

      -- Primera venta: sin referencia, así que el índice único lo deja ocurrir
      -- una sola vez en la vida del proveedor.
      perform otorgar_experiencia(_fila.provider_id, 'primera_venta');

      -- El volumen se apunta como un evento por tramo de 200.000, con la orden
      -- y el número de tramo en la referencia para que sea idempotente.
      for _i in 1..least(floor(_fila.vendido / 200000)::int, 50) loop
        perform otorgar_experiencia(
          _fila.provider_id, 'volumen_vendido', new.id::text || '#' || _i::text);
      end loop;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_experiencia on orders;
create trigger orders_experiencia
  after update of status on orders
  for each row execute function experiencia_por_orden();

-- 5.c Reseña de 4 o 5 estrellas
--
-- La reseña solo la puede escribir quien compró (política `reviews_author_write`
-- de 0001), así que esto no se puede inflar con cuentas falsas sin comprar de
-- verdad — que es el punto.
create or replace function experiencia_por_resena()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _provider uuid;
begin
  if new.rating >= 4 then
    select provider_id into _provider from listings where id = new.listing_id;
    perform otorgar_experiencia(_provider, 'resena_positiva', new.id::text);
  end if;
  return new;
end;
$$;

drop trigger if exists reviews_experiencia on reviews;
create trigger reviews_experiencia
  after insert on reviews
  for each row execute function experiencia_por_resena();

-- 5.d Certificación verificada por un administrador
create or replace function experiencia_por_certificacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.verified_at is not null and old.verified_at is null then
    perform otorgar_experiencia(
      new.provider_id, 'certificacion_verificada', new.id::text);
  end if;
  return new;
end;
$$;

drop trigger if exists provider_certs_experiencia on provider_certifications;
create trigger provider_certs_experiencia
  after update of verified_at on provider_certifications
  for each row execute function experiencia_por_certificacion();

-- ---------------------------------------------------------------------------
-- 6. La evaluación de sostenibilidad deja de escribir el nivel
--
-- Reemplaza el cuerpo de `sync_provider_score()` de 0001. Antes escribía
-- `sustainability_score` **y** `tier`; ahora escribe el puntaje, marca el sello
-- y otorga los 300 puntos. El nivel sale de los puntos, y de nada más.
--
-- Las invariantes 13, 14 y 15 de `dominio-regenera` siguen en pie tal cual: el
-- puntaje lo escribe este trigger y no el proveedor, es auditable punto por
-- punto y las certificaciones tienen tope.
-- ---------------------------------------------------------------------------

create or replace function sync_provider_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' then
    update providers
       set sustainability_score = new.score,
           -- `coalesce`: el sello lo marca la PRIMERA evaluación aprobada. Una
           -- reevaluación actualiza el puntaje y no reescribe la fecha, que es
           -- lo que la ficha muestra como "verificado desde".
           sustainability_verified_at = coalesce(sustainability_verified_at, now())
     where id = new.provider_id;

    perform otorgar_experiencia(new.provider_id, 'evaluacion_aprobada');
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Postular deja de ser pedir permiso
--
-- 7.a Las postulaciones dejan de ser colombianas
--
-- `department` era un enum de los 32 departamentos de Colombia en el formulario
-- (`DEPARTMENTS` de src/lib/taxonomy.ts) — en la base siempre fue texto, así que
-- esto no cambia el tipo: cambia lo que significa. Con `country`, un proveedor
-- peruano escribe su región y el campo sigue sirviendo.
--
-- `tax_id_kind` guarda CÓMO se llama el documento en su país (NIT, RUC, RFC,
-- CUIT, RUT…) y `tax_id` el número. Guardar solo el número obligaría a adivinar
-- el formato al facturar.
-- ---------------------------------------------------------------------------

alter table provider_applications
  add column if not exists country text not null default 'Colombia';
alter table provider_applications
  add column if not exists org_type text;
alter table provider_applications
  add column if not exists tax_id_kind text;
alter table provider_applications
  add column if not exists tax_id text;
alter table provider_applications
  add column if not exists categories text[] not null default '{}';
-- Ley 1581 de 2012 (habeas data). Recogemos nombre, correo y teléfono de una
-- persona identificable: hay que poder demostrar que lo autorizó, cuándo y bajo
-- qué política. Un booleano no basta — la fecha es la prueba.
alter table provider_applications
  add column if not exists consent_at timestamptz;

alter table providers
  add column if not exists country text not null default 'Colombia';

comment on column provider_applications.consent_at is
  'Cuándo autorizó el tratamiento de sus datos personales. Ley 1581 de 2012: '
  'sin esta marca no se puede demostrar el consentimiento, y el dato es de una '
  'persona identificable.';

-- 7.b El slug de la empresa, sin colisiones
--
-- `security definer` no es opcional: `providers_public_read` solo deja ver las
-- aprobadas, así que un slug ya tomado por una empresa invisible para quien
-- consulta se vería libre, y el `insert` fallaría con un error de clave única
-- que no dice nada del problema real.

create or replace function slug_unico_proveedor(_texto text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _base text;
  _intento text;
  _n int := 1;
begin
  _base := trim(both '-' from
    regexp_replace(public.sin_tildes(coalesce(_texto, '')), '[^a-z0-9]+', '-', 'g'));
  _base := left(nullif(_base, ''), 60);
  if _base is null then _base := 'proveedor'; end if;

  _intento := _base;
  while exists (select 1 from providers where slug = _intento) loop
    _n := _n + 1;
    _intento := _base || '-' || _n;
  end loop;

  return _intento;
end;
$$;

-- 7.c Postular
--
-- Devuelve json con qué pasó, para que `/vender` pueda decirle a la persona la
-- verdad en vez de un «recibido» genérico:
--
--   { "application_id": …, "activado": true,  "provider_slug": "…" }
--   { "application_id": …, "activado": false, "motivo": "sin-sesion" }
--
-- **`activado: false` no es un fallo.** Quien postula sin cuenta deja su
-- postulación registrada y recibe un correo que le pide registrarse con ese
-- mismo correo; ahí se activa. No se le crea la empresa porque no hay a quién
-- dársela: sin `provider_members`, `manages_provider()` devuelve falso y la
-- empresa nace muerta — es la trampa que `docs/BETA.md` dejó anotada.
--
-- El límite de tres por correo al día es lo único que frena a un robot que
-- encuentre el formulario. No es gran cosa y no pretende serlo: el formulario es
-- público a propósito, y lo que de verdad importa —que nadie LEA postulaciones
-- ajenas— lo sigue impidiendo RLS.

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
begin
  if (select count(*) from provider_applications
       where lower(email) = lower(_email)
         and created_at > now() - interval '1 day') >= 3 then
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
      'application_id', _app_id, 'activado', false, 'motivo', 'sin-sesion');
  end if;

  -- ¿Ya gestiona una empresa? Entonces no se le crea otra: se le enlaza la
  -- postulación a la que ya tiene. Sin esto, mandar el formulario dos veces
  -- deja a la misma persona con dos fichas en el catálogo.
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
      -- Titular corto de la ficha: la primera frase de lo que escribieron. Es un
      -- punto de partida editable; dejarlo vacío haría que la tarjeta del
      -- catálogo saliera coja el primer día.
      left(split_part(_description, '. ', 1), 140),
      _description, _country, _department, _city,
      _email, _phone, nullif(_website, ''), _tax_id,
      -- Aprobada de entrada: ese es el cambio de este archivo. El control deja
      -- de ser una puerta y pasa a ser una palanca — un administrador puede
      -- suspender, que es reversible y no bloquea a nadie mientras tanto.
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
    'application_id', _app_id, 'activado', true, 'provider_slug', _slug);
end;
$$;

revoke all on function postular_proveedor(
  text, text, text, text, text, text, text, text, text, text, text, text, text[]
) from public;
-- `anon` también: el formulario de `/vender` no exige sesión, y no exigirla es
-- la decisión de producto. Lo que la función NO hace sin sesión es crear la
-- empresa.
grant execute on function postular_proveedor(
  text, text, text, text, text, text, text, text, text, text, text, text, text[]
) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Tres agujeros de RLS que venían de 0001
--
-- Ninguno se había explotado, y los tres se explotan igual: con la clave anon
-- —que es pública por diseño— y una sesión normal, escribiendo directo contra
-- PostgREST sin pasar por la aplicación.
-- ---------------------------------------------------------------------------

-- 8.a Cualquiera con cuenta podía meter una empresa APROBADA en el catálogo
--
-- `providers_insert` decía `with check (auth.uid() is not null)` y no miraba el
-- `status`. O sea: quien se registrara como comprador podía hacer un POST a
-- /rest/v1/providers con status 'approved' y su empresa salía en el catálogo
-- público, en las cifras de la portada y en la lista de proveedores. No hacía
-- falta ninguna clave privada.
--
-- Ahora un insert directo solo puede nacer en borrador o esperando revisión. La
-- única vía a 'approved' es `postular_proveedor()`, que es `security definer` y
-- por tanto no pasa por esta política — y que además enlaza dueño y rol, cosa
-- que el insert crudo no hacía.
drop policy if exists providers_insert on providers;
create policy providers_insert on providers
  for insert with check (
    auth.uid() is not null
    and status in ('draft', 'pending_review')
  );

-- 8.b Se podía crear una cotización a nombre de otra persona
--
-- `quotations_insert` exigía sesión y no comparaba `buyer_id` con `auth.uid()`.
-- Se podía insertar una cotización atribuida a otro usuario, que la vería en su
-- panel como suya.
--
-- Se permite `buyer_id is null` para no cerrarle la puerta a la cotización sin
-- cuenta, que es el mismo criterio de `provider_applications_insert`: lo que no
-- se puede es firmar con el nombre de otro.
drop policy if exists quotations_insert on quotations;
create policy quotations_insert on quotations
  for insert with check (buyer_id is null or buyer_id = auth.uid());

-- 8.c `quotation_items` no tenía política de inserción
--
-- Consecuencia: nadie podía crear las líneas de una cotización, ni la propia
-- aplicación. No es un agujero, es un cajón sin fondo — la funcionalidad no se
-- había usado todavía, y el día que se usara habría fallado sin error (RLS
-- niega devolviendo cero filas, no lanzando).
--
-- Se abre exactamente igual que la cabecera: quien puede crear la cotización
-- puede ponerle líneas.
drop policy if exists quotation_items_insert on quotation_items;
create policy quotation_items_insert on quotation_items
  for insert with check (
    exists (
      select 1 from quotations q
       where q.id = quotation_id
         and (q.buyer_id is null or q.buyer_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 9. La orden guarda la tasa, no solo el monto
--
-- Con la comisión fija en 12 % bastaba el monto. Ahora depende del nivel del
-- proveedor y el nivel sube con el tiempo: sin la tasa guardada, una orden de
-- hace seis meses se puede leer pero no auditar — se sabe cuánto se descontó y
-- no si estuvo bien descontado.
--
-- Es la invariante 2 de `dominio-regenera`, que ya lo anticipaba: «la orden debe
-- guardar la tasa aplicada, no solo el monto».
--
-- Nullable a propósito: las órdenes anteriores no la tienen y no se les puede
-- inventar. `src/lib/orders.ts` les atribuye la tasa base al leerlas.
-- ---------------------------------------------------------------------------

alter table order_items
  add column if not exists commission_rate numeric(5,4)
    check (commission_rate is null or (commission_rate >= 0 and commission_rate <= 1));

comment on column order_items.commission_rate is
  'Tasa con la que se calculó commission_cop (0.1200, 0.1000, 0.0800). Se '
  'congela igual que el precio: el nivel del proveedor sube y recalcularla '
  'daría otro número. Null en órdenes anteriores a la migración 0006.';

-- ---------------------------------------------------------------------------
-- 10. Los proveedores que ya existen arrancan con nivel
--
-- Los trece sembrados y cualquiera creado a mano tienen `experience_points = 0`
-- y, por el trigger, se quedarían en Semilla aunque su ficha ya diga Bosque.
--
-- Se les acredita el nivel que ya tenían, convertido a los puntos mínimos de ese
-- tramo. No es un regalo: es no castigar a nadie por un cambio de modelo.
-- Queda apuntado en `experience_events` como cualquier otro evento, con la clave
-- `migracion_0006`, para que la suma siga cuadrando con el registro.
-- ---------------------------------------------------------------------------

insert into experience_events (provider_id, clave, puntos, referencia)
select p.id,
       'migracion_0006',
       case p.tier when 'bosque' then 2500 when 'raiz' then 600 else 1 end,
       'nivel-heredado'
  from providers p
 where p.experience_points = 0
on conflict do nothing;

update providers p
   set experience_points = e.puntos
  from experience_events e
 where e.provider_id = p.id
   and e.clave = 'migracion_0006'
   and p.experience_points = 0;

-- El `check (puntos > 0)` de la tabla obliga a que Semilla herede 1 y no 0. No
-- mueve a nadie de nivel (el umbral de Raíz son 600) y deja el registro
-- completo, que es lo que se quería.

-- ---------------------------------------------------------------------------
-- Rollback
--
--   drop trigger if exists providers_tier_por_experiencia on providers;
--   drop trigger if exists listings_experiencia on listings;
--   drop trigger if exists orders_experiencia on orders;
--   drop trigger if exists reviews_experiencia on reviews;
--   drop trigger if exists provider_certs_experiencia on provider_certifications;
--   drop function if exists postular_proveedor(text,text,text,text,text,text,text,text,text,text,text,text,text[]);
--   drop function if exists slug_unico_proveedor(text);
--   drop function if exists otorgar_experiencia(uuid,text,text);
--   drop function if exists nivel_para_puntos(int);
--   drop function if exists sync_tier_por_experiencia();
--   drop function if exists experiencia_por_oferta();
--   drop function if exists experiencia_por_orden();
--   drop function if exists experiencia_por_resena();
--   drop function if exists experiencia_por_certificacion();
--   drop table if exists experience_events;
--   alter table providers drop column if exists experience_points,
--                         drop column if exists sustainability_verified_at;
--   -- y volver a poner el cuerpo de sync_provider_score() de 0001_init.sql,
--   -- que escribía `tier` desde la evaluación.
--
-- **Revertir no devuelve los niveles a su estado anterior**: `tier` quedó
-- derivado de los puntos y las filas ya se reescribieron. Habría que
-- recalcularlo desde `sustainability_assessments`. Exportar `providers` antes.
-- ---------------------------------------------------------------------------
