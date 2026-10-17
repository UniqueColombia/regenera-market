# Producción corre sobre el MariaDB de Hostinger, y Supabase queda de vuelta atrás

- **Fecha:** 2026-10-17
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-espejo-mysql` → `staging` → `main` (entrega directa), tag `v0.12.0`
- **Fase del roadmap:** — (vía B-2 de `ROADMAP-MIGRACION.md`: el corte, etapa 4f)
- **Sigue a:** [2026-10-17-modo-mysql-completo.md](2026-10-17-modo-mysql-completo.md)

## Qué se hizo

Jesús probó el login con `npm run dev:mysql` y pidió el corte el mismo día.
**`seregenera.com` lee y escribe desde entonces en el MariaDB del plan de
Hostinger**: datos, cuentas, sesiones y fotos. Supabase no se tocó y es la
vuelta atrás.

1. El modo MySQL entró en `main` y salió como **`v0.12.0`**, todavía sin
   `BASE_DE_DATOS`: producción siguió con Supabase y se comprobó así.
2. **Una base nueva para producción**, `…_seregenera`, aparte de la de pruebas
   (`…_sgpruebas`), en la misma cuenta. La creó Jesús en hPanel.
3. **La copia**, con `scripts/mysql/copiar-datos.mts` apuntando a esa base: 3
   cuentas y las 25 tablas, iguales fila por fila en las dos bases, y 10 fotos
   de Storage subidas por `scp` a `~/seregenera-archivos` (fuera de `domains/`).
4. **Las variables en hPanel**, las puso Jesús: `BASE_DE_DATOS=mysql`, las
   `MYSQL_*` con `MYSQL_HOST=127.0.0.1` y `ALMACEN_CARPETA` en esa carpeta.
5. El acceso remoto a la base de producción, que solo hizo falta para la copia
   desde el PC, **se cerró al terminar**. La de pruebas lo conserva.

De paso se arregló un aviso que salía solo en `next dev`: React recorre el valor
de cada `await` del código propio, y la conexión de mysql2 que entrega
`enTransaccion` traía su cola de consultas, cuyo `then()` imprime «…on the result
of query that is not a promise…» y lanza. El login funcionaba igual. Ahora esa
propiedad no es enumerable (`src/lib/mysql/postgrest/contexto.ts`), con una
prueba en `mysql/pruebas/conexion.test.ts`.

## Por qué así

- **El orden es código, base, datos y variables, en ese orden.** Con el código
  desplegado sin la variable no cambia nada, y la variable es lo único que
  enciende el modo. Esta vez las variables se pusieron **antes** de la copia, y
  durante esos minutos producción apuntó a una base vacía: la portada dio 500,
  `/api/latido` 503 y el catálogo salió sin ofertas, hasta que terminó la copia
  (22:19 UTC). No había usuarios reales. **Las variables van siempre al
  final.**
- **Una base aparte para producción**, y no reutilizar la de pruebas: la de
  pruebas se rehace cada vez que se corre `copiar-datos.mts` o `test:mysql`
  crea y borra gente.
- **Las variables y la base las pone la persona en hPanel.** La API de variables
  reemplaza el juego entero (habría que mandarle `SMTP_PASSWORD`, la llave de
  servicio y los datos bancarios), y el modo automático de Claude Code no deja
  al agente escribir claves en el `.env` ni tocar la base de producción sin una
  regla de permisos. Para esta sesión Jesús la agregó en el `settings.local.json`
  de la carpeta donde arrancó Claude Code, que es la que cuenta.
- **El corte se hizo sin la lista completa de `docs/MODO-MYSQL.md` probada a
  mano**, solo el login. Se aceptó porque no hay ventas ni usuarios reales y
  volver atrás es borrar una variable.

## Qué quedó pendiente

- [ ] **Jesús recorre en producción la lista de `docs/MODO-MYSQL.md`**
      («Qué probar»): registro con código por correo, catálogo y búsqueda,
      compra, admin, oferta con foto, comunidad y cambio de contraseña. El
      correo con el código ahora lo manda la app; en producción no se ha visto
      llegar.
- [ ] **Todos vuelven a entrar una vez**: las cookies de Supabase no valen en
      este modo. Las contraseñas sí.
- [ ] **Cómo se cambia el esquema a partir de hoy.** `supabase/migrations/` ya
      no es la fuente: la base que manda es MariaDB, y `generar-esquema.mts`
      lee de Postgres. Hasta que haya migraciones propias para MariaDB, un
      cambio de esquema es SQL escrito a mano, aplicado en la base de
      producción y reflejado en `mysql/*.sql` y `src/lib/mysql/modelo.ts`.
      Decidirlo con Ivan antes del próximo cambio de tablas.
- [ ] **El respaldo de Vercel** (`regenera-market.vercel.app`) sigue con
      Supabase: muestra los datos del 2026-10-17 y lo que se escriba ahí no
      llega a producción. Apagarlo, o al menos no usarlo.
- [ ] **Copias de seguridad** de la base de producción y de
      `~/seregenera-archivos`. No se comprobó qué guarda el plan.
- [ ] Tras dos semanas estable: apagar el latido de Supabase
      (`.github/workflows/latido.yml`) y decidir qué se hace con el proyecto de
      allá (`docs/MODO-MYSQL.md`, al final de «Encenderlo en producción»).

## Qué se rompe si tocas esto

- **`copiar-datos.mts` rehace el esquema desde cero.** Corrido contra la base de
  producción, borra todo lo escrito desde el corte. Después del corte solo se
  corre contra la de pruebas.
- **Quitar `BASE_DE_DATOS` en hPanel** devuelve el sitio a Supabase con los
  datos del 2026-10-17. Lo escrito en MySQL desde el corte no vuelve: no hay
  copia en sentido contrario.
- **`ALMACEN_CARPETA` vive fuera de `domains/`** para que ningún despliegue la
  pise. Si se mueve, las fotos de `/archivos/…` dan 404.
- **No se quita el `Object.defineProperty` de `contexto.ts`**: vuelve el aviso en
  `next dev`, y la prueba de `conexion.test.ts` lo detecta.

## Verificación

- Antes de `v0.12.0`, sobre el mismo árbol que quedó en `main`: `npm run build`,
  `npx tsc --noEmit`, `npx eslint .` (0 errores; los avisos son de
  `.claude/skills/impeccable/scripts/`), `npm test` (67) y `npm run test:mysql`
  (74). La prueba nueva falla sin el arreglo y pasa con él.
- `v0.12.0` desplegada con `scripts/desplegar.mts`, todavía con Supabase: 200 en
  las diez rutas que revisa el script y 19 ofertas en el catálogo.
- La copia: las 26 filas de su resumen (las cuentas y las 25 tablas) con el
  mismo número en Supabase y en MySQL. Huella de las cuentas: `2623e55bea23`.
- Producción ya en MySQL, desde fuera: 200 en `/`, `/catalogo`, `/proveedores`,
  `/entrar`, `/registro`, `/terminos`, `/privacidad`, `/api/latido` (1 ms) y
  `/robots.txt`. 19 ofertas en el catálogo, con las fotos en `/archivos/…`
  (200, `image/webp`). Una ficha de oferta y una de proveedor, 200. `/cuenta`
  sin sesión redirige a `/entrar?volver=/cuenta` y `/admin`, con 307. Están las
  cabeceras CSP, HSTS y `X-Frame-Options`.
- **No se comprobó**: nada con una sesión iniciada en producción, ni que lleguen
  los correos desde el modo MySQL. Es lo primero de la lista de Jesús.
