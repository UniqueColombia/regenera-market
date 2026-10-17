# Todo funciona dentro de Hostinger, y hay cuentas propias sin Supabase Auth

- **Fecha:** 2026-10-17
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-espejo-mysql` (sin merge: es un experimento)
- **Fase del roadmap:** — (pruebas de la vía B-2 de `ROADMAP-MIGRACION.md`)
- **Sigue a:** [2026-10-17-experimento-mysql-etapas-2-y-3.md](2026-10-17-experimento-mysql-etapas-2-y-3.md)

## Qué se hizo

1. **La prueba dentro de Hostinger, que había quedado pendiente.** Jesús
   autorizó subirla por SSH. `scripts/mysql/servidor.mts` corrió con el
   Node 22 del servidor, contra 127.0.0.1, desde una carpeta aparte en la
   carpeta de inicio (fuera de `domains/`). La carpeta se borró al terminar.

   | Prueba | Resultado |
   |---|---|
   | Modo estricto y UTC en cada conexión | ✓ |
   | 9 filtros del catálogo, mismos totales que Supabase | ✓ |
   | Catálogo completo (página + conteo + cupos), 50 seguidas | **2,0 ms** de mediana (Supabase desde el mismo servidor: ~52 ms por consulta) |
   | 30 consultas a la vez con un pool de 5 | ✓, 42 ms |
   | Consultar tras 25 s ociosa (el servidor corta a los 20) | ✓, 7 ms |
   | Escribir y leer una foto fuera del sitio con `AlmacenDisco` | ✓ |

2. **Etapa 4a: el motor de cuentas propio.**
   - `mysql/cuentas.sql`: `usuarios`, `sesiones` y `codigos`.
   - `src/lib/mysql/cuentas.ts`: cuentas, contraseñas, códigos de seis
     dígitos y sesiones. Es lo que hoy hace Supabase Auth.
   - `mysql/pruebas/cuentas.test.ts`: **19 pruebas**, casi todas intentando
     romperlo.
   - `user_roles` y `provider_members` ahora apuntan a `usuarios` con llave
     foránea, como en Postgres apuntan a `auth.users`. Borrar una cuenta se
     lleva sus roles y membresías.
   - Las pruebas de MySQL preparan la base en un solo sitio:
     `mysql/pruebas/preparar.ts`.

   **No está conectado a las pantallas.** `/entrar`, `/registro` y
   `/cuenta/clave` siguen con Supabase.

## Por qué así

- **Contraseñas con scrypt** (viene con Node: no suma dependencias), con
  N = 2^15. Más alto aprieta la memoria del hosting compartido cuando entran
  varias personas a la vez. Los parámetros van escritos en cada hash, así
  que se pueden subir mañana sin invalidar las contraseñas de hoy. Antes de
  derivar se normaliza a NFC: la misma «é» llega compuesta o descompuesta
  según el teclado.
- **No se importan los hashes de Supabase.** GoTrue guarda bcrypt.
  Traerlos exige leer `auth.users` con permisos de administración, y no hay
  usuarios reales que conservar. Una cuenta importada queda sin contraseña:
  entra con código y se pone una, que es el camino que ya existe para
  «olvidé mi contraseña».
- **La sesión es un token aleatorio en la cookie; en la base, solo su
  sha256.** No hay JWT que validar ni refrescar. Leer la tabla no da acceso
  a ninguna cuenta. La sesión muere por inactividad y por edad, con los
  números de `src/lib/inactividad.ts` (48 h y 30 días): se importan, no se
  copian.
- **El código vale una vez, 15 minutos y 5 intentos, y solo el último
  pedido.** El intento se cuenta antes de comparar y en la misma transacción
  que lee el código (`for update`). Así dos verificaciones simultáneas no
  entran las dos (hay prueba).
- **El ritmo de los códigos se cuenta en la base**: 60 s entre uno y otro, 5
  por hora por correo. `src/lib/ritmo.ts` lo cuenta en la memoria de cada
  proceso; aquí es exacto aunque haya reinicios o varios procesos.
- **El motor no manda correos ni escribe cookies.** Devuelve el código y el
  token, y la acción decide. Así el modelo de `src/app/entrar/actions.ts`
  (contraseña siempre, código solo en un aparato desconocido) no cambia;
  cambia quién guarda las cosas.

## Lo que esto enseñó sobre el plan: el corte es uno solo

**Las cuentas no pueden pasar a MySQL antes que los datos.** Las políticas
RLS de Supabase saben quién pide gracias a la sesión de Supabase
(`auth.uid()` sale de su JWT). Con las cuentas en MySQL, Supabase ya no sabe
quién es nadie. La app tendría que hablarle con la llave de servicio para
todo, y eso apaga la protección. Al revés tampoco sirve: datos en MySQL con
la sesión en Supabase obliga a mantener los dos sistemas a la vez.

Así que el resto de la etapa 4 se construye **módulo por módulo, cada uno
probado, detrás de un solo interruptor** («modo MySQL», que reemplaza a
`FUENTE_CATALOGO`). Se enciende todo junto cuando esté completo. Hasta
entonces, producción no ve nada de esto. El orden propuesto:

| Paso | Qué | Cómo se prueba |
|---|---|---|
| 4b | El interruptor y la identidad: `getUser`/`getSesion`/`requireUser`, el `proxy.ts`, `/entrar`, `/registro`, `/salir` y `/cuenta/clave` sobre `cuentas.ts`; los códigos salen por el SMTP de Hostinger con las plantillas de `plantillas-correo/`; `trusted_devices` en MySQL | Pruebas, y Jesús en el navegador en local con el modo MySQL |
| 4c | Empresas, perfiles, certificaciones, evaluaciones, postulaciones (`/vender`), reseñas y la cadena de puntos y niveles | Pruebas portadas de `supabase/pruebas/` (gemelos, permisos) |
| 4d | Pedidos, cotizaciones, cupos, stock y pagos (la compra atómica, las transiciones, el webhook de BOLD) | `compras`, `concurrencia` y `pagos` portadas |
| 4e | Comunidad, paneles de administración, prospectos y campañas, medición, la baja (0021) | Las suyas, y el resto de `permisos` |
| 4f | El corte: copiar los datos de Supabase (la llave de servicio, una vez), desplegar con el modo MySQL y `ALMACEN_CARPETA` en Hostinger | El Anexo B de `ROADMAP-MIGRACION.md`. Volver atrás: quitar las variables y redesplegar; Supabase sigue intacto |

## Qué quedó pendiente

- [ ] Todo lo de la tabla de arriba.
- [ ] No hay tope de intentos de **contraseña** por cuenta en la base: lo
      sigue haciendo `ritmo.ts` en la acción, como hoy.
- [ ] Copias de seguridad de la base de Hostinger y de `ALMACEN_CARPETA`:
      sin mirar.

## Qué se rompe si tocas esto

- **El orden del esquema:** `espejo-catalogo.sql`, luego `cuentas.sql`, luego
  `permisos-de-ofertas.sql` (`ESQUEMA` de `scripts/mysql/espejo.mts` y de
  `mysql/pruebas/preparar.ts`). Fuera de orden, faltan las tablas a las que
  apuntan las llaves foráneas, o los triggers se pierden.
- **Guardar un token o un código en claro**, aunque sea en un log. Las
  pruebas comprueban que la base no los tiene; un `console.log` no lo cubre
  nadie.
- **`normalizarCorreo()`.** La unicidad del correo es binaria: sin
  normalizar, «Ana@x.co» y «ana@x.co» serían dos cuentas.
- **Bajar los parámetros de scrypt.** Las contraseñas nuevas quedarían más
  débiles sin que nada falle.
- `preparar.ts` **rehace** `usuarios`, `sesiones` y `codigos` en cada corrida
  de las pruebas. Mientras dure el experimento no hay cuentas reales ahí. El
  día que las haya, las pruebas necesitan su propia base.

## Verificación

- Por SSH, en Hostinger: `servidor.mts` dio «Todo bien» (la tabla de
  arriba).
- `npm run test:mysql`: **37/37** (18 de permisos y 19 de cuentas). Después, 0
  usuarios, 0 sesiones, 0 códigos y 0 empresas de prueba.
- `scripts/mysql/espejo.mts` con los tres archivos de esquema: 19 ofertas,
  931 campos, idénticas. `imagenes.mts`: 6 fotos.
- `npm run build`, `npx tsc --noEmit`, `npx eslint .` (0 errores; los 94
  avisos de siempre en `impeccable`) y `npm test` (67/67).
- `seregenera.com`: sin cambios.
