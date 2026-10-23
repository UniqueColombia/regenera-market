-- Las funciones, los triggers y las vistas de Postgres, traducidos a mano a
-- MariaDB. Va después de `cuentas.sql` y `esquema.sql`.
--
-- Cada bloque dice de qué función o trigger de producción sale (el nombre es
-- el mismo cuando se pudo). La referencia es la definición viva de Postgres, no
-- las migraciones: lo que se tradujo es lo que corre hoy.
--
-- ## Cómo se imita lo que Postgres hace solo
--
-- **Quién pide.** `auth.uid()` y `auth.role()` salen del JWT en Supabase. Aquí
-- salen de variables de sesión que pone la capa compatible
-- (`src/lib/mysql/postgrest/`) al empezar cada petición:
--   @app_usuario  el id de la persona, o NULL
--   @app_rol      'anon', 'authenticated', 'service_role', o NULL (scripts)
--
-- **`current_user`.** Varios triggers de Postgres preguntan
-- `current_user in ('anon', 'authenticated')`: «¿esto lo pidió un cliente, o
-- viene de una función `security definer`, de la llave de servicio o de un
-- script?». Aquí es `es_cliente()`, y el «modo definidor» es @app_definer: lo
-- suben las funciones de la app que en Postgres son `security definer`
-- (`src/lib/mysql/postgrest/rpc.ts`) y los triggers que escriben en otras
-- tablas, y lo bajan al terminar. Un contador y no un sí/no, porque se anidan.
--
-- **`pg_advisory_xact_lock`.** No existe. Lo hace `candado()`: una fila de la
-- tabla `candados` tomada con `for update`, que se suelta sola al terminar la
-- transacción, igual que el de Postgres.
--
-- **El `hint` de un `raise exception`.** MariaDB no lo tiene. Antes del
-- `signal`, el texto va a @app_pista, y la capa lo devuelve como `error.hint`
-- (lo usa la cesta: «sin stock de <producto>»).
--
-- ## Lo que MariaDB no deja y cómo se resolvió
--
-- - **Un trigger no puede escribir en su propia tabla** (error 1442). En
--   Postgres, los puntos por «perfil completo» los da un trigger `after` de
--   `providers` que actualiza `providers`. Aquí se suman en el `before` (sección
--   providers).
-- - **Un borrado en cascada no dispara triggers.** En Postgres, sí. Lo único que
--   dependía de eso es `user_roles_ultimo_admin` al borrar una cuenta, y la baja
--   (`preparar_baja_de_cuenta`) ya rechaza a los administradores.
-- - **Las columnas generadas no llaman funciones.** `clave_tributaria` la
--   mantiene el trigger de `providers`.
-- - **Un CHECK no recorre arreglos.** `providers_giros_validos` va en el trigger.

-- ---------------------------------------------------------------------------
-- Candados (pg_advisory_xact_lock)
-- ---------------------------------------------------------------------------

drop table if exists candados;
create table candados (
  nombre varchar(200) collate utf8mb4_bin not null primary key
) engine = innodb default charset = utf8mb4;

drop procedure if exists candado;
create procedure candado(_nombre varchar(200))
  modifies sql data
begin
  declare _x int;
  insert into candados (nombre) values (_nombre) on duplicate key update nombre = nombre;
  -- count(*) y no `select nombre into`: un `into` sin filas lanza «not found», que
  -- sube hasta el trigger que llamó y le corta el bucle en silencio.
  select count(*) into _x from candados where nombre = _nombre for update;
end;

-- ---------------------------------------------------------------------------
-- Identidad: auth.uid(), auth.role(), current_user y los roles
-- ---------------------------------------------------------------------------

drop function if exists auth_uid;
create function auth_uid() returns char(36) character set ascii collate ascii_bin
  not deterministic no sql
  return @app_usuario;

drop function if exists auth_role;
create function auth_role() returns varchar(32)
  not deterministic no sql
  return @app_rol;

-- `current_user in ('anon', 'authenticated')`.
drop function if exists es_cliente;
create function es_cliente() returns boolean
  not deterministic no sql
  return coalesce(@app_rol, '') in ('anon', 'authenticated') and coalesce(@app_definer, 0) = 0;

drop function if exists has_role;
create function has_role(_usuario char(36) character set ascii collate ascii_bin, _rol varchar(20)) returns boolean
  not deterministic reads sql data
  return _usuario is not null and exists (select 1 from user_roles where user_id = _usuario and role = _rol);

drop function if exists is_admin;
create function is_admin() returns boolean
  not deterministic reads sql data
  return has_role(auth_uid(), 'admin');

drop function if exists manages_provider;
create function manages_provider(_provider_id char(36) character set ascii collate ascii_bin) returns boolean
  not deterministic reads sql data
  return auth_uid() is not null
     and exists (select 1 from provider_members where provider_id = _provider_id and user_id = auth_uid());

drop function if exists manages_order;
create function manages_order(_order_id char(36) character set ascii collate ascii_bin) returns boolean
  not deterministic reads sql data
  return auth_uid() is not null and exists (
    select 1 from order_items oi join provider_members pm on pm.provider_id = oi.provider_id
     where oi.order_id = _order_id and pm.user_id = auth_uid());

drop function if exists manages_quotation;
create function manages_quotation(_quotation_id char(36) character set ascii collate ascii_bin) returns boolean
  not deterministic reads sql data
  return auth_uid() is not null and exists (
    select 1 from quotation_items qi join provider_members pm on pm.provider_id = qi.provider_id
     where qi.quotation_id = _quotation_id and pm.user_id = auth_uid());

drop function if exists owns_order;
create function owns_order(_order_id char(36) character set ascii collate ascii_bin) returns boolean
  not deterministic reads sql data
  return auth_uid() is not null and exists (select 1 from orders where id = _order_id and buyer_id = auth_uid());

drop function if exists owns_quotation;
create function owns_quotation(_quotation_id char(36) character set ascii collate ascii_bin) returns boolean
  not deterministic reads sql data
  return auth_uid() is not null and exists (select 1 from quotations where id = _quotation_id and buyer_id = auth_uid());

-- ---------------------------------------------------------------------------
-- Funciones puras (gemelas de las de Postgres, y algunas de TypeScript)
-- ---------------------------------------------------------------------------

