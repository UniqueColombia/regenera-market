# Camino a la beta

Qué falta exactamente para que Seregenera deje de ser una demo navegable y pase
a ser una plataforma operable en beta gratuita, y **cómo se hace cada paso**.

Este documento es el plan de ejecución de las Fases 1 y 2 de `docs/ROADMAP.md`.
El roadmap dice *qué* fases hay y con qué criterio se cierran; este dice *cómo*
se ejecutan, en qué orden y quién hace cada bloque. Cuando la beta esté cerrada,
este archivo deja de tener uso corriente y su resumen queda en `.claude/hitos/`.

**Alcance de "beta":** la plataforma opera con datos reales, usuarios reales y un
panel de administración real. **No cobra dinero todavía** — los pagos siguen en
modo manual. Esa decisión está justificada abajo.

---

## El punto de partida, sin adornos

Conviene decirlo con precisión porque de aquí salen todos los bloques.

**La aplicación no es estática y ya sabe hacer CRUD.** `next.config.ts` no tiene
`output: "export"`, hay dos Server Actions (`src/app/carrito/actions.ts`,
`src/app/vender/actions.ts`) y cuatro rutas dinámicas. Vercel la corre como
servidor Node. Lo que le falta no es capacidad: es **dónde escribir**.

| Dato | Dónde vive hoy | Consecuencia |
|---|---|---|
| Catálogo y proveedores | `src/data/listings.ts`, `src/data/providers.ts` — **código** | Cambiar un precio exige commit, PR y deploy |
| Órdenes | `src/lib/orders.ts:11` — un `Map` en memoria | Se borran en cada redeploy |
| Postulaciones de proveedor | `src/app/vender/actions.ts:19` — un array | Se borran en cada redeploy |
| Usuarios, sesiones, roles | No existen | No hay login, ni registro, ni admin |

Y lo que sí está hecho y no hay que rehacer:

- `supabase/migrations/0001_init.sql` — **491 líneas**: 14 tablas, los triggers
  del puntaje, y ~35 políticas RLS. Escrito y revisado. **Nunca aplicado.**
- `src/lib/repo.ts` — todas sus funciones ya son `async` a propósito, para que
  cambiar el cuerpo por una consulta real no obligue a tocar ninguna página.
- `src/lib/payments.ts` — la pasarela ya está detrás de una interfaz.
- `@supabase/ssr` y `@supabase/supabase-js` ya están en `package.json`.

Verificado el 2026-08-28: **`src/` no importa el SDK de Supabase en ningún
archivo**, no existe `middleware.ts`, y no existe `src/lib/supabase/`. El
acoplamiento con la base es cero, y eso es exactamente lo que hace que este plan
sea aditivo y no un rediseño.

**El punto que resuelve la queja del deploy lento:** hoy el catálogo *es* código,
por eso cambiar un dato dispara un build. En cuanto los datos vivan en Postgres,
editar un proveedor es un `UPDATE` — Vercel no se entera. Un deploy solo vuelve a
ocurrir cuando cambia el *código*.

---

## Decisiones tomadas al escribir este plan

Se dejan por escrito para no rediscutirlas en cada sesión.

### Supabase, no Firebase

Firebase se evaluó al plantear la beta y se descartó. El argumento no es de
gusto:

- **Firestore es NoSQL sin joins.** Una orden aquí es `orders` + `order_items` +
  `providers` con comisión congelada por ítem. En Firestore eso se resuelve
  duplicando datos a mano y sincronizándolos con Cloud Functions. Es el caso de
  uso que peor le queda.
- **Toda la autorización del proyecto ya está escrita como RLS en SQL**, colgada
  de `auth.uid()` y `auth.users` (14 usos y 7 llaves foráneas en
  `0001_init.sql`). Migrarla a Security Rules es reescribir las 491 líneas en
  otro lenguaje.
- **`docs/DEPLOY.md` ya cerró esta discusión contra Neon** por las mismas
  razones, más la de Fase 5: el aislamiento entre clientes se garantiza con RLS
  en la base, no con un `where` en el código. Un `where` olvidado es una fuga;
  una política RLS olvidada es un error de acceso.

