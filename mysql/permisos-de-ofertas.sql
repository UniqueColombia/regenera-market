-- Quién puede escribir una oferta, en MariaDB — experimento MySQL, etapa 2.
--
-- Traduce cuatro piezas de Postgres:
--   - la política `listings_provider_write` (0001): solo escribe quien
--     gestiona la empresa, o un administrador;
--   - el trigger `listings_proteger_proveedor` (0012, rehecho en la 0014): una
--     empresa no se publica sola, no se destaca, no muda la oferta a otra
--     empresa, y editar algo publicado lo devuelve a revisión;
--   - el trigger `listings_version` (0014);
--   - la exigencia del sello para vender consultoría.
--
-- **MariaDB no tiene RLS.** Para escribir, el trigger hace de política: no
-- filtra la fila en silencio como Postgres, la rechaza con `denegado`. Para
-- leer, el filtro va en las consultas de `src/lib/mysql/ofertas.ts`.
--
-- Quién escribe lo dicen dos variables de sesión que pone `comoUsuario()` de
-- `src/lib/mysql/ofertas.ts`, el equivalente de `auth.uid()`:
--   @app_usuario  el id de la persona (el de Supabase Auth), o NULL;
--   @app_rol      'authenticated', 'anon' (o NULL) o 'servicio'. 'servicio' es
--                 el `postgres` de los scripts: el espejo y las semillas.
-- Sin variables, la base trata a quien escribe como visitante y lo rechaza: un
-- olvido niega, no abre.
--
-- Se aplica **después** de `espejo-catalogo.sql` (que borra `listings`, y con
-- ella sus triggers) y de `cuentas.sql` (las dos tablas de abajo apuntan a
-- `usuarios`, como en Postgres apuntan a `auth.users`). `scripts/mysql/espejo.mts`
-- aplica las tres en orden; las pruebas, `mysql/pruebas/preparar.ts`.

drop table if exists provider_members;
drop table if exists user_roles;

-- Las dos tablas de las que salen `manages_provider()` e `is_admin()`. Solo las
-- columnas que esas funciones leen.
create table provider_members (
  provider_id char(36) character set ascii collate ascii_bin not null,
  user_id     char(36) character set ascii collate ascii_bin not null,
  primary key (provider_id, user_id),
  key miembros_usuario (user_id),
  constraint miembros_proveedor foreign key (provider_id) references providers (id) on delete cascade,
  constraint miembros_usuario foreign key (user_id) references usuarios (id) on delete cascade
) engine = innodb default charset = utf8mb4 collate = utf8mb4_uca1400_ai_ci;

create table user_roles (
  user_id char(36) character set ascii collate ascii_bin not null,
  role    enum('buyer','provider','admin') not null,
  primary key (user_id, role),
  constraint roles_usuario foreign key (user_id) references usuarios (id) on delete cascade
) engine = innodb default charset = utf8mb4 collate = utf8mb4_uca1400_ai_ci;

drop function if exists es_admin;
create function es_admin() returns boolean
  not deterministic reads sql data
  return @app_usuario is not null
     and exists (select 1 from user_roles where user_id = @app_usuario and role = 'admin');

drop function if exists gestiona_proveedor;
create function gestiona_proveedor(_proveedor char(36) character set ascii collate ascii_bin) returns boolean
  not deterministic reads sql data
  return @app_usuario is not null
     and exists (select 1 from provider_members where provider_id = _proveedor and user_id = @app_usuario);

drop trigger if exists listings_proteger_alta;
create trigger listings_proteger_alta before insert on listings for each row
begin
  if coalesce(@app_rol, 'anon') <> 'servicio' and not es_admin() then
    if not gestiona_proveedor(new.provider_id) then
      signal sqlstate '45000' set message_text = 'denegado';
    end if;
    set new.featured = false;
    if new.status not in ('draft', 'pending_review') then
      set new.status = 'pending_review';
    end if;
    if new.category = 'consultoria' and not exists (
      select 1 from providers where id = new.provider_id and sustainability_verified_at is not null
    ) then
      signal sqlstate '45000' set message_text = 'categoria-avanzada';
    end if;
  end if;
end;

drop trigger if exists listings_proteger_cambio;
create trigger listings_proteger_cambio before update on listings for each row
begin
  -- `listings_version`: también para administradores y scripts. La sube la
  -- base y no la aplicación, para que la suba también la compra que descuenta
  -- stock sin pasar por ningún formulario.
  set new.version = old.version + 1;

  if coalesce(@app_rol, 'anon') <> 'servicio' and not es_admin() then
    if not gestiona_proveedor(old.provider_id) then
      signal sqlstate '45000' set message_text = 'denegado';
    end if;
    set new.featured = old.featured;
    set new.provider_id = old.provider_id;

    -- Retirar (a borrador) o pedir revisión sí; publicarse, rechazarse o
    -- suspenderse, no.
    if not (new.status <=> old.status) and new.status not in ('draft', 'pending_review') then
      set new.status = old.status;
    end if;

    -- Editar algo publicado lo devuelve a revisión. Es el `to_jsonb(new) -
    -- array[…]` de Postgres: todas las columnas **menos** status, featured,
    -- stock, version y las dos generadas (en un trigger `before` todavía no
    -- están calculadas). **Una columna nueva en `listings` va aquí**; la
    -- prueba «el trigger compara todas las columnas» falla si falta.
    if old.status = 'approved' and new.status = 'approved' and not (
          new.slug <=> old.slug and new.kind <=> old.kind and new.title <=> old.title
      and new.summary <=> old.summary and new.description <=> old.description
      and new.category <=> old.category and new.verticals <=> old.verticals
      and new.images <=> old.images and new.price_cop <=> old.price_cop
      and new.wholesale_price_cop <=> old.wholesale_price_cop
      and new.wholesale_min_qty <=> old.wholesale_min_qty and new.unit <=> old.unit
      and new.quote_only <=> old.quote_only and new.co2_kg_saved <=> old.co2_kg_saved
      and new.water_liters_saved <=> old.water_liters_saved
      and new.waste_kg_reduced <=> old.waste_kg_reduced
      and new.certifications <=> old.certifications and new.department <=> old.department
      and new.city <=> old.city and new.duration_hours <=> old.duration_hours
      and new.min_people <=> old.min_people and new.max_people <=> old.max_people
      and new.meeting_point <=> old.meeting_point and new.includes <=> old.includes
      and new.delivery_time <=> old.delivery_time and new.scope <=> old.scope
      and new.created_at <=> old.created_at and new.subcategory <=> old.subcategory
      and new.aporte_ambiental <=> old.aporte_ambiental
      and new.consecuencia_ambiental <=> old.consecuencia_ambiental
      and new.huella_co2_kg <=> old.huella_co2_kg and new.despacho <=> old.despacho
      and new.transportadora <=> old.transportadora and new.envio_cop <=> old.envio_cop
      and new.entrega_dias_min <=> old.entrega_dias_min
      and new.entrega_dias_max <=> old.entrega_dias_max
      and new.envio_local_cop <=> old.envio_local_cop
      and new.envio_adicional_cop <=> old.envio_adicional_cop
      and new.peso_kg <=> old.peso_kg and new.largo_cm <=> old.largo_cm
      and new.ancho_cm <=> old.ancho_cm and new.alto_cm <=> old.alto_cm
      and new.id <=> old.id
    ) then
      set new.status = 'pending_review';
    end if;

    if new.category = 'consultoria' and not exists (
      select 1 from providers where id = new.provider_id and sustainability_verified_at is not null
    ) then
      signal sqlstate '45000' set message_text = 'categoria-avanzada';
    end if;
  end if;
end;
