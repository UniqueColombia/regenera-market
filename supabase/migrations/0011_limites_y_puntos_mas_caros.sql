-- ---------------------------------------------------------------------------
-- 0011 — Límites de uso en la Comunidad, y puntos de experiencia más caros
--
-- ## Por qué las dos cosas en la misma migración
--
-- Porque son el mismo problema visto dos veces. Publicar en la Comunidad no
-- tenía freno de ninguna clase **y** daba 30 puntos cada vez, sin tope: nueve
-- publicaciones —una tarde— sumaban 270, y con el perfil completo y diez ofertas
-- se llegaba a Raíz sin haberle vendido nada a nadie. Raíz es dos puntos menos
-- de comisión, o sea que el agujero no era de reputación: era de dinero.
--
-- La 0007 ya lo dejó anotado («el tope de articulo_publicado va en
-- otorgar_experiencia(), el día que alguien lo intente») y `docs/ESTADO.md` lo
-- arrastraba en la lista de lo que dejó abierto la Comunidad. Esta migración lo
-- cierra por los dos lados: **cuántas veces puedes hacerlo** y **cuánto vale
-- cada vez**.
--
-- ## Qué cambia
--
-- 1. **Ritmo de publicación** (`community_posts`): 30 segundos entre una y la
--    siguiente, 3 al día y 10 al mes por autor.
-- 2. **Ritmo de reacciones** (`community_reactions`): 60 por hora y persona.
-- 3. **Los puntos bajan y aparecen topes** donde no los había.
--
-- ## Lo que NO cambia, y conviene saberlo antes de aplicarla
--
-- **Los puntos ya otorgados no se recalculan.** `experience_events` es el
-- registro de lo que pasó, y reescribirlo sería mentir sobre el pasado: quien
-- ganó 30 puntos por una publicación de agosto los ganó. Lo único que cambia es
-- lo que vale un evento **a partir de ahora**. Consecuencia práctica: ningún
-- proveedor baja de nivel con esta migración, y los que ya están en Raíz se
-- quedan ahí.
--
-- **Los umbrales siguen donde estaban** (Raíz 600, Bosque 2.500). Subirlos haría
-- caer de nivel a quien ya lo tiene, que es una conversación que no queremos
-- tener con un proveedor. Lo que se encarece es ganar los puntos, no el precio
-- del nivel.
--
-- ## Orden respecto al despliegue
--
-- **Da igual, antes o después.** No toca ninguna tabla, columna ni política: son
-- dos triggers nuevos y dos funciones reemplazadas. El código que se despliega
-- con ella solo cambia textos y mensajes de error, y sin la migración esos
-- mensajes simplemente no llegan a aparecer.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0011_limites_y_puntos_mas_caros.sql
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Cuánto se puede publicar en la Comunidad
--
-- ## Por qué en la base y no en la acción de servidor
--
-- Por lo mismo que los `check` de longitud de la 0007: la clave anon es pública
-- por diseño, así que cualquiera puede hablarle a PostgREST directamente sin
-- pasar por `src/app/comunidad/actions.ts`. Un límite que vive en la acción es
-- un límite que se salta con `curl`. El de aquí vale siempre.
--
-- ## Por qué tres ventanas y no una
--
-- Cada una frena algo distinto:
--
-- - **30 segundos** frena al guion que envía en bucle. Nadie escribe 80
--   caracteres con sentido en medio minuto, así que no molesta a una persona.
-- - **3 al día** frena la tarde de inundar el muro. Es el límite que protege a
--   quien lee.
-- - **10 al mes** frena el goteo constante. Es el que protege el puntaje: sin
--   él, tres al día durante un mes son noventa publicaciones.
--
-- ## Qué cuenta y qué no
--
-- Cuenta **todo lo que escribió esa persona**, incluido lo que un administrador
-- suspendió después. Si lo suspendido no contara, publicar basura saldría gratis:
-- se borra y se vuelve a empezar. Y cuenta por autor (`author_id`), no por
-- empresa: la empresa la elige quien publica, y contar por empresa dejaría a
-- alguien con dos empresas publicando el doble.
--
-- **Un administrador no tiene límite.** Es la única excepción, y existe porque
-- moderar a veces es publicar: un aviso, una corrección, una respuesta. Se
-- comprueba con `is_admin()`, que ya es `security definer` desde la 0001.
-- ---------------------------------------------------------------------------

-- El contador recorre «lo de este autor desde tal fecha». Sin este índice es un
-- recorrido de la tabla entera en cada publicación; con él son unas pocas filas.
-- El que existía (`community_posts_author_idx`) es solo por autor y no ordena.
create index if not exists community_posts_autor_fecha_idx
  on community_posts (author_id, created_at desc);

create or replace function community_posts_limites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _ultima timestamptz;
  _hoy int;
  _mes int;
