# La auditoría del modo MySQL ya en producción: lo que se arregló y lo que falta

- **Fecha:** 2026-10-17
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `fix/js-auditoria-mysql` → `staging` → `main` (entrega directa), tag `v0.12.1`
- **Fase del roadmap:** — (vía B-2: después del corte)
- **Sigue a:** [2026-10-17-produccion-sobre-mariadb.md](2026-10-17-produccion-sobre-mariadb.md)

## Qué se hizo

Jesús pidió auditar todo, también la seguridad, y arreglar lo que estuviera mal,
con el modo MySQL ya en producción. Se revisaron cuatro frentes por separado
(cuentas y sesiones; acceso a datos, RLS y SQL; fotos y archivos; lo que queda
atado a Supabase), y producción desde fuera. Nada fue crítico. Se arregló:

| Hallazgo | Gravedad | Arreglo |
|---|---|---|
| Cambiar la contraseña no cerraba las demás sesiones ni anulaba los códigos (GoTrue sí) | Alta | `updateUser` cierra las otras sesiones y marca los códigos como usados (`auth.ts`, `borrarCodigos` en `cuentas.ts`). Prueba en `sesiones.test.ts` |
| Registrarse otra vez con un correo sin confirmar reescribía la clave y el nombre de esa cuenta | Media | Ya no toca la cuenta, como GoTrue: solo manda otro código. Prueba |
| Redirección abierta con `?volver=/\evil.com` o `/<tab>/evil.com` en entrar, registro, código y clave | Media | `src/lib/ruta-propia.ts` (resuelve con `URL` y exige el mismo origen) en los cinco sitios. Prueba |
| El `with check` se saltaba si la fila escrita no se reencontraba por su llave (cambiar la llave primaria de una fila propia la pasaba a otra persona) | Media | Falla cerrado con 42501 (`consulta.ts`). Prueba en `permisos.test.ts` |
| La identidad de una petición pasaba a la siguiente cuando el pool entregaba la conexión directamente a quien esperaba (el evento `release` no salta) | Media | `enTransaccion` encola el borrado antes de devolverla (`contexto.ts`); comentarios de `conexion.ts` corregidos |
| `/api/latido` devolvía el error crudo de MariaDB (usuario de la base e IP) | Media | Al registro del servidor; la respuesta solo dice el motivo |
| Los pedidos sin pago no vencían solos: en MariaDB no hay `pg_cron` | Media (funcional) | `vencerPedidosDeFondo()` (como mucho una vez por hora, con la llave de servicio, que en `rpc.ts` hace de cron) al crear un pedido y al abrir una ficha |
| Una empresa podía llenar el disco subiendo fotos de oferta en bucle; la caché del optimizador no tenía tope | Media | 60 subidas por hora por empresa; `images.maximumDiskCacheSize` en 300 MB |
| El `matcher` de `src/proxy.ts` tenía `\.` en un string (queda `.`): las rutas que terminan en «ico», «png»… se saltaban el proxy, como `/oferta/coco-pacifico` | Baja | `\\.` |
| El tipo de imagen se creía del cliente | Baja | `bytesDeImagen()` mira la firma antes de guardar |
| Un `.tmp` quedaba si la escritura de una foto fallaba | Baja | Se borra |
| `rpc("constructor")`, tablas y columnas heredadas de `Object` | Baja | `Object.hasOwn` |
| `limit`/`offset` pegados al SQL sin comprobar | Baja | Solo enteros no negativos |
| Un objeto como valor de `?` se expandía en SQL (mysql2) | Baja | `stringifyObjects: true` |
| `olvidarDispositivo` mostraba el error crudo | Baja | `registrarFallo` |
| Una línea de foto con `?` o `//` tumbaba la ficha | Baja | `FotoOferta` la manda a `<img>` |
| `copiar-datos.mts` podía borrar producción y bajaba fotos de cualquier dominio | Operativa | Se niega con la base `…_seregenera` y exige el host del Supabase propio |
| La política de privacidad declaraba `sb-…` y no `sgr_sesion`, y decía que el respaldo de Vercel usaba la misma base | Legal | Corregida (Hostinger guarda la base; Supabase, la copia del 2026-10-17) |

También se actualizaron `CLAUDE.md`, `docs/VARIABLES.md`, `docs/MODO-MYSQL.md`
(«Trampas que ya costaron una caída») y las skills `supabase-schema`,
`acceso-y-registro`, `dominio-regenera` y `desplegar-hostinger`: todas trataban
a Supabase como la base que manda.