drop function if exists nivel_para_puntos;
create function nivel_para_puntos(_puntos int) returns varchar(20)
  deterministic no sql
  return case when coalesce(_puntos, 0) >= 2500 then 'bosque'
              when coalesce(_puntos, 0) >= 600 then 'raiz'
              else 'semilla' end;

drop function if exists limite_de_giros;
create function limite_de_giros(_tier varchar(20)) returns int
  deterministic no sql
  return case _tier when 'raiz' then 3 when 'bosque' then 8 else 2 end;

-- `lower(unaccent(x))` para lo que usa este esquema (nombres de país,
-- departamentos y slugs). Gemela de `normalize()` de `src/lib/repo.ts`.
drop function if exists sin_tildes;
create function sin_tildes(_texto text) returns text
  deterministic no sql
begin
  declare _s text default lower(_texto);
  if _s is null then return null; end if;
  set _s = replace(replace(replace(replace(replace(replace(_s, 'á', 'a'), 'à', 'a'), 'â', 'a'), 'ä', 'a'), 'ã', 'a'), 'å', 'a');
  set _s = replace(replace(replace(replace(_s, 'é', 'e'), 'è', 'e'), 'ê', 'e'), 'ë', 'e');
  set _s = replace(replace(replace(replace(_s, 'í', 'i'), 'ì', 'i'), 'î', 'i'), 'ï', 'i');
  set _s = replace(replace(replace(replace(replace(_s, 'ó', 'o'), 'ò', 'o'), 'ô', 'o'), 'ö', 'o'), 'õ', 'o');
  set _s = replace(replace(replace(replace(_s, 'ú', 'u'), 'ù', 'u'), 'û', 'u'), 'ü', 'u');
  set _s = replace(replace(replace(replace(_s, 'ñ', 'n'), 'ç', 'c'), 'ý', 'y'), 'ÿ', 'y');
  return _s;
end;

-- El dígito de verificación de un NIT (DIAN): pesos primos sobre los dígitos de derecha a izquierda.
drop function if exists dv_nit;
create function dv_nit(_base varchar(40)) returns int
  deterministic no sql
begin
  declare _i int default 1;
  declare _suma int default 0;
  declare _r int;
  declare _pesos varchar(100) default '3,7,13,17,19,23,29,37,41,43,47,53,59,67,71';
  declare _al_reves varchar(40) default reverse(_base);
  if _base is null then return null; end if;
  while _i <= least(char_length(_base), 15) do
    set _suma = _suma + cast(substr(_al_reves, _i, 1) as signed) * cast(substring_index(substring_index(_pesos, ',', _i), ',', -1) as signed);
    set _i = _i + 1;
  end while;
  set _r = _suma % 11;
  return case when _r in (0, 1) then _r else 11 - _r end;
end;

-- 0022: la identidad tributaria de una empresa, para «un documento, una empresa».
drop function if exists clave_tributaria;
create function clave_tributaria(_pais text, _documento text) returns varchar(255)
  deterministic no sql
begin
  declare _p text default sin_tildes(trim(coalesce(nullif(trim(_pais), ''), 'Colombia')));
  declare _d text default coalesce(_documento, '');
  if _p = 'colombia' then
    set _d = regexp_replace(_d, '-\\s*[0-9]\\s*$', '');
    set _d = regexp_replace(_d, '[^0-9]', '');
    if (char_length(_d) = 10 and left(_d, 1) in ('8', '9') and dv_nit(left(_d, 9)) = cast(right(_d, 1) as signed))
       or (char_length(_d) = 11 and left(_d, 1) = '1' and dv_nit(left(_d, 10)) = cast(right(_d, 1) as signed)) then
      set _d = left(_d, char_length(_d) - 1);
    end if;
  else
    set _d = upper(regexp_replace(_d, '[^0-9A-Za-z]', ''));
  end if;
  if _d = '' then return null; end if;
  return concat(_p, ':', _d);
end;

-- La fecha de hoy en Colombia (UTC-5, sin horario de verano desde 1993).
drop function if exists hoy_en_colombia;
create function hoy_en_colombia() returns date
  not deterministic no sql
  return date(utc_timestamp() - interval 5 hour);

-- `a is not distinct from b` para json: compara el valor, no el texto.
drop function if exists igual_json;
create function igual_json(_a json, _b json) returns boolean
  deterministic no sql
  return (_a is null and _b is null) or (_a is not null and _b is not null and json_equals(_a, _b));

-- ---------------------------------------------------------------------------
-- Puntos de experiencia (otorgar_experiencia, revertir_experiencia)
-- ---------------------------------------------------------------------------

drop function if exists experiencia_topada;
create function experiencia_topada(_provider_id char(36) character set ascii collate ascii_bin, _clave varchar(64), _maximo int, _dias int) returns boolean
  not deterministic reads sql data
  return (select count(*) from experience_events
           where provider_id = _provider_id and clave = _clave
             and (_dias is null or created_at > now(6) - interval _dias day)) >= _maximo;

drop function if exists puntos_de_experiencia;
create function puntos_de_experiencia(_clave varchar(64)) returns int
  deterministic no sql
  return case _clave
    when 'perfil_completo' then 40 when 'oferta_publicada' then 10 when 'primera_venta' then 120
    when 'venta_entregada' then 40 when 'volumen_vendido' then 10 when 'resena_positiva' then 30
    when 'cotizacion_respondida' then 5 when 'evaluacion_aprobada' then 250
    when 'certificacion_verificada' then 80 when 'articulo_publicado' then 10
    when 'articulo_destacado' then 50 else null end;

drop function if exists experiencia_tope_alcanzado;
create function experiencia_tope_alcanzado(_provider_id char(36) character set ascii collate ascii_bin, _clave varchar(64)) returns boolean
  not deterministic reads sql data
  return case _clave
    when 'oferta_publicada' then experiencia_topada(_provider_id, _clave, 5, 30)
    when 'articulo_publicado' then experiencia_topada(_provider_id, _clave, 4, 30)
    when 'cotizacion_respondida' then experiencia_topada(_provider_id, _clave, 10, 30)
    when 'certificacion_verificada' then experiencia_topada(_provider_id, _clave, 3, null)
    else false end;

