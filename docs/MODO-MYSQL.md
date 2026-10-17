# El modo MySQL: Seregenera entera en Hostinger, sin Supabase

**Qué es.** Con `BASE_DE_DATOS=mysql`, todo lo que hoy va a Supabase va al
MariaDB del plan de Hostinger:

- **los datos**, por una capa que habla como PostgREST;
- **las cuentas y sesiones**, con un motor propio en lugar de Supabase Auth;
- **las fotos**, al disco del servidor en lugar de Storage.

Sin la variable, la app es exactamente la de siempre. Las tres cosas cambian
**juntas**: con las cuentas en un lado y los datos en el otro, las políticas de
Supabase no sabrían quién pide.

Estado al 2026-10-17: hecho y probado en la rama `feat/js-espejo-mysql`.
**Producción sigue con Supabase.** Falta que Jesús lo pruebe como usuario y, si
sale bien, encenderlo en Hostinger (más abajo). Las razones de cada decisión
están en los hitos `2026-10-17-experimento-mysql-*` y `2026-10-17-modo-mysql-completo.md`.

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
| `mysql/pruebas/` | 73 pruebas contra la base de pruebas (`npm run test:mysql`) | — |

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

1. **Los datos.** La base de pruebas de Hostinger ya tiene una copia del
   2026-10-17. Para traer lo de hoy (borra lo que haya en MySQL y vuelve a
   copiar todo):

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

No está hecho: se hace cuando Jesús lo apruebe después de probar. **Supabase
no se toca en ningún paso**, y es la vuelta atrás.

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

**Postgres sigue mandando**: una migración nueva va a `supabase/migrations/`,
se aplica en Supabase y después:

1. `node --env-file=.env scripts/mysql/generar-esquema.mts` → regenera
   `mysql/esquema.sql` y `modelo.ts` (tablas, llaves, CHECK, políticas).
2. Si la migración toca **funciones o triggers**: traducirlos a mano en
   `mysql/logica.sql` o, si la app los llama con `rpc()`, en `rpc.ts`.
3. `npm run test:mysql` y `copiar-datos.mts` para rehacer la base de pruebas.

El día que se encienda en producción, se invierte: MySQL pasa a mandar y
`supabase/migrations/` queda como historia.
