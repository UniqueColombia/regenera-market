# Dónde estamos

**Este archivo responde a «¿en qué vamos?».** Es el único que dice qué está a
medias *ahora mismo* y qué sigue. Si acabas de hacer `git pull` y quieres saber
qué hacer, empieza aquí y no en el ROADMAP.

- **Corte:** 2026-09-19
- **Producción:** `v0.6.0` en `main` → **https://regenera-market.vercel.app**
- **Fase del roadmap:** 0 cerrada. Bloques 0, 1, 2 y **3** de `docs/BETA.md`
  cerrados y **en producción**.

> ## ⚠️ Lo primero que hay que probar en producción: reaccionar en la Comunidad
>
> **La `0007` la aplicó Jesús el 2026-09-19**, por el editor SQL del panel y
> antes de desplegar, que era el orden obligatorio. Desde que corrió es
> inmutable como las seis anteriores.
>
> ```sql
> -- 2 = las dos tablas existen
> select count(*) from information_schema.tables
>  where table_name in ('community_posts', 'community_reactions');
> ```
>
> Lo que **nadie ha probado todavía** es el camino que más fácil falla en
> silencio: **reacciona a una publicación y quita la reacción**. Si el contador
> no se mueve, la marca `app.derivados` de la sección 4 de la migración no está
> haciendo su trabajo y el trigger de derivados deshace su propio incremento.
> No hay error en ninguna parte: el número simplemente se queda en cero.

> ## El 2026-09-19 entró el release `v0.6.0`: existe la Comunidad, y el registro dejó de pedir la clave dos veces
>
> Una revisión de uso dejó ocho observaciones; siete eran arreglos y una era una
> sección entera que faltaba. Todo está en
> [el hito](../.claude/hitos/2026-09-19-comunidad-y-ocho-observaciones-de-beta.md).
>
> Lo que conviene saber sin abrirlo:
>
> - **`/comunidad`**: muro donde publica cualquiera con cuenta, a título personal
>   o firmando con una empresa que gestione. Solo lo que firma una empresa suma
>   experiencia. Se modera desde `/admin/comunidad`, que es la **séptima**
>   pantalla del panel.
> - **`articulo_publicado` (30) y `articulo_destacado` (80) dejaron de ser
>   teoría.** Estaban en `otorgar_experiencia()` desde la `0006` sin tener dónde
>   ocurrir, y `/niveles` los escondía con una lista `AUN_NO` que ya no existe.
> - **El registro termina en `/registro/listo`**, no en `/cuenta/clave`. Quien
>   acaba de elegir contraseña no debe volver a elegirla. `/entrar` no cambió:
>   ahí `necesitaClave` sigue haciendo lo que debe.
> - **La cláusula de datos de `/vender` ya no es colombiana.** Redacción general
>   más la norma del país elegido, desde `PAISES[].proteccionDatos`.
> - **En el móvil ya se llega a la cuenta.** `MenuUsuario` es `hidden sm:block`,
>   así que por debajo de 640 px la única opción era salir.
> - **Tres skills nuevas o ampliadas**: `redaccion-producto`, `acceso-y-registro`
>   y una sección de paridad móvil en `diseno-visual`.
> - **Se reescribieron los textos de medio sitio.** Dos rondas de observaciones:
>   la primera quitó las frases que decían lo que *no* pasa; la segunda, las que
>   describían la sección en tercera persona en vez de hablarle a quien lee. De
>   paso cayeron seis textos que además eran **falsos desde la `0006`**, porque
>   seguían diciendo que el nivel sale de la evaluación de sostenibilidad.

