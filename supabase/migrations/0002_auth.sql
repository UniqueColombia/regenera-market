-- ---------------------------------------------------------------------------
-- 0002 — Perfil y rol automáticos al registrarse
--
-- Tapa un hueco de 0001: `profiles` referencia `auth.users` y tiene `full_name
-- not null`, pero nada crea la fila cuando alguien se registra. Sin esto, todo
-- usuario nuevo queda con sesión válida y sin perfil, y cada página que lea
-- `profiles` revienta. El síntoma es desconcertante — el registro "funciona" y
-- la aplicación falla después.
--
-- Aditiva: no toca ninguna tabla ni columna existente.
-- ---------------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
-- `security definer` es obligatorio, no una comodidad: el trigger corre dentro
-- del `insert` en auth.users, antes de que exista sesión, así que no hay
-- `auth.uid()` con el que una política RLS pudiera dejarle escribir.
-- `set search_path = public` cierra la vía de que alguien cree un objeto
-- homónimo en otro esquema y se lo haga ejecutar con estos privilegios.
security definer
set search_path = public
as $$
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;

  -- Todo el mundo entra como comprador. `provider` lo otorga la aprobación de
  -- la postulación y `admin` se asigna a mano desde el SQL Editor: nadie se
  -- autoasciende, que es la invariante 12 de la skill dominio-regenera.
  insert into user_roles (user_id, role)
  values (new.id, 'buyer')
  on conflict (user_id, role) do nothing;

  return new;
end
$$;

-- `drop ... if exists` antes de crear para que la migración se pueda volver a
-- correr entera sin error. `create or replace trigger` existe en Postgres 14+,
-- pero esto funciona igual en cualquier versión y se lee mejor.
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Rollback
--
--   drop trigger if exists on_auth_user_created on auth.users;
--   drop function if exists handle_new_user();
--
-- Revertir NO borra los perfiles ni los roles ya creados, y así debe ser: son
-- datos de usuarios reales. Lo único que se pierde es la creación automática
-- para los que se registren después.
-- ---------------------------------------------------------------------------
