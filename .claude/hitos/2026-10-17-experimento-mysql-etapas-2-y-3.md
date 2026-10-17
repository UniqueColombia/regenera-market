# Las ofertas se escriben en MariaDB con los mismos permisos, y las fotos salen del disco

- **Fecha:** 2026-10-17
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-espejo-mysql` (sin merge: es un experimento)
- **Fase del roadmap:** — (pruebas de la vía B-2 de `ROADMAP-MIGRACION.md`)
- **Sigue a:** [2026-10-17-experimento-mysql-etapas-0-y-1.md](2026-10-17-experimento-mysql-etapas-0-y-1.md)

## Qué se hizo

Las etapas 2 y 3 del experimento, en la misma rama y con la misma regla:
producción y Supabase no cambian. Lo nuevo solo actúa con una variable que hoy
no está en ningún entorno real.

1. **Etapa 2: escribir una oferta con permisos.** Es lo que de verdad decía si
   B-2 es viable: MariaDB no tiene RLS.
   - `mysql/permisos-de-ofertas.sql`: `provider_members`, `user_roles`, las
     funciones `es_admin()` y `gestiona_proveedor()`, y dos triggers en
     `listings` que traducen `listings_provider_write`,
     `listings_proteger_proveedor` y `listings_version`.
   - `src/lib/mysql/ofertas.ts`: `comoUsuario()` (quién escribe),
     `visible()` (el filtro de lectura), `leerOferta()` y
     `escribirOfertaMysql()`, con los mismos resultados que `escribirOferta()`
     de `src/lib/ofertas.ts`.
   - `mysql/pruebas/permisos-ofertas.test.ts`: **18 pruebas**, la mayoría
     entrando con el rol equivocado. Corren con `npm run test:mysql`.
2. **Etapa 3: las fotos en el disco del servidor.**
   - `src/lib/almacen-disco.ts`: una implementación más de `AlmacenDeImagenes`.
     `getAlmacen()` la elige si existe `ALMACEN_CARPETA`.
   - `src/app/archivos/[...ruta]/route.ts`: sirve esas fotos desde el propio
     dominio.
   - `scripts/mysql/imagenes.mts`: copia las fotos del catálogo de Supabase
     Storage a la carpeta y cambia sus URL **solo en el espejo de MySQL**.
   - 6 pruebas de unidad en `src/lib/almacen-disco.test.ts` (corren en el CI).
3. `scripts/mysql/comparar-catalogo.mts` ahora también comprueba las fotos.
   `scripts/mysql/servidor.mts` quedó listo para probar todo dentro de
   Hostinger, pero **no se pudo correr** (ver «Qué quedó pendiente»).

## Por qué así

- **Escribir lo deciden triggers, leer lo filtran las consultas.** Es el
  reparto de Postgres, llevado a lo que MariaDB permite. Un trigger rechaza
  una escritura venga de donde venga, así que ninguna acción nueva puede
  olvidarse de comprobar. Para leer no hay equivalente, porque una vista de
  MariaDB no puede leer variables de sesión. Por eso el filtro de
  `listings_public_read` es `visible()`, y usa las mismas funciones de la base
  que los triggers.
- **Quién escribe va en variables de sesión** (`@app_usuario`, `@app_rol`),
  que es lo que hace `auth.uid()` en Supabase y lo que ya imita
  `supabase-minimo.sql`. Sin variables, la base ve a un visitante: **un
  olvido niega, no abre** (hay una prueba de eso). Una variable de sesión
  sobrevive cuando la conexión vuelve al pool, así que `conexion.ts` la borra
  cada vez que el pool entrega una (`onReserveConnection`). Sin eso, una
  petición podía heredar la identidad de la anterior, admin incluido (también
  hay prueba).
- **Una diferencia con Postgres, a propósito.** Allá, editar sin permiso
  afecta cero filas en silencio; aquí el trigger lo rechaza con `denegado`.
  Para quien llama, los dos son `motivo: "denegado"`.
- **Un solo trigger de cambio, con las columnas escritas una por una.** El
  `to_jsonb(new) - array[…]` de Postgres no tiene traducción directa. Si se
  agrega una columna a `listings` y no se agrega a la comparación, una edición
  de esa columna no devolvería la oferta a revisión. La prueba «el trigger
  compara todas las columnas» lee `information_schema` y falla si falta alguna.
- **Los puntos de experiencia no se portaron.** `otorgar_experiencia()` y su
  cadena (niveles, `docs/NIVELES.md`) son otro trabajo. En MySQL, hoy,
  publicar una oferta no da puntos.
- **Las fotos llevan la versión dentro de la ruta**
  (`/archivos/logos/<empresa>/<versión>/imagen.webp`), no en `?v=`. Next 16 no
  optimiza una imagen local con query string sin abrir
  `images.localPatterns`, y abrirlo cerraría de paso las de `/img/`.
- **Con las fotos en disco se pierde una comprobación.** Storage volvía a
  revisar, con su política de la 0008, que la carpeta fuera de quien subía.
  En disco vale solo la que hace la acción. Por eso cada pedazo de la ruta se
  valida contra un patrón cerrado: dueño uuid, pieza conocida, extensión de
  imagen. Hay pruebas con `..` y nombres inventados.
- **No se creó una segunda Web App en Hostinger.** Comparte CPU y memoria con
  `seregenera.com` y con los otros sitios de la cuenta de Ivan. Probar ahí
  podía degradar lo que funciona.

## Lo que cambia que todavía no haya ventas

El código de precios, stock, comisiones y pedidos existe, y hay que portarlo
igual aunque nadie haya comprado. Lo que **sí** cambia es el corte: no hay
datos que migrar con cuidado ni cuentas que conservar. Las cuentas de prueba
se pueden recrear, y lo que hay hoy en Supabase sirve de semilla. Eso
abarata mucho la etapa 4.

## Qué quedó pendiente

- [ ] **Probar dentro de Hostinger** (`scripts/mysql/servidor.mts`): Node 22
      del servidor contra 127.0.0.1, 30 consultas a la vez, la espera de
      25 s y una foto escrita y leída fuera del sitio. El permiso del agente
      para escribir en el servidor por SSH (`~/pruebas-mysql/`) fue
      **denegado**. Hace falta que Jesús lo autorice o lo corra él.
- [ ] Conectar `escribirOfertaMysql()` a las acciones (`guardarOfertaDeEmpresa`,
      `retirarOferta`, panel). Faltan dos cosas. Una: copiar
      `provider_members` y `user_roles` reales, que no son públicos y piden la
      llave de servicio. La otra: probarlo entrando con una cuenta en el
      navegador, que solo puede hacer una persona.
- [ ] Los puntos de experiencia en MariaDB.
- [ ] Los logos y portadas de las empresas (2 de las 8 fotos en Storage) no
      están en el espejo: su tabla no trae esas columnas.
- [ ] Dónde vive `ALMACEN_CARPETA` en Hostinger: fuera de
      `domains/seregenera.com` y sin copias de seguridad propias. Falta
      confirmar si Hostinger respalda la carpeta de inicio.
- [ ] **Etapa 4**: cuentas propias (sin Supabase Auth), pedidos y pagos, y el
      resto de las ~170 consultas.

## Qué se rompe si tocas esto

- **`onReserveConnection` de `conexion.ts`.** Si se quita, la identidad pasa
  de una petición a otra por el pool.
- **Escribir fuera de `comoUsuario()`.** La base lo trata como visitante y lo
  rechaza. Es a propósito.
- **La lista de columnas de `listings_proteger_cambio`.** Una columna nueva va
  ahí (la prueba lo exige).
- **`ALMACEN_CARPETA` en el `.env` de un PC.** `npm run dev` guardaría las
  fotos en el disco del PC y su URL en el Supabase de producción, donde se
  verían rotas. Va en el comando de cada prueba, o en un servidor cuya base
  sea MySQL.
- **Los patrones de `almacen-disco.ts`.** Aflojarlos abre la lectura o la
  escritura de archivos fuera de la carpeta.
- **Las columnas `json`** se leen como arreglo, pero se escriben como texto
  (`JSON.stringify`): un arreglo suelto, mysql2 lo expande en una lista
  (`ColumnType` en `esquema.ts`).
- **Lo que importan los scripts** (`conexion.ts`, `catalogo.ts`,
  `ofertas.ts`, `almacen-disco.ts`) corre con el TypeScript sin compilar de
  Node. Ahí no valen los `constructor(private x)`, los `enum` ni los imports
  relativos con valor.

## Verificación

- `npm run test:mysql`: **18/18**. Al terminar, 0 empresas de prueba, 0
  miembros, 0 roles; el espejo sigue con sus 19 ofertas públicas.
- `npm test`: **67/67** (las 61 de antes y las 6 de `almacen-disco`).
- `scripts/mysql/espejo.mts` con los dos archivos de esquema: 19 ofertas,
  931 campos, idénticas.
- `scripts/mysql/imagenes.mts` con `ALMACEN_CARPETA` en `outputs/`: 6 fotos
  copiadas y leídas de vuelta con el mismo sha256.
- `npm run build`, dos `next start` (Supabase en el 3101; MySQL y disco en el
  3102) y `comparar-catalogo.mts`:
  - **31/31 casos idénticos**;
  - la foto, directa, da 200 `image/webp`, y por el optimizador de Next
    también da 200;
  - **byte a byte igual** a la de Supabase (344.038 B);
  - tres rutas maliciosas dan 404;
  - sin `ALMACEN_CARPETA`, `/archivos` da 404.
- `npx tsc --noEmit` limpio. `npx eslint .`: 0 errores, y los 94 avisos de
  `.claude/skills/impeccable/scripts/` que ya estaban.
- No se probó: nada dentro de Hostinger, ni la app con una sesión iniciada.
