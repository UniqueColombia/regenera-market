-- 0022 — Un documento tributario, una empresa.
--
-- Pedido de Jesús el 2026-10-14, sobre la 0021: «alguien con malas reseñas
-- podría cerrar su empresa y volverla a abrir». Y había una forma más simple
-- todavía: **dar de alta una segunda empresa con el mismo NIT desde otra
-- cuenta**, sin cerrar la primera. La base no comparaba documentos.
--
-- **Va después de la 0021**: usa `providers.cerrada_at` y redefine
-- `cerrar_mi_empresa()`.
--
-- ## La regla
--
-- 1. Cada empresa tiene una **clave tributaria**: el país y el documento,
--    normalizados (`clave_tributaria()`). En Colombia, `900.123.456-7`,
--    `900123456-7`, `9001234567` y `900123456` son la misma: se quitan los
--    signos y el dígito de verificación, que se reconoce con la fórmula de la
--    DIAN aunque venga pegado. Fuera de Colombia se quitan los signos y nada
--    más (el RUT chileno `12.345.678-K` y `12345678K` son la misma).
-- 2. **Al dar de alta una empresa con una clave que ya existe, no se crea
--    otra:**
--    - si la existente **la cerró la misma persona** (`cerrada_por`), se
--      reactiva **tal como estaba**: con su nivel, sus puntos, sus reseñas y
--      sus ventas. Sus ofertas siguen en borrador hasta que las mande a
--      revisión;
--    - en cualquier otro caso —la cerró otra persona, está activa, la suspendió
--      el equipo— la solicitud queda **en revisión** para el equipo
--      (`documento-existente`). No se reactiva sola para un desconocido: quien
--      gestiona una empresa ve los nombres, teléfonos y direcciones de sus
--      compradores, y un NIT ajeno se consigue en el RUES.
-- 3. **El equipo, al aprobar esa solicitud** (`aprobar_postulacion()`),
--    reactiva la empresa cerrada con la nueva persona como dueña; si la
--    existente está activa, no crea otra y lo dice (`documento-existente`): a
--    la persona se la enlaza a la empresa desde «Usuarios».
-- 4. **Una empresa cerrada no se aprueba desde el panel** (`empresa-cerrada`):
--    volvería al catálogo sin nadie que la gestione. Vuelve solo por la
--    reactivación, que le pone dueña en el mismo paso.
--
-- Una empresa que nunca vendió se sigue borrando entera al cerrarla (0021), y
-- con ella su clave: no tiene reseñas ni ventas de las que escapar.
--
-- No hay índice único sobre la clave a propósito: en la base ya puede haber
-- dos empresas con el mismo documento (las sembradas, o dos altas de antes de
-- esta migración), y un índice único haría fallar la migración entera. La
-- regla la imponen las dos funciones de alta, con un candado por clave.
--
-- Aditiva y re-ejecutable.

-- ---------------------------------------------------------------------------
-- 1. La clave tributaria
-- ---------------------------------------------------------------------------

-- El dígito de verificación de un NIT colombiano (DIAN): pesos primos desde la
-- derecha, módulo 11.
create or replace function dv_nit(_base text)
returns int
language sql
immutable
strict
parallel safe
set search_path = public
as $$
  select case when r in (0, 1) then r else 11 - r end
  from (
    select (sum(substr(reverse(_base), i, 1)::int * (array[3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71])[i]) % 11)::int as r
    from generate_series(1, least(char_length(_base), 15)) i
  ) t;
$$;

create or replace function clave_tributaria(_pais text, _documento text)
returns text
language plpgsql
immutable
parallel safe
set search_path = public
as $$
declare
  _p text := sin_tildes(lower(trim(coalesce(nullif(trim(_pais), ''), 'Colombia'))));
  _d text := coalesce(_documento, '');