-- ¿Esta venta o esta reseña le da puntos a la empresa? (auditoría del
-- 2026-10-22). «Nadie se beneficia a sí mismo» miraba solo la cuenta que compra,
-- y una segunda cuenta propia compraba barato, confirmaba y se reseñaba hasta el
-- nivel Raíz. Como la reputación de MercadoLibre (las ventas a un mismo
-- comprador cuentan una vez por periodo) y Amazon (las cuentas nuevas pesan
-- menos), cuentan solo si:
--   - la cuenta compradora tiene al menos 7 días;
--   - su teléfono no es el de la empresa;
--   - ese comprador no le dio ya puntos de la misma clase en 90 días.
-- La venta y la reseña existen igual: lo único que no hacen es sumar puntos.
drop function if exists cuenta_para_puntos;
create function cuenta_para_puntos(
  _provider char(36) character set ascii collate ascii_bin,
  _comprador char(36) character set ascii collate ascii_bin,
  _telefono text,
  _clave varchar(64),
  _referencia varchar(255)
) returns boolean
  not deterministic reads sql data
begin
  declare _creada datetime(6);
  declare _tel varchar(20) default right(regexp_replace(coalesce(_telefono, ''), '[^0-9]', ''), 10);
  if _provider is null or _comprador is null then return false; end if;
  select creado_at into _creada from usuarios where id = _comprador;
  if _creada is null or _creada > now(6) - interval 7 day then return false; end if;
  if _tel <> '' and _tel = (select right(regexp_replace(coalesce(phone, ''), '[^0-9]', ''), 10) from providers where id = _provider) then
    return false;
  end if;
  if _clave = 'venta_entregada' then
    return not exists (
      select 1 from experience_events ee join orders o on o.id = ee.referencia
       where ee.provider_id = _provider and ee.clave = 'venta_entregada' and o.buyer_id = _comprador
         and ee.referencia_clave <> coalesce(_referencia, '') and ee.created_at > now(6) - interval 90 day);
  end if;
  if _clave = 'resena_positiva' then
    return not exists (
      select 1 from experience_events ee join reviews r on r.id = ee.referencia
       where ee.provider_id = _provider and ee.clave = 'resena_positiva' and r.author_id = _comprador
         and ee.referencia_clave <> coalesce(_referencia, '') and ee.created_at > now(6) - interval 90 day);
  end if;
  return true;
end;

drop procedure if exists otorgar_experiencia;
create procedure otorgar_experiencia(_provider_id char(36) character set ascii collate ascii_bin, _clave varchar(64), _referencia varchar(255))
  modifies sql data
proc: begin
  declare _puntos int default puntos_de_experiencia(_clave);
  declare _x int;
  if _provider_id is null then leave proc; end if;
  if _puntos is null then
    signal sqlstate '45000' set message_text = 'otorgar_experiencia: evento desconocido';
  end if;
  select count(*) into _x from providers where id = _provider_id for update;
  if experiencia_tope_alcanzado(_provider_id, _clave) then leave proc; end if;
  if exists (select 1 from experience_events
              where provider_id = _provider_id and clave = _clave and referencia_clave = coalesce(_referencia, '')) then
    leave proc;
  end if;
  insert into experience_events (provider_id, clave, puntos, referencia) values (_provider_id, _clave, _puntos, _referencia);
  set @app_definer = coalesce(@app_definer, 0) + 1;
  update providers set experience_points = experience_points + _puntos where id = _provider_id;
  set @app_definer = @app_definer - 1;
end;

drop procedure if exists revertir_experiencia;
create procedure revertir_experiencia(_provider_id char(36) character set ascii collate ascii_bin, _clave varchar(64), _referencia varchar(255))
  modifies sql data
proc: begin
  declare _puntos int;
  declare _x int;
  if _provider_id is null then leave proc; end if;
  select count(*) into _x from providers where id = _provider_id for update;
  select coalesce(sum(puntos), 0) into _puntos from experience_events
   where provider_id = _provider_id and clave = _clave and referencia_clave = coalesce(_referencia, '');
  delete from experience_events
   where provider_id = _provider_id and clave = _clave and referencia_clave = coalesce(_referencia, '');
  if _puntos > 0 then
    set @app_definer = coalesce(@app_definer, 0) + 1;
    update providers set experience_points = greatest(0, experience_points - _puntos) where id = _provider_id;
    set @app_definer = @app_definer - 1;
  end if;
end;

-- ---------------------------------------------------------------------------
-- Comunidad
-- ---------------------------------------------------------------------------

drop procedure if exists recontar_publicacion;
create procedure recontar_publicacion(_post char(36) character set ascii collate ascii_bin)
  modifies sql data
proc: begin
  declare _por_tipo json;
  declare _total int;
  declare _x int;
  if _post is null then leave proc; end if;
  select count(*) into _x from community_posts where id = _post for update;
  select coalesce(json_objectagg(kind, n), json_object()), coalesce(sum(n), 0) into _por_tipo, _total
    from (select kind, count(*) as n from community_reactions where post_id = _post group by kind) t;
  set @app_derivados = 1;
  set @app_definer = coalesce(@app_definer, 0) + 1;
  update community_posts set reaction_count = _total, reaction_counts = _por_tipo where id = _post;
  set @app_definer = @app_definer - 1;
  set @app_derivados = null;
end;

drop trigger if exists community_posts_antes_de_insertar;
create trigger community_posts_antes_de_insertar before insert on community_posts for each row
begin
  declare _ultima datetime(6);
  declare _hoy int;
  declare _mes int;
  -- community_posts_derivados (INSERT)
  set new.author_name = coalesce(nullif(trim((select full_name from profiles where id = new.author_id)), ''), 'Alguien de la comunidad');
  set new.edited_at = null;
  if not is_admin() then
    -- Lo que decide el equipo o la cuenta de reacciones no lo trae quien publica
    -- (auditoría del 2026-10-22).
    set new.status = 'approved', new.featured = false, new.reaction_count = 0, new.reaction_counts = json_object();
    -- Firmar como empresa exige que el equipo haya verificado su documento: como
    -- las tiendas oficiales de MercadoLibre, nadie habla en nombre de una
    -- empresa que no se comprobó.
    if new.provider_id is not null
       and not exists (select 1 from providers where id = new.provider_id and documento_verificado_at is not null) then
      signal sqlstate '45000' set message_text = 'empresa-sin-verificar';
    end if;
  end if;
  -- community_posts_ritmo
  if not is_admin() then
    call candado(concat('publicar:', new.author_id));
    delete from community_post_log where author_id = new.author_id and created_at < now(6) - interval 30 day;
    select max(created_at) into _ultima from community_post_log where author_id = new.author_id;
    if _ultima is not null and _ultima > now(6) - interval 30 second then
      signal sqlstate '45000' set message_text = 'limite-ritmo';
    end if;
    select count(case when created_at > now(6) - interval 1 day then 1 end),
           count(case when created_at > now(6) - interval 30 day then 1 end)
      into _hoy, _mes from community_post_log where author_id = new.author_id;
    if _hoy >= 3 then signal sqlstate '45000' set message_text = 'limite-diario'; end if;
    if _mes >= 10 then signal sqlstate '45000' set message_text = 'limite-mensual'; end if;
    insert into community_post_log (author_id) values (new.author_id);
  end if;
