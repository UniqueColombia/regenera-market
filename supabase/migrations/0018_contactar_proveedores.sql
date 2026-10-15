-- 0018 — Contactar proveedores: prospectos, invitaciones y bajas.
--
-- Pedido de Jesús el 2026-10-14: un módulo de administración «Contactar
-- proveedores» para gestionar en bloque a los posibles proveedores e
-- invitarlos por correo a subir sus productos, o mandarles noticias.
--
-- ## Por qué en la base y no en el repositorio
--
-- La idea de partida era «subir al repo solo los datos no sensibles, los que
-- están en las páginas de contacto de cada proveedor». El `CLAUDE.md` del
-- proyecto lo prohíbe con nombre propio («No se versionan listas de
-- prospectos»): el repositorio es público, y que un dato sea público en el
-- sitio de cada empresa no nos autoriza a republicarlo **agregado y puntuado**
-- en GitHub. Aquí viven en una tabla que solo leen los administradores (RLS),
-- que es además lo que el módulo necesita: estado por contacto, quién pidió la
-- baja, cuándo se le escribió.
--
-- ## Qué se guarda, y qué no
--
-- Datos de contacto **de la empresa**, de fuentes públicas (su sitio web, el
-- RUES): nombre, NIT, correo y teléfono de contacto, sitio, ciudad. No se pide
-- ni se importa el nombre de una persona: la invitación va a la empresa. Cada
-- fila guarda de dónde salió (`fuente`), que es lo primero que hay que poder
-- contestar si alguien pregunta «¿de dónde sacaron mi correo?».
--
-- ## La baja
--
-- Todo correo lleva un enlace para no recibir más (y las cabeceras
-- `List-Unsubscribe` para el botón de Gmail). `baja_de_prospecto()` la marca
-- con el `token` de la fila, sin sesión. **Una baja no se deshace desde el
-- panel**: se respeta para siempre, y la acción de envío salta esas filas.
--
-- Aditiva y re-ejecutable: crea tres tablas y tres funciones, no toca nada
-- existente.