Aclaración que motivó la pregunta: **la cuenta Google Workspace PRO de Unique
Colombia no aporta nada a Firebase.** Firebase se factura por Google Cloud, que
es una cuenta y una facturación distintas de Workspace. No hay plan incluido ni
descuento.

### Dónde sí sirve la cuenta de Google: el correo

Supabase Auth ya resuelve nativamente el registro con código de verificación
(`signInWithOtp`, código de 6 dígitos, o magic link). No hay que programar ese
flujo.

Pero **el enviador de correo que Supabase da gratis está limitado a unos pocos
correos por hora y su propia documentación lo declara solo para pruebas**. Con
eso no se hace una beta con gente real: el segundo usuario que se registre no
recibe el código. Hay que enchufar un SMTP propio, y ahí entra Workspace.

El número exacto del límite lo dice el panel, no este documento:
*Authentication → Rate Limits*. Compruébalo antes de contar con él.

Se usa el SMTP de Google Workspace con una cuenta de `uniquecolombia`, así el
código de verificación sale de un remitente del dominio y no de un enviador
compartido que cae en spam. El volumen que permite Workspace está muy por encima
de lo que una beta necesita, y el coste sobre lo que ya se paga es cero.

**Alternativa si el SMTP de Workspace da problemas de entregabilidad:** Resend
(plan gratuito con dominio propio). No se adopta de entrada porque agrega un
servicio más que administrar para un problema que Workspace ya resuelve.

### Los pagos siguen en modo manual durante la beta

`src/lib/payments.ts` registra la orden y muestra instrucciones de transferencia;
la confirmación la hace un humano desde el panel. Se queda así.

Motivo: la Fase 3 tiene un **bloqueante externo** —la cuenta de comercio de Wompi
a nombre de Dimension Natural SAS— y no tiene sentido que el calendario de la
beta dependa de la aprobación de un tercero. El modo manual es suficiente para
validar con hoteles reales que el catálogo, la verificación y el flujo de compra
funcionan. La interfaz `PaymentGateway` ya existe: cuando lleguen las
credenciales, se implementa `WompiGateway` y **cambia una línea** en
`getGateway()`. Ninguna página se toca.

---

## Los seis bloques

Dependencias reales: **0 → 1 → 2 → (3 ∥ 4) → 5**. Los bloques 3 y 4 son el mismo
patrón aplicado a dos roles y se pueden repartir entre los dos en paralelo.

| # | Bloque | Quién | Bloquea a |
|---|---|---|---|
| 0 | Infraestructura y accesos | Ivan (necesita admin) | todo |
| 1 | Persistencia real | cualquiera | 2 |
| 2 | Identidad y sesión | cualquiera | 3, 4 |
| 3 | Panel de administración | — | 5 |
| 4 | Panel de proveedor | — | 5 |
| 5 | Prueba de RLS y cierre | los dos | — |

---

## Bloque 0 — Infraestructura y accesos

**Objetivo:** que exista una base de datos con el esquema aplicado y un correo
que llega. No se escribe código de aplicación en este bloque.

**Lo hace Ivan**: casi todo requiere permisos de administrador que Jesús no
tiene, ni en el repositorio ni en la cuenta de Workspace.

### Cómo se hace

**1. Crear el proyecto de Supabase.** Tarda un par de minutos; no es un deploy.
Región la más cercana a Colombia. `docs/DEPLOY.md` pide **dos** proyectos, uno
para `main` y otro para `staging`. Para la beta se crea **primero el de
`staging`** y se trabaja todo ahí; el de producción se crea al final del Bloque
5, ya sabiendo que el esquema funciona. Crear los dos de entrada solo duplica el
trabajo de configuración de algo que todavía va a cambiar.

**2. Aplicar el esquema.** SQL Editor → pegar entero
`supabase/migrations/0001_init.sql` → ejecutar. Debe correr sin un solo error; si
alguno falla, **no se parchea a mano en el panel**: se corrige en el archivo, se
descarta el proyecto y se reaplica limpio. Una base cuyo estado no está en el
repositorio es una base que nadie puede reconstruir.

Desde ese momento **`0001_init.sql` es inmutable**. Todo cambio posterior es un
`0002_`, `0003_`… Ver la skill `supabase-schema`.