end;

drop trigger if exists community_posts_antes_de_cambiar;
create trigger community_posts_antes_de_cambiar before update on community_posts for each row
begin
  -- community_posts_derivados (UPDATE). La marca la pone recontar_publicacion().
  if coalesce(@app_derivados, 0) = 0 and not is_admin() then
    set new.status = old.status, new.featured = old.featured,
        new.reaction_count = old.reaction_count, new.reaction_counts = old.reaction_counts,
        new.author_id = old.author_id, new.author_name = old.author_name,
        new.provider_id = old.provider_id, new.created_at = old.created_at;
    if not (new.title <=> old.title and new.body <=> old.body and new.topic <=> old.topic) then
      set new.edited_at = now(6);
    else
      set new.edited_at = old.edited_at;
    end if;
  end if;
end;

drop trigger if exists community_posts_despues_de_insertar;
create trigger community_posts_despues_de_insertar after insert on community_posts for each row
begin
  -- community_posts_experiencia (INSERT)
  if new.provider_id is not null and new.status = 'approved' then
    call otorgar_experiencia(new.provider_id, 'articulo_publicado', new.id);
  end if;
end;

drop trigger if exists community_posts_despues_de_cambiar;
create trigger community_posts_despues_de_cambiar after update on community_posts for each row
proc: begin
  -- community_posts_experiencia (UPDATE)
  if new.provider_id is not null and old.status = 'approved' and new.status <> 'approved' then
    call revertir_experiencia(new.provider_id, 'articulo_publicado', new.id);
    call revertir_experiencia(new.provider_id, 'articulo_destacado', new.id);
    leave proc;
  end if;
  if new.provider_id is not null and new.status = 'approved' and old.status <> 'approved' then
    call otorgar_experiencia(new.provider_id, 'articulo_publicado', new.id);
  end if;
  if new.provider_id is not null and new.status = 'approved' and new.featured and not old.featured then
    call otorgar_experiencia(new.provider_id, 'articulo_destacado', new.id);
  end if;
end;

drop trigger if exists community_posts_antes_de_borrar;
create trigger community_posts_antes_de_borrar before delete on community_posts for each row
begin
  -- community_posts_revertir_experiencia
  declare _puntos int;
  if old.provider_id is not null then
    select coalesce(sum(puntos), 0) into _puntos from experience_events
     where provider_id = old.provider_id and referencia = old.id and clave in ('articulo_publicado', 'articulo_destacado');
    delete from experience_events
     where provider_id = old.provider_id and referencia = old.id and clave in ('articulo_publicado', 'articulo_destacado');
    if _puntos > 0 then
      set @app_definer = coalesce(@app_definer, 0) + 1;
      update providers set experience_points = greatest(0, experience_points - _puntos) where id = old.provider_id;
      set @app_definer = @app_definer - 1;
    end if;
  end if;
end;

drop trigger if exists community_reactions_antes_de_insertar;
create trigger community_reactions_antes_de_insertar before insert on community_reactions for each row
begin
  -- community_reactions_ritmo
  call candado(concat('reaccionar:', new.user_id));
  if (select count(*) from community_reactions where user_id = new.user_id and created_at > now(6) - interval 1 hour) >= 60 then
    signal sqlstate '45000' set message_text = 'limite-reacciones';
  end if;
end;

drop trigger if exists community_reactions_despues_de_insertar;
create trigger community_reactions_despues_de_insertar after insert on community_reactions for each row
  call recontar_publicacion(new.post_id);

drop trigger if exists community_reactions_despues_de_cambiar;
create trigger community_reactions_despues_de_cambiar after update on community_reactions for each row
begin
  if not (new.kind <=> old.kind) then call recontar_publicacion(new.post_id); end if;
end;

drop trigger if exists community_reactions_despues_de_borrar;
create trigger community_reactions_despues_de_borrar after delete on community_reactions for each row
  call recontar_publicacion(old.post_id);

-- ---------------------------------------------------------------------------
-- Ofertas (listings)
-- ---------------------------------------------------------------------------

drop trigger if exists listings_antes_de_insertar;
create trigger listings_antes_de_insertar before insert on listings for each row
begin
  -- listings_proteger_proveedor (INSERT)
  if es_cliente() and not is_admin() then
    set new.featured = false;
    if new.status not in ('draft', 'pending_review') then set new.status = 'pending_review'; end if;
    if new.category = 'consultoria' and not exists (
      select 1 from providers where id = new.provider_id and sustainability_verified_at is not null) then
      set @app_pista = 'Consultoría e implementación exige la evaluación verificada por Seregenera.';
      signal sqlstate '45000' set message_text = 'categoria-avanzada';
    end if;
  end if;
end;

