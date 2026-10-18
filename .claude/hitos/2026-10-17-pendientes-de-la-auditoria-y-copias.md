# Los pendientes menores de la auditoría, el CI que prueba MariaDB y las copias de seguridad diarias

- **Fecha:** 2026-10-17
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `fix/js-pendientes-auditoria` → `staging` → `main` (entrega directa), tag `v0.12.3`
- **Fase del roadmap:** — (vía B-2: después del corte)
- **Sigue a:** [2026-10-17-auditoria-del-modo-mysql.md](2026-10-17-auditoria-del-modo-mysql.md)

## Qué se hizo

Jesús pidió resolver los pendientes menores de la auditoría y montar copias de
seguridad de la base y las fotos. Dejó para después apagar el Vercel de respaldo
(con el latido que lo vigila) y pausar Supabase tras dos semanas estables.

| Pendiente de la auditoría | Arreglo |
|---|---|
| La versión de `/archivos/<bucket>/<dueño>/<versión>/<archivo>` no se comprobaba al leer: cualquier versión inventada servía la foto y llenaba la caché del optimizador | La versión es la fecha del archivo en base 36 (`versionDeFecha()` en `almacen-disco.ts`): `guardar` le pone esa fecha con `utimes` y `leerImagen` devuelve 404 si no coincide. Una URL vieja deja de servir cuando la foto se reemplaza. Las 10 fotos copiadas de Supabase recibieron su fecha en el servidor antes del despliegue (`copiar-datos.mts` ya lo hace solo) |
| Quitar una foto (avatar, logo, portada) dejaba el archivo en su URL | `borrarPieza()` en los dos almacenes (disco y Supabase); `guardar` borra además la misma pieza con otra extensión |
| Topes: Supabase los ponía por proyecto, y por correo solo por hora | 12 códigos por correo al día (además de los de la hora), 300 códigos por hora en total y 150 registros por hora en total (`cuentas.ts`) |
| Las cuentas sin confirmar se quedaban para siempre | `limpiarCuentas()`, como mucho una vez por hora al registrarse alguien: códigos de más de 2 días y cuentas sin confirmar de más de 7 días que no son de ninguna empresa ni tienen otro rol |
| Un borrado en cascada no dispara triggers: al borrar una cuenta, la empresa conservaba los puntos de sus artículos | `borrarCuenta` borra primero sus reacciones y artículos de la comunidad, con los triggers |
| El enlace del correo servía aunque hubiera uno más nuevo | Solo el del último código, y sin gastar un intento |
| El paso de bcrypt a scrypt al entrar podía pisar una clave cambiada en ese mismo instante | Solo reescribe si la clave guardada sigue siendo la vieja |
| `auth.admin` existía también en los clientes de sesión | Error 403 `not_admin` salvo en `clienteDeServicio()` |
| La cookie de sesión dependía de `NEXT_PUBLIC_SITE_URL` para ser `Secure` | Siempre `Secure` en producción |
| El correo de consola imprimía el código en producción | Sin el cuerpo en producción |
| `seed.mts` y `crear-admin.mts` no sirven en el modo MySQL | Se niegan sin `--supabase`; el primer administrador en MariaDB es un `insert into user_roles` (`docs/MODO-MYSQL.md`) |
| Una carpeta de fotos relativa en `ALMACEN_CARPETA` dependía del directorio de arranque | `getAlmacen()` la rechaza |
| El CI no probaba lo que corre en producción | Job `mysql` en `.github/workflows/ci.yml`: un MariaDB 11.8 de servicio, y `preparar.ts` crea el esquema si la base está vacía. En la primera vuelta encontró una prueba que dependía del catálogo de certificaciones de la base de pruebas borrada |

**Copias de seguridad:** `scripts/servidor/respaldar.sh` corre en el servidor
cada día a las 03:15 UTC (cron de la cuenta) y deja en `~/respaldos/` un
`mariadb-dump` comprimido (comprueba la línea final «Dump completed» antes de
darlo por bueno) y un `tar` de las fotos, 14 días. `scripts/respaldos.mts`
lo instala, hace el simulacro de restauración en una base temporal y trae la
última copia al PC. Procedimiento en `docs/MODO-MYSQL.md`, «Copias de
seguridad».

