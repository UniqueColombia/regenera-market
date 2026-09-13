-- ---------------------------------------------------------------------------
-- 0004 — Contraseña con segundo factor por dispositivo, postulaciones
--        persistentes y lectura de usuarios para el panel
--
-- Tres cosas que hasta ahora no tenían dónde vivir:
--
--   1. `trusted_devices` — qué aparatos ya pasaron el código de seis dígitos,
--      para no volver a pedirlo en cada acceso. Es lo que convierte el código
--      en un segundo factor de verdad en vez de en un estorbo diario.
--   2. `provider_applications` — lo que llega de `/vender`. Hoy se guardaba en
--      un array dentro del proceso de Node (`src/app/vender/actions.ts`) y se
--      perdía en cada redespliegue: una empresa postulaba y su postulación
--      desaparecía sin que nadie se enterara.
--   3. `admin_listar_usuarios()` — el correo de un usuario vive en
--      `auth.users`, que la clave anon no puede leer. El panel necesita verlo
--      para dar y quitar roles.
--
-- Aditiva: no borra ni cambia el tipo de ninguna columna existente. Lo único
-- que reemplaza es el cuerpo de `handle_new_user()`, que pasa a guardar también
-- el teléfono que ahora pide el registro.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. El perfil nuevo también guarda el teléfono
--
-- `profiles.phone` existe desde 0001 y nadie lo escribía: el registro solo
-- pedía correo. Ahora el formulario pide indicativo de país y número, los une
-- en formato E.164 (+573001234567) y los manda en `raw_user_meta_data`.
--
-- Se guarda en `profiles` y no solo en los metadatos del usuario porque
-- `auth.users` no se puede consultar con la clave anon: un panel que quiera
-- listar teléfonos tendría que saltarse RLS para leerlos.
-- ---------------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
-- Ver 0002: `security definer` es obligatorio porque el trigger corre dentro
-- del insert en auth.users, antes de que exista sesión y por tanto `auth.uid()`.
security definer
set search_path = public
as $$
begin
  insert into profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    -- nullif: un metadato ausente llega como null, pero uno presente y vacío
    -- llega como '' y guardaría un teléfono en blanco que parece un dato.
    nullif(new.raw_user_meta_data->>'phone', '')
  )
  on conflict (id) do nothing;

  insert into user_roles (user_id, role)
  values (new.id, 'buyer')
  on conflict (user_id, role) do nothing;

  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Dispositivos de confianza
--
-- El acceso pide correo y contraseña. El código de seis dígitos solo se pide
-- cuando el aparato no está en esta tabla: al registrarse, al entrar desde un
-- computador nuevo, o después de que la persona cierre sus sesiones.
--
-- **Se guarda el hash del identificador, nunca el identificador.** El valor
-- vive en una cookie httpOnly del navegador; si alguien se lleva un volcado de
-- esta tabla, no obtiene cookies válidas con las que saltarse el segundo
-- factor. Es el mismo motivo por el que una tabla de sesiones guarda hashes.
-- ---------------------------------------------------------------------------

create table if not exists trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  -- sha256 en hexadecimal del identificador que va en la cookie
  device_hash text not null,
  -- "Chrome en Windows" — para que la persona reconozca cuál es cuál en la
  -- pantalla de su cuenta. Nunca el User-Agent crudo: es huella digital.
  label text not null default 'Dispositivo',
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- Un mismo aparato no se registra dos veces para la misma persona, y dos
  -- personas sí pueden confiar en el mismo computador (cada una con su cookie).
  unique (user_id, device_hash)
);

create index if not exists trusted_devices_user_idx on trusted_devices (user_id);

alter table trusted_devices enable row level security;

-- Cada quien ve y revoca los suyos. No hay política de admin a propósito: un
-- administrador no tiene por qué saber desde qué aparatos entra un comprador.
drop policy if exists trusted_devices_own on trusted_devices;
create policy trusted_devices_own on trusted_devices
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Postulaciones de proveedor
--
-- El formulario de `/vender` es público: se puede postular sin tener cuenta.
-- Por eso `user_id` es nullable y la política de inserción no exige sesión.
--
-- Que sea público significa que se puede llenar con basura desde fuera de la
-- aplicación. Es el mismo riesgo de cualquier formulario de contacto y se
-- resuelve donde se resuelven esos: revisándolos. Lo que RLS sí impide es que
-- alguien **lea** las postulaciones ajenas, que es donde hay datos de personas.
-- ---------------------------------------------------------------------------