begin
  if is_admin() then
    return new;
  end if;

  select max(created_at) into _ultima
    from community_posts
   where author_id = new.author_id;

  if _ultima is not null and _ultima > now() - interval '30 seconds' then
    raise exception 'limite-ritmo' using errcode = 'P0001';
  end if;

  select
    count(*) filter (where created_at > now() - interval '1 day'),
    count(*) filter (where created_at > now() - interval '30 days')
    into _hoy, _mes
    from community_posts
   where author_id = new.author_id;

  if _hoy >= 3 then
    raise exception 'limite-diario' using errcode = 'P0001';
  end if;

  if _mes >= 10 then
    raise exception 'limite-mensual' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- `before insert`: si va a rebotar, que rebote antes de escribir la fila y antes
-- de que corran los triggers que derivan el nombre del autor y otorgan puntos.
drop trigger if exists community_posts_ritmo on community_posts;
create trigger community_posts_ritmo
  before insert on community_posts
  for each row execute function community_posts_limites();

-- ---------------------------------------------------------------------------
-- 2. Cuántas reacciones por hora
--
-- Una reacción es un `insert` de tres columnas: es lo más barato de automatizar
-- que hay en el sitio, y es lo que mueve el contador que se ve en cada tarjeta.
-- Sesenta por hora es una por minuto sostenida, que nadie alcanza leyendo.
--
-- No hay tope diario a propósito: el daño de las reacciones es el pico, no el
-- acumulado. Quien reaccione a sesenta publicaciones en una hora durante todo un
-- día es alguien que leyó el muro entero, y eso no es un problema.
-- ---------------------------------------------------------------------------

create index if not exists community_reactions_usuario_fecha_idx
  on community_reactions (user_id, created_at desc);

create or replace function community_reactions_limites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    select count(*) from community_reactions
     where user_id = new.user_id
       and created_at > now() - interval '1 hour'
  ) >= 60 then
    raise exception 'limite-reacciones' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists community_reactions_ritmo on community_reactions;
create trigger community_reactions_ritmo
  before insert on community_reactions
  for each row execute function community_reactions_limites();

-- ---------------------------------------------------------------------------
-- 3. Los puntos, más caros
--
-- ## La tabla, antes y después
--
--   clave                      antes   ahora   tope
--   perfil_completo               80      40   una vez
--   oferta_publicada              25      10   5 al mes   (antes 10)
--   primera_venta                150     120   una vez
--   venta_entregada               50      40   —
--   volumen_vendido               10      10   por cada 500.000 (antes 200.000)
--   resena_positiva               40      30   —
--   cotizacion_respondida         15       5   10 al mes  (antes SIN tope)
--   evaluacion_aprobada          300     250   una vez
--   certificacion_verificada     100      80   3 en total
--   articulo_publicado            30      10   4 al mes   (antes SIN tope)
--   articulo_destacado            80      50   —
--
-- ## El criterio, en una frase
--
-- **Lo que se hace solo vale menos; lo que exige que otro te compre vale más.**
-- Publicar, escribir y llenar el perfil son cosas que un proveedor hace sin que
-- nadie participe, así que ahora suman una fracción. Vender, entregar y que te
-- reseñen exigen un comprador de verdad, y por eso son lo único que llega a
-- Bosque en un plazo razonable.
--
-- Cuentas, para que se vea: antes, perfil (80) + diez ofertas (250) + nueve
-- publicaciones (270) = 600 = Raíz, en una tarde y sin vender. Ahora ese mismo
-- esfuerzo, ya topado por mes, da 40 + 50 + 40 = 130.
--
-- `articulo_destacado` se queda sin tope y no es un olvido: lo decide el equipo
-- desde `/admin/comunidad`, así que el tope es que alguien lo pulse.
--
-- ## Los topes no se escriben dos veces
--
-- Los tres son la misma consulta con distinto parámetro, así que se saca a una
-- función auxiliar. El de certificaciones no tiene ventana (es de por vida) y por
-- eso el intervalo es opcional.
-- ---------------------------------------------------------------------------