drop trigger if exists listings_antes_de_cambiar;
create trigger listings_antes_de_cambiar before update on listings for each row
begin
  -- listings_proteger_proveedor (UPDATE), que en Postgres corre antes que
  -- listings_version (orden alfabético).
  if es_cliente() and not is_admin() then
    set new.featured = old.featured;
    set new.provider_id = old.provider_id;
    if not (new.status <=> old.status) and new.status not in ('draft', 'pending_review') then
      set new.status = old.status;
    end if;
    -- El `to_jsonb(new) - array[…]` de Postgres: todo menos status, featured,
    -- stock, version y las dos generadas. **Una columna nueva va aquí** (la
    -- prueba «el trigger compara todas las columnas» falla si falta).
    if old.status = 'approved' and new.status = 'approved' and not (
          new.id <=> old.id and new.slug <=> old.slug and new.provider_id <=> old.provider_id
      and new.kind <=> old.kind and new.title <=> old.title and new.summary <=> old.summary
      and new.description <=> old.description and new.category <=> old.category
      and igual_json(new.verticals, old.verticals) and igual_json(new.images, old.images)
      and new.price_cop <=> old.price_cop and new.wholesale_price_cop <=> old.wholesale_price_cop
      and new.wholesale_min_qty <=> old.wholesale_min_qty and new.unit <=> old.unit
      and new.quote_only <=> old.quote_only and new.co2_kg_saved <=> old.co2_kg_saved
      and new.water_liters_saved <=> old.water_liters_saved and new.waste_kg_reduced <=> old.waste_kg_reduced
      and igual_json(new.certifications, old.certifications) and new.department <=> old.department
      and new.city <=> old.city and new.duration_hours <=> old.duration_hours
      and new.min_people <=> old.min_people and new.max_people <=> old.max_people
      and new.meeting_point <=> old.meeting_point and igual_json(new.includes, old.includes)
      and new.delivery_time <=> old.delivery_time and igual_json(new.scope, old.scope)
      and new.created_at <=> old.created_at and new.subcategory <=> old.subcategory
      and new.aporte_ambiental <=> old.aporte_ambiental and new.consecuencia_ambiental <=> old.consecuencia_ambiental
      and new.huella_co2_kg <=> old.huella_co2_kg and new.despacho <=> old.despacho
      and new.transportadora <=> old.transportadora and new.envio_cop <=> old.envio_cop
      and new.entrega_dias_min <=> old.entrega_dias_min and new.entrega_dias_max <=> old.entrega_dias_max
      and new.envio_local_cop <=> old.envio_local_cop and new.envio_adicional_cop <=> old.envio_adicional_cop
      and new.peso_kg <=> old.peso_kg and new.largo_cm <=> old.largo_cm
      and new.ancho_cm <=> old.ancho_cm and new.alto_cm <=> old.alto_cm
    ) then
      set new.status = 'pending_review';
    end if;
    if new.category = 'consultoria' and not exists (
      select 1 from providers where id = new.provider_id and sustainability_verified_at is not null) then
      set @app_pista = 'Consultoría e implementación exige la evaluación verificada por Seregenera.';
      signal sqlstate '45000' set message_text = 'categoria-avanzada';
    end if;
  end if;
  -- listings_version: para todos, también la compra que descuenta stock.
  set new.version = old.version + 1;
end;

drop trigger if exists listings_despues_de_insertar;
create trigger listings_despues_de_insertar after insert on listings for each row
begin
  -- listings_experiencia (INSERT)
  if new.status = 'approved' then call otorgar_experiencia(new.provider_id, 'oferta_publicada', new.id); end if;
end;

drop trigger if exists listings_despues_de_cambiar;
create trigger listings_despues_de_cambiar after update on listings for each row
begin
  -- listings_experiencia (UPDATE OF status)
  if new.status = 'approved' and not (old.status <=> 'approved') then
    call otorgar_experiencia(new.provider_id, 'oferta_publicada', new.id);
  end if;
end;

-- ---------------------------------------------------------------------------
-- Pedidos (orders)
-- ---------------------------------------------------------------------------

drop trigger if exists orders_antes_de_cambiar;
create trigger orders_antes_de_cambiar before update on orders for each row
begin
  -- orders_transicion
  if not (new.status <=> old.status) and not (
       (old.status = 'pending_payment' and new.status in ('paid', 'cancelled'))
    or (old.status = 'paid' and new.status in ('in_progress', 'fulfilled', 'refunded'))
    or (old.status = 'in_progress' and new.status in ('fulfilled', 'refunded'))
    or (old.status = 'fulfilled' and new.status = 'refunded')
    or (old.status = 'cancelled' and new.status = 'pending_payment')
  ) then
    set @app_pista = concat(old.status, ' → ', new.status);
    signal sqlstate '45000' set message_text = 'transicion-invalida';
  end if;
end;