> ## El 2026-09-17 entró el release `v0.5.0`: el proveedor entra solo
>
> **Cambia el modelo de negocio, no solo el código.** Quien postula desde
> `/vender` con sesión abierta queda dado de alta en el acto, y su nivel se gana
> con actividad en vez de salir de la evaluación de sostenibilidad; la comisión
> baja con el nivel: 12 / 10 / 8 %. El porqué y las trampas, en
> [`docs/NIVELES.md`](NIVELES.md) y en
> [el hito](../.claude/hitos/2026-09-17-niveles-por-experiencia-y-alta-directa.md).
>
> **La migración `0006` se aplicó el 2026-09-17**, por el editor SQL del panel de
> Supabase y **antes** de desplegar, que era el orden obligatorio: el código lee
> columnas que hasta entonces no existían, así que al revés el catálogo entero
> habría respondido 500. Desde que corrió es inmutable como las cinco anteriores.
>
> ```sql
> -- 2 = las dos funciones existen. Es lo que se comprobó al aplicarla.
> select count(*) from pg_proc
>  where proname in ('postular_proveedor', 'otorgar_experiencia');
> ```
>
> **Salió sin el visto bueno de Ivan sobre la comisión.** Decisión de Jesús para
> no frenar el lanzamiento: la tasa pasó de un 12 % fijo a 12 / 10 / 8 % según el
> nivel, y eso es negocio, no código. Queda por confirmar con él. Cambiarla es
> editar `NIVELES[].comision` en `src/lib/niveles.ts` y nada más — las órdenes ya
> emitidas no se tocan, porque cada ítem guarda la tasa con la que se cobró.
>
> **Lo único que quedó pendiente de esta tanda:** las cinco variables `SMTP_*` de
> `.env.example` en Vercel. Sin ellas el alta funciona igual y el correo de
> respaldo de cada postulación solo se escribe en la consola del servidor — nadie
> lo recibe, y no hay ningún error que lo delate.

> **El 2026-09-13 entró el release `v0.4.0`** (PR #42 → `staging`, #43 →
> `main`): acceso con contraseña y segundo factor por dispositivo, panel de
> administración de seis pantallas, órdenes y postulaciones en Postgres, y el
> latido diario contra la pausa de Supabase.
>
> Comprobado contra producción al desplegar: `/api/latido` responde `ok`,
> `/catalogo` 200, `/entrar` pide contraseña, `/admin` sin sesión redirige. El
> workflow `Latido` se disparó a mano y terminó en verde.

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

Todo lo que hacía falta para operar la beta **está en producción**: el catálogo
sale de Postgres, el acceso pide contraseña con el código de seis dígitos como
segundo factor en dispositivos nuevos, el panel de administración tiene seis
pantallas —incluido el CRUD de ofertas, que permite cambiar el catálogo sin
desplegar—, las órdenes y las postulaciones se persisten, y hay dos
administradores. **Lo que falta ya no es construir la plataforma: es meterle
datos reales y proveedores reales.**

Y desde el 2026-09-17 **cayó el último portero**: el proveedor se da de alta solo
y el nivel se gana vendiendo, no esperando a que alguien apruebe su evaluación
([`docs/NIVELES.md`](NIVELES.md)). Queda una cosa de esa tanda sin poner: las
`SMTP_*` en Vercel, sin las cuales nadie recibe el correo de su postulación.

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
| Contraseña + segundo factor por dispositivo | ✅ en producción desde `v0.4.0` |
| Las seis pantallas de `/admin` | ✅ en producción; falta `/admin/evaluaciones` |
| La séptima, `/admin/comunidad` | ✅ en producción desde `v0.6.0` |
| Órdenes y postulaciones en Postgres | ✅ en producción |
| Latido diario contra la pausa de Supabase | ✅ corriendo, 12:10 UTC |
| `0006_niveles_por_experiencia_y_alta_directa.sql` | ✅ **aplicada** el 2026-09-17, inmutable |
| `0007_comunidad.sql` | ✅ **aplicada** el 2026-09-19, inmutable |
| Comunidad: `/comunidad`, la sección de la portada y `/admin/comunidad` | ✅ en producción desde `v0.6.0`; **sin probar con datos reales** |
| Niveles por experiencia y comisión por nivel (12/10/8 %) | ✅ en producción desde `v0.5.0` |
| Alta directa del proveedor (`postular_proveedor()`) | ✅ en producción; con sesión, postular crea la empresa en el acto |
| `/niveles` y la ficha con nivel y sello separados | ✅ en producción |
| Correo transaccional de la aplicación (`src/lib/correo/`) | 🟡 desplegado, **sin credenciales**: faltan las `SMTP_*` en Vercel |
| El OK de Ivan a la comisión por nivel | ❌ se lanzó sin él, a conciencia. Ver el bloque de arriba |
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

