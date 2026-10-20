# El modo MySQL: Seregenera entera en Hostinger, sin Supabase

**Qué es.** Con `BASE_DE_DATOS=mysql`, todo lo que hoy va a Supabase va al
MariaDB del plan de Hostinger:

- **los datos**, por una capa que habla como PostgREST;
- **las cuentas y sesiones**, con un motor propio en lugar de Supabase Auth;
- **las fotos**, al disco del servidor en lugar de Storage.

Sin la variable, la app es exactamente la de siempre. Las tres cosas cambian
**juntas**: con las cuentas en un lado y los datos en el otro, las políticas de
Supabase no sabrían quién pide.

**Encendido en producción el 2026-10-17** (`v0.12.0`): `seregenera.com` corre
sobre la base `…_seregenera`, y Supabase quedó congelado como vuelta atrás. Las
razones de cada decisión están en los hitos `2026-10-17-experimento-mysql-*`,
`2026-10-17-modo-mysql-completo.md` y `2026-10-17-produccion-sobre-mariadb.md`.

## Cómo está armado

| Pieza | Qué es | Se edita |
|---|---|---|
| `src/lib/modo.ts` | El interruptor | — |
| `src/lib/supabase/server.ts`, `admin.ts`, `efimero.ts`, `config.ts`, `src/proxy.ts`, `src/lib/almacenamiento.ts` | Los únicos sitios que miran el interruptor; el resto de la app no sabe qué base hay detrás | A mano |
| `src/lib/mysql/postgrest/` | La capa compatible: `from()`, `rpc()` y `auth` con la forma de `SupabaseClient` | A mano |
| `src/lib/mysql/postgrest/rpc.ts` | Las 17 funciones de Postgres que llama la app, traducidas de plpgsql | A mano, **gemelas de Postgres** |
| `src/lib/mysql/cuentas.ts` | Cuentas, contraseñas, códigos y sesiones | A mano |
| `src/lib/almacen-disco.ts` y `src/app/archivos/[...ruta]/route.ts` | Las fotos en disco, servidas por `/archivos/…` | A mano |
| `mysql/cuentas.sql` | `usuarios`, `sesiones`, `codigos` | A mano |
| `mysql/esquema.sql` y `src/lib/mysql/modelo.ts` | Las 25 tablas, sus llaves y las 58 políticas, traducidas | **Generados** por `scripts/mysql/generar-esquema.mts`; no se tocan |
| `mysql/logica.sql` | Las funciones y los 25 triggers de Postgres, traducidos | A mano, **gemelos de Postgres** |
| `scripts/mysql/copiar-datos.mts` | Copia todo de Supabase a MySQL (sin tocar Supabase) | — |
| `scripts/mysql/comparar-sitio.mts` | Las páginas públicas en los dos modos, comparadas | — |
| `mysql/pruebas/` | Las pruebas del modo (`npm run test:mysql`), contra un MariaDB vacío: el job `mysql` del CI lo levanta en cada push | — |
| `scripts/servidor/respaldar.sh` y `scripts/respaldos.mts` | Las copias de seguridad de producción: ver «Copias de seguridad» | — |

Cómo se imita lo que Postgres hace solo (detalle en la cabecera de `mysql/logica.sql`):

| Postgres | MariaDB |
|---|---|
| `auth.uid()`, `auth.role()` | Variables de sesión que pone la capa al empezar cada petición y borra el pool al recibir la conexión de vuelta |
| RLS | Las políticas traducidas, aplicadas por la capa en cada lectura y escritura, con las reglas de Postgres (el `with check` se evalúa sobre la fila propuesta, antes de que exista) |
| `security definer` y `current_user` | Un «modo definidor» que suben las funciones de `rpc.ts` y los triggers que escriben en otras tablas |
| `pg_advisory_xact_lock` | Una fila de la tabla `candados` tomada con `for update` |
| El `hint` de un `raise exception` | `@app_pista`, que la capa devuelve como `error.hint` |
| Supabase Auth | `cuentas.ts`. Las contraseñas copiadas de Supabase (bcrypt) siguen sirviendo y pasan a scrypt en el primer acceso |
| Los correos de acceso del panel de Supabase | Los manda la app con las mismas plantillas de `plantillas-correo/` |

## Probarlo en el PC

> **La base de pruebas de Hostinger (`…_sgpruebas`) se borró el 2026-10-17**,
> y desde el PC ya no se llega a la de producción. Las pruebas automáticas
> corren en el CI (job `mysql`, un MariaDB 11.8 que se levanta y se tira). Para
> `npm run dev:mysql` o `npm run test:mysql` en el PC hace falta un MariaDB
> propio en las `MYSQL_*` del `.env` (las de ahora apuntan a la base borrada):
> `test:mysql` crea las tablas solo si la base está vacía, y para usar la app
> hay que llenarla con `copiar-datos.mts`, como abajo. Lo de abajo es cómo se
> probó antes del corte.

