# La app entera corre sobre el MariaDB de Hostinger, detrás de un interruptor

- **Fecha:** 2026-10-17
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-espejo-mysql` (sin merge: espera la prueba de Jesús)
- **Fase del roadmap:** — (vía B-2 de `ROADMAP-MIGRACION.md`: etapas 4b a 4f)
- **Sigue a:** [2026-10-17-experimento-mysql-etapa-4a-cuentas.md](2026-10-17-experimento-mysql-etapa-4a-cuentas.md)

## Qué se hizo

Jesús pidió las etapas 4b a 4f juntas, para probar al final como usuario.
Quedó el **modo MySQL**: con `BASE_DE_DATOS=mysql`, todo lo que va a Supabase
(datos, cuentas y fotos) va al MariaDB del plan de Hostinger. **Sin la
variable, la app es la de siempre**, y producción no la tiene. Cómo se usa,
cómo se enciende y cómo se apaga: [`docs/MODO-MYSQL.md`](../../docs/MODO-MYSQL.md).

- **Una capa compatible con supabase-js** (`src/lib/mysql/postgrest/`):
  `from()`, `rpc()` y `auth` con la forma de `SupabaseClient`.
  `createClient()`, `createAdminClient()` y los clientes efímero y de token la
  devuelven en el modo MySQL. **Ninguna página ni acción cambió.**
- **El esquema, generado del Postgres de producción**
  (`scripts/mysql/generar-esquema.mts` → `mysql/esquema.sql` y
  `src/lib/mysql/modelo.ts`): las 25 tablas con sus llaves, CHECK e índices, y
  las 58 políticas RLS traducidas.
- **La lógica, traducida a mano**:
  - `mysql/logica.sql`: 23 funciones, 6 procedimientos, 30 triggers (los 25 de
    Postgres, partidos por evento) y las 3 vistas;
  - `rpc.ts`: las 17 funciones que la app llama con `rpc()`, de plpgsql a
    TypeScript.
- **Las sesiones** sobre el motor de cuentas de la etapa 4a (`auth.ts`), con los
  correos de código mandados por la app con las plantillas de
  `plantillas-correo/`, y el `proxy.ts` validando la cookie `sgr_sesion` contra
  la tabla `sesiones`.
- **El corte (4f), escrito y sin ejecutar:**
  - `scripts/mysql/copiar-datos.mts` copia todo de Supabase: las cuentas con su
    hash bcrypt (se entra con la misma contraseña), las 25 tablas y las fotos,
    sin escribir nada allá;
  - `docs/MODO-MYSQL.md` trae los pasos y la vuelta atrás.
- **`npm run dev:mysql`** para probarlo en el PC.

Se borró lo que el modo completo dejó de lado: el espejo del catálogo,
`FUENTE_CATALOGO`, `catalogo.ts`, `ofertas.ts` y sus scripts. Los hitos
anteriores siguen contando por qué se hicieron.

## Por qué así

- **Una capa que imita a PostgREST, y no reescribir las ~170 consultas.** La
  app ya hablaba con «un PostgREST»: reemplazarlo por otro que entiende lo
  mismo deja un solo código para los dos modos. Lo que la capa no implementa
  (agregados, `csv()`, búsqueda de texto) es un error explícito, porque la app
  no lo usa.
- **El esquema y las políticas, generados; la lógica, a mano.** Las tablas,
  las llaves y las expresiones de las políticas se traducen con reglas fijas, y
  un generador no se equivoca dos veces igual. Un plpgsql de 8.000 caracteres
  (`crear_orden`) no se traduce solo.
- **Los triggers en MariaDB y las funciones de `rpc()` en TypeScript.** Un
  trigger tiene que dispararse escriba quien escriba, así que va en la base.
  Una función que la app llama con `rpc()` es más fácil de leer, probar y
  seguir paso a paso en TypeScript, dentro de una transacción con candados.
- **El `with check` se evalúa sobre la fila propuesta, antes de que exista.**
  Lo encontró una prueba. Comprobando *después* de insertar, `is_admin()` (que
  lee `user_roles`) veía el rol de admin que alguien se acababa de insertar a sí
  mismo. Ahora la capa escribe en un *savepoint*, lee cómo quedó la fila tras
  los triggers, deshace, evalúa la política sobre esa fila como tabla derivada
  y solo entonces escribe. Es lo que hace Postgres.
- **Las contraseñas de Supabase se copian, no se reemplazan.** GoTrue guarda
  bcrypt; el motor lo acepta y lo cambia por scrypt en el primer acceso. Para
  probar como usuario, entrar con la contraseña de siempre vale más que la
  limpieza de no traerlas.
- **Las lecturas sin transacción y la limpieza de la identidad al devolver la
  conexión.** Desde el PC cada viaje a la base son ~160 ms. Una consulta hacía
  cinco; ahora hace dos, y la página tarda la mitad. Con *read committed*, un
  `select` suelto ve lo mismo con transacción o sin ella. La identidad la sigue
  fijando la capa al empezar, y el pool la borra al recibir la conexión de
  vuelta (lo cubre la prueba «la identidad no se queda pegada»).
- **4f no se ejecutó.** Encenderlo en `seregenera.com` es lo único que Jesús
  pidió no hacer sin su prueba: «la idea es no dañar nada de lo que ya tenemos».

## Verificación

- `scripts/mysql/copiar-datos.mts`: 3 cuentas (las 3 con contraseña), las 25
  tablas con **las mismas filas que Supabase** en cada una, 10 fotos al disco.
- `scripts/mysql/comparar-sitio.mts` con dos `next start` (Supabase y MySQL):
  **79 páginas públicas**, entre ellas cada oferta, cada empresa, el catálogo
  con 25 filtros, el sitemap y las páginas legales. 75 salen idénticas en
  texto, enlaces y fotos. Las otras 4 traen el mismo contenido en otro orden,
  por consultas sin `order by` (ver «Qué se rompe»).
- Como administrador, con una sesión de prueba (borrada al terminar): **28
  páginas con sesión** dieron 200 sin un solo error en el servidor (cuenta,
  empresa, ofertas, pedidos y las 13 del panel). El panel muestra el pedido y
  los usuarios reales.
- `npm run test:mysql`: **73/73**:
  - permisos (23): el rol equivocado en ofertas, empresas, roles, pedidos,
    reseñas, el pool;
  - compras (11): stock, precio mayorista, comisión por nivel, envío por zona,
    doble envío, dos compras a la vez por la última unidad, cupos,
    cancelar/reabrir, transiciones, despacho, entrega, puntos, reseña y
    devolución;
  - sesiones (9): registro con código, contraseña con segundo factor, bcrypt
    importado, enlace del correo, cambio de clave, `admin`;
  - funciones (11): postularse, un documento una empresa, aprobar, cerrar,
    baja, prospectos, visitas, analíticas, comunidad;
  - cuentas (19).
- `npm run build`, `npx tsc --noEmit`, `npx eslint .` (0 errores; los avisos
  de siempre en `impeccable`) y `npm test` (67/67).
- **No se probó**: la app en el navegador con una persona (eso es lo que falta);
  la app desplegada en Hostinger en este modo.

## Qué quedó pendiente

- [ ] **Que Jesús lo pruebe como usuario** (`npm run dev:mysql`, lista en
      `docs/MODO-MYSQL.md`).
- [ ] El corte en producción (4f), si la prueba sale bien y Jesús lo aprueba,
      junto con Ivan, que es el dueño de la cuenta.
- [ ] Mientras convivan los dos: cada migración de Postgres se regenera con
      `generar-esquema.mts`, y sus funciones y triggers se traducen a mano.
- [ ] Las consultas sin `order by` (`getListingsByProvider`,
      `getRelatedListings`, la lista de proveedores) podrían llevar uno en
      `repo.ts`, que vale para los dos modos. No se tocó: cambia producción.

## Qué se rompe si tocas esto

- **`rpc.ts` y `logica.sql` son gemelos de Postgres.** Si cambia una función o
  un trigger en `supabase/migrations/`, cambia aquí en el mismo commit, con su
  prueba en `mysql/pruebas/`.
- **`mysql/esquema.sql` y `modelo.ts` no se editan**: se regeneran.
- **La comparación de columnas de `listings_antes_de_cambiar`.** Una columna
  nueva de `listings` va ahí (la prueba lo exige).
- **`escribirComprobando()` de `consulta.ts`.** Si se cambia por una
  comprobación después de escribir, vuelve el agujero del admin autoasignado.
- **El evento `release` del pool** (`conexion.ts`). Sin él, una petición
  hereda la identidad de la anterior.
- **`NEXT_PUBLIC_SITE_URL` en `dev:mysql`.** Con el dominio de producción, el
  enlace del correo y las redirecciones del acceso llevarían a seregenera.com,
  que sigue con Supabase.
- **Editar archivos con un script que lleve `\` dentro de un heredoc de
  bash**: dos veces se comieron las barras invertidas de una expresión regular
  (la del bcrypt quedó sin coincidir con nada). Las pruebas lo atraparon. Para
  esos cambios, la herramienta de edición directa.
