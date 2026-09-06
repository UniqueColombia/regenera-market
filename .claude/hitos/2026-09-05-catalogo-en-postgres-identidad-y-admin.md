# El catálogo sale de Postgres, hay identidad y hay panel de administración

- **Fecha:** 2026-09-05
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-catalogo-postgres-auth-admin` → #31
- **Fase del roadmap:** 1 y 2 — Bloques 1, 2 y 3 de `docs/BETA.md`

## Qué se hizo

Tres bloques en un PR, a petición del dueño del repositorio y **contra lo que
`docs/BETA.md` recomienda** («el Bloque 1 no se hace en un PR gigante»). Se dejó
un commit por bloque para que el diff siga siendo revisable por partes.

**Bloque 1.** `src/lib/repo.ts` ya no importa `src/data/`: el catálogo, los
proveedores y las cifras del home salen de Postgres. Migración
`0003_busqueda.sql`, aplicada.

**Bloque 2.** Registro y acceso con código de seis dígitos (`/registro`,
`/entrar`, `/auth/callback`, cierre de sesión). El encabezado sabe quién eres.

**Bloque 3.** `/admin`: aprobar, rechazar y suspender proveedores.

## Por qué así

**La vista `listings_publicos` existe por una limitación concreta, no por
comodidad.** PostgREST no sabe ordenar la tabla padre por una columna de una
tabla embebida, y el orden por defecto del catálogo es «destacados primero,
luego mejor puntaje del proveedor» — puntaje que vive en `providers`. Sin la
vista habría que traerse el catálogo entero y ordenarlo en JavaScript: funciona
con 18 ofertas y muere con 1.500. De paso resolvió el filtro por nivel (pasa a
ser un `>=`) y la búsqueda por nombre de proveedor (deja de necesitar una segunda
consulta).

`security_invoker = true` en la vista **no es opcional**. Por defecto una vista
consulta con los permisos de quien la creó, así que sin esa opción cualquier
visitante leería a través de ella justo lo que RLS le niega directamente.

**La trampa del `unaccent`, que es donde se atasca todo el mundo.** `unaccent()`
está declarada `stable`, no `immutable`, porque depende del diccionario
instalado; y una columna generada exige `immutable`. Por eso existe
`public.sin_tildes()`, que fija el diccionario con `::regdictionary` y por tanto
sí puede declararse `immutable`. Se descartó ponerle `set search_path` a esa
función: una función con cláusula `SET` no se puede inlinear y da problemas
dentro de una columna generada; calificar cada referencia con su esquema protege
igual contra el secuestro de esquema.

Se verificó antes de escribir que Supabase instala las extensiones en el esquema
`extensions` y no en `public`. Escribir `create extension unaccent` a secas las
habría puesto en `public`, mezcladas con el esquema de la aplicación.

**Se descartó filtrar en JavaScript.** Era la salida fácil para la búsqueda sin
tildes y la prohíbe la skill `supabase-schema` por la razón de siempre: funciona
en la demo y se cae con datos reales.

**Se descartó migrar «una función a la vez»**, que es lo que recomienda
`docs/BETA.md`. No es aplicable aquí: en `src/data/` los identificadores de
proveedor son cadenas (`p-aromas-paramo`) y en la base son `uuid`.
`ListingCard` llama a `getProviderById(listing.providerId)`; en cuanto una fuente
cambiara y la otra no, ese `get` dejaría de encontrar nada y las tarjetas se
quedarían sin proveedor. **El espacio de identificadores es todo o nada.**

**Código de seis dígitos y no enlace mágico.** Se puede pedir en el móvil y
escribir en el computador, no se rompe al pasar por un cliente de correo
corporativo que reescribe enlaces, y es el flujo que la gente reconoce de su
banco.

**Las escrituras de `/admin` van con el cliente de sesión, no con la clave de
servicio.** Con `admin.ts` funcionarían igual, pero entonces el permiso lo
concedería el código en vez de la base, y cualquier fallo en `requireAdmin` se
convertiría en escritura libre. Con el cliente de sesión decide
`providers_admin_all`. `requireAdmin()` se queda por delante solo para que quien
no debe estar vea un redirect limpio.

**Cerrar sesión es una Server Action con formulario, no un enlace a `/salir`.**
Un GET que cierra sesión lo dispara cualquier prefetch o la imagen de un tercero,
y el usuario se encuentra fuera sin haber tocado nada.

## Qué quedó pendiente

- **Las cuatro variables de entorno en Vercel.** Desde este PR la aplicación no
  sirve una página sin credenciales, y **el verde del CI no protege de eso**: lo
  que falla es el runtime, no la compilación. Ver `docs/ESTADO.md`.
- **El correo.** Sin SMTP propio, el enviador gratuito de Supabase aguanta unos
  pocos correos por hora y su documentación lo declara solo para pruebas. El
  registro funciona; lo que no aguanta es gente real.
- **Nadie es admin.** Correcto por diseño: `user_roles_admin_write` solo deja
  escribir roles a quien ya lo es. El arranque es manual, una vez, desde el SQL
  Editor y después de registrarse por la aplicación.
- **Nadie se convierte en `provider`.** Aprobar desde `/admin` cambia el
  `status`, pero no crea la fila de `provider_members` que enlaza persona con
  empresa ni otorga el rol. Los 13 proveedores sembrados no tienen dueño humano.
  Es el cabo que tiene que atar el Bloque 4.
- **La revisión visual.** Aquí no hay navegador; nadie ha mirado `/entrar`,
  `/registro` ni `/admin` con los ojos.
- El flujo completo de registro no se pudo probar de punta a punta porque exige
  recibir un correo.

## Qué se rompe si tocas esto

- **`public.sin_tildes()` y `normalize()` de `repo.ts` tienen que hacer lo
  mismo.** Una alimenta la columna indexada, la otra normaliza lo que teclea el
  usuario. Si divergen, la búsqueda empieza a no encontrar cosas que sí están, y
  nadie relaciona el síntoma con ninguna de las dos.
- **RLS no devuelve error cuando niega: devuelve cero filas.** Toda escritura
  tiene que mirar el resultado. `decidirProveedor` lo hace; si copias ese patrón
  a otra acción, copia también la comprobación.
- **`getListingsByIds` filtra los ids que no son `uuid` antes del `in`.** Un
  carrito guardado antes de esta migración trae ids como
  `l-amenities-organicos`, y Postgres rechazaría la consulta entera —y con ella
  el carrito completo— en vez de ignorarlos.
- **Si quitas `security_invoker` de la vista**, se convierte en un agujero de
  lectura silencioso.
- **`0001`, `0002` y `0003` son inmutables.** Ya corrieron. Todo cambio es
  `0004_`.
- Leer la sesión en `src/app/layout.tsx` vuelve dinámicas todas las páginas. Si
  alguien quiere recuperar el prerenderizado, tendrá que sacar la sesión de ahí y
  aceptar el parpadeo en el encabezado.

## Verificación

`npm run build`, `npx tsc --noEmit` y `npx eslint .` en limpio, en ese orden, y
el build corrido **dos veces: con credenciales y sin ellas**. Lo segundo no fue
previsión sino corrección — el primer intento de CI falló porque `/_not-found` se
prerenderiza, y al hacerlo renderiza el layout, que pide la sesión. Se arregló
distinguiendo los dos casos: la sesión degrada a anónimo cuando no hay Supabase
configurado (no tener sesión es un estado legítimo) y las páginas que leen datos
se marcan `force-dynamic` (una página de catálogo congelada en el build vuelve a
exigir un deploy para mostrar un dato nuevo, que es lo que se quitó de en medio).
`grep -rn "@/data/" src/lib/repo.ts` no devuelve nada — criterio de salida del
Bloque 1.

`0003_busqueda.sql` aplicada en transacción, y comprobado de vuelta: extensiones
`unaccent` y `pg_trgm` presentes, columnas generadas `busqueda` e `impacto`,
vista creada con `reloptions = {security_invoker=true}`, política pública de
certificaciones creada, `sin_tildes('Amazonía SÜCHIIMMA')` → `amazonia
suchiimma`, y 18 ofertas visibles en la vista.

Con el servidor compilado corriendo contra la base real:

| Prueba | Resultado |
|---|---|
| `/`, `/catalogo`, `/proveedores`, `/carrito`, `/entrar`, `/registro` | 200 |
| `/oferta/no-existe`, `/proveedor/no-existe` | 404 |
| `/proveedor/tejido-wayuu` (proveedor `pending_review`) | 404 |
| Catálogo sin filtros | 18 ofertas |
| `?q=amazonia` y `?q=Amazonía` | 1 y 1 — la misma |
| `?q=aromas` | 2, por nombre de proveedor |
| `?tier=semilla` / `?tier=bosque` | 18 / 6 — acumulativo hacia arriba |
| `?kind=experience` / `?kind=service` | 3 / 4 |
| `/admin` sin sesión | 307 a `/entrar` |
| `/auth/callback?next=https://ejemplo.com` | se queda en el dominio |

Trigger de alta comprobado creando un usuario con la clave de servicio: se creó
la fila en `profiles` con el `full_name` de `raw_user_meta_data` y un único rol
`buyer`. El usuario de prueba se borró y no quedaron filas colgando.

`scripts/seed.mts` corrido dos veces: cifras idénticas y cero evaluaciones
duplicadas.

**Lo visual no se verificó.**