1. **Los datos.** Para traer lo de Supabase (borra lo que haya en MySQL y
   vuelve a copiar todo; se niega con la base de producción):

   ```bash
   ALMACEN_CARPETA="$(pwd -W)/outputs/almacen-pruebas" node --env-file=.env scripts/mysql/copiar-datos.mts
   ```

2. **La app.** Cerrar antes cualquier `npm run dev` de este proyecto: Next 16
   no deja abrir dos a la vez («Another next dev server is already running»).
   Después, `npm run dev:mysql` y abrir http://localhost:3000. Desde el PC
   cada consulta cruza internet hasta Hostinger: las páginas tardan uno o dos
   segundos. Dentro de Hostinger, milisegundos.
3. **Qué probar.** Todo lo que se haga aquí queda en la base de pruebas de
   MySQL. Supabase y `seregenera.com` no se enteran.
   - [ ] Entrar con tu contraseña de siempre. El aparato es nuevo para este
         sitio, así que pide el código: llega al correo, y también sale en la
         consola donde corre `dev:mysql`.
   - [ ] Registrar una cuenta nueva con otro correo tuyo; confirmar con el código.
   - [ ] Catálogo, búsqueda (con y sin tildes), filtros, una ficha.
   - [ ] Comprar: cesta → pedido → ver el pedido en `/orden/…`.
   - [ ] Como administrador: marcar ese pedido como pagado en `/admin/ordenes`;
         aprobar una oferta; ver usuarios y analíticas.
   - [ ] Como empresa: crear una oferta **con foto** (va a
         `outputs/almacen-pruebas/`), editarla, despachar el pedido.
   - [ ] Comunidad: publicar y reaccionar.
   - [ ] Cuenta: cambiar la contraseña, salir y volver a entrar.

Si algo falla, lo que dice la consola de `dev:mysql` es lo que hace falta para
arreglarlo.

## Encenderlo en producción

**Hecho el 2026-10-17** con estos pasos (hito
`2026-10-17-produccion-sobre-mariadb.md`). Quedan escritos para rehacerlo en otra
cuenta o volver a encenderlo después de una vuelta atrás. **Supabase no se toca
en ningún paso**, y es la vuelta atrás. **Las variables del paso 4 van siempre
después de la copia del paso 3**: puestas antes, el sitio apunta a una base
vacía y da 500 (pasó el 2026-10-17, unos minutos).

> ⚠️ **Después del corte, `copiar-datos.mts` no se corre contra la base de
> producción**: rehace el esquema y borra todo lo escrito desde entonces.

1. **Una base para producción**, aparte de la de pruebas, creada como
   `…_sgpruebas` (`scripts/mysql/` no la crea: hPanel → Bases de datos, o la API).
   El usuario de la base sirve para `127.0.0.1` desde el servidor; se comprobó el
   2026-10-17.
2. **El código.** Mergear la rama y desplegar el tag con `desplegar-hostinger`
   **sin** `BASE_DE_DATOS`. Producción sigue igual: el código nuevo solo actúa
   con la variable.
3. **Los datos, justo antes del corte** (lo que se escriba en Supabase después
   no pasa): `copiar-datos.mts` con las `MYSQL_*` de la base de producción y
   `ALMACEN_CARPETA` local. Después, subir la carpeta de fotos por SFTP a
   `~/seregenera-archivos` (fuera de `domains/`, donde ningún despliegue la
   pisa; Node escribe y lee ahí, comprobado).