-- ---------------------------------------------------------------------------
-- 1. Prospectos
-- ---------------------------------------------------------------------------
create table if not exists prospectos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(trim(nombre)) between 2 and 200),
  nit text check (nit is null or char_length(nit) <= 30),
  correo text check (correo is null or (char_length(correo) <= 200 and correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  telefono text check (telefono is null or char_length(telefono) <= 40),
  sitio_web text check (sitio_web is null or char_length(sitio_web) <= 300),
  instagram text check (instagram is null or char_length(instagram) <= 300),
  ciudad text check (ciudad is null or char_length(ciudad) <= 80),
  departamento text check (departamento is null or char_length(departamento) <= 80),
  -- Qué vende o a qué vertical sirve, como venga de la planilla.
  categoria text check (categoria is null or char_length(categoria) <= 200),
  encaje text check (encaje is null or encaje in ('alto', 'medio', 'bajo', 'descartar')),
  fuente text check (fuente is null or char_length(fuente) <= 300),
  notas text check (notas is null or char_length(notas) <= 2000),
  estado text not null default 'nuevo'
    check (estado in ('nuevo', 'invitado', 'interesado', 'descartado')),
  -- Cuántos correos recibió se cuenta en `envios_de_campana`; aquí solo la
  -- fecha del último, que se escribe sin leer antes (invariante 25).
  ultimo_envio_at timestamptz,
  -- Para el enlace de invitación y el de baja. No adivinable; solo viaja en el
  -- correo (o el WhatsApp) que se le manda a esa empresa.
  token uuid not null default gen_random_uuid() unique,
  baja_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table prospectos is
  'Posibles proveedores a invitar. Datos de contacto de empresas, de fuentes públicas. Solo administradores (0018).';
comment on column prospectos.baja_at is
  'Cuándo pidió no recibir más correos. Se respeta siempre: el envío salta estas filas.';

-- Una empresa una vez: por NIT si lo hay, y por correo si lo hay.
create unique index if not exists prospectos_nit_idx on prospectos (nit) where nit is not null;
create unique index if not exists prospectos_correo_idx on prospectos (lower(correo)) where correo is not null;
create index if not exists prospectos_estado_idx on prospectos (estado, created_at desc);

alter table prospectos enable row level security;

drop policy if exists prospectos_admin on prospectos;
create policy prospectos_admin on prospectos
  for all using (is_admin()) with check (is_admin());

create or replace function prospectos_tocar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  -- Una baja no se deshace desde el panel: quien la pidió, la pidió.
  if tg_op = 'UPDATE' and old.baja_at is not null then
    new.baja_at := old.baja_at;
  end if;
  return new;
end;
$$;

drop trigger if exists prospectos_tocar on prospectos;
create trigger prospectos_tocar
  before update on prospectos
  for each row execute function prospectos_tocar();

-- ---------------------------------------------------------------------------
-- 2. Campañas y envíos
--
-- Una campaña es un mensaje (invitación o noticia) que se manda a varios
-- prospectos. `envios_de_campana` lleva una fila por destinatario con clave
-- (campaña, prospecto): **un mismo correo no le llega dos veces a la misma
-- empresa** aunque la pantalla se recargue a mitad del envío y se reintente.
-- El `id` de la campaña lo genera el navegador (invariante 24).
-- ---------------------------------------------------------------------------
create table if not exists campanas (
  id uuid primary key,
  tipo text not null check (tipo in ('invitacion', 'noticia')),
  asunto text not null check (char_length(trim(asunto)) between 3 and 160),
  cuerpo text not null check (char_length(trim(cuerpo)) between 10 and 8000),
  creada_por uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists envios_de_campana (
  campana_id uuid not null references campanas (id) on delete cascade,
  prospecto_id uuid not null references prospectos (id) on delete cascade,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'enviado', 'fallido', 'omitido')),
  error text check (error is null or char_length(error) <= 300),
  enviado_at timestamptz not null default now(),
  primary key (campana_id, prospecto_id)
);

create index if not exists envios_de_campana_fecha_idx on envios_de_campana (enviado_at);

alter table campanas enable row level security;
alter table envios_de_campana enable row level security;

drop policy if exists campanas_admin on campanas;
create policy campanas_admin on campanas
  for all using (is_admin()) with check (is_admin());

drop policy if exists envios_de_campana_admin on envios_de_campana;
create policy envios_de_campana_admin on envios_de_campana
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- 3. Lo que se puede hacer sin sesión, con el token del correo
-- ---------------------------------------------------------------------------

-- La baja. Devuelve el nombre de la empresa para decir «listo, X no recibirá
-- más correos», o null si el token no existe. Repetirla no cambia la fecha.
create or replace function baja_de_prospecto(_token uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _nombre text;
begin
  update prospectos
     set baja_at = coalesce(baja_at, now())
   where token = _token
  returning nombre into _nombre;
  return _nombre;
end;
$$;

-- Lo que trae el enlace de invitación para no volver a preguntarlo en
-- `/vender`: datos de la propia empresa, que ella misma publica. Solo con el
-- token, que solo llega a su correo. No marca nada: los antivirus de correo
-- corporativo abren los enlaces antes que la persona, y eso no es interés.
create or replace function invitacion_de_prospecto(_token uuid)
returns table (nombre text, nit text, correo text, telefono text, sitio_web text, ciudad text, departamento text)
language sql
stable
security definer
set search_path = public
as $$
  select p.nombre, p.nit, p.correo, p.telefono, p.sitio_web, p.ciudad, p.departamento
    from prospectos p
   where p.token = _token
     and p.estado <> 'descartado';
$$;

-- Cuántos correos de campaña salieron hoy (hora de Colombia), para el tope
-- diario que protege la reputación del remitente.
create or replace function envios_de_hoy()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case when is_admin() then
    (select count(*)::int from envios_de_campana
      where estado = 'enviado'
        and enviado_at >= date_trunc('day', now() at time zone 'America/Bogota') at time zone 'America/Bogota')
  else 0 end;
$$;

revoke execute on function baja_de_prospecto(uuid) from public;
revoke execute on function invitacion_de_prospecto(uuid) from public;
revoke execute on function envios_de_hoy() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    -- La baja y la invitación son, a propósito, para quien no tiene cuenta.
    grant execute on function baja_de_prospecto(uuid) to anon, authenticated;
    grant execute on function invitacion_de_prospecto(uuid) to anon, authenticated;
    revoke execute on function envios_de_hoy() from anon;
    grant execute on function envios_de_hoy() to authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Comprobación después de aplicarla:
--
--   select count(*) from pg_tables where tablename in ('prospectos', 'campanas', 'envios_de_campana');  -- 3
--   select count(*) from pg_proc where proname in ('baja_de_prospecto', 'invitacion_de_prospecto', 'envios_de_hoy');  -- 3
--
-- Rollback (en el papel; borra los prospectos y el registro de envíos):
--   drop function if exists baja_de_prospecto(uuid), invitacion_de_prospecto(uuid), envios_de_hoy();
--   drop table if exists envios_de_campana, campanas, prospectos;
--   drop function if exists prospectos_tocar();
-- ---------------------------------------------------------------------------
