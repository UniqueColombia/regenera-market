-- ---------------------------------------------------------------------------
-- 0009 — El límite de postulaciones deja de castigar a quien tiene sesión
--
-- ## El problema
--
-- `postular_proveedor()` (migración 0006, sección 7.c) rechaza la cuarta
-- postulación del mismo correo en 24 horas:
--
--   if (select count(*) from provider_applications
--        where lower(email) = lower(_email)
--          and created_at > now() - interval '1 day') >= 3 then
--     raise exception 'limite-postulaciones';
--
-- El tope existe para frenar a un robot que encuentre el formulario, que es
-- público a propósito. **Pero cuenta por correo y no mira si hay sesión**, y eso
-- produce una trampa que no se ve venir:
--
-- Alguien con cuenta intenta dar de alta su empresa. Algo falla —un correo de
-- respaldo que rebota, una pantalla de error— y vuelve a intentarlo, que es lo
-- que hace cualquiera. Al cuarto intento el sistema le dice que ya recibió
-- varias postulaciones suyas hoy, y **se queda sin poder registrar su empresa
-- hasta el día siguiente** por haber insistido.
--
-- Lo denunció un caso real el 2026-09-19: «cuando intento crear la empresa da
-- error, ¿quizás no puedo usar el mismo correo del usuario?». La respuesta es
-- que sí se puede —nada lo impide y es lo esperable, el correo de la empresa
-- suele ser el de quien la dirige— pero el tope le hacía creer lo contrario.
--
-- ## El cambio
--
-- **El tope solo cuenta postulaciones sin sesión.** Con sesión no aporta nada:
-- la función ya impide que una persona cree dos empresas —si ya es dueña de
-- una, enlaza la postulación a la que tiene y no crea otra—, así que insistir
-- no ensucia el catálogo. Lo único que se acumula son filas en
-- `provider_applications`, que es el registro de lo que pasó y conviene que esté
-- completo.
--
-- Una sesión es además una señal mucho más fuerte que un correo: para tenerla
-- hubo que recibir un código de seis dígitos en un buzón real.
--
-- ## Qué NO cambia
--
-- El tope sigue igual de estricto para quien postula **sin cuenta**, que es el
-- caso que el formulario público expone a un robot. Y sigue sin ser una defensa
-- seria: lo que de verdad importa —que nadie lea postulaciones ajenas— lo
-- impide RLS.
--
-- ## Cómo se aplica
--
-- Reemplaza el cuerpo de una función. No toca ninguna tabla, ningún dato y
-- ninguna política, así que **se puede aplicar antes o después de desplegar**;
-- es la primera migración de este repositorio de la que eso se puede decir.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0009_alta_con_sesion_y_portada.sql
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
begin
  -- El tope, solo para quien no tiene sesión. Ver la cabecera de esta
  -- migración: con sesión no protege de nada y sí bloquea a quien insiste
  -- porque algo le falló.
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
      'application_id', _app_id, 'activado', false, 'motivo', 'sin-sesion');
  end if;

  -- ¿Ya gestiona una empresa? Entonces no se le crea otra: se le enlaza la
  -- postulación a la que ya tiene. Sin esto, mandar el formulario dos veces
  -- deja a la misma persona con dos fichas en el catálogo.
  --
  -- **Esto es también lo que hace que insistir sea inofensivo**, y por tanto lo
  -- que permite quitarle el tope a quien tiene sesión.
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

  -- `provider_id` va en la respuesta desde esta migración. Lo necesita la
  -- pantalla que sigue al alta: ahí se suben el logo y la portada, y la carpeta
  -- de Storage donde van **es el id de la empresa** — es lo que comparan las
  -- políticas de `storage.objects` con `manages_provider()`. Devolverlo aquí
  -- evita una consulta más justo después de una transacción que ya lo sabía.
  return jsonb_build_object(
    'application_id', _app_id,
    'activado', true,
    'provider_id', _provider_id,
    'provider_slug', _slug);
end;
$$;

-- Los permisos no cambian, pero `create or replace` no los conserva si la firma
-- cambiara. Se vuelven a declarar por si acaso: cuestan una línea y su ausencia
-- se manifiesta como un 404 de PostgREST que no dice que falta un `grant`.
revoke all on function postular_proveedor(
  text, text, text, text, text, text, text, text, text, text, text, text, text[]
) from public;
grant execute on function postular_proveedor(
  text, text, text, text, text, text, text, text, text, text, text, text, text[]
) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- La portada de la empresa no necesita esquema
--
-- `providers.cover_url` existe desde la 0001 y nunca se llenó: la ficha pública
-- usaba la foto de una de sus ofertas. A partir de esta tanda el proveedor la
-- sube desde `/cuenta/empresa`, y si no sube ninguna se sigue usando la foto de
-- su oferta — o sea que no hay ficha sin imagen en ningún momento.
--
-- El archivo va al bucket `logos` que creó la 0008, en
-- `logos/<provider_id>/portada.webp`. **No hace falta un bucket ni una política
-- nueva**: lo que la política comprueba es la primera carpeta de la ruta, que
-- sigue siendo el id de la empresa. El nombre del archivo lo decide
-- `src/lib/almacenamiento.ts`.
-- ---------------------------------------------------------------------------

comment on column providers.cover_url is
  'Foto de portada de la ficha pública. La sube quien gestiona la empresa desde '
  '/cuenta/empresa, al bucket `logos` (logos/<id>/portada.*). Si está vacía, la '
  'ficha usa la foto de una de sus ofertas.';

-- ---------------------------------------------------------------------------
-- Comprobar que quedó aplicada
--
--   -- Devuelve provider_id además de provider_slug
--   select pg_get_function_result(oid) from pg_proc where proname = 'postular_proveedor';
--
--   -- Con una sesión de usuario, mandar el formulario de /vender cuatro veces
--   -- seguidas ya no rebota. Sin sesión, la cuarta sigue rebotando.
--
-- ---------------------------------------------------------------------------
-- Rollback
--
-- Volver a crear `postular_proveedor()` con el cuerpo de la sección 7.c de la
-- migración 0006. **Revertir vuelve a bloquear a quien insiste tras un fallo**,
-- que es el problema que esta migración existe para quitar.
-- ---------------------------------------------------------------------------