begin
  if _p = 'colombia' then
    -- El dígito de verificación separado con guion: fuera.
    _d := regexp_replace(_d, '-\s*[0-9]\s*$', '');
    _d := regexp_replace(_d, '[^0-9]', '', 'g');
    -- Pegado, sin guion: el NIT de una sociedad (nueve dígitos, empieza por 8
    -- o 9) o el de una persona (su cédula de diez, empieza por 1), con el DV
    -- al final. Se exige el prefijo además del DV para no recortarle el último
    -- dígito a una cédula a la que, por casualidad, le cuadre (1 de cada 11).
    if (char_length(_d) = 10 and left(_d, 1) in ('8', '9')
        and dv_nit(left(_d, 9)) = right(_d, 1)::int)
       or (char_length(_d) = 11 and left(_d, 1) = '1'
        and dv_nit(left(_d, 10)) = right(_d, 1)::int) then
      _d := left(_d, char_length(_d) - 1);
    end if;
  else
    _d := upper(regexp_replace(_d, '[^0-9A-Za-z]', '', 'g'));
  end if;
  if _d = '' then
    return null;
  end if;
  return _p || ':' || _d;
end;
$$;

comment on function clave_tributaria(text, text) is
  'País y documento tributario normalizados: la identidad de una empresa (0022). En Colombia, sin signos ni dígito de verificación.';

alter table providers add column if not exists cerrada_por uuid;
comment on column providers.cerrada_por is
  'Quién la cerró (0022). Sin clave foránea a propósito: si borra su cuenta, el dato se queda y nadie más puede reabrirla sola.';

alter table providers
  add column if not exists clave_tributaria text
  generated always as (clave_tributaria(country, tax_id)) stored;

create index if not exists providers_clave_tributaria_idx on providers (clave_tributaria);

-- ---------------------------------------------------------------------------
-- 2. Una empresa cerrada no se aprueba desde el panel
--
-- Antes que `providers_proteger_derivados` (los triggers del mismo momento
-- corren por orden alfabético): la reactivación borra `cerrada_at` en el
-- mismo `update` que la aprueba, y eso sí pasa.
-- ---------------------------------------------------------------------------
create or replace function providers_cerrada_no_se_aprueba()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.cerrada_at is not null and new.cerrada_at is not null
     and new.status = 'approved' and old.status is distinct from 'approved' then
    raise exception 'empresa-cerrada'
      using hint = 'La cerró su dueña. Vuelve al catálogo cuando se da de alta otra vez con su documento.';
  end if;
  return new;
end;
$$;

drop trigger if exists providers_cerrada_no_se_aprueba on providers;
create trigger providers_cerrada_no_se_aprueba
  before update on providers
  for each row execute function providers_cerrada_no_se_aprueba();