**3. Configurar el SMTP.** Authentication → SMTP Settings, con el servidor de
Google y una **contraseña de aplicación** de una cuenta de `uniquecolombia`
(exige verificación en dos pasos activa en esa cuenta). Remitente algo del estilo
`no-responder@uniquecolombia.com` con nombre visible "Seregenera".

Prueba de que quedó: Authentication → Users → *Invite user* al correo personal de
Ivan. Si llega, el bloque de correo está resuelto. **Si no llega, no se avanza al
Bloque 2**, porque sin correo no hay registro.

**4. Cargar las variables en Vercel.** Settings → Environment Variables, en el
entorno **Preview**, con los nombres que ya documenta `.env.example`:

| Variable | Origen | Entorno |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API | Preview |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | idem | Preview |
| `SUPABASE_SERVICE_ROLE_KEY` | idem | Preview, **solo servidor** |
| `NEXT_PUBLIC_SITE_URL` | la URL de la preview estable de `staging` | Preview |

`SUPABASE_SERVICE_ROLE_KEY` **jamás** lleva prefijo `NEXT_PUBLIC_`. El job
`secretos` del CI falla si aparece, y hace bien: esa clave en el bundle del
navegador es acceso total a la base saltándose RLS.

**5. Registrar las URL de redirección.** Authentication → URL Configuration: la
URL de la preview de `staging` y `http://localhost:3000`. Si falta, el enlace del
correo devuelve al usuario a un sitio equivocado y el registro parece roto.

**6. Aplicar la política de ramas.** `scripts/politica-de-ramas.sh` sigue sin
correrse (verificado el 2026-08-23: `branches/main/protection` responde 404), así
que ni el borrado de `main` está bloqueado. Requiere admin.

**7. Igualar la versión de Node.** El CI usa `node-version: 22`
(`.github/workflows/ci.yml`). Si el proyecto en Vercel usa otra, el CI pasa en
verde y producción falla. Pendiente ya anotado en `docs/DEPLOY.md`.

### Criterio de salida

```sql
-- En el SQL Editor: deben aparecer las 14 tablas
select table_name from information_schema.tables
 where table_schema = 'public' order by 1;
```

```bash
# La política de ramas está aplicada
gh api repos/UniqueColombia/regenera-market/branches/main/protection >/dev/null 2>&1 \
  && echo "aplicada" || echo "SIN aplicar"
```

Y un correo de invitación de Supabase llegó a una bandeja real.

### Trampa

**El plan gratuito de Supabase pausa los proyectos inactivos.** Durante la beta
se usa a diario, así que no aplica; pero si la beta se detiene tres semanas y
luego se le pasa la URL a un hotel, se encuentra una página muerta. Si va a haber
una pausa larga, avisarlo.

---

## Bloque 1 — Persistencia real

**Objetivo:** que nada se pierda al reiniciar el servidor, y que el catálogo se
sirva de Postgres.

Es el bloque que más superficie toca. **No se hace en un PR gigante**: se hace
función por función, corriendo la app entre cada una. Si algo se rompe, se sabe
exactamente qué lo rompió.

### Cómo se hace

**1. Los tres clientes de Supabase.** Se crean en `src/lib/supabase/`, y son tres
porque tienen tres niveles de privilegio distintos:

| Archivo | Clave | Para qué |
|---|---|---|
| `client.ts` | anon | Componentes de cliente. Sujeto a RLS |
| `server.ts` | anon + cookies de sesión | Server Components y Server Actions. Sujeto a RLS |
| `admin.ts` | service role | **Se salta RLS.** Solo el seed y tareas de servidor |

`admin.ts` lleva un comentario en su primera línea diciendo que se salta RLS.
Quien lo importe por descuido en una página filtra la base entera.

**2. `scripts/seed.ts`.** Lee `src/data/listings.ts` y `src/data/providers.ts` y
los inserta con el cliente de `admin.ts`. Dos requisitos:

- **Idempotente**: `upsert` por `slug`, no `insert`. Se va a correr más de una
  vez.
- Los proveedores primero, las ofertas después: `listings.provider_id` es una
  llave foránea.

El `sustainability_score` y el `tier` **no se insertan a mano**: los escribe el
trigger `sustainability_approved` cuando se aprueba una evaluación. Sembrarlos
directamente en `providers` deja la base en un estado que la aplicación no puede
reproducir. El seed crea la evaluación aprobada y deja que el trigger haga su
trabajo.