create or replace function experiencia_topada(
  _provider_id uuid,
  _clave text,
  _maximo int,
  _ventana interval default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select count(*) >= _maximo
    from experience_events
   where provider_id = _provider_id
     and clave = _clave
     and (_ventana is null or created_at > now() - _ventana);
$$;

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
  _topado boolean;
begin
  if _provider_id is null then
    return null;
  end if;

  _puntos := case _clave
    when 'perfil_completo'          then 40
    when 'oferta_publicada'         then 10
    when 'primera_venta'            then 120
    when 'venta_entregada'          then 40
    when 'volumen_vendido'          then 10
    when 'resena_positiva'          then 30
    when 'cotizacion_respondida'    then 5
    when 'evaluacion_aprobada'      then 250
    when 'certificacion_verificada' then 80
    when 'articulo_publicado'       then 10
    when 'articulo_destacado'       then 50
    else null
  end;

  -- Una clave desconocida SÍ lanza: es un error de programación nuestro, no un
  -- caso del dominio, y quedarse callado lo dejaría suelto durante meses.
  if _puntos is null then
    raise exception 'otorgar_experiencia: evento desconocido %', _clave;
  end if;

  -- Topes. Existen para que el puntaje mida oficio y no volumen de ruido. El de
  -- certificaciones es la invariante 15 de `dominio-regenera` llevada a los
  -- puntos: un taller sin plata para certificarse tiene que poder llegar arriba
  -- igual.
  _topado := case _clave
    when 'oferta_publicada'
      then experiencia_topada(_provider_id, _clave, 5, interval '30 days')
    when 'articulo_publicado'
      then experiencia_topada(_provider_id, _clave, 4, interval '30 days')
    when 'cotizacion_respondida'
      then experiencia_topada(_provider_id, _clave, 10, interval '30 days')
    when 'certificacion_verificada'
      then experiencia_topada(_provider_id, _clave, 3)
    else false
  end;

  -- Topar no es un error: el hecho ocurrió (la oferta se publicó, la
  -- publicación está en el muro), lo único que no ocurre es la suma. Devolver el
  -- total intacto es lo que deja que el trigger que llama siga adelante.
  if _topado then
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

-- ---------------------------------------------------------------------------
-- Quién puede llamarlas: nadie de fuera
--
-- Las dos las invocan los triggers, que corren con los permisos del propietario.
-- Ninguna ruta de la aplicación las llama, y no deben poder llamarse: darse
-- experiencia a uno mismo es bajarse la comisión, o sea dinero.
--
-- **`from public` no basta por sí solo, y esto se comprobó revisando.** Postgres
-- concede `execute` a `public` por defecto al crear una función, y eso es lo que
-- ese `revoke` quita. Pero si el proyecto tuviera además una concesión
-- *explícita* a `anon` o a `authenticated` —Supabase trae plantillas de
-- `alter default privileges` que la ponen—, quitarla de `public` la dejaría
-- intacta y cualquiera con una cuenta podría llamarlas contra PostgREST.
-- Nombrar los dos roles cuesta cuatro líneas y cierra el caso sin tener que
-- averiguar en qué estado quedó la base.
--
-- Va en un `do` porque `anon` y `authenticated` son roles de Supabase: en un
-- Postgres pelado —el de alguien que aplique esto en local— no existen, y un
-- `revoke` sobre un rol inexistente aborta la migración entera.
-- ---------------------------------------------------------------------------

revoke all on function otorgar_experiencia(uuid, text, text) from public;
revoke all on function experiencia_topada(uuid, text, int, interval) from public;

do $$
declare
  _rol text;
begin
  foreach _rol in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = _rol) then
      execute format(
        'revoke all on function otorgar_experiencia(uuid, text, text) from %I', _rol);
      execute format(
        'revoke all on function experiencia_topada(uuid, text, int, interval) from %I', _rol);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. El volumen vendido, por tramos de 500.000
--
-- Es el único cambio que no cabe en `otorgar_experiencia()`: el tamaño del tramo
-- lo decide quien la llama. Lo demás del trigger no cambia.
--
-- 200.000 COP es una compra pequeña en este marketplace —un pedido de jabones de
-- hotel lo pasa—, así que el volumen estaba dando puntos a razón de uno por
-- venta corriente. A 500.000 sigue reconociendo el tamaño sin convertirse en un
-- segundo `venta_entregada`.
--
-- **Los tramos ya apuntados se quedan.** La referencia es `<orden>#<tramo>`, así
-- que una orden vieja no se reprocesa: el índice único la rechazaría igual.
-- ---------------------------------------------------------------------------

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

      -- El volumen se apunta como un evento por tramo de 500.000, con la orden
      -- y el número de tramo en la referencia para que sea idempotente.
      for _i in 1..least(floor(_fila.vendido / 500000)::int, 50) loop
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

-- ---------------------------------------------------------------------------
-- Comprobar que quedó aplicada
--
--   -- Los dos triggers de ritmo existen
--   select tgname from pg_trigger
--    where tgname in ('community_posts_ritmo', 'community_reactions_ritmo');
--
--   -- Publicar da 10 y no 30
--   select prosrc like '%''articulo_publicado''       then 10%'
--     from pg_proc where proname = 'otorgar_experiencia';
--
--   -- Nadie de fuera puede otorgarse experiencia: ni anon=X ni authenticated=X
--   select proname, proacl from pg_proc
--    where proname in ('otorgar_experiencia', 'experiencia_topada');
--
--   -- Y a mano, con una cuenta de prueba: publicar dos veces seguidas en
--   -- /comunidad. La segunda tiene que decir «espera unos segundos».
-- ---------------------------------------------------------------------------
-- Rollback
--
--   drop trigger if exists community_posts_ritmo on community_posts;
--   drop trigger if exists community_reactions_ritmo on community_reactions;
--   drop function if exists community_posts_limites();
--   drop function if exists community_reactions_limites();
--
-- y volver a crear `otorgar_experiencia()` y `experiencia_por_orden()` con los
-- cuerpos de las secciones 4 y 5.b de la migración 0006. **Revertir vuelve a
-- dejar la Comunidad sin freno y los puntos al precio viejo**, que es justo lo
-- que esta migración existe para cerrar. Los índices se pueden dejar: no
-- estorban a nada.
-- ---------------------------------------------------------------------------
