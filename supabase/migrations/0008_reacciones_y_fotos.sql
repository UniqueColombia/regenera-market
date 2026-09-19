-- ---------------------------------------------------------------------------
-- 0008 — Cinco reacciones, foto de perfil y logo que sube su dueño
--
-- ## Qué trae
--
-- 1. **Las reacciones dejan de ser una.** La semilla («me sirve») se queda, y
--    entran cuatro más. Una persona puede marcar varias a la vez en la misma
--    publicación, que es lo que la decisión 2 de la 0007 no permitía.
-- 2. **El contador se recalcula, no se incrementa.** Es el cambio que cierra la
--    auditoría abierta en `docs/ESTADO.md`: mientras el número se llevaba a
--    `+1` / `-1`, cualquier escritura que se perdiera lo dejaba mintiendo para
--    siempre y sin error. Ahora cada reacción recuenta desde las filas, así que
--    el número no puede desviarse de la verdad más de una transacción — y si ya
--    estaba desviado, esta migración lo cuadra al aplicarse.
-- 3. **`profiles.avatar_url`** y dos buckets de Storage, para que cada persona
--    ponga su foto y cada empresa su logo en vez del monograma de iniciales.
-- 4. **Un proveedor deja de poder escribirse el nivel.** `providers_member_update`
--    (0001) permite a cualquier miembro actualizar **cualquier** columna de su
--    empresa, incluida `experience_points` — y el nivel baja la comisión, así
--    que son cuatro puntos de cada venta. Nunca se había usado desde la
--    aplicación; esta tanda estrena el primer formulario que escribe en
--    `providers` desde una sesión normal (el logo), y abrir esa puerta con el
--    agujero abierto sería regalar la llave.
--
-- ## Cómo se aplica
--
-- Es aditiva salvo en un punto: **la clave primaria de `community_reactions`
-- pasa de `(post_id, user_id)` a `(post_id, user_id, kind)`**. No se pierde
-- ninguna fila —la nueva clave es un superconjunto de la vieja y las existentes
-- quedan como `semilla`— pero es un `drop constraint`, así que va dicho aquí y
-- no escondido.
--
-- **Antes de desplegar el código de esta tanda**, como la 0006 y la 0007:
-- `/comunidad` lee `reaction_counts` y `/cuenta` lee `avatar_url`, y sin las
-- columnas las dos páginas responden error en vez de vacío.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0008_reacciones_y_fotos.sql
--
-- Los buckets y las políticas de la sección 4 tocan el esquema `storage`, y eso
-- exige correrla como `postgres` — que es el rol del editor SQL del panel. Con
-- otro rol falla ahí, y **no queda nada aplicado**: el editor envuelve el script
-- entero en una transacción. Se arregla el permiso y se vuelve a correr entera,
-- que es seguro porque todo el archivo es idempotente.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. El tipo de reacción
--
-- Texto con `check` y no enum, por lo mismo que `community_posts.topic`:
-- agregar una reacción no debe obligar a partir el archivo de migración en dos
-- —Postgres no deja *usar* un valor de enum en la transacción que lo crea—.
--
-- **`semilla` es el valor por defecto a propósito.** Las reacciones que ya
-- existen se hicieron sobre un botón que decía «me sirve», y eso es exactamente
-- lo que significa `semilla`. Ninguna cambia de sentido al migrarse.
--
-- Esta lista tiene un gemelo en `src/lib/comunidad.ts`. Si cambias una, cambia
-- la otra: la de aquí es la barrera —vale aunque alguien llame a PostgREST
-- directo— y la de allá es la que pinta el icono y la etiqueta.
-- ---------------------------------------------------------------------------

alter table community_reactions
  add column if not exists kind text not null default 'semilla';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'community_reactions_kind_check'
  ) then
    alter table community_reactions
      add constraint community_reactions_kind_check
      check (kind in ('semilla', 'megusta', 'bien_hecho', 'idea', 'apoyo'));
  end if;
end;
$$;

comment on column community_reactions.kind is
  'Cuál de las cinco reacciones. Gemelo de REACCIONES en src/lib/comunidad.ts.';