**3. Reemplazar `src/lib/repo.ts`, una función a la vez.** El orden importa, de
la más aislada a la más usada, corriendo `npm run dev` entre cada una:

```
getProviderById  →  getApprovedProviders  →  getProviderBySlug
  →  getListingsByIds  →  getListingBySlug  →  getListingsByProvider
  →  getRelatedListings  →  searchListings  →  getFeaturedListings
  →  getMarketplaceStats
```

`searchListings` es la difícil y va casi al final porque concentra todo lo
delicado:

- **La normalización de tildes.** Hoy `normalize()` quita diacríticos para que
  "Amazonía" se encuentre escribiendo "amazonia". Postgres no hace eso solo: hay
  que usar `unaccent` en la consulta, o una columna generada. Si se olvida, la
  búsqueda del catálogo empeora respecto a la demo y nadie entiende por qué.
- **El orden por defecto.** Destacados primero, luego mejor puntaje. Está en el
  comentario de `repo.ts:88` y premia a quien completó la evaluación. No es un
  detalle cosmético: es una regla de producto.
- **El filtro por nivel es "de este nivel hacia arriba"** — quien busca Raíz
  también quiere ver Bosque.
- **`PUBLIC` deja de ser una constante.** Hoy es un array filtrado una vez al
  arrancar (`repo.ts:16`). En Postgres, "aprobado y de proveedor aprobado" es una
  condición de cada consulta. Es el punto donde es fácil dejarse un borrador
  visible en el catálogo público.

**4. Índices.** `0001_init.sql` ya trae índices por `status`, `department`,
`kind`, `category` y un GIN por `verticals`. Al escribir `searchListings` se
comprueba con `explain analyze` que se usan, y se agrega en `0002_` lo que falte.

**5. Órdenes y postulaciones a la base.** `src/lib/orders.ts` pasa a escribir en
`orders` + `order_items`, y `src/app/vender/actions.ts` deja de empujar a un
array: crea la fila en `providers` con estado `pending_review`.

Al persistir la orden hay una invariante que **no se puede perder**:
`order_items` congela `title_snapshot`, `unit_price_cop` y `commission_cop`. Si
mañana el proveedor sube el precio, la orden histórica debe seguir diciendo lo
que el comprador aceptó. Nunca se lee el precio por join contra `listings`.

Lo que **no** entra en este bloque: descontar cupo e inventario. Eso exige que el
descuento ocurra en la misma transacción que la orden para que dos compras
simultáneas del último cupo no sobrevendan, y es Fase 3.

### Criterio de salida

- `grep -rn "@/data/" src/lib/repo.ts` no devuelve nada.
- Una orden hecha en la preview sobrevive a un redeploy.
- El catálogo devuelve **el mismo orden por defecto** y encuentra "Amazonía"
  escribiendo "amazonia".
- Una postulación desde `/vender` aparece como fila en `providers` con estado
  `pending_review`.

### Trampa

`src/data/` **no se borra** al terminar. Se queda como fuente del seed hasta el
primer lote real de onboarding (Fase 4). Lo que se corta es que `repo.ts` lo
importe.

---

## Bloque 2 — Identidad y sesión

**Objetivo:** que alguien se registre con su correo, reciba un código, entre, y
que la aplicación sepa quién es y qué rol tiene.

Es el bloque que se construye **desde cero**: hoy no hay nada de esto.

### Cómo se hace

**1. Migración `0002_auth.sql` — el hueco del esquema.** `0001_init.sql` define
`profiles` con `full_name not null`, pero **no crea la fila cuando alguien se
registra**. Sin trigger, todo usuario nuevo queda con sesión válida y sin perfil,
y cada página que lea `profiles` falla. Va en una migración aditiva:

```sql
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  -- Todo el mundo entra como comprador. 'provider' lo da la aprobación de la
  -- postulación; 'admin' se asigna a mano. Nadie se autoasciende.
  insert into user_roles (user_id, role) values (new.id, 'buyer');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
```

`security definer` es obligatorio: el trigger corre antes de que exista sesión,
así que no puede depender de RLS.

**2. El middleware de sesión.** `middleware.ts` en la raíz, con
`createServerClient` de `@supabase/ssr`. Refresca el token en cada request y
reescribe las cookies. Sin él la sesión expira sola y el usuario se ve
deslogueado a mitad de una compra.