### 0. Cerrar lo que quedó a medias de los `v0.5.0` y `v0.6.0`

**Esta es la lista con la que se retoma.** Ordenada por lo que bloquea a lo que
no; los cuatro primeros no son código.

| # | Qué | Quién | Bloquea |
|---|---|---|---|
| 1 | Las cinco `SMTP_*` en Vercel | Ivan | Que alguien reciba su correo |
| 2 | Probar el alta de proveedor en producción | Cualquiera | Abrir a proveedores reales |
| 3 | Probar la Comunidad en producción | Cualquiera | Confiar en el contador |
| 4 | El OK de Ivan a la comisión 12/10/8 % | Ivan | Nada técnico. Es negocio |
| 5 | Paginar `/comunidad` | Agente | Nada hoy. Sí con volumen |
| 6 | `/admin/evaluaciones` | Agente | Aprobar evaluaciones sin SQL |

1. ✅ **Las `0006` y `0007` están aplicadas**, el 2026-09-17 y el 2026-09-19,
   las dos antes de su despliegue.
2. **Las cinco `SMTP_*` en Vercel** (Production, y de paso Preview). Las mismas
   credenciales que ya tiene Supabase en Authentication → SMTP Settings. Sin
   ellas nadie recibe el correo de respaldo de su postulación, y no hay ningún
   error que lo delate: se escribe en la consola del servidor y ya. **Viene
   arrastrándose desde el `v0.5.0`.**
3. **Probar el alta de punta a punta, en producción**: entrar con una cuenta de
   prueba, mandar el formulario de `/vender` y comprobar que la empresa aparece
   en `/proveedores` con nivel Semilla y que llega el correo. **Nadie lo ha hecho
   todavía**: el camino de `postular_proveedor()` se revisó línea a línea, no se
   ejecutó. Si algo falla, es el primer sitio donde mirar.
4. **Probar la Comunidad en producción**, en este orden:
   1. Publicar con sesión a título personal → sale en `/comunidad` y en la
      portada.
   2. Publicar firmando con una empresa → `providers.experience_points` sube 30
      y `experience_events` gana su fila.
   3. **Reaccionar y quitar la reacción** → el contador sube y baja. Es la que
      importa: falla en silencio (ver el aviso del principio).
   4. Con otra cuenta, intentar firmar con una empresa ajena → lo niega
      `community_posts_insert`.
   5. Ocultar una publicación desde `/admin/comunidad` → desaparece del muro.
   6. Registrarse de cero → se aterriza en `/registro/listo`, no en
      `/cuenta/clave`.
   7. A 375 px, con sesión → el menú del teléfono lleva a «Tu cuenta».
5. **Contarle a Ivan lo de la comisión** — 12 / 10 / 8 % salió a producción sin
   su visto bueno, para no frenar el lanzamiento.

### 0b. Lo que dejó abierto la Comunidad

Ninguno bloquea nada hoy. Están aquí para que no se pierdan.

- **Paginar `/comunidad`.** Hoy trae 30 publicaciones y el panel 200, sin
  cursor. Con volumen real hace falta uno por `created_at`.
- **Sin imágenes en las publicaciones**, por lo mismo que las ofertas: subir
  archivos está fuera de la beta. Es lo primero que se va a pedir.
- **A nadie le llega un aviso cuando se publica algo.** `/admin/comunidad` hay
  que ir a mirarlo. Si el muro se llena, esto pasa a ser lo primero.
- **Sin denuncia de una publicación.** Moderar depende de que un administrador
  la vea; un lector que encuentre algo fuera de sitio no tiene cómo avisar.
- **`articulo_publicado` no tiene tope.** Los demás eventos repetibles sí
  (10 ofertas al mes, 3 certificaciones). Publicar cien entradas distintas suma
  cien veces 30 puntos, y eso es comisión. El tope va en
  `otorgar_experiencia()`, junto a los otros dos, el día que alguien lo intente.