drop trigger if exists orders_despues_de_cambiar;
create trigger orders_despues_de_cambiar after update on orders for each row
begin
  declare _fin boolean default false;
  declare _proveedor char(36) character set ascii collate ascii_bin;
  declare _vendido bigint;
  declare _i int;
  declare _ref varchar(255);
  declare _item char(36) character set ascii collate ascii_bin;
  declare _oferta char(36) character set ascii collate ascii_bin;
  declare _qty int;
  declare _fecha date;
  declare _envio text;
  declare _stock_desc boolean;
  declare _cupo_desc boolean;
  declare _titulo text;
  declare _stock int;
  declare _n int;
  declare cur_vendido cursor for
    select provider_id, sum(unit_price_cop * qty) from order_items where order_id = new.id group by provider_id order by provider_id;
  declare cur_proveedores cursor for
    select distinct provider_id from order_items where order_id = new.id and provider_id is not null order by provider_id;
  declare cur_volumen cursor for
    select referencia from experience_events
     where provider_id = _proveedor and clave = 'volumen_vendido' and referencia like concat(new.id, '#%');
  declare cur_liberar cursor for
    select id, listing_id, qty, date, envio_estado, stock_descontado, cupo_descontado
      from order_items where order_id = new.id order by listing_id, date for update;
  declare cur_reservar cursor for
    select oi.id, oi.listing_id, oi.qty, oi.date, oi.title_snapshot, oi.stock_descontado, oi.cupo_descontado, l.stock
      from order_items oi left join listings l on l.id = oi.listing_id
     where oi.order_id = new.id order by oi.listing_id, oi.date for update;
  declare continue handler for not found set _fin = true;

  if not (new.status <=> old.status) then
    set @app_definer = coalesce(@app_definer, 0) + 1;

    -- orders_experiencia (corre antes que orders_liberar_reservas: orden alfabético)
    if new.status = 'fulfilled' and not (old.status <=> 'fulfilled') then
      set _fin = false;
      open cur_vendido;
      bucle: loop
        fetch cur_vendido into _proveedor, _vendido;
        if _fin then leave bucle; end if;
        -- Solo un comprador que cuenta (`cuenta_para_puntos`, 2026-10-22).
        if cuenta_para_puntos(_proveedor, new.buyer_id, new.buyer_phone, 'venta_entregada', new.id) then
          call otorgar_experiencia(_proveedor, 'venta_entregada', new.id);
          call otorgar_experiencia(_proveedor, 'primera_venta', null);
          set _i = 1;
          while _i <= least(floor(_vendido / 500000), 50) do
            call otorgar_experiencia(_proveedor, 'volumen_vendido', concat(new.id, '#', _i));
            set _i = _i + 1;
          end while;
        end if;
      end loop;
      close cur_vendido;
    elseif new.status = 'refunded' and not (old.status <=> 'refunded') then
      update reviews set oculta = true
       where not oculta and order_item_id in (select id from order_items where order_id = new.id);
      set _fin = false;
      open cur_proveedores;
      bucle2: loop
        fetch cur_proveedores into _proveedor;
        if _fin then leave bucle2; end if;
        call revertir_experiencia(_proveedor, 'venta_entregada', new.id);
        begin
          declare _fin2 boolean default false;
          declare continue handler for not found set _fin2 = true;
          open cur_volumen;
          bucle3: loop
            fetch cur_volumen into _ref;
            if _fin2 then leave bucle3; end if;
            call revertir_experiencia(_proveedor, 'volumen_vendido', _ref);
          end loop;
          close cur_volumen;
        end;
        if not exists (
          select 1 from order_items oi join orders o on o.id = oi.order_id
           where oi.provider_id = _proveedor and o.id <> new.id and o.status = 'fulfilled') then
          call revertir_experiencia(_proveedor, 'primera_venta', null);
        end if;
        set _fin = false;
      end loop;
      close cur_proveedores;
    end if;

    -- orders_liberar_reservas
    if new.status in ('cancelled', 'refunded') and old.status not in ('cancelled', 'refunded') then
      set _fin = false;
      open cur_liberar;
      bucle4: loop
        fetch cur_liberar into _item, _oferta, _qty, _fecha, _envio, _stock_desc, _cupo_desc;
        if _fin then leave bucle4; end if;
        if _stock_desc and coalesce(_envio, 'pendiente') = 'pendiente' then
          update listings set stock = stock + _qty where id = _oferta and stock is not null;
          update order_items set stock_descontado = false where id = _item;
        end if;
        if _cupo_desc and _fecha >= hoy_en_colombia() then
          update listing_availability set slots_taken = greatest(slots_taken - _qty, 0)
           where listing_id = _oferta and `date` = _fecha;
          update order_items set cupo_descontado = false where id = _item;
        end if;
      end loop;
      close cur_liberar;
    elseif old.status = 'cancelled' and new.status = 'pending_payment' then
      set _fin = false;
      open cur_reservar;
      bucle5: loop
        fetch cur_reservar into _item, _oferta, _qty, _fecha, _titulo, _stock_desc, _cupo_desc, _stock;
        if _fin then leave bucle5; end if;
        if _oferta is not null then
          if not _stock_desc and _stock is not null then
            update listings set stock = stock - _qty where id = _oferta and stock >= _qty;
            if row_count() = 0 then
              set @app_pista = _titulo;
              signal sqlstate '45000' set message_text = 'sin-stock';
            end if;
            update order_items set stock_descontado = true where id = _item;
          end if;
          if not _cupo_desc and _fecha is not null
             and exists (select 1 from listing_availability where listing_id = _oferta and `date` = _fecha) then
            update listing_availability set slots_taken = slots_taken + _qty
             where listing_id = _oferta and `date` = _fecha and slots_taken + _qty <= slots_total;
            if row_count() = 0 then
              set @app_pista = _titulo;
              signal sqlstate '45000' set message_text = 'sin-cupo';
            end if;
            update order_items set cupo_descontado = true where id = _item;
          end if;
        end if;
      end loop;
      close cur_reservar;
    end if;

    set @app_definer = @app_definer - 1;
  end if;
end;

-- ---------------------------------------------------------------------------
-- Prospectos
-- ---------------------------------------------------------------------------

drop trigger if exists prospectos_antes_de_cambiar;
create trigger prospectos_antes_de_cambiar before update on prospectos for each row
begin
  -- prospectos_tocar
  set new.updated_at = now(6);
  if old.baja_at is not null then set new.baja_at = old.baja_at; end if;
end;

-- ---------------------------------------------------------------------------
-- Certificaciones de una empresa
-- ---------------------------------------------------------------------------

drop trigger if exists provider_certifications_antes_de_insertar;
create trigger provider_certifications_antes_de_insertar before insert on provider_certifications for each row
begin
  -- provider_certs_proteger (INSERT)
  if es_cliente() and not is_admin() then set new.verified_at = null, new.verified_by = null; end if;
end;

drop trigger if exists provider_certifications_antes_de_cambiar;
create trigger provider_certifications_antes_de_cambiar before update on provider_certifications for each row
begin
  -- provider_certs_proteger (UPDATE)
  if es_cliente() and not is_admin() then set new.verified_at = old.verified_at, new.verified_by = old.verified_by; end if;
end;

drop trigger if exists provider_certifications_despues_de_cambiar;
create trigger provider_certifications_despues_de_cambiar after update on provider_certifications for each row
begin
  -- provider_certs_experiencia
  if new.verified_at is not null and old.verified_at is null then
    call otorgar_experiencia(new.provider_id, 'certificacion_verificada', new.id);
  end if;
end;

-- ---------------------------------------------------------------------------
-- Empresas (providers)
-- ---------------------------------------------------------------------------

drop function if exists perfil_completo;
create function perfil_completo(_logo text, _tagline text, _descripcion text, _telefono text, _correo text) returns boolean
  deterministic no sql
  return coalesce(nullif(trim(_logo), ''), '') <> '' and char_length(trim(_tagline)) >= 10
     and char_length(trim(_descripcion)) >= 120 and coalesce(nullif(trim(_telefono), ''), '') <> ''
     and coalesce(nullif(trim(_correo), ''), '') <> '';

drop procedure if exists validar_giros;
create procedure validar_giros(_giros json)
  no sql
begin
  -- providers_giros_validos: el CHECK `giros <@ array[…]` de Postgres.
  if exists (select 1 from json_table(_giros, '$[*]' columns (g varchar(60) path '$')) t
              where g not in ('alojamiento', 'restaurante', 'transporte', 'tours', 'turismo', 'productos', 'servicios', 'consultoria')) then
    signal sqlstate '23000' set mysql_errno = 4025, message_text = 'CONSTRAINT `providers_giros_validos` failed for `providers`';
  end if;