create table if not exists provider_applications (
  id uuid primary key default gen_random_uuid(),
  -- Quién postuló, si tenía sesión. Al aprobar, es quien queda como dueño en
  -- `provider_members`; sin él, la empresa aprobada no tiene quién la gestione.
  user_id uuid references auth.users on delete set null,
  name text not null,
  contact_name text not null,
  email text not null,
  phone text not null,
  department text not null,
  city text not null,
  website text,
  description text not null,
  status review_status not null default 'pending_review',
  reviewer_notes text,
  reviewed_by uuid references auth.users,
  reviewed_at timestamptz,
  -- El proveedor que se creó al aprobarla. Deja el rastro de qué salió de qué,
  -- y evita crear dos empresas si alguien aprueba dos veces.
  provider_id uuid references providers on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists provider_applications_status_idx
  on provider_applications (status);

alter table provider_applications enable row level security;

drop policy if exists provider_applications_insert on provider_applications;
create policy provider_applications_insert on provider_applications
  for insert with check (
    -- O no hay sesión (postulación anónima), o el `user_id` es el de quien
    -- postula. Lo que no se puede es postular en nombre de otra persona.
    user_id is null or user_id = auth.uid()
  );

drop policy if exists provider_applications_read_own on provider_applications;
create policy provider_applications_read_own on provider_applications
  for select using (user_id = auth.uid());

drop policy if exists provider_applications_admin on provider_applications;
create policy provider_applications_admin on provider_applications
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- 4. Los usuarios, para el panel de administración
--
-- El correo de un usuario vive en `auth.users`, esquema al que la clave anon no
-- tiene acceso. Sin esto, la pantalla `/admin/usuarios` tendría que leerse con
-- la clave de servicio, y entonces el permiso lo concedería el código de la
-- aplicación en vez de la base — exactamente lo que este proyecto evita.
--
-- `security definer` para poder leer `auth.users`, y el `where is_admin()`
-- dentro del cuerpo para que quien no sea administrador reciba cero filas.
-- **Ese `where` es la política**: sin él, cualquiera con la clave anon podría
-- llamar a la función y listar los correos de todo el mundo.
-- ---------------------------------------------------------------------------

create or replace function admin_listar_usuarios()
returns table (
  id uuid,
  email text,
  full_name text,
  phone text,
  roles app_role[],
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.id,
    u.email::text,
    coalesce(p.full_name, ''),
    p.phone,
    coalesce(
      (select array_agg(r.role order by r.role) from user_roles r where r.user_id = u.id),
      '{}'::app_role[]
    ),
    u.last_sign_in_at,
    u.email_confirmed_at,
    u.created_at
  from auth.users u
  left join profiles p on p.id = u.id
  where is_admin()
  order by u.created_at desc;
$$;

-- `authenticated` y no `anon`: un visitante sin sesión no tiene nada que hacer
-- llamando a esto. El `where is_admin()` ya lo frenaría, pero no hace falta
-- ofrecerle la puerta.
revoke all on function admin_listar_usuarios() from public;
grant execute on function admin_listar_usuarios() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Las órdenes guardan su propio impacto
--
-- `src/lib/types.ts` lleva desde el principio un `impact` agregado en la orden y
-- la pantalla `/orden/[reference]` lo enseña. Mientras las órdenes vivieron en
-- un `Map` en memoria nadie notó que la tabla no tenía dónde ponerlo.
--
-- Se guarda sumado en la orden en vez de recalcularlo con un join contra el
-- catálogo, por la misma razón que el título y el precio se congelan en el ítem
-- (invariante 6 de `dominio-regenera`): si mañana el proveedor corrige el CO₂ de
-- su producto, el certificado que ya se le dio al comprador no puede cambiar
-- solo.
-- ---------------------------------------------------------------------------

alter table orders add column if not exists co2_kg_saved numeric(12,2);
alter table orders add column if not exists water_liters_saved numeric(12,2);
alter table orders add column if not exists waste_kg_reduced numeric(12,2);

-- ---------------------------------------------------------------------------
-- 6. El administrador también puede tocar los cupos
--
-- `availability_write` de 0001 solo deja escribir a quien gestiona el proveedor.
-- Con el panel de ofertas en manos del admin, eso deja cojo el formulario de
-- experiencias: se podría crear la experiencia y no sus fechas, sin que el error
-- dijera por qué (RLS no falla al negar: devuelve cero filas).
-- ---------------------------------------------------------------------------

drop policy if exists availability_admin on listing_availability;
create policy availability_admin on listing_availability
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Rollback
--
--   drop function if exists admin_listar_usuarios();
--   drop table if exists provider_applications;
--   drop table if exists trusted_devices;
--   drop policy if exists availability_admin on listing_availability;
--   alter table orders drop column if exists co2_kg_saved, drop column if exists water_liters_saved, drop column if exists waste_kg_reduced;
--   -- y volver a poner el cuerpo de handle_new_user() de 0002_auth.sql
--
-- Revertir borra las postulaciones recibidas y obliga a todo el mundo a
-- verificar su dispositivo la próxima vez que entre. Ninguna de las dos cosas
-- rompe nada, pero la primera pierde datos de empresas reales: exportar antes.
-- ---------------------------------------------------------------------------
