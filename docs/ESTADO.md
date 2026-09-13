# Dónde estamos

**Este archivo responde a «¿en qué vamos?».** Es el único que dice qué está a
medias *ahora mismo* y qué sigue. Si acabas de hacer `git pull` y quieres saber
qué hacer, empieza aquí y no en el ROADMAP.

- **Corte:** 2026-09-13
- **Producción:** `v0.3.2` en `main` → **https://regenera-market.vercel.app**
- **Fase del roadmap:** 0 cerrada. Bloques 0, 1 y 2 de `docs/BETA.md` cerrados y
  en producción. **El Bloque 3 está terminado pero NO desplegado** — ver abajo.

> ⚠️ **Ojo con la diferencia entre «hecho» y «en producción».** El 2026-09-13 se
> terminó el Bloque 3 entero y el acceso con contraseña, pero **vive en la rama
> `feat/js-clave-y-panel-admin`, sin PR y sin mergear**. Producción sigue
> sirviendo `v0.3.2`: acceso solo por código y `/admin` de una sola pantalla.
>
> **La migración `0004` sí está aplicada contra la base real**, que es la única
> compartida. Es aditiva y no rompe el código viejo —lo único que reemplaza es el
> cuerpo de `handle_new_user()`, para que guarde también el teléfono—, así que
> producción funciona igual mientras tanto.

> **Antes de creerle a este archivo, comprueba que no está viejo.** Es el único
> documento del repositorio que caduca.
>
> ```bash
> git log --oneline $(git tag -l --sort=-v:refname | head -1)..origin/main
> ls .claude/hitos/ | tail -3
> ```
>
> Si hay commits o hitos posteriores al corte de arriba y este archivo no los
> menciona, está desactualizado: **gana el hito**. Quien avance un bloque
> actualiza este archivo en el mismo PR.

---

## ✅ Producción está configurada — y por qué eso hay que cuidarlo

**Resuelto el 2026-09-07** con el release `v0.3.0`. Las cuatro variables están en
el entorno **Production** de Vercel y el sitio sirve el catálogo desde Postgres.
Ver [el hito](../.claude/hitos/2026-09-07-release-v0-3-0-en-produccion.md).

Desde que `src/lib/repo.ts` consulta Postgres, **la aplicación ya no funciona sin
credenciales.** Es un cambio irreversible de propiedad: antes el catálogo vivía
en `src/data/` y el sitio se levantaba con `.env.local` vacío; ahora no.

Falla de forma ruidosa y con un mensaje que dice qué hacer, que es lo que se
quería — un sitio que sirviera datos de demostración en silencio sería peor.

**El verde del CI no protege de esto.** El build compila sin las variables: las
páginas que leen datos están marcadas `force-dynamic` y `getUser()` devuelve
anónimo cuando no hay Supabase configurado, para que un clon recién bajado
compile. Lo que falla sin ellas es el runtime. Corolario: **borrar o renombrar
cualquiera de las cuatro tumba el sitio en el siguiente despliegue y ningún check
te avisa.**

| Variable | Production | Preview |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | ✅ el dominio real | — (se queda en Production) |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | ❌ **falta** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | ❌ **falta** |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | ❌ **falta** |

`NEXT_PUBLIC_SITE_URL` es **por entorno**: en Production el dominio real, en
`.env.local` `http://localhost:3000`. Copiar el de local a Vercel deja el
`og:image` apuntando a localhost.

> `SUPABASE_SERVICE_ROLE_KEY` **jamás** lleva prefijo `NEXT_PUBLIC_`. El job
> `secretos` del CI falla si aparece en el código, y hace bien: esa clave en el
> bundle del navegador es acceso total a la base saltándose RLS.

### Cárgalas por el panel, no por el CLI

`https://vercel.com/uniquecolombias-projects/regenera-market/settings/environment-variables`

Se intentó con `vercel env add` y hay dos trampas que cuestan una hora:

1. **Guarda las comillas literalmente.** Un `NEXT_PUBLIC_SUPABASE_URL="https://…"`
   copiado de `.env.local` queda almacenado *con* las comillas, y ninguna
   petición a Supabase funciona. El CLI lo avisa con
   `! Value includes surrounding quotes`, en medio de mucho ruido.