-- La clave primaria **es** la regla de negocio, igual que en la 0007: lo que
-- cambia es la regla. Antes decía «una persona reacciona una vez a una
-- publicación»; ahora dice «una persona marca cada reacción una sola vez», que
-- es lo que hace que un doble toque desde un teléfono con mala señal siga sin
-- contar dos.
alter table community_reactions drop constraint if exists community_reactions_pkey;
alter table community_reactions add primary key (post_id, user_id, kind);

-- ---------------------------------------------------------------------------
-- 2. El desglose por tipo
--
-- `reaction_count` se queda y sigue siendo el total: es por lo que se ordena el
-- muro, y ordenar por una clave de un jsonb es la consulta que se vuelve lenta
-- justo cuando la sección empieza a usarse (decisión 3 de la 0007, intacta).
--
-- `reaction_counts` es el desglose `{"semilla": 12, "idea": 4}`. Va como jsonb y
-- no como cinco columnas porque agregar la sexta reacción sería entonces una
-- migración con `alter table`, y la gracia de la sección 1 es que no lo sea.
-- Las claves que valen cero **no aparecen**: el objeto dice lo que hay.
-- ---------------------------------------------------------------------------

alter table community_posts
  add column if not exists reaction_counts jsonb not null default '{}'::jsonb;

comment on column community_posts.reaction_counts is
  'Desglose de reacciones por tipo. Lo escribe community_recontar_reacciones(); '
  'ninguna política permite escribirlo a mano. reaction_count es su suma.';

-- ---------------------------------------------------------------------------
-- 3. El contador se recalcula desde las filas
--
-- ## Por qué se cambia algo que parecía funcionar
--
-- La versión de la 0007 hacía `reaction_count + 1` y `greatest(0, … - 1)`. Es
-- correcto mientras nada se pierda, y **cuando algo se pierde no hay forma de
-- notarlo**: el número queda separado de la verdad y no existe ningún sitio
-- donde se contradigan. Eso es justo lo que `docs/ESTADO.md` dejó anotado como
-- «lo primero que hay que probar en producción», y la respuesta correcta a una
-- duda así no es comprobarla una vez: es quitar la clase de fallo.
--
-- Recontar cuesta un `count(*)` sobre el prefijo de la clave primaria
-- (`post_id`), que son las reacciones de **una** publicación. A cambio, el
-- número se corrige solo en la siguiente reacción aunque alguna vez se haya
-- desviado.
--
-- ## El `for update` no es cosmético
--
-- Dos personas reaccionando a la vez a la misma publicación: sin el bloqueo,
-- cada transacción cuenta sin ver la fila de la otra —todavía sin confirmar— y
-- la segunda escribe un total al que le falta una. Bloquear primero la
-- publicación obliga a la segunda a esperar, y la consulta que va después toma
-- una instantánea nueva (read committed) en la que la primera ya está. El orden
-- **bloquear → contar → escribir** es lo que hace correcta esta función; si
-- alguien mueve el `count` antes del `for update`, vuelve la carrera.
--
-- `app.derivados` sigue siendo la marca que le dice al trigger de la sección 5
-- de la 0007 «este update lo hace la base». Sin ella, ese trigger devolvería el
-- contador a su valor anterior sin que nada fallara.
-- ---------------------------------------------------------------------------