4. **Las variables, en hPanel** (las cambia Jesús: la API reemplaza todas y
   borraría `SMTP_PASSWORD`): `BASE_DE_DATOS=mysql`, `MYSQL_HOST=127.0.0.1`,
   `MYSQL_PORT=3306`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD` y
   `ALMACEN_CARPETA=/home/<usuario>/seregenera-archivos`. Reiniciar la app.
5. **Comprobar.** El sitio público en los dos modos con `comparar-sitio.mts`
   (producción contra un `next start` local en modo Supabase), y el Anexo B de
   `ROADMAP-MIGRACION.md` a mano.
6. **Todos vuelven a entrar una vez.** Las cookies de Supabase no valen en este
   modo. Las contraseñas sí.

**Volver atrás:** quitar `BASE_DE_DATOS` en hPanel y reiniciar. El sitio vuelve
a Supabase tal como estaba en el paso 3. **Lo que se haya escrito en MySQL
después del corte no vuelve** (no hay copia en sentido contrario). Por eso
conviene hacerlo mientras no haya ventas reales.

Cuando lleve dos semanas estable: apagar el latido de Supabase
(`.github/workflows/latido.yml`), dejar de subir las plantillas al panel de
Supabase y decidir qué se hace con el proyecto de allá.

## Copias de seguridad

Desde el 2026-10-17, **cifradas desde el 2026-10-20**. **Lo que hay:**

| Dónde | Qué | Cuánto |
|---|---|---|
| `~/respaldos/` en el servidor (fuera de `domains/`) | `base-AAAA-MM-DD.sql.gz.cms` (`mariadb-dump` con tablas, datos, rutinas, triggers y vistas) y `fotos-AAAA-MM-DD.tar.gz.cms` (la carpeta de `ALMACEN_CARPETA`, con las fechas de cada archivo), **cifradas** | Una por día, a las 03:15 UTC, por un cron de la cuenta; se guardan 14 días |
| `outputs/respaldos/` en el PC de quien corre `bajar` | Las dos últimas, copiadas tal cual (cifradas) | Las 4 más recientes de cada tipo |
| Las copias automáticas de Hostinger | Lo que el plan guarde de la cuenta (hPanel → Archivos → Copias de seguridad) | No se ven por la API: comprobarlo en hPanel |

**El cifrado.** CMS de OpenSSL: AES-256 para el contenido y RSA-4096 para la
llave de cada archivo. El servidor solo tiene el **certificado**
(`~/respaldos/respaldos.crt`), que cierra pero no abre; la **llave privada**
está en el PC (`~/.ssh/seregenera_respaldos.key`) y en el gestor de
contraseñas. Así, quien se lleve una copia —del servidor, del PC o de un
disco— no la puede leer. Lo que no protege: a quien ya tiene la cuenta de
hosting, que lee la base directamente. **Perder la llave privada es perder
todas las copias**: por eso vive en el gestor, no solo en un PC.

**Los comandos** (`scripts/respaldos.mts`, con la llave SSH y la API como
`desplegar.mts`):

```bash
node scripts/respaldos.mts llave                               # una vez: crea la pareja de llaves en este PC
node --env-file=.env scripts/respaldos.mts instalar            # comprueba la pareja, sube certificado y respaldar.sh, y hace una copia ya
node --env-file=.env scripts/respaldos.mts probar              # descifra y restaura la última en una base temporal, compara y la borra
node --env-file=.env scripts/respaldos.mts bajar               # trae la última (cifrada) al PC
node --env-file=.env scripts/respaldos.mts retirar-sin-cifrar  # borra del servidor las copias en claro de antes del 2026-10-20
node scripts/respaldos.mts descifrar outputs/respaldos/base-AAAA-MM-DD.sql.gz.cms
```

En el **otro PC** no se corre `llave`: se copian los dos archivos desde el
gestor a `~/.ssh/` (o a las rutas de `RESPALDOS_LLAVE` y
`RESPALDOS_CERTIFICADO`). Una pareja nueva obliga a volver a `instalar`, y las
copias hechas con la anterior solo las abre la anterior.

`probar` es el simulacro: conviene correrlo una vez al mes y antes de cualquier
cambio grande. Descifra en el servidor con la llave mandada por SSH a un
temporal que se borra al terminar. `bajar`, cada semana: las del servidor
sirven contra un error, no contra perder la cuenta de hosting. La salida del
cron la da la API (`hosting_cron-jobs_output`); sin certificado, `respaldar.sh`
se niega en vez de dejar una copia en claro.

**Restaurar de verdad**, por SSH en el servidor (es reemplazar producción: se
hace con el sitio en mantenimiento y después de bajar una copia de lo actual).
Primero subir la llave privada a un temporal, y borrarla al terminar:

```bash
cd ~/respaldos
umask 077; cat > .llave            # pegar la llave privada del gestor y cerrar con Ctrl+D
# las MYSQL_* de la app; Hostinger pone entre comillas simples lo que lleva $ (la clave), así que `.` las lee bien
set -a; . ~/domains/seregenera.com/hbuilds/config/.env; set +a
openssl cms -decrypt -binary -inform DER -inkey .llave -in base-AAAA-MM-DD.sql.gz.cms   | zcat | MYSQL_PWD="$MYSQL_PASSWORD" mariadb -h 127.0.0.1 -u "$MYSQL_USER" "$MYSQL_DATABASE"
openssl cms -decrypt -binary -inform DER -inkey .llave -in fotos-AAAA-MM-DD.tar.gz.cms   | tar -xz -C ~                   # recrea ~/seregenera-archivos con sus fechas
rm -f .llave
```

Una copia de antes del 2026-10-20 (`.sql.gz` / `.tar.gz`, sin `.cms`) se
restaura igual sin el paso de `openssl`: `zcat` y `tar -xzf` directos.

Con el mismo usuario de la app, los DEFINER de la copia son los suyos y la
lógica queda bien (ver la trampa de abajo). En otra base o con otro usuario,
quitarlos antes: `sed -E 's/DEFINER=`[^`]*`@`[^`]*`//g'`, como hace `probar`.

**El primer administrador**, si alguna vez no queda ninguno: por SSH en el
servidor, `insert into user_roles (user_id, role) values ('<id de la cuenta>', 'admin');`
con el mismo `mariadb` de arriba. `scripts/crear-admin.mts` habla con Supabase.

## Trampas que ya costaron una caída

- **El DEFINER de la lógica.** MariaDB guarda como dueño de cada vista,
  función y trigger la cuenta con la que se crearon. `copiar-datos.mts` corrido
  desde el PC los deja a nombre de `usuario@IP-del-PC`, la cuenta que existe
  mientras dura el acceso remoto. **Cerrar ese acceso remoto borra la cuenta y
  tumba el sitio** («The user specified as a definer … does not exist»): pasó el
  2026-10-17 con producción. `mysql/logica.sql` se vuelve a crear **desde el
  servidor**, contra 127.0.0.1, y solo después se cierra el acceso remoto. En la
  base de pruebas el acceso del PC sigue abierto, así que allí no se nota.
  Así se hizo ese día: una carpeta temporal fuera de `domains/` con `mysql2`,
  un script que lee las `MYSQL_*` de la app de
  `~/domains/seregenera.com/hbuilds/config/.env` (donde Hostinger guarda las
  variables; la clave no sale del servidor), corre `logica.sql` con los
  `AJUSTES_DE_SESION` de `conexion.ts` y lista el DEFINER de rutinas, triggers y
  vistas; después se borra la carpeta. **Todo cambio futuro de `logica.sql` en
  producción va por ese camino**: aplicado desde el PC volvería a quedar a
  nombre de la cuenta remota. Hoy la base de producción no tiene acceso remoto.
- **`BASE_DE_DATOS` vacía es Supabase**, sin error: ver `docs/VARIABLES.md`.
- **La identidad va en variables de sesión** de la conexión. `enTransaccion`
  la fija al empezar y la borra antes de devolver la conexión; quien use
  `getMysql()` o el pool directamente no tiene esa garantía (comentario de
  `src/lib/mysql/conexion.ts`).

## En qué se porta distinto de Supabase

- **Las consultas sin `order by`** (`getListingsByProvider`,
  `getRelatedListings`, la lista de proveedores) devuelven otro orden. En
  Postgres ese orden tampoco está garantizado. Si importa, se agrega el `order`
  en `src/lib/repo.ts`, que vale para los dos modos.
- **Un borrado en cascada no dispara triggers** en MariaDB. Lo único que
  dependía de eso es el «último administrador» al borrar una cuenta, y la baja
  ya rechaza a los administradores.
- **Los triggers `update of columna`** de Postgres se disparan aquí cuando la
  columna **cambia**, no cuando aparece en el `set`. Los resultados son los
  mismos porque todos esos triggers miran el cambio.
- **Cambiar el correo de una cuenta** no está: `updateUser({ email })` responde
  un error. La app hoy no lo ofrece.
- **Los enlaces PKCE de Supabase** (`?code=`) no sirven; los correos de este modo
  traen `token_hash`, como las plantillas.

## Mientras convivan los dos

> **Desde el 2026-10-17 esto ya no aplica: manda MySQL.** Lo que sigue es como
> se trabajaba antes del corte. Falta decidir cómo se cambia el esquema ahora
> (pendiente en el hito `2026-10-17-produccion-sobre-mariadb.md`): mientras
> tanto, SQL a mano en la base de producción, reflejado en `mysql/*.sql` y en
> `src/lib/mysql/modelo.ts`.

**Postgres seguía mandando**: una migración nueva va a `supabase/migrations/`,
se aplica en Supabase y después:

1. `node --env-file=.env scripts/mysql/generar-esquema.mts` → regenera
   `mysql/esquema.sql` y `modelo.ts` (tablas, llaves, CHECK, políticas).
2. Si la migración toca **funciones o triggers**: traducirlos a mano en
   `mysql/logica.sql` o, si la app los llama con `rpc()`, en `rpc.ts`.
3. `npm run test:mysql` y `copiar-datos.mts` para rehacer la base de pruebas.

El día que se encienda en producción, se invierte: MySQL pasa a mandar y
`supabase/migrations/` queda como historia.