end;

drop trigger if exists providers_antes_de_insertar;
create trigger providers_antes_de_insertar before insert on providers for each row
begin
  call validar_giros(new.giros);
  set new.clave_tributaria = clave_tributaria(new.country, new.tax_id);
  -- Lo que certifica la plataforma no lo trae quien crea la empresa (auditoría
  -- del 2026-10-22): al insertar no se pisaba, solo al actualizar.
  if es_cliente() and not is_admin() then
    set new.experience_points = 0, new.sustainability_score = 0,
        new.sustainability_verified_at = null, new.documento_verificado_at = null;
  end if;
  -- providers_limitar_giros (INSERT): nivel semilla, sin sello.
  if es_cliente() and not is_admin() then
    if json_length(new.giros) > limite_de_giros('semilla') then
      set @app_pista = concat('Con nivel semilla caben ', limite_de_giros('semilla'), ' giros.');
      signal sqlstate '45000' set message_text = 'giros-limite';
    end if;
    if json_contains(new.giros, '"consultoria"') then
      set @app_pista = 'La consultoría exige la evaluación verificada por Seregenera.';
      signal sqlstate '45000' set message_text = 'giros-verificacion';
    end if;
  end if;
  -- providers_perfil_completo (el `after insert` de Postgres): los puntos aquí;
  -- el evento, en el `after` de abajo, cuando la fila ya existe.
  if perfil_completo(new.logo_url, new.tagline, new.description, new.phone, new.email) then
    set new.experience_points = new.experience_points + puntos_de_experiencia('perfil_completo');
  end if;
  -- providers_tier_por_experiencia
  set new.tier = nivel_para_puntos(new.experience_points);
end;

drop trigger if exists providers_despues_de_insertar;
create trigger providers_despues_de_insertar after insert on providers for each row
begin
  if perfil_completo(new.logo_url, new.tagline, new.description, new.phone, new.email) then
    insert into experience_events (provider_id, clave, puntos, referencia)
    values (new.id, 'perfil_completo', puntos_de_experiencia('perfil_completo'), null);
  end if;
end;

drop trigger if exists providers_antes_de_cambiar;
create trigger providers_antes_de_cambiar before update on providers for each row
begin
  -- En el orden alfabético de Postgres: cerrada_no_se_aprueba, limitar_giros,
  -- perfil_completo (que allá es `after`), proteger_derivados, tier_por_experiencia.
  if old.cerrada_at is not null and new.cerrada_at is not null
     and new.status = 'approved' and not (old.status <=> 'approved') then
    set @app_pista = 'La cerró su dueña. Vuelve al catálogo cuando se da de alta otra vez con su documento.';
    signal sqlstate '45000' set message_text = 'empresa-cerrada';
  end if;

  call validar_giros(new.giros);
  if es_cliente() and not is_admin() and not igual_json(new.giros, old.giros) then
    -- Del valor viejo: en el mismo update alguien podría mandar tier = 'bosque'.
    if json_length(new.giros) > limite_de_giros(old.tier) then
      set @app_pista = concat('Con nivel ', old.tier, ' caben ', limite_de_giros(old.tier), ' giros.');
      signal sqlstate '45000' set message_text = 'giros-limite';
    end if;
    if json_contains(new.giros, '"consultoria"') and old.sustainability_verified_at is null then
      set @app_pista = 'La consultoría exige la evaluación verificada por Seregenera.';
      signal sqlstate '45000' set message_text = 'giros-verificacion';
    end if;
  end if;

  if es_cliente() and not is_admin() then
    -- providers_proteger_derivados
    set new.experience_points = old.experience_points, new.tier = old.tier,
        new.sustainability_score = old.sustainability_score,
        new.sustainability_verified_at = old.sustainability_verified_at,
        new.documento_verificado_at = old.documento_verificado_at,
        new.status = old.status, new.slug = old.slug;
  end if;
  -- Otro documento ya no es el que se verificó (2026-10-22). Salvo que la misma
  -- operación lo verifique: el equipo corrigiendo el NIT y marcándolo a la vez.
  if not (new.tax_id <=> old.tax_id and new.country <=> old.country)
     and new.documento_verificado_at <=> old.documento_verificado_at then
    set new.documento_verificado_at = null;
  end if;

  -- providers_perfil_completo (UPDATE): una sola vez por empresa.
  if perfil_completo(new.logo_url, new.tagline, new.description, new.phone, new.email)
     and not exists (select 1 from experience_events where provider_id = new.id and clave = 'perfil_completo') then
    insert into experience_events (provider_id, clave, puntos, referencia)
    values (new.id, 'perfil_completo', puntos_de_experiencia('perfil_completo'), null);
    set new.experience_points = new.experience_points + puntos_de_experiencia('perfil_completo');
  end if;

  set new.clave_tributaria = clave_tributaria(new.country, new.tax_id);
  -- providers_tier_por_experiencia
  set new.tier = nivel_para_puntos(new.experience_points);
end;

-- ---------------------------------------------------------------------------
-- Reseñas
-- ---------------------------------------------------------------------------

drop trigger if exists reviews_despues_de_insertar;
create trigger reviews_despues_de_insertar after insert on reviews for each row
begin
  -- reviews_experiencia, con `cuenta_para_puntos` (2026-10-22)
  declare _provider char(36) character set ascii collate ascii_bin;
  if new.rating >= 4 then
    select max(provider_id) into _provider from listings where id = new.listing_id;
    if cuenta_para_puntos(_provider, new.author_id,
         (select o.buyer_phone from order_items oi join orders o on o.id = oi.order_id where oi.id = new.order_item_id),
         'resena_positiva', new.id) then
      call otorgar_experiencia(_provider, 'resena_positiva', new.id);
    end if;
  end if;
end;

drop trigger if exists reviews_despues_de_cambiar;
create trigger reviews_despues_de_cambiar after update on reviews for each row
begin
  -- reviews_experiencia_cambio
  declare _provider char(36) character set ascii collate ascii_bin;
  if not (old.oculta <=> new.oculta) or not (old.rating <=> new.rating) then
    select max(provider_id) into _provider from listings where id = new.listing_id;
    if not new.oculta and new.rating >= 4 and not exists (
      select 1 from order_items oi join orders o on o.id = oi.order_id
       where oi.id = new.order_item_id and o.status = 'refunded')
       and cuenta_para_puntos(_provider, new.author_id,
         (select o.buyer_phone from order_items oi join orders o on o.id = oi.order_id where oi.id = new.order_item_id),
         'resena_positiva', new.id) then
      call otorgar_experiencia(_provider, 'resena_positiva', new.id);
    else
      call revertir_experiencia(_provider, 'resena_positiva', new.id);
    end if;
  end if;
