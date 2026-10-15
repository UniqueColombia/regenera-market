-- 0021 — Cerrar la empresa, y eliminar la cuenta.
--
-- Pedido de Jesús el 2026-10-14: que una persona pueda eliminar su cuenta y
-- cerrar la empresa que creó —y crear otra—, que no existía. La política de
-- privacidad ya prometía lo primero («si la cierras, se borran los datos de tu
-- perfil y lo que publicaste en la Comunidad») sin que hubiera cómo hacerlo.
--
-- ## Lo que se borra y lo que no, y por qué
--
-- **Una empresa que ya vendió no se borra: se cierra.** Sus ítems vendidos la
-- referencian (`order_items.provider_id`, sin `on delete`), y está bien que la
-- base lo impida: sin ella no se puede auditar una venta, ni liquidarle, ni
-- facturar. Cerrada, sale del sitio (`status = 'suspended'`, sus ofertas a
-- borrador), nadie la gestiona y queda con la fecha en `cerrada_at`. Una
-- empresa **sin ventas ni cotizaciones** se borra entera, con sus ofertas.
-- En los dos casos su dueña queda libre para crear otra: la regla «una
-- persona, una empresa» de `postular_proveedor()` mira `provider_members`.
--
-- **Una cuenta se borra, pero sus pedidos se conservan.** `orders.buyer_id` es
-- `on delete set null` desde la 0001: el pedido queda con el nombre, el correo
-- y el documento congelados, que es lo que exige la normativa contable y lo que
-- dice la política. Lo demás cae en cascada al borrar el usuario (perfil,
-- roles, dispositivos, publicaciones y reacciones, reseñas).
--
-- **Las reseñas se ocultan antes de borrarse.** Borrar una reseña no tiene
-- trigger y dejaría al vendedor con los puntos que dio; ocultarla los revierte
-- (`reviews_experiencia_cambio`, 0016). Es la invariante 30: lo que se quita
-- deshace lo que dio. Las publicaciones de la Comunidad ya revierten al
-- borrarse (0013).
--
-- ## Lo que impide cerrar o borrar
--
-- Decisión de Jesús el 2026-10-14: **si hay alguien esperando algo, no se
-- puede**. Primero se cumple o se cancela.
--
-- - **La empresa**: un pedido con ítems suyos que espera pago, está pagado o en
--   preparación (`ventas-en-curso`), o una solicitud de cotización abierta a
--   alguna de sus ofertas (`solicitudes-abiertas`).
-- - **La cuenta**: un pedido suyo que espera pago, está pagado o en preparación
--   (`pedidos-en-curso`), o una cotización suya abierta
--   (`solicitudes-abiertas`). Y lo mismo que la empresa de la que es la única
--   persona.
-- - **Ser administrador**: otro administrador le quita el rol primero. Evita
--   quedarse sin nadie que administre (el trigger `user_roles_ultimo_admin`
--   también lo impediría, con un error menos claro).
--
-- **Una cotización está abierta mientras no esté terminada.** `quotations.status`
-- es texto libre y hoy solo existe `requested`; se cuenta como terminada solo
-- la que diga `accepted`, `declined`, `cancelled` o `expired`. Ante un estado
-- nuevo que nadie previó, bloquea en vez de dejar pasar.
--
-- El borrado del usuario en sí (`auth.users`) lo hace la aplicación con la API
-- de administración de Supabase después de `preparar_baja_de_cuenta()`: es la
-- forma que Supabase sostiene de borrar una cuenta, y la que también cierra sus
-- sesiones abiertas.
--
-- Aditiva y re-ejecutable: una columna y dos funciones.

alter table providers add column if not exists cerrada_at timestamptz;

comment on column providers.cerrada_at is
  'Cuándo la cerró su dueña (0021). Cerrada: fuera del sitio, sin miembros, conservada por sus ventas.';

-- ---------------------------------------------------------------------------
-- 1. cerrar_mi_empresa()
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
    update providers
       set status = 'suspended', cerrada_at = now()
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
-- 2. preparar_baja_de_cuenta()
--
-- Todo lo que hay que hacer antes de borrar el usuario, en una transacción:
-- si algo impide la baja, no se toca nada. Devuelve las empresas que se
-- borraron enteras, para que la aplicación borre también sus fotos.
-- ---------------------------------------------------------------------------
create or replace function preparar_baja_de_cuenta()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _p record;
  _r jsonb;
  _borradas uuid[] := '{}';
  _cerradas int := 0;
begin
  if _uid is null then
    raise exception 'sin-sesion';
  end if;
  if is_admin() then
    raise exception 'es-admin';
  end if;
  if exists (
    select 1 from orders
     where buyer_id = _uid and status in ('pending_payment', 'paid', 'in_progress')
  ) then
    raise exception 'pedidos-en-curso';
  end if;
  if exists (
    select 1 from quotations
     where buyer_id = _uid and status not in ('accepted', 'declined', 'cancelled', 'expired')
  ) then
    raise exception 'solicitudes-abiertas';
  end if;

  -- Las empresas de las que es la única persona se cierran con la misma regla
  -- que si las cerrara a mano (y con los mismos impedimentos). Las que
  -- comparte con otros siguen: solo se va su vínculo, en cascada.
  for _p in
    select pm.provider_id
      from provider_members pm
     where pm.user_id = _uid and pm.is_owner
       and not exists (
         select 1 from provider_members o
          where o.provider_id = pm.provider_id and o.user_id <> _uid
       )
     order by pm.provider_id
  loop
    _r := cerrar_mi_empresa(_p.provider_id);
    if _r ->> 'resultado' = 'borrada' then
      _borradas := _borradas || _p.provider_id;
    else
      _cerradas := _cerradas + 1;
    end if;
  end loop;

  -- Ocultar revierte los puntos que dio cada reseña (invariante 30); después,
  -- borrar el usuario las borra en cascada.
  update reviews set oculta = true where author_id = _uid and not oculta;

  return jsonb_build_object('empresas_borradas', to_jsonb(_borradas), 'empresas_cerradas', _cerradas);
end;
$$;

revoke execute on function cerrar_mi_empresa(uuid) from public;
revoke execute on function preparar_baja_de_cuenta() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function cerrar_mi_empresa(uuid) from anon;
    revoke execute on function preparar_baja_de_cuenta() from anon;
    grant execute on function cerrar_mi_empresa(uuid) to authenticated;
    grant execute on function preparar_baja_de_cuenta() to authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Comprobación después de aplicarla (las dos en 1 y 2):
--
--   select count(*) from information_schema.columns where table_name = 'providers' and column_name = 'cerrada_at';  -- 1
--   select count(*) from pg_proc where proname in ('cerrar_mi_empresa', 'preparar_baja_de_cuenta');  -- 2
--
-- Rollback (en el papel):
--   drop function if exists cerrar_mi_empresa(uuid), preparar_baja_de_cuenta();
--   alter table providers drop column if exists cerrada_at;
-- ---------------------------------------------------------------------------