### 1. Abrir a proveedores reales

La plataforma ya hace lo que tenía que hacer. El siguiente paso no es código:

1. **El SMTP definitivo** (solo Ivan, punto 1 de arriba). Hoy el correo de acceso
   sale del Gmail personal de Jesús, con techo de ~500 al día. No se sostiene
   frente a un hotel.
2. **Cargar proveedores de verdad** desde `/admin/ofertas` y `/admin/usuarios`.
   Los 13 sembrados son ficticios y no se pueden presentar como reales —
   invariante 21.
3. **Ya no hace falta aprobar a nadie para que entre.** Con la 0006, quien
   postula con sesión queda dado de alta solo, con su empresa, su vínculo de
   dueño y su rol. `/admin/postulaciones` sigue existiendo para las que llegan
   **sin cuenta**, que son las únicas que quedan en `pending_review`.
4. **Enlazar con una persona a los proveedores viejos** (`/admin/usuarios`): los
   sembrados no tienen `provider_members`, y mientras una empresa no tenga a
   nadie, solo un administrador puede tocarla.

### 2. Lo que quedó fuera del Bloque 3, a conciencia

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

### 3. El Bloque 4 — panel de proveedor

Mismo patrón que `/admin` aplicado al otro rol. Depende del cabo suelto de arriba
(`provider_members`): mientras nadie se convierta en `provider`, no hay a quién
enseñarle ese panel.

### 4. Mudarse a servidor propio, y dejar de depender de Supabase

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
- **`supabase.auth.signOut()` sin argumentos cierra la sesión en TODOS los
  dispositivos de esa persona.** El valor por defecto de `scope` es `global` y
  revoca todos sus tokens. En los tres sitios donde se llama va
  `signOut({ scope: "local" })`: sin eso, entrar desde un computador nuevo —o
  simplemente escribir bien tu contraseña actual para cambiarla— echaría a la
  persona de su teléfono y de su portátil. El síntoma sería «se me cierra la
  sesión sola», sin nada que lo relacione con la causa.
- **El contexto `secrets` no existe en el `if` de un paso de GitHub Actions.**
  Solo están `github`, `needs`, `job`, `runner`, `env`, `vars`, `steps`, `inputs`
  y `matrix`. Un `if: ${{ secrets.X != '' }}` no se evalúa como falso: revienta el
  workflow entero con «Unrecognized named-value». El secreto se copia al `env` del
  job y la condición mira la copia — así está hecho en `latido.yml`.
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
- **El nivel de un proveedor no se puede escribir a mano, ni con la clave de
  servicio.** Desde la 0006, un trigger `before insert or update` lo deriva de
  `experience_points` y pisa cualquier valor. Un `update providers set tier =
  bosque` parece funcionar y no cambia nada. Para subir a alguien se le dan
  puntos con `otorgar_experiencia()` — ver `docs/NIVELES.md`.
- **Los puntos y los umbrales están escritos dos veces**: en la 0006 y en
  `src/lib/niveles.ts`. Manda la base; el de TypeScript existe para poder
  pintarlo sin una consulta. Si divergen, la pantalla le promete al proveedor
  puntos que nunca le llegan.
- **La comisión ya no es una constante.** Depende del nivel de quien vende, así
  que valorizar el carrito necesita leer el nivel de cada proveedor
  (`getProviderTiers`). Un proveedor que no se pueda leer paga la tasa base, que
  es la más alta: ante la duda se cobra de más, porque cobrar de menos es plata
  que se pierde sin que ningún error lo diga.
- **`order_items.commission_rate` congela la tasa aplicada.** No se recalcula
  nunca contra el nivel de hoy: el nivel sube con el tiempo y una orden de hace
  seis meses dejaría de cuadrar consigo misma.
- **`0001` … `0006` son inmutables.** Las seis corrieron contra la base. Todo
  cambio posterior es `0007_`.
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
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/niveles    # 200 = la tanda de niveles está desplegada
```

Y si lo que quieres saber es qué tiene la **base**, eso no está en el
repositorio: se pregunta en el editor SQL del panel de Supabase, con la consulta
del bloque del principio de este archivo.