end;

-- ---------------------------------------------------------------------------
-- Evaluación de sostenibilidad
-- ---------------------------------------------------------------------------

drop trigger if exists sustainability_assessments_antes_de_insertar;
create trigger sustainability_assessments_antes_de_insertar before insert on sustainability_assessments for each row
begin
  -- assessments_proteger (INSERT)
  if es_cliente() and not is_admin() then
    if new.status not in ('draft', 'pending_review') then signal sqlstate '45000' set message_text = 'solo-el-equipo-aprueba'; end if;
    set new.reviewed_by = null, new.reviewed_at = null, new.reviewer_notes = null;
  end if;
end;

drop trigger if exists sustainability_assessments_antes_de_cambiar;
create trigger sustainability_assessments_antes_de_cambiar before update on sustainability_assessments for each row
begin
  -- assessments_proteger (UPDATE)
  if es_cliente() and not is_admin() then
    if new.status not in ('draft', 'pending_review') then signal sqlstate '45000' set message_text = 'solo-el-equipo-aprueba'; end if;
    set new.reviewed_by = null, new.reviewed_at = null, new.reviewer_notes = old.reviewer_notes;
  end if;
end;

drop procedure if exists sincronizar_puntaje;
create procedure sincronizar_puntaje(_provider char(36) character set ascii collate ascii_bin, _puntaje int)
  modifies sql data
begin
  -- sync_provider_score: solo un script (sin rol) o un administrador.
  if auth_role() is null or is_admin() then
    set @app_definer = coalesce(@app_definer, 0) + 1;
    update providers
       set sustainability_score = _puntaje,
           sustainability_verified_at = coalesce(sustainability_verified_at, now(6))
     where id = _provider;
    set @app_definer = @app_definer - 1;
    call otorgar_experiencia(_provider, 'evaluacion_aprobada', null);
  end if;
end;

drop trigger if exists sustainability_assessments_despues_de_insertar;
create trigger sustainability_assessments_despues_de_insertar after insert on sustainability_assessments for each row
begin
  if new.status = 'approved' then call sincronizar_puntaje(new.provider_id, new.score); end if;
end;

drop trigger if exists sustainability_assessments_despues_de_cambiar;
create trigger sustainability_assessments_despues_de_cambiar after update on sustainability_assessments for each row
begin
  -- En Postgres, `after update of status`: también cuando el equipo vuelve a guardar una aprobada con otra nota.
  if new.status = 'approved' and (not (old.status <=> new.status) or not (old.score <=> new.score)) then
    call sincronizar_puntaje(new.provider_id, new.score);
  end if;
end;

-- ---------------------------------------------------------------------------
-- Roles y cuentas
-- ---------------------------------------------------------------------------

drop trigger if exists user_roles_antes_de_borrar;
create trigger user_roles_antes_de_borrar before delete on user_roles for each row
begin
  -- user_roles_ultimo_admin
  if old.role = 'admin' then
    call candado('user_roles:admin');
    if not exists (select 1 from user_roles where role = 'admin' and user_id <> old.user_id) then
      signal sqlstate '45000' set message_text = 'ultimo-admin';
    end if;
  end if;
end;

-- handle_new_user: el trigger de `auth.users`, sobre `usuarios`.
drop trigger if exists usuarios_despues_de_insertar;
create trigger usuarios_despues_de_insertar after insert on usuarios for each row
begin
  insert into profiles (id, full_name, phone)
  values (new.id, coalesce(json_value(new.metadatos, '$.full_name'), ''), nullif(json_value(new.metadatos, '$.phone'), ''))
  on duplicate key update id = id;
  insert into user_roles (user_id, role) values (new.id, 'buyer') on duplicate key update role = role;
end;

-- ---------------------------------------------------------------------------
-- Vistas (todas `security_invoker` en Postgres)
-- ---------------------------------------------------------------------------
--
-- MariaDB no aplica RLS a una vista. `listings_publicos` y
-- `calificaciones_oferta` no lo necesitan: filtran a lo que cualquiera puede
-- ver. `calificaciones_proveedor` cruza `listings` sin filtrar, así que lleva
-- dentro la política `listings_public_read`.

create or replace view listings_publicos as
select l.id, l.slug, l.provider_id, l.kind, l.title, l.summary, l.description, l.category, l.verticals,
       l.images, l.price_cop, l.wholesale_price_cop, l.wholesale_min_qty, l.unit, l.quote_only, l.stock,
       l.co2_kg_saved, l.water_liters_saved, l.waste_kg_reduced, l.certifications, l.department, l.city,
       l.status, l.featured, l.duration_hours, l.min_people, l.max_people, l.meeting_point, l.includes,
       l.delivery_time, l.scope, l.created_at, l.busqueda, l.impacto, l.subcategory, l.aporte_ambiental,
       l.consecuencia_ambiental, l.huella_co2_kg, l.despacho, l.transportadora, l.envio_cop,
       l.entrega_dias_min, l.entrega_dias_max, l.version, l.envio_local_cop, l.envio_adicional_cop,
       l.peso_kg, l.largo_cm, l.ancho_cm, l.alto_cm,
       p.slug as provider_slug, p.name as provider_name, p.sustainability_score as provider_score,
       p.tier as provider_tier, p.busqueda as provider_busqueda
  from listings l join providers p on p.id = l.provider_id
 where l.status = 'approved' and p.status = 'approved';

create or replace view calificaciones_oferta as
select listing_id, round(avg(rating), 1) as promedio, cast(count(*) as signed) as cantidad
  from reviews where not oculta group by listing_id;

create or replace view calificaciones_proveedor as
select l.provider_id, round(avg(r.rating), 1) as promedio, cast(count(*) as signed) as cantidad
  from reviews r join listings l on l.id = r.listing_id
 where not r.oculta
   and ((l.status = 'approved' and exists (select 1 from providers p where p.id = l.provider_id and p.status = 'approved'))
        or manages_provider(l.provider_id) or is_admin())
 group by l.provider_id;