-- ---------------------------------------------------------------------------
-- 3. reactivar_empresa(): el paso compartido por las dos altas
-- ---------------------------------------------------------------------------
create or replace function reactivar_empresa(_provider_id uuid, _duena uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _slug text;
begin
  update providers
     set status = 'approved', cerrada_at = null, cerrada_por = null
   where id = _provider_id
  returning slug into _slug;

  insert into provider_members (provider_id, user_id, is_owner)
  values (_provider_id, _duena, true)
  on conflict do nothing;

  insert into user_roles (user_id, role)
  values (_duena, 'provider')
  on conflict (user_id, role) do nothing;

  return _slug;
end;
$$;

-- Solo la llaman las funciones de esta migración, nunca la aplicación.
revoke execute on function reactivar_empresa(uuid, uuid) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function reactivar_empresa(uuid, uuid) from anon, authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. cerrar_mi_empresa(): igual que en la 0021, y anota quién la cerró
--
-- El único cambio va marcado con «0022».
-- ---------------------------------------------------------------------------
create or replace function cerrar_mi_empresa(_provider_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _slug text;
  _con_historia boolean;
begin
  if _uid is null then
    raise exception 'sin-sesion';
  end if;
  if not exists (
    select 1 from provider_members
     where provider_id = _provider_id and user_id = _uid and is_owner
  ) then
    raise exception 'no-es-duena';
  end if;

  -- La fila de la empresa queda tomada hasta el final: una compra que llegue a
  -- la vez encuentra la empresa cerrada (o espera a que esto termine).
  select slug into _slug from providers where id = _provider_id for update;

  if exists (
    select 1 from order_items oi
      join orders o on o.id = oi.order_id
     where oi.provider_id = _provider_id
       and o.status in ('pending_payment', 'paid', 'in_progress')
  ) then
    raise exception 'ventas-en-curso';
  end if;
  if exists (
    select 1 from quotation_items qi
      join quotations q on q.id = qi.quotation_id
     where qi.provider_id = _provider_id
       and q.status not in ('accepted', 'declined', 'cancelled', 'expired')
  ) then
    raise exception 'solicitudes-abiertas';
  end if;

  _con_historia := exists (select 1 from order_items where provider_id = _provider_id)
                or exists (select 1 from quotation_items where provider_id = _provider_id);

  if not _con_historia then
    -- Sin ventas: se va entera. Las ofertas, los miembros, las certificaciones,
    -- la evaluación y los puntos caen en cascada; lo que firmó en la Comunidad
    -- se queda a nombre de la persona (`provider_id` pasa a null).
    delete from providers where id = _provider_id;
  else
    update listings
       set status = 'draft', featured = false
     where provider_id = _provider_id
       and (status <> 'draft' or featured);
    -- 0022: y quién la cerró. Es lo que deja que la misma persona la reabra
    -- sola al dar de alta otra vez su documento.
    update providers
       set status = 'suspended', cerrada_at = now(), cerrada_por = _uid
     where id = _provider_id;
    delete from provider_members where provider_id = _provider_id;
  end if;

  -- El rol de proveedor sobra si ya no gestiona ninguna empresa.
  if not exists (select 1 from provider_members where user_id = _uid) then
    delete from user_roles where user_id = _uid and role = 'provider';
  end if;

  return jsonb_build_object(
    'resultado', case when _con_historia then 'cerrada' else 'borrada' end,
    'slug', _slug
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. postular_proveedor(): mismo cuerpo que en la 0014; lo nuevo va marcado
--    con «0022»
-- ---------------------------------------------------------------------------
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
  _clave text;
  _existente record;
  _reactivada boolean := false;
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

  -- 0022: un documento tributario, una empresa. Con el candado de la clave,
  -- dos altas con el mismo NIT a la vez se turnan y la segunda encuentra la
  -- primera.
  if _provider_id is null then
    _clave := clave_tributaria(_country, _tax_id);
    if _clave is not null then
      perform pg_advisory_xact_lock(hashtextextended('nit:' || _clave, 0));
      select id, slug, cerrada_at, cerrada_por into _existente
        from providers
       where clave_tributaria = _clave
       order by (cerrada_at is null) desc, created_at
       limit 1;
      if found then
        if _existente.cerrada_at is not null and _existente.cerrada_por = _uid then
          -- La cerró ella misma: vuelve tal como estaba.
          _slug := reactivar_empresa(_existente.id, _uid);
          _provider_id := _existente.id;
          _reactivada := true;
        else
          -- Otra persona, o una empresa que sigue activa o suspendida: no se
          -- crea otra. La decide el equipo.
          update provider_applications
             set status = 'pending_review',
                 reviewer_notes = format(
                   'Mismo documento que la empresa «%s» (/proveedor/%s).',
                   (select name from providers where id = _existente.id), _existente.slug)
           where id = _app_id;
          return jsonb_build_object(
            'application_id', _app_id, 'activado', false,
            'motivo', 'documento-existente', 'repetida', false);
        end if;
      end if;
    end if;
  end if;

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
  elsif not _reactivada then
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
    'reactivada', _reactivada,
    'repetida', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. aprobar_postulacion(): mismo cuerpo que en la 0014, con la misma regla
-- ---------------------------------------------------------------------------
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
  _clave text;
  _existente record;
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

  -- 0022: con el documento de una empresa que ya existe no se crea otra. Si
  -- está cerrada, el equipo decidió reabrirla con esta persona como dueña; si
  -- está activa, a la persona se la enlaza a esa empresa desde «Usuarios».
  _clave := clave_tributaria(coalesce(_p.country, 'Colombia'), _p.tax_id);
  if _clave is not null then
    perform pg_advisory_xact_lock(hashtextextended('nit:' || _clave, 0));
    select id, slug, name, cerrada_at into _existente
      from providers
     where clave_tributaria = _clave
     order by (cerrada_at is null) desc, created_at
     limit 1;
    if found then
      if _existente.cerrada_at is null then
        raise exception 'documento-existente'
          using hint = format('%s (/proveedor/%s)', _existente.name, _existente.slug);
      end if;
      if _p.user_id is null then
        raise exception 'reabrir-sin-cuenta'
          using hint = format('%s (/proveedor/%s)', _existente.name, _existente.slug);
      end if;
      _slug := reactivar_empresa(_existente.id, _p.user_id);
      update provider_applications
         set status = 'approved',
             provider_id = _existente.id,
             reviewer_notes = nullif(trim(coalesce(_notas, '')), ''),
             reviewed_by = auth.uid(),
             reviewed_at = now()
       where id = _id;
      return jsonb_build_object(
        'repetida', false, 'provider_id', _existente.id, 'slug', _slug,
        'sin_dueno', false, 'reactivada', true);
    end if;
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


-- `create or replace` conserva los permisos; se repiten por si alguien aplica
-- esta sobre una base donde las funciones no existían.
revoke all on function postular_proveedor(
  text, text, text, text, text, text, text, text, text, text, text, text, text[]
) from public;
grant execute on function postular_proveedor(
  text, text, text, text, text, text, text, text, text, text, text, text, text[]
) to anon, authenticated;
revoke all on function aprobar_postulacion(uuid, text) from public;
grant execute on function aprobar_postulacion(uuid, text) to authenticated;
revoke execute on function cerrar_mi_empresa(uuid) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function cerrar_mi_empresa(uuid) from anon;
    revoke execute on function aprobar_postulacion(uuid, text) from anon;
    grant execute on function cerrar_mi_empresa(uuid) to authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Comprobación después de aplicarla:
--
--   select clave_tributaria('Colombia', '900.123.456-7');   -- colombia:900123456
--   select clave_tributaria('Colombia', '9001234567') = clave_tributaria('Colombia', '900123456');
--     -- true solo si 7 es el DV de 900123456; si no, son documentos distintos
--   select count(*) from information_schema.columns
--    where table_name = 'providers' and column_name in ('cerrada_por', 'clave_tributaria');  -- 2
--
-- Empresas que ya comparten documento (deberían ser 0 filas; si no, el equipo
-- decide cuál vale):
--
--   select clave_tributaria, array_agg(name) from providers
--    where clave_tributaria is not null group by 1 having count(*) > 1;
--
-- Rollback (en el papel): volver a correr las definiciones de la 0014 para
-- postular_proveedor y aprobar_postulacion, y la de la 0021 para
-- cerrar_mi_empresa, y:
--   drop trigger if exists providers_cerrada_no_se_aprueba on providers;
--   drop function if exists providers_cerrada_no_se_aprueba(), reactivar_empresa(uuid, uuid);
--   drop index if exists providers_clave_tributaria_idx;
--   alter table providers drop column if exists clave_tributaria, drop column if exists cerrada_por;
--   drop function if exists clave_tributaria(text, text), dv_nit(text);
-- ---------------------------------------------------------------------------