2. **`vercel env add <nombre> preview` abre un prompt interactivo** (`? Git
   branch?`) que no se puede contestar si el valor llega por tubería. Los `add`
   de Preview se quedan colgados sin guardar nada.

Además, `vercel env add` **falla en silencio si la variable ya existe**: hay que
`vercel env rm <nombre> <entorno> --yes` antes de reintentar. Si el `created` del
`env ls` no cambia, no se guardó nada.

Y **al agregar una variable, los despliegues existentes no la toman**: hace falta
un build nuevo.

### Aparte del CLI y de las variables

- **Supabase → Authentication → URL Configuration.** ✅ hecho. El dominio de
  producción en *Site URL*, y `…/auth/callback` + `…/**` en *Redirect URLs*. Es
  independiente de `NEXT_PUBLIC_SITE_URL`: si ahí solo estuviera `localhost`, el
  código de seis dígitos falla en producción sin dejar claro por qué.
- **Vercel → Settings → Node.js Version.** El CI usa 22
  (`.github/workflows/ci.yml`); si no coinciden, el CI pasa en verde y producción
  falla.

### Cómo se comprueba que producción está viva

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://regenera-market.vercel.app/catalogo
#   200 = la base responde; 500 = faltan las claves de Supabase
curl -s https://regenera-market.vercel.app | grep -o '<meta property="og:image"[^>]*>'
#   si dice localhost:3000, falta NEXT_PUBLIC_SITE_URL
curl -s https://regenera-market.vercel.app/catalogo | grep -o 'href="/oferta/[a-z0-9-]*"' | sort -u | wc -l
#   18 = el catálogo sale de Postgres (repo.ts ya no importa src/data/)
```

---

## En una frase

El catálogo se sirve de Postgres en producción. En la rama sin mergear, el acceso
pasó a **contraseña con el código de seis dígitos como segundo factor** (solo en
dispositivos nuevos), el panel de administración tiene **seis pantallas** en vez
de una —incluido el CRUD de ofertas, que es lo que permite cambiar el catálogo
sin desplegar—, las postulaciones y las órdenes dejaron de vivir en memoria, y
**hay dos administradores**. Lo que falta para la beta ya no es construir: es
probarlo en un navegador, mergearlo y desplegarlo.

---

## Lo que ya está

| | Estado |
|---|---|
| Sitio navegable, identidad visual, interacción táctil, contraste AA | ✅ en producción |
| Prospector de proveedores (RUES → Excel) | ✅ |
| Proyecto de Supabase | ✅ ref `mgsrzlqellphmfbhpdoj`, región `us-east-2` |
| `0001_init.sql`, `0002_auth.sql`, `0003_busqueda.sql` | ✅ **aplicadas**, inmutables |
| `scripts/seed.mts` — catálogo sembrado | ✅ idempotente |
| `src/lib/repo.ts` contra Postgres | ✅ **Bloque 1 cerrado** |
| Registro y acceso por código (`/entrar`, `/registro`) | ✅ **Bloque 2 cerrado**, probado de punta a punta |
| SMTP propio y plantillas con `{{ .Token }}` | ✅ Gmail personal de Jesús, provisional |
| Vercel Production configurado y verificado | ✅ `v0.3.2`, **https://regenera-market.vercel.app** |
| `0004_clave_dispositivos_y_postulaciones.sql` | ✅ **aplicada** el 2026-09-13, inmutable |
| `0005_recursion_ordenes_y_cotizaciones.sql` | ✅ **aplicada** el 2026-09-13, inmutable |
| Que alguien sea admin | ✅ Jesús e Ivan, con `scripts/crear-admin.mts` |
| Contraseña + segundo factor por dispositivo | 🟡 hecho, **sin desplegar** (rama) |
| Las seis pantallas de `/admin` | 🟡 cinco hechas, **sin desplegar**; falta `/admin/evaluaciones` |
| Órdenes y postulaciones en Postgres | 🟡 hecho, **sin desplegar** |
| Latido diario contra la pausa de Supabase | 🟡 hecho, **empieza a correr al mergear** |
| `/admin/evaluaciones` | ❌ la quinta pantalla de `docs/BETA.md` |
| Subir imágenes de una oferta | ❌ fuera de la beta a propósito |
| Fechas con cupo de una experiencia desde el panel | ❌ solo por script |
| Vercel Preview | ❌ faltan las tres de Supabase |
| Panel de proveedor | ❌ **Bloque 4, sin empezar** |
| Servidor propio (VPS) en vez de Vercel + Supabase | ❌ decidido, sin fecha |

---

## Lo que falta, y quién puede hacerlo

### ✅ Resuelto el 2026-09-11: el correo de acceso

**El registro funciona de punta a punta.** Se deja escrito aquí porque costó tres
hallazgos encadenados y porque la configuración vive en el panel, donde el
repositorio no la ve.

Lo que hubo que hacer, en este orden — **y el orden importa, no es opcional**:

1. **Un SMTP propio.** No es un muro de plan, no hace falta Pro: desde el 3 de
   junio de 2026 los proyectos gratuitos que usan el enviador por defecto de
   Supabase tienen las plantillas **bloqueadas**, y configurar un SMTP propio las
   desbloquea. De paso quita el límite de 2 correos/hora del enviador por
   defecto. Hoy está el Gmail personal de Jesús, provisional.
2. **`{{ .Token }}` en las dos plantillas**, *Confirm signup* y *Magic Link*.
3. **`Email OTP Length` en 6** (Authentication → Sign In / Providers → Email).
   Estaba en **8**, y la aplicación pedía seis.

**Se descartó el _Send Email hook_.** No desbloquea las plantillas: las
*reemplaza*, obligando a escribir el correo en código. Y una función de Postgres
no puede mandar un correo —Postgres no habla SMTP—, así que el ejemplo oficial
solo encola en una tabla y todavía hacen falta `pg_cron`, un proceso que la vacíe
y un proveedor externo. Se acaba necesitando el proveedor igual, más código
propio que mantener.

#### Cómo quedó configurado, para poder reproducirlo

**Authentication → Emails → Templates**, las dos plantillas con el mismo cuerpo.
`signInWithOtp` elige una u otra según el usuario exista, así que poner
`{{ .Token }}` en una sola deja la mitad de los casos rota según a quién le
toque. El enlace de cortesía apunta a
`{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email`, **nunca** a
`{{ .ConfirmationURL }}` — ver «Trampas vigentes».

Las plantillas van sin imágenes a propósito: Gmail bloquea las remotas hasta que
el destinatario las pide y no admite SVG, que es el único formato en que existe
el isotipo. La marca la llevan Georgia y el verde `#1b5b3d`, así que llegan
iguales siempre.

**Authentication → SMTP Settings.** El remitente tiene que ser la misma cuenta
que autentica: Gmail reescribe o rechaza un `From` que no sea suyo ni un alias
verificado.

**Las plantillas sobreviven al cambio de SMTP.** Son configuración aparte, así
que cambiar las credenciales al Workspace de Ivan no toca ni una línea de ellas.

Nada de esto está en el repositorio: aquí no hay `supabase/config.toml`, así que
ni se versiona ni el CI lo detecta. **Si alguien recrea el proyecto de Supabase,
esta sección es lo único que queda.**

Prueba de que sigue bien: registrarse en `/registro` con un correo real y
comprobar que el mensaje trae los seis dígitos **y** el enlace, y que los dos
entran.

### 🟠 Solo Ivan (`UniqueColombia`)

**1. SMTP de Google Workspace — el remitente definitivo.** Authentication → SMTP
Settings: `smtp.gmail.com`, puerto 587, con contraseña de aplicación de una
cuenta `@uniquecolombia` (exige verificación en dos pasos activa). Remitente tipo
`no-responder@uniquecolombia.com`, nombre visible «Seregenera».

**Ya no bloquea la beta.** El acceso funciona hoy con el Gmail personal de
Jesús; esto solo cambia quién aparece como remitente y sube el techo de envío a
~2.000 al día. Pero **hay que hacerlo antes de abrir a gente real**: un correo de
acceso que llega desde un Gmail personal no se sostiene frente a un hotel, y el
techo de una cuenta personal es de ~500 al día.

Prueba de que quedó: registrarse con un correo limpio y mirar el remitente.

**2. Integración de Supabase con GitHub.** Jesús es colaborador con permiso
`write`, no `admin`, así que al seleccionar el repositorio no le aparece
`regenera-market`. **No bloquea nada:** sirve para branching de base por PR, que
además es de plan pago.

**3. `bash scripts/politica-de-ramas.sh`.** Requiere admin. Comprobado el
2026-09-05: `admin: false` para `seiler18` y la protección sigue sin aplicarse.
Lo único que impone es que no se pueda borrar `main`.

```bash
gh api repos/UniqueColombia/regenera-market/branches/main/protection >/dev/null 2>&1 \
  && echo "aplicada" || echo "SIN aplicar"
```

### 🟠 Cualquiera con acceso a Vercel

**4. Las tres variables de Supabase en el entorno *Preview*.** Las de Production
ya están (desde el release `v0.3.0`). **No bloquea producción:** lo que hace es que los
despliegues de preview de cada PR compilen verde y luego fallen en runtime, o
sea que las previews no sirven para revisar nada que toque datos.

Se hace en el panel, editando cada una de las tres y marcando *Preview* además de
Production. `NEXT_PUBLIC_SITE_URL` se queda solo en Production. Ver arriba por
qué el CLI no sirve para esto.

### 🟡 Cualquiera, una sola vez

**5. ✅ Resuelto el 2026-09-13: hay dos administradores.** Se hicieron con
`scripts/crear-admin.mts`, que crea la cuenta si no existe y asigna el rol en la
misma pasada. Los correos no se escriben aquí: el repositorio es público.

```bash
node --env-file=.env.local scripts/crear-admin.mts --listar
node --env-file=.env.local scripts/crear-admin.mts correo@ejemplo.com --nombre "Nombre Apellido" --avisar
```

**El arranque en frío era real y ahora está roto por diseño, no por accidente.**
La política `user_roles_admin_write` solo deja escribir roles a quien ya es
admin, así que el primero no se puede crear desde la aplicación: el script usa la
clave de servicio, que es uno de sus tres usos legítimos. A partir del segundo,
lo normal es usar `/admin/usuarios` y dejar que RLS conceda el permiso.

Una cuenta creada así **no tiene contraseña**: entra con código y la aplicación
le exige ponerse una antes de dejarla usar el panel.

**6. Rotar la contraseña de la base.** Settings → Database → *Reset database
password*. La que se usó para aplicar las migraciones pasó por un chat.

---

## Lo que sigue, por orden

### 1. Probar en un navegador lo del 2026-09-13, y desplegarlo

**Es lo único que separa la beta de estar lista, y no lo puede hacer un agente:**
aquí no hay navegador automatizado. Lo verificado hasta ahora es el build, los
tipos, el lint, las políticas RLS probadas con el rol equivocado (doce
comprobaciones, todas en verde) y las respuestas HTTP. **Lo que nadie ha
recorrido con el ratón es la interfaz.**

```bash
git switch feat/js-clave-y-panel-admin && npm run dev
```

El recorrido, en este orden, porque cada paso depende del anterior:

| Paso | Dónde | Qué tiene que pasar |
|---|---|---|
| 1 | `/registro` | Pide nombre, apellido, teléfono con país y contraseña con barra. Llega el código, entra |
| 2 | `/entrar` | Con la contraseña, **sin** pedir código: este aparato ya es de confianza |
| 3 | Ventana de incógnito → `/entrar` | Contraseña **y** código: es un aparato nuevo |
| 4 | `/cuenta` | Aparecen los dos dispositivos. Quitar uno |
| 5 | `/entrar` con la cuenta de admin (nunca tuvo clave) | Entra con código y **lo manda a ponerse contraseña** |
| 6 | `/admin/ofertas` → Nueva | Crear una experiencia, publicarla, verla en `/catalogo` **sin desplegar** |
| 7 | `/admin/ofertas` | Retirarla: desaparece del catálogo |
| 8 | `/vender` | Postular. Aparece en `/admin/postulaciones`. Aprobarla crea la empresa |
| 9 | `/carrito` | Comprar. La orden aparece en `/admin/ordenes`. Confirmar el pago |
| 10 | `/admin/usuarios` | Enlazar a alguien con una de las empresas sembradas |

**Si algo falla, es más probable que sea de la interfaz que de los permisos**:
esos ya se probaron contra la base.

Después: PR contra `staging` (skill `flujo-git`), y al mergear a `main` empieza a
correr el latido — el workflow `.github/workflows/latido.yml` no existe en `main`
hasta entonces, así que **la protección contra la pausa de Supabase todavía no
está activa**.

### 1 bis. Lo que quedó fuera del Bloque 3, a conciencia

- **`/admin/evaluaciones`** — la quinta pantalla de `docs/BETA.md`. Las
  evaluaciones de sostenibilidad se siguen aprobando por SQL. No bloquea la beta
  mientras ningún proveedor haya llenado el cuestionario, que es hoy.
- **Las fechas con cupo de una experiencia** (`listing_availability`) solo se
  siembran con el script. Una experiencia creada desde el panel se puede comprar
  sin fecha.
- **Subir imágenes**: el formulario pide direcciones de texto. Estaba fuera de la
  beta a propósito, pero es lo primero que va a pedir un proveedor real.
- **Los dos secretos del latido** (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) los tiene
  que crear alguien con permiso de administración del repositorio — o sea Ivan;
  `seiler18` tiene `write` y no puede. **Sin ellos el latido funciona igual**: lo
  que se pierde es poder distinguir «se cayó Vercel» de «se pausó Supabase», que
  desde fuera se ven igual.

### 2. El Bloque 4 — panel de proveedor

Mismo patrón que `/admin` aplicado al otro rol. Depende del cabo suelto de arriba
(`provider_members`): mientras nadie se convierta en `provider`, no hay a quién
enseñarle ese panel.

### 3. Mudarse a servidor propio, y dejar de depender de Supabase

**Decidido, sin fecha: arranca cuando Ivan compre el VPS de Hostinger.** El
destino es que todo lo que hoy vive en Vercel y Supabase corra en una máquina
nuestra, **con el mismo comportamiento y con código nuestro**.

Esto no es un cambio de despliegue, es **cambiar de dueño a media docena de cosas
que hoy no escribimos nosotros**. Lo que hay que sustituir, y lo que cuesta cada
una:

| Hoy lo da | Hay que reemplazarlo por | Dificultad real |
|---|---|---|
| Vercel (build, CDN, TLS, despliegue por push) | Node en el VPS, Nginx o Caddy delante, TLS con Let's Encrypt, despliegue por CI | Media. Es trabajo conocido |
| Postgres gestionado de Supabase | Postgres en el VPS | Media — **lo caro no es instalarlo, son las copias de seguridad**. Hoy las hace Supabase y no pensamos en ellas |
| Supabase Auth (`signInWithOtp`, `verifyOtp`, sesión, cookies) | Autenticación propia | **Es la pieza grande.** Ver abajo |
| **RLS de Postgres** | Nada equivalente — pasa a ser código | **Es el riesgo grande.** Ver abajo |
| Almacenamiento de Supabase | Disco del VPS o S3 compatible | Baja, hoy casi no se usa |
| SMTP | No cambia: es un SMTP externo igual | Ninguna |

**Las dos que hay que mirar de frente antes de decidir la fecha:**

**La autenticación no es «un login».** Hoy Supabase nos da emisión y verificación
de códigos, expiración, límite de intentos, rotación de tokens, refresco de
sesión, cookies `httpOnly` bien puestas y `src/proxy.ts` apoyándose en todo eso.
Escribirlo nosotros es posible y está resuelto en la industria, pero es donde los
fallos no se ven hasta que alguien entra en la cuenta de otro. Conviene apoyarse
en una librería probada y no en código a mano.

**RLS es la barrera de verdad, y en un VPS deja de existir gratis.** Toda la
seguridad de datos del proyecto está hoy en políticas dentro de Postgres: un bug
en una ruta no da acceso porque la base dice que no. `dominio-regenera` lo
sostiene como invariante. Postgres propio **sí** tiene RLS —no se pierde por
mudarse—, pero deja de estar conectado a un `auth.uid()` que alguien mantenga por
nosotros: hay que emitir y propagar esa identidad a cada conexión. Si en la
mudanza se sustituye por comprobaciones en el código de la aplicación, el modelo
de seguridad del proyecto cambia entero y hay que reescribir `dominio-regenera`.

**Qué hay que decidir antes de empezar, y no durante:**

1. ¿Se conserva RLS con Postgres propio, o se pasa la autorización a la
   aplicación? *(Recomendación: conservarla. Es la decisión más barata de
   respetar y la más cara de deshacer.)*
2. ¿Quién responde a las 3 de la mañana si el VPS se cae? Vercel y Supabase se
   reinician solos; una máquina nuestra no.
3. ¿Cuál es la política de copias, dónde viven y **cuándo se prueba una
   restauración**? Una copia que nadie restauró no es una copia.
4. ¿Se migran los datos que existan, o se parte de cero? Depende de si para
   entonces hay proveedores y órdenes reales.
5. ¿Se va todo de golpe o primero la aplicación y después la base?

**Y algo que afecta al trabajo diario desde el primer día:** hoy cada PR tiene
despliegue de vista previa automático. Con VPS propio eso hay que construirlo o
perderlo, y perderlo cambia cómo revisamos el trabajo del otro — que es el único
momento en que cada uno ve lo que hizo el agente del otro. Está en `flujo-git`.

**Cuando se haga, `docs/DEPLOY.md` se reescribe entero** y este bloque se
convierte en un hito.

---

## Trampas vigentes

- **Las plantillas de correo de Supabase no mandan el código si no se lo pides.**
  Las de fábrica solo traen `{{ .ConfirmationURL }}`: llega un enlace y la
  aplicación pide seis dígitos. El que los renderiza es `{{ .Token }}`, y hay que
  ponerlo en **dos** plantillas — *Magic Link* para quien ya tiene cuenta y
  *Confirm signup* para quien se registra por primera vez; `signInWithOtp` usa una
  u otra según exista el usuario, y arreglar solo una deja la mitad rota.
- **`{{ .ConfirmationURL }}` no pasa por `/auth/callback`.** Apunta al
  `/auth/v1/verify` de Supabase, que devuelve al *Site URL* con el token en el
  fragmento `#`, y un fragmento no llega al servidor. El enlace del correo tiene
  que ser
  `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email`.
- **`sameLine` del carrito compara `listingId` **y** `date`.** Quitar o buscar una
  línea pasando solo el id compila, no falla y no empareja con una experiencia
  reservada: la línea se vuelve inmortal, suma en el contador de la cabecera y la
  página declara la cesta vacía. Fue exactamente el bug de `v0.3.2`.
- **Subir `STORAGE_KEY` en `src/components/cart.ts` tira el carrito de todo el
  mundo.** Se hace cuando lo guardado deja de poder resolverse —como cuando los
  ids pasaron de cadena a uuid—, no cuando cambia la vista. Bajarla no recupera
  nada.
- **`middleware.ts` no existe aquí, es `src/proxy.ts`.** Next 16 deprecó esa
  convención. Cualquier tutorial de Supabase que encuentres crea `middleware.ts`
  porque está escrito para Next 15.
- **`unaccent` es `stable` y una columna generada exige `immutable`.** Por eso
  existe `public.sin_tildes()` en `0003`, con el diccionario fijado por
  `::regdictionary`. Si tocas la búsqueda, esa es la trampa.
- **`public.sin_tildes()` y `normalize()` de `repo.ts` tienen que hacer lo
  mismo.** Una alimenta la columna indexada y la otra normaliza lo que escribe el
  usuario; si divergen, la búsqueda deja de encontrar cosas que sí están.
- **Las escrituras de administración van con el cliente de sesión, no con la
  clave de servicio.** Si se cambian a `admin.ts`, el permiso pasa a concederlo el
  código en vez de RLS, y cualquier fallo en `requireAdmin` se vuelve escritura
  libre.
- **RLS no da error cuando niega: devuelve cero filas.** Toda escritura tiene que
  comprobar el resultado, o un intento denegado se ve como éxito.
- **El plan gratuito de Supabase pausa los proyectos inactivos**, y lo que cuenta
  como actividad es una petición **desde fuera**: un `pg_cron` dentro de Postgres
  correría todos los días sin evitar la pausa. Por eso el latido lo dispara
  GitHub Actions (`.github/workflows/latido.yml`, 12:10 UTC = 07:10 en Colombia)
  contra `/api/latido`. **Y GitHub desactiva los `schedule` de un repositorio
  tras 60 días sin actividad**, avisando por correo: si el proyecto se queda
  quieto dos meses, hay que reactivarlo a mano en la pestaña Actions — justo
  cuando más falta hace.
- **El cliente de `src/lib/supabase/efimero.ts` es lo que hace real el segundo
  factor.** Comprueba la contraseña **sin escribir cookies**. Si alguien cambia
  `entrarConClave()` para usar el de `server.ts`, la sesión queda abierta en
  cuanto la contraseña resulta correcta y el código posterior no protege de nada:
  basta cerrar la pestaña. Todo seguiría funcionando de cara al usuario y ninguna
  prueba lo detectaría.
- **`user_metadata.tiene_clave` es la única forma de saber si una cuenta tiene
  contraseña.** Supabase no lo dice: `user.identities` trae el proveedor `email`
  tanto si hay contraseña como si la cuenta nació de un enlace mágico. Si se deja
  de escribir esa marca, se le exigirá crear contraseña a gente que ya la tiene.
- **`requireUser()` redirige a `/cuenta/clave` a quien no tenga contraseña**, y
  el corte del bucle es el parámetro `destino`: esa misma página llama a
  `requireUser("/cuenta/clave")`. Copiar la llamada ahí sin el argumento deja el
  sitio en un bucle de redirecciones.
- **Un archivo `"use server"` solo puede exportar funciones asíncronas.** Por eso
  las tablas de estados de una orden viven en `src/lib/order-status.ts` y no
  junto a la acción que las usa. Exportar una constante desde un `"use server"`
  rompe la compilación con un error que no dice eso.
- **La cookie del dispositivo (`sgr_dispositivo`) no lleva el prefijo
  `__Host-`.** Ese prefijo exige `secure`, y en `localhost` sobre http el
  navegador la descartaría en silencio: el síntoma sería «el código se pide
  siempre» en desarrollo, sin ninguna pista de por qué.
- **Una política que consulta otra tabla protegida cuyas políticas consultan la
  primera produce `42P17: infinite recursion`, y no lo detecta nada más que
  ejecutarla.** Pasó con `orders` ↔ `order_items`: estaba mal desde `0001` y no
  se vio en tres semanas porque las órdenes vivían en memoria y ninguna consulta
  llegaba a la tabla. Lo arregló `0005`. **Regla práctica:** si una política
  necesita mirar otra tabla protegida, la pregunta se responde con una función
  `security definer` con `set search_path = public` —como `is_admin()`—, nunca
  con un `exists (...)` dentro de la política.
- **`0001` … `0005` son inmutables.** Ya corrieron contra la base. Todo cambio
  posterior es `0006_`.
- **Vercel Hobby es para proyectos no comerciales.** El día que entre dinero real
  son 20 USD/mes de Pro.
- **`hairline` y `control` no son intercambiables.** El primero separa
  superficies; el segundo dibuja el borde de un control, donde WCAG pide 3:1.
- **La longitud del código de acceso vive en el panel, no en el código.**
  Authentication → Sign In / Providers → Email → *Email OTP Length*, entre 6 y
  10. Está en **6**, que es lo que dice la pantalla de `/entrar`. La validación
  acepta el rango entero a propósito: si alguien sube ese ajuste y el código
  exigiera seis exactos, **nadie podría entrar** y el mensaje de error diría que
  el código está mal cuando el correcto es el que tiene delante. Ya pasó con el
  panel en 8.

---

## Comprobar el estado sin preguntarle a nadie

```bash
git fetch origin --prune && git log --oneline origin/main -5
git tag --points-at origin/main          # vacío = release sin etiquetar
gh pr list                               # qué hay abierto
ls .claude/hitos/                        # la historia; lo último al final
grep -rn "@/data/" src/lib/repo.ts       # vacío = el Bloque 1 terminó
```

Y contra la aplicación corriendo:

```bash
npm run build && npm run start
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/catalogo   # 200 = la base responde
curl -s -o /dev/null -w "%{redirect_url}\n" localhost:3000/admin   # /entrar = el guardia funciona
```