## Por qué así

- **La versión atada a la fecha del archivo**, y no a un hash del contenido ni a
  una tabla: no hay que leer la foto ni la base para validar la URL, y el
  `stat` que ya hacía falta lo dice. Un hash obligaba a leer el archivo entero
  en cada petición que no estuviera en caché.
- **La limpieza al registrarse**, como el vencimiento de pedidos: sin un cron
  que llame a un endpoint con secreto. Cada hora como mucho.
- **Las copias, con un cron de la propia cuenta** y no con las de Hostinger: las
  de Hostinger no se ven ni se restauran por la API, y no se sabe a qué hora
  corren ni qué guardan. El simulacro restaura de verdad y compara tabla por
  tabla: una copia que nunca se restauró no es una copia.
- **El DEFINER se quita al restaurar** (`sed` en `respaldos.mts probar`): las
  rutinas de producción son de `…@127.0.0.1`, y restaurarlas en otra base con
  otro usuario fallaría por permisos.

## Qué quedó pendiente

- [ ] **Apagar el Vercel de respaldo** y apuntar `latido.yml` a
      `seregenera.com` (Jesús lo dejó para después).
- [ ] **Pausar Supabase** tras dos semanas estables, hacia el 2026-10-31.
- [ ] Mirar en hPanel qué copias automáticas guarda el plan Business.
- [ ] Bajos, sin arreglar:
  - «Regístrate» dice si un correo ya tiene cuenta.
  - El enlace de `/auth/callback` abre la sesión de quien lo mandó (CSRF de login).
  - Una foto que se quita de una oferta no se borra del disco.
  - El factor de trabajo de scrypt es el de la librería.
  - Los aparatos de confianza no caducan.
  - Los filtros sobre tablas relacionadas se ignoran en `update` y `delete`.

## Qué se rompe si tocas esto

- **La fecha de cada foto es su versión.** Copiar `~/seregenera-archivos` sin
  conservar las fechas (`cp` sin `-p`, un `tar` sin ellas, un FTP) deja todas
  las fotos en 404. Restaurar con `tar -xzf`, que las conserva.
- `guardar` pone la fecha **antes** del `rename`: si se cambia el orden, hay un
  instante en que la URL devuelta no sirve.
- `respaldar.sh` lee la clave de la base del `.env` del servidor
  (`hbuilds/config/.env`). Si Hostinger cambia esa ruta, las copias fallan: el
  cron manda el error a su salida (`hosting_cron-jobs_output`).

## Verificación

- `npm run build`, `npx tsc --noEmit`, `npx eslint .` (0 errores), `npm test`
  y el job `mysql` del CI.
- `almacen-disco.test.ts`: una URL vieja y una versión inventada dan
  `undefined`; quitar una pieza la borra; cambiar de formato no deja la anterior.
- Antes del despliegue, en el servidor: las 10 fotos con la fecha de su versión,
  sin ningún problema. Después de `v0.12.3`, las 7 fotos públicas (catálogo y
  proveedores) dan 200 y la misma URL con una versión inventada, 404.
- **Simulacro de restauración** (`respaldos.mts probar`) con la primera copia
  (base de 48 KB y fotos de 1,5 MB): 27 rutinas, 30 triggers y 3 vistas, las 29
  tablas con las mismas filas que producción y las 10 fotos. La base temporal se
  borró después (comprobado en la lista de bases). La copia está también en
  `outputs/respaldos/` del PC de Jesús.
- Lo que hubo que corregir en el camino, ya en los scripts: la clave de la base
  va entre comillas simples en el `.env` del servidor porque lleva `$`; con dos
  conexiones por tabla el MariaDB compartido cortó a la décima (ERROR 2002); y el
  servidor no tiene `/dev/fd`, así que no sirve `< <(…)`.
- El cron (`15 3 * * *`, `/bin/bash /home/…/respaldos/respaldar.sh`) se creó por
  la API; el servidor está en UTC.