El `matcher` **excluye** `_next/static`, `_next/image` y el favicon; si no, se
paga una llamada a Supabase por cada icono.

**3. Las rutas de auth.**

| Ruta | Qué hace |
|---|---|
| `/entrar` | Pide el correo, llama `signInWithOtp`, muestra el campo de 6 dígitos |
| `/registro` | Igual más nombre completo, que viaja en `options.data.full_name` y lo recoge el trigger |
| `/auth/callback` | Route Handler que canjea el código por sesión |
| `/salir` | Server Action con `signOut` |

Se elige **código de 6 dígitos y no magic link**: el usuario puede pedirlo en el
móvil y escribirlo en el computador, el enlace no se rompe al pasar por un
cliente de correo corporativo, y es el flujo que la gente ya reconoce.

`site-header.tsx` cambia para mostrar "Entrar" o el usuario con su menú.

**4. Dar de alta a los dos admin.** Nadie es admin todavía, y **eso es correcto
por diseño**: la política `user_roles_admin_write` solo deja escribir roles a
quien ya es admin, y no hay ninguno. El arranque es manual, una sola vez, desde
el SQL Editor:

```sql
insert into user_roles (user_id, role)
select id, 'admin' from auth.users
 where email in ('<correo de Ivan>', '<correo de Jesús>')
on conflict do nothing;
```

Antes hay que registrarse los dos por la aplicación, para que exista la fila en
`auth.users`. Los correos **no se escriben en este archivo**: el repositorio es
público.

**5. Un helper de autorización, en un solo sitio.** `src/lib/auth.ts` con
`requireUser()` y `requireAdmin()`, que leen la sesión del servidor y redirigen
si no cumple. Que la comprobación esté repetida a mano en cada página es cómo se
olvida en una.

Esto es **defensa en profundidad, no la defensa**: la barrera real es RLS. El
helper existe para que el usuario vea un redirect limpio en vez de una página
vacía.

### Criterio de salida

Un correo que nunca se usó se registra en la preview, recibe el código, entra, y
la aplicación lo saluda por su nombre. En la base, ese usuario tiene fila en
`profiles` y fila `buyer` en `user_roles`, ambas creadas por el trigger. Ivan y
Jesús, además, tienen fila `admin`.

---

## Bloque 3 — Panel de administración

**Objetivo:** que Ivan y Jesús operen la plataforma sin escribir SQL. Es el
módulo que la beta necesita para existir.

### Cómo se hace

**1. `src/app/admin/layout.tsx` llama a `requireAdmin()`.** Un solo punto de
entrada para todo el panel; ninguna página de adentro repite la comprobación.

**2. Las pantallas**, en este orden de utilidad real:

| Ruta | Qué resuelve |
|---|---|
| `/admin/postulaciones` | Ver lo que llega de `/vender`, aprobar o rechazar |
| `/admin/proveedores` | Aprobar, suspender, editar la ficha, destacar |
| `/admin/ofertas` | **El CRUD que faltaba**: crear y editar productos, experiencias y servicios |
| `/admin/evaluaciones` | Revisar la evidencia y aprobar o rechazar la evaluación |
| `/admin/ordenes` | Ver órdenes y **confirmar el pago manual** (`pending_payment` → `paid`) |

**3. Cada acción es una Server Action con el cliente `server.ts`, nunca con
`admin.ts`.** Que Ivan sea admin ya se lo dice RLS a la base a través de
`is_admin()`; usar la service role aquí desactivaría la única barrera real y
haría que un bug de ruta valiera acceso total.

**4. El formulario de oferta.** Es el más grande porque `listings` tiene campos
comunes y campos por tipo: `duration_hours`, `min_people`, `meeting_point` e
`includes` solo aplican a experiencias; `delivery_time` y `scope` solo a
servicios. El formulario muestra la sección según `kind`. Validación con Zod
espejando los `check` de la tabla — sobre todo `wholesale_needs_qty`, que exige
que un precio mayorista traiga cantidad mínima.

Al pasar de ~150 líneas de JSX, cargar la skill `componentizacion`.