-- El recuento de una publicación, en su propia función para que la pueda llamar
-- también la reparación de la sección 7 y cualquier auditoría futura.
create or replace function recontar_publicacion(_post uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _por_tipo jsonb;
  _total int;
begin
  if _post is null then
    return;
  end if;

  -- Ver la cabecera: bloquear, contar, escribir. En ese orden.
  perform 1 from community_posts where id = _post for update;

  select coalesce(jsonb_object_agg(t.kind, t.n), '{}'::jsonb),
         coalesce(sum(t.n), 0)
    into _por_tipo, _total
    from (
      select kind, count(*)::int as n
        from community_reactions
       where post_id = _post
       group by kind
    ) t;

  perform set_config('app.derivados', 'on', true);
  update community_posts
     set reaction_count  = _total,
         reaction_counts = _por_tipo
   where id = _post;
  perform set_config('app.derivados', 'off', true);
end;
$$;

create or replace function community_recontar_reacciones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _post uuid;
begin
  if tg_op = 'DELETE' then
    _post := old.post_id;
  else
    _post := new.post_id;
  end if;

  perform recontar_publicacion(_post);
  return null;  -- trigger `after`: el valor de retorno se ignora
end;
$$;

-- `or update of kind` además de insert y delete: cambiar el tipo de una fila no
-- es algo que haga la aplicación —quita e inserta—, pero si algún día lo hace,
-- el desglose tiene que moverse con ella.
drop trigger if exists community_reactions_contador on community_reactions;
create trigger community_reactions_contador
  after insert or delete or update of kind on community_reactions
  for each row execute function community_recontar_reacciones();

-- El trigger de derivados de la 0007 protegía `reaction_count`. Ahora hay dos
-- columnas derivadas y las dos tienen que volver a su valor: si `reaction_counts`
-- quedara fuera, el autor de una publicación podría escribirse el desglose que
-- quisiera contra PostgREST y su tarjeta mostraría cuarenta aplausos que nadie
-- dio. Lo demás es idéntico a la 0007.
create or replace function community_proteger_derivados()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.author_name := coalesce(
      nullif(trim((select full_name from profiles where id = new.author_id)), ''),
      'Alguien de la comunidad'
    );
    return new;
  end if;

  if coalesce(current_setting('app.derivados', true), 'off') = 'on' then
    return new;
  end if;

  if is_admin() then
    return new;
  end if;

  new.status          := old.status;
  new.featured        := old.featured;
  new.reaction_count  := old.reaction_count;
  new.reaction_counts := old.reaction_counts;
  new.author_id       := old.author_id;
  new.author_name     := old.author_name;
  new.created_at      := old.created_at;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. La foto de perfil y el logo
--
-- `providers.logo_url` existe desde la 0001 y nunca se llenó. Lo que faltaba era
-- el sitio donde dejar el archivo y la columna equivalente para las personas.
--
-- ## Por qué dos buckets y no uno
--
-- Las políticas son distintas: la carpeta de un avatar la manda su dueño
-- (`auth.uid()`) y la de un logo la manda `manages_provider()`. Con un bucket
-- único, cada política tendría que mirar además el prefijo de la ruta, y una
-- condición de más en una política de escritura es una condición que un día se
-- escribe al revés.
--
-- ## Públicos, y qué significa eso
--
-- Una foto de perfil se ve en el muro de la Comunidad, que es público, y un logo
-- sale en el catálogo. Servirlos con URL firmada obligaría a firmar veinte URLs
-- por página y a que caducaran en la caché del CDN. Son públicos **para leer**;
-- escribir sigue exigiendo ser el dueño.
--
-- La ruta es `<id>/<archivo>`: la primera carpeta es el id del usuario o de la
-- empresa, y es lo que la política compara. Ver `src/lib/almacenamiento.ts`.
-- ---------------------------------------------------------------------------

alter table profiles
  add column if not exists avatar_url text;

comment on column profiles.avatar_url is
  'Foto de perfil. URL pública del bucket `avatares`, o null: entonces la '
  'interfaz dibuja el monograma de iniciales.';

insert into storage.buckets (id, name, public)
values ('avatares', 'avatares', true),
       ('logos',    'logos',    true)
on conflict (id) do update set public = true;

-- `security definer` y un `where` sobre el texto antes de convertirlo: un
-- `::uuid` sobre una carpeta que no lo sea lanza, y una política que lanza es
-- una política que niega con un error feo en vez de negar limpio.
create or replace function carpeta_es_mia(_nombre text)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select auth.uid() is not null
     and (storage.foldername(_nombre))[1] = auth.uid()::text;
$$;

create or replace function carpeta_es_de_mi_empresa(_nombre text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
  _carpeta text := (storage.foldername(_nombre))[1];
begin
  if _carpeta !~ '^[0-9a-fA-F-]{36}$' then
    return false;
  end if;
  return manages_provider(_carpeta::uuid);
end;
$$;

drop policy if exists avatares_lectura on storage.objects;
create policy avatares_lectura on storage.objects
  for select using (bucket_id in ('avatares', 'logos'));

drop policy if exists avatares_escritura on storage.objects;
create policy avatares_escritura on storage.objects
  for insert with check (bucket_id = 'avatares' and carpeta_es_mia(name));

drop policy if exists avatares_reemplazo on storage.objects;
create policy avatares_reemplazo on storage.objects
  for update using (bucket_id = 'avatares' and carpeta_es_mia(name))
  with check (bucket_id = 'avatares' and carpeta_es_mia(name));

drop policy if exists avatares_borrado on storage.objects;
create policy avatares_borrado on storage.objects
  for delete using (bucket_id = 'avatares' and carpeta_es_mia(name));

drop policy if exists logos_escritura on storage.objects;
create policy logos_escritura on storage.objects
  for insert with check (bucket_id = 'logos' and carpeta_es_de_mi_empresa(name));

drop policy if exists logos_reemplazo on storage.objects;
create policy logos_reemplazo on storage.objects
  for update using (bucket_id = 'logos' and carpeta_es_de_mi_empresa(name))
  with check (bucket_id = 'logos' and carpeta_es_de_mi_empresa(name));

drop policy if exists logos_borrado on storage.objects;
create policy logos_borrado on storage.objects
  for delete using (bucket_id = 'logos' and carpeta_es_de_mi_empresa(name));

-- ---------------------------------------------------------------------------
-- 4.b Cómo ve el muro la foto de otra persona
--
-- `profiles` solo lo lee su dueño (`profiles_own`, 0001), y eso está bien: ahí
-- está el teléfono y el documento tributario de un comprador. Es el mismo
-- problema que la 0007 tuvo con el nombre, y que resolvió copiándolo en
-- `community_posts.author_name` con el argumento de que quien firmó algo lo
-- firmó con el nombre que tenía ese día.
--
-- **Con la foto ese argumento no vale.** Quien se cambia la foto espera que
-- cambie en todas partes, y una copia congelada haría que la publicación de
-- hace un mes siguiera mostrando la anterior. Copiarla además obligaría a
-- reescribir cada publicación del autor cada vez que sube una nueva.
--
-- Así que se lee en vivo, por una función que devuelve **solo la foto** de los
-- ids que se le pidan. No abre `profiles`: no hay forma de sacar de aquí un
-- teléfono, un nombre ni un correo. Y los ids que se le pasan son los
-- `author_id` que la propia consulta del muro ya devuelve.
-- ---------------------------------------------------------------------------

create or replace function avatares_publicos(_ids uuid[])
returns table (id uuid, avatar_url text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.avatar_url
    from profiles p
   where p.id = any(coalesce(_ids, '{}'::uuid[]))
     and p.avatar_url is not null;
$$;

revoke all on function avatares_publicos(uuid[]) from public;
grant execute on function avatares_publicos(uuid[]) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Un proveedor no se escribe su propio nivel
--
-- ## El agujero
--
-- `providers_member_update` (0001) dice:
--
--   for update using (manages_provider(id)) with check (manages_provider(id))
--
-- Una política de Postgres **no distingue columnas**: quien gestiona la empresa
-- puede actualizar la fila entera. Desde la 0006 esa fila incluye
-- `experience_points`, y el trigger `providers_tier_por_experiencia` deriva el
-- nivel de ahí. O sea: con la clave anon —que es pública por diseño— y una
-- sesión normal de proveedor, un `PATCH /rest/v1/providers?id=eq.<mío>` con
-- `experience_points: 99999` daba nivel Bosque y bajaba la comisión del 12 % al
-- 8 %. No hace falta ninguna clave privada. Es la invariante 13 de
-- `dominio-regenera`, y estaba abierta desde la 0006.
--
-- Nunca se explotó porque ninguna ruta de la aplicación escribía en `providers`
-- desde una sesión de proveedor. Esta tanda estrena la primera (el logo).
--
-- ## Por qué un trigger y no una política mejor
--
-- Porque no existe una política mejor: PostgREST no sabe limitar una política a
-- ciertas columnas. Es el mismo razonamiento de la sección 5 de la 0007, y por
-- eso la solución es la misma — con una diferencia que importa.
--
-- ## Cómo distingue quién escribe
--
-- Por `current_user`, no por una marca de transacción. Las escrituras que vienen
-- de una sesión del sitio llegan como `anon` o `authenticated`; las que hace la
-- propia base (`otorgar_experiencia()`, `sync_provider_score()`, ambas
-- `security definer` y de `postgres`) y las de una tarea de servidor con la
-- clave de servicio (`service_role`) llegan con otro rol.
--
-- **Esto es lo que evita tener que reescribir las funciones de la 0006 para que
-- se marquen.** Ninguna de ellas cambia: siguen otorgando puntos igual, y este
-- trigger las deja pasar porque no son una sesión. La lista es de roles
-- *restringidos*, no de roles permitidos: un rol nuevo de Supabase no se queda
-- bloqueado sin que nadie entienda por qué.
--
-- Para que `current_user` diga la verdad, esta función **no** es `security
-- definer` — dentro de una lo sería siempre `postgres` y la comprobación no
-- valdría nada. `is_admin()` sí lo es y se puede llamar desde aquí.
-- ---------------------------------------------------------------------------

create or replace function providers_proteger_derivados()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if is_admin() then
    return new;
  end if;

  -- Dinero: el nivel baja la comisión. Ver la cabecera de esta sección.
  new.experience_points := old.experience_points;
  new.tier              := old.tier;

  -- Sello de sostenibilidad: lo escribe `sync_provider_score()` cuando un
  -- administrador aprueba la evaluación. Invariantes 13 y 14.
  new.sustainability_score        := old.sustainability_score;
  new.sustainability_verified_at  := old.sustainability_verified_at;

  -- Estar en el catálogo es una decisión del equipo (0006, sección 8.a). Sin
  -- esta línea, una empresa suspendida se reactivaría sola.
  new.status := old.status;

  -- El slug es la URL pública de la ficha y la unicidad la da un índice: dejar
  -- que se cambie a mano rompe los enlaces que ya circulan y puede chocar con
  -- otra empresa. Se cambia desde administración, que es la rama de arriba.
  new.slug := old.slug;

  return new;
end;
$$;

-- `before update` y no `insert`: quien crea la fila es `postular_proveedor()`,
-- que es `security definer` y ya decide todos estos campos. El nombre importa —
-- los triggers del mismo momento corren en orden alfabético, y «proteger» va
-- antes que «tier»: primero se devuelven los puntos a su valor, después
-- `providers_tier_por_experiencia` deriva el nivel de los puntos ya corregidos.
drop trigger if exists providers_proteger_derivados on providers;
create trigger providers_proteger_derivados
  before update on providers
  for each row execute function providers_proteger_derivados();

-- ---------------------------------------------------------------------------
-- 6. Experiencia por completar el perfil
--
-- `perfil_completo` (80 puntos) existe en `otorgar_experiencia()` desde la 0006
-- y en `src/lib/niveles.ts`, y **nunca lo otorgaba nadie**: no había pantalla
-- donde completar el perfil. Es el caso exacto de la regla 6 de
-- `redaccion-producto` —prometer puntos por algo que no se puede hacer—, y se
-- resuelve al revés que entonces: ahora la pantalla existe, así que el evento
-- se ata a su hecho.
--
-- Qué cuenta como perfil completo: logo, titular, descripción con algo de
-- sustancia y forma de contactar. Es lo que hace que una ficha sirva para
-- vender; pedir más sería inventarse requisitos para no dar los puntos.
--
-- Se otorga una sola vez —lo garantiza el índice único de `experience_events`
-- sobre (provider_id, clave, referencia)— y **no se quita si el perfil se
-- vuelve a vaciar**: los puntos no bajan nunca, que es la decisión de la 0006.
-- ---------------------------------------------------------------------------

create or replace function experiencia_por_perfil_completo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(nullif(trim(new.logo_url), ''), '') <> ''
     and char_length(trim(new.tagline)) >= 10
     and char_length(trim(new.description)) >= 120
     and coalesce(nullif(trim(new.phone), ''), '') <> ''
     and coalesce(nullif(trim(new.email), ''), '') <> ''
  then
    perform otorgar_experiencia(new.id, 'perfil_completo');
  end if;
  return null;
end;
$$;

-- `after`, como todos los de experiencia: se apunta cuando la fila ya existe.
drop trigger if exists providers_perfil_completo on providers;
create trigger providers_perfil_completo
  after insert or update of logo_url, tagline, description, phone, email
  on providers
  for each row execute function experiencia_por_perfil_completo();

-- ---------------------------------------------------------------------------
-- 7. Cuadrar lo que ya hay
--
-- Recuenta **todas** las publicaciones desde sus reacciones. Hace dos cosas a la
-- vez: llena `reaction_counts`, que acaba de nacer vacío, y corrige
-- `reaction_count` si la versión incremental de la 0007 se desvió alguna vez —
-- que es la pregunta que `docs/ESTADO.md` dejó abierta y que a partir de aquí
-- ya no hace falta contestar.
--
-- Queda como función y no como un `update` suelto porque es la herramienta de
-- auditoría: correr `select recontar_todas_las_publicaciones();` y comparar
-- antes y después dice si hubo desvío. Es idempotente y barata; se puede correr
-- cuando se quiera.
--
-- Va dentro de una función `security definer` por un motivo que no es obvio: el
-- trigger `community_posts_derivados` devuelve `reaction_count` a su valor
-- anterior para todo el que no sea administrador, y en el editor SQL del panel
-- `auth.uid()` es null — o sea que `is_admin()` es falso y el update se
-- desharía solo, en silencio. La marca `app.derivados` que pone
-- `recontar_publicacion()` es lo que lo permite.
-- ---------------------------------------------------------------------------

create or replace function recontar_todas_las_publicaciones()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  _p record;
  _n int := 0;
begin
  for _p in select id from community_posts loop
    perform recontar_publicacion(_p.id);
    _n := _n + 1;
  end loop;
  return _n;
end;
$$;

select recontar_todas_las_publicaciones();

-- ---------------------------------------------------------------------------
-- Comprobar que quedó aplicada
--
--   -- 1. Las cinco reacciones se aceptan y la clave primaria es la nueva
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'community_reactions'::regclass;
--
--   -- 2. Ninguna publicación miente: las dos columnas tienen que dar 0 filas
--   select p.id, p.reaction_count, count(r.*) as real
--     from community_posts p
--     left join community_reactions r on r.post_id = p.id
--    group by p.id, p.reaction_count
--   having p.reaction_count <> count(r.*);
--
--   -- 3. Los buckets existen y son públicos
--   select id, public from storage.buckets where id in ('avatares', 'logos');
--
--   -- 4. Un proveedor no puede subirse el nivel. Con una sesión de proveedor
--   --    (no de administrador), desde la aplicación o con la clave anon:
--   --      update providers set experience_points = 99999 where id = '<el mío>';
--   --    No debe lanzar error y no debe cambiar nada. Una política se valida
--   --    demostrando que niega.
--
-- ---------------------------------------------------------------------------
-- Rollback
--
--   drop trigger if exists providers_perfil_completo on providers;
--   drop trigger if exists providers_proteger_derivados on providers;
--   drop function if exists experiencia_por_perfil_completo();
--   drop function if exists providers_proteger_derivados();
--   drop function if exists recontar_todas_las_publicaciones();
--   drop function if exists recontar_publicacion(uuid);
--   drop function if exists carpeta_es_de_mi_empresa(text);
--   drop function if exists carpeta_es_mia(text);
--   drop policy if exists logos_borrado on storage.objects;
--   drop policy if exists logos_reemplazo on storage.objects;
--   drop policy if exists logos_escritura on storage.objects;
--   drop policy if exists avatares_borrado on storage.objects;
--   drop policy if exists avatares_reemplazo on storage.objects;
--   drop policy if exists avatares_escritura on storage.objects;
--   drop policy if exists avatares_lectura on storage.objects;
--   alter table profiles drop column if exists avatar_url;
--   alter table community_posts drop column if exists reaction_counts;
--   delete from community_reactions where kind <> 'semilla';
--   alter table community_reactions drop constraint community_reactions_pkey;
--   alter table community_reactions add primary key (post_id, user_id);
--   alter table community_reactions drop column if exists kind;
--   -- y volver a crear community_recontar_reacciones() y
--   -- community_proteger_derivados() con el cuerpo de la 0007.
--
-- **Revertir borra reacciones.** Las cuatro nuevas no caben en la clave primaria
-- vieja, así que hay que quitarlas antes de estrecharla. Las fotos subidas
-- sobreviven en Storage aunque `avatar_url` deje de existir; los buckets se
-- borran a mano desde el panel si de verdad se quiere.
-- ---------------------------------------------------------------------------