## Por qué así

- **Lo que hacía GoTrue es la referencia** para las cuentas: la app se escribió
  contra su comportamiento. Guardar la clave nueva «pendiente» junto al código
  se descartó: la víctima recibe en su buzón el código del intruso, lo escribe y
  le aplica su clave.
- **Fallar cerrado** donde la capa no puede comprobar una política, aunque hoy
  ningún camino de la app llegue ahí: son las garantías que la capa promete.
- **El vencimiento de pedidos sin cron**: un `EVENT` de MariaDB depende de que el
  plan tenga el planificador encendido, y un cron de Hostinger necesitaría un
  endpoint con secreto. Engancharlo donde el stock retenido estorba no necesita
  nada nuevo.

## La segunda caída del día

Al cerrar el acceso remoto a la base de producción después de la copia, el sitio
volvió a dar 500. La lógica (`logica.sql`) se había creado desde el PC y su
DEFINER era `usuario@IP-del-PC`, la cuenta que Hostinger borra con la regla de
acceso remoto. Se restauró recreando el acceso remoto. Detalle en
`docs/MODO-MYSQL.md`, «Trampas que ya costaron una caída».

## Qué quedó pendiente

- [ ] **Rehacer `logica.sql` desde el servidor** (127.0.0.1) y solo entonces
      cerrar el acceso remoto de la base de producción. Hoy el sitio depende de
      esa regla.
- [ ] **Los topes por IP se saltan**: la app toma la primera IP de
      `x-forwarded-for`, que escribe el cliente (comprobado: con otra IP
      inventada, el tope de `/api/latido` vuelve a cero). Delante está la CDN de
      Hostinger (`server: hcdn`). `v0.12.1` deja en el registro qué cabeceras
      llegan (`/api/latido?cadena`, temporal) para elegir la buena en
      `origenDeLaPeticion()` (`src/lib/ritmo.ts`).
- [ ] Topes globales de códigos y registros (Supabase los ponía por proyecto), un
      tope de 24 h de intentos de código por correo, y borrar cuentas sin
      confirmar viejas.
- [ ] La versión de `/archivos/…` no se comprueba al leer: con el tope de caché
      ya no llena el disco, pero sigue costando CPU. Arreglo: atarla a la fecha
      del archivo (y migrar las 10 fotos copiadas).
- [ ] Quitar una foto no borra el archivo: sigue en su URL.
- [ ] Un borrado en cascada no dispara triggers: al borrar una cuenta, la
      empresa conserva los puntos de sus artículos.
- [ ] `auth.admin` existe también en los clientes de sesión (hoy nadie lo usa ahí).
- [ ] `latido.yml` llama al Vercel de respaldo: producción no tiene un monitor
      externo. Y el Vercel de respaldo sigue escribiendo en Supabase.
- [ ] `scripts/seed.mts` y `scripts/crear-admin.mts` no sirven en el modo MySQL.
- [ ] El CI no corre `test:mysql` (no tiene la base): lo que corre en producción
      solo se prueba en local.
- [ ] Copias de seguridad de la base y de `~/seregenera-archivos`.

## Qué se rompe si tocas esto

- `rutaPropia()` es la única puerta de `volver`: una pantalla nueva que redirija
  con un parámetro de la URL la usa.
- Quitar el borrado de identidad del `finally` de `enTransaccion` vuelve a dejar
  que una petición herede la de otra bajo carga.
- `vencer_pedidos_sin_pago` acepta la llave de servicio **solo** en `rpc.ts`
  (MariaDB); la de Postgres sigue sin aceptarla.

## Verificación

- `npm run build`, `npx tsc --noEmit`, `npx eslint .` (0 errores; los avisos son
  de `.claude/skills/impeccable/scripts/`), `npm test` y `npm run test:mysql`.
- Las pruebas nuevas de `sesiones.test.ts` (cambio de clave) y `permisos.test.ts`
  (`with check`) fallan sin el arreglo y pasan con él.
- Producción, desde fuera: `/archivos/…` con `..`, `%2e%2e`, `%5c`, `%00` y rutas
  incompletas da 400 o 404; la base de producción no tiene ninguna fila con
  `supabase.co` (201 columnas revisadas, solo lectura).