**5. Aprobar un proveedor no es un botón sobre `providers.status` y ya.** Cuando
se aprueba una postulación hay que crear también la fila en `provider_members`
que enlaza al usuario que postuló con el proveedor. Sin ella,
`manages_provider()` devuelve falso y el proveedor aprobado no puede tocar nada
de lo suyo — el Bloque 4 entero queda muerto y el síntoma no apunta a la causa.

### La trampa que hay que tener presente

**El puntaje de sostenibilidad y el nivel los escribe el trigger, no un
formulario.** `sync_provider_score()` los baja a `providers` cuando una
evaluación pasa a `approved`. Ninguna pantalla del panel puede tener un campo
editable de `sustainability_score` ni de `tier`. Si un admin puede escribirlos a
mano, el nivel deja de significar nada y la auditoría del puntaje se pierde.

Relacionado y anotado en `docs/DEPLOY.md`: como el repositorio es público,
`src/lib/sustainability.ts` publica los puntos exactos de cada respuesta, así que
un proveedor puede responder lo justo para llegar a Bosque. **El control real no
es el cuestionario: es la revisión de la evidencia.** Varias preguntas llevan
`requiresEvidence: true`. Si se aprueba sin mirarla, el puntaje es decorativo.

### Criterio de salida

Se crea una experiencia nueva desde `/admin/ofertas`, aparece en el catálogo
público sin redeploy, y se retira volviéndola borrador. Se aprueba una
postulación y ese usuario entra a su panel. Se confirma el pago de una orden y su
estado cambia a `paid`. Nadie escribió SQL en todo el recorrido.

---

## Bloque 4 — Panel de proveedor

**Objetivo:** que el proveedor gestione lo suyo. Es el mismo patrón del Bloque 3
con otro predicado, así que se puede hacer en paralelo por la otra persona.

### Cómo se hace

`src/app/panel/layout.tsx` llama a `requireUser()` y resuelve de qué proveedores
es miembro. Adentro: sus ofertas (mismo formulario del Bloque 3, reutilizado),
sus órdenes, sus cotizaciones, y el cuestionario de sostenibilidad.

**La diferencia con el panel de admin no está en el código de la página: está en
la política RLS que responde.** Donde el admin pasa por `is_admin()`, el
proveedor pasa por `manages_provider(provider_id)`. Si el código quedó bien, la
misma consulta devuelve conjuntos distintos según quién la haga, y **no hay un
solo `where provider_id = ...` escrito a mano en la aplicación**. Ese `where`
manual es precisamente lo que RLS existe para no tener que confiar.

Tres cosas que el proveedor **no** puede hacer, y las tres ya están en RLS:

- Cambiar su `sustainability_score` o su `tier` — los escribe el trigger.
- Publicar directo: al editar, la oferta vuelve a `pending_review`.
- Editar una evaluación ya enviada. `assessments_update_draft` solo deja tocar
  las que están en `draft` o `rejected`.

**Si el calendario aprieta, este es el bloque que se recorta**, no el 3: durante
una beta con pocos proveedores, el admin puede publicar en nombre de ellos y el
proveedor solo ve. Es más trabajo manual, pero no bloquea la validación.

### Criterio de salida

Un proveedor aprobado entra, edita su ficha, crea una oferta que queda en
`pending_review`, y ve **solo** las órdenes que incluyen ítems suyos.

---

## Bloque 5 — Prueba de RLS y cierre

**Objetivo:** comprobar que las ~35 políticas hacen lo que dicen. **No es
opcional y no lo cubre el CI**, porque no hay forma de que un `tsc` sepa si una
política filtra datos.

### Cómo se hace

Se prueba **con el rol equivocado**, que es lo único que prueba algo. Comprobar
que un admin ve todo no prueba nada; comprobar que un comprador *no* ve las
órdenes de otro, sí.

La forma barata: en el SQL Editor, asumir la identidad de un usuario cualquiera y
correr la consulta que **debería** fallar.

```sql
-- Como un comprador cualquiera, intentar leer órdenes ajenas
set local role authenticated;
set local request.jwt.claims = '{"sub":"<uuid de un comprador>"}';
select count(*) from orders;   -- debe contar SOLO las suyas
```

La matriz mínima, cada fila con su resultado esperado:

| Quién | Intenta | Esperado |
|---|---|---|
| `buyer` A | leer órdenes de `buyer` B | 0 filas |
| `provider` X | leer órdenes sin ítems suyos | 0 filas |
| `provider` X | editar una oferta de `provider` Y | error |
| `buyer` | `insert into user_roles` con `'admin'` | error |
| anónimo | leer un `listing` en `draft` | 0 filas |
| anónimo | leer `provider_certifications` | 0 filas — son documentos privados |
| `provider` | `update providers set tier='bosque'` | el trigger manda: no cambia |
| `buyer` | reseñar algo que no compró | error |

**Cualquier fila que no dé el resultado esperado detiene la beta.** Es una fuga
de datos, en un repositorio público donde las políticas están a la vista.

### El cierre

1. Crear el **segundo proyecto de Supabase**, el de producción, y aplicarle
   `0001_init.sql` y `0002_auth.sql`. Variables en el entorno **Production** de
   Vercel, distintas de las de Preview. Una base de pruebas nunca apunta a datos
   de producción.
2. Release `staging` → `main` con la skill `flujo-git`, **con etiqueta**: Fases 1
   y 2 cerradas es `v0.3.0`. Sin etiqueta no hay forma de responder qué había en
   producción el martes.
3. Registrar el hito con la skill `registrar-hito`.
4. Marcar las Fases 1 y 2 como cerradas en `docs/ROADMAP.md`.

---

## Lo que la beta deja fuera a propósito

Se dice explícitamente para que nadie lo dé por incluido a mitad de camino.

| Fuera | Por qué | Cuándo |
|---|---|---|
| Cobrar con Wompi | Bloqueante externo: cuenta de comercio. El modo manual valida igual | Fase 3 |
| Descuento transaccional de cupo e inventario | Sin dinero real, una sobreventa se arregla hablando | Fase 3 |
| Subida de imágenes (Storage) | `listing-media.tsx` dibuja un tapiz de colores. Feo, no bloqueante | Fase 4 |
| Correo transaccional de órdenes | El SMTP queda montado en el Bloque 0; usarlo para confirmaciones es más trabajo | Fase 4 |
| Interfaz de reseñas | Tabla y política ya existen. No hay compras que reseñar todavía | Fase 4 |
| Mover comisión y pesos del cuestionario a base | `docs/DEPLOY.md` lo pide por ser repo público. Mitiga, no bloquea | Fase 4 |

**El único candidato serio a entrar antes de tiempo es la subida de imágenes**,
porque un proveedor real va a querer sus fotos y el tapiz de colores se nota. Si
se decide meterlo, entra como bloque propio después del 4 y **con su propio PR**;
no se cuela dentro del panel de admin.

---

## Cómo se reparte y cómo entra el trabajo

Un PR por bloque contra `staging`, con la excepción del Bloque 1, que va **por
tandas de funciones** porque toca demasiada superficie para revisarse de una.

```
docs/js-plan-beta          este documento
chore/id-supabase-inicial  Bloque 0 (no toca código; deja constancia)
feat/xx-repo-postgres      Bloque 1, en 2 o 3 PRs
feat/xx-auth-supabase      Bloque 2
feat/xx-panel-admin        Bloque 3
feat/xx-panel-proveedor    Bloque 4
```

Cada PR llena la plantilla de verdad y pasa `npm run build`, `npx tsc --noEmit` y
`npx eslint .` **en ese orden** — el build va primero porque genera los tipos de
rutas que `tsc` necesita.

Los bloques 1 y 2 tocan `src/lib/repo.ts`, `orders.ts` y `payments.ts`, que están
en `.github/CODEOWNERS`: la revisión se pide sola. No bloquea el merge, pero es
el aviso de que al otro le interesa enterarse.

---

## Advertencia de costos

Todo lo anterior corre en plan gratuito. Dos cosas que conviene saber antes de
que sorprendan:

- **Vercel Hobby es para proyectos no comerciales.** Mientras la beta sea
  gratuita y no se cobre comisión, pasa. El día que entre dinero real, son 20
  USD/mes de Vercel Pro. No es urgente; es previsible.
- **El plan gratuito de Supabase pausa proyectos inactivos** y no incluye
  branching de base por PR (`docs/DEPLOY.md`). Para dos personas y una beta, el
  plan gratuito alcanza.
