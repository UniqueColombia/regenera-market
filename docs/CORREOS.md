# Correos: configurar el remitente y editar las plantillas

Guía paso a paso para **Ivan**. Está escrita para seguirla a mano y también para
que su Claude Code la use de mapa: si le pides «guíame con `docs/CORREOS.md`», debe
llevarte parte por parte, esperar a que confirmes cada paso y no pasar a la
siguiente sin que la anterior esté comprobada.

**Meta:** que todo correo de Seregenera salga desde una cuenta de
`@uniquecolombia` y ninguno desde el Gmail personal de Jesús.

> **Nunca se pega una contraseña en un chat, en el repositorio, en un hito ni en
> un mensaje de PR.** Va solo en los dos paneles que se nombran abajo.

---

## Por qué hay dos sitios donde configurar lo mismo

Los correos salen por **dos caminos independientes**, y cada uno guarda sus propias
credenciales:

| Quién lo manda | Qué correos | Dónde viven sus credenciales | Dónde vive su texto |
|---|---|---|---|
| **Supabase** | Código de acceso, confirmación de registro, invitación, cambio de correo, recuperar clave, confirmar operación | Supabase → Authentication → Emails → **SMTP Settings** | Supabase → Authentication → Emails → **Templates** (copias en `plantillas-correo/`) |
| **La aplicación** | Bienvenida, pedido recibido, postulación recibida, ofertas en revisión y publicadas, cambios de estado del pedido y aviso al proveedor | Variables `SMTP_*` en **Vercel** | `src/lib/correo/plantillas.ts` |

La aplicación no puede leer lo que hay en el panel de Supabase, así que las
mismas credenciales se escriben **en los dos sitios**. Mientras falten las
`SMTP_*` en Vercel, los correos de la aplicación **no se envían**: se escriben en
los registros del servidor y no da ningún error. Por eso el código de acceso llega
y la bienvenida no.

---

## Parte A — Pasar el remitente a Google Workspace

### A1. En Google Workspace

1. **Elige la cuenta que envía.** Mejor una dedicada, como
   `no-responder@uniquecolombia.com`, que la de una persona. Se crea en
   `admin.google.com` → Directorio → Usuarios. Es una cuenta real, con su buzón y
   su licencia.
2. **Activa la verificación en dos pasos** en esa cuenta. Sin ella Google no deja
   crear contraseñas de aplicación. Si el administrador la tiene bloqueada, se
   habilita en `admin.google.com` → Seguridad → Autenticación.
3. **Genera una contraseña de aplicación.** Con esa cuenta, en
   `myaccount.google.com/apppasswords`: nombre «Seregenera», copiar los 16
   caracteres. **Se muestran una sola vez.**
4. **Guárdala en un gestor de contraseñas** antes de seguir.

Si la opción de contraseñas de aplicación no aparece, el administrador de
Workspace la restringe: hay que permitirla, o usar un servicio transaccional
(Resend, Brevo) en vez de Gmail. En ese caso los valores de abajo cambian por los
que dé el servicio.

### A2. En Supabase

`Authentication` → `Emails` → pestaña **SMTP Settings**:

| Campo | Valor |
|---|---|
| Host | `smtp.gmail.com` |
| Port number | `587` |
| Username | `no-responder@uniquecolombia.com` |
| Password | la contraseña de aplicación de A1 |
| Sender email | `no-responder@uniquecolombia.com` |
| Sender name | `Seregenera` |

El **remitente tiene que ser la misma cuenta que autentica** (o un alias verificado
suyo): Gmail reescribe o rechaza cualquier otro `From`. Guarda. Las plantillas no
se tocan; son configuración aparte y sobreviven al cambio.

El aviso amarillo de Supabase («pensado para correo personal») seguirá saliendo con
Gmail. Con Workspace el techo es de unos 2.000 correos al día, que sobra para la
beta.

### A3. En Vercel

`Settings` → `Environment Variables`, **desde el panel y no con el CLI** (el CLI
guarda las comillas literalmente y rompe el valor):

`https://vercel.com/uniquecolombias-projects/regenera-market/settings/environment-variables`

| Variable | Valor |
|---|---|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | `no-responder@uniquecolombia.com` |
| `SMTP_PASSWORD` | la misma contraseña de aplicación |
| `SMTP_REMITENTE` | `Seregenera <no-responder@uniquecolombia.com>` |

Marca **Production y Preview** en cada una. Luego `Deployments` → el último →
**Redeploy**: un despliegue ya hecho no toma variables nuevas.

### A4. Que no caigan en spam: SPF y DKIM del dominio

Sin esto, un correo que sale de `@uniquecolombia.com` puede llegar a la carpeta
de spam aunque todo lo anterior esté bien. Se hace una sola vez y lo hace quien
administre el DNS del dominio.

1. **DKIM.** `admin.google.com` → Aplicaciones → Google Workspace → Gmail →
   **Autenticar correo electrónico**. Elige el dominio, *Generar nuevo registro*
   (clave de 2048 bits) y copia el registro TXT que te da.
2. **Publica ese TXT en el DNS** del dominio (donde esté registrado: GoDaddy,
   Cloudflare, etc.) con el nombre que Google indica (`google._domainkey`). Espera
   a que propague (puede tardar hasta unas horas) y vuelve a Google a pulsar
   **Iniciar autenticación**. Tiene que decir «Autenticando correo».
3. **SPF.** El dominio debe tener **un solo** registro TXT que empiece por
   `v=spf1` y que incluya `include:_spf.google.com`. Si ya existe uno, se le
   **añade** el `include`; dos registros SPF se anulan entre sí.
4. **Comprueba:** manda un correo desde la cuenta a un Gmail personal, abre
   «Mostrar original» y busca `SPF: PASS` y `DKIM: PASS`.

### A5. Comprobar que quedó

1. Regístrate en `/registro` con un correo real que no hayas usado.
2. Tiene que llegar el **código de 6 dígitos** (lo manda Supabase) **y** la
   **bienvenida** (la manda la aplicación). Si llega el código y no la bienvenida,
   falta A3 o falta el redespliegue.
3. En cada correo, «Mostrar original»: el remitente debe ser
   `Seregenera <no-responder@uniquecolombia.com>` y no debe aparecer
   `ichbinseiler@gmail.com` en ninguna parte.
4. Si algo no llega, los registros de Vercel (Logs) dicen por qué: busca
   `[checkout]`, `[postular-correo]` o un correo impreso en la consola.

---

## Parte B — Editar el texto de un correo

> **Antes de editar nada, una pasada por las seis pestañas.** Nadie dejó anotado
> cuáles están pegadas hoy en el panel. En `Authentication` → `Emails` →
> `Templates`, abre cada una y márcala aquí:
>
> - [ ] Confirm sign up: trae el logo, los seis dígitos y el botón
> - [ ] Magic link or OTP: igual
> - [ ] Invite user: no dice «Follow this link» en inglés
> - [ ] Change email address: igual
> - [ ] Reset password: igual
> - [ ] Reauthentication: **es la que casi seguro sigue con el texto de fábrica**
>
> Si una está en inglés o sin logo, es que es la de fábrica: pega la de su archivo
> (tabla de abajo).

Primero averigua **quién lo manda**, porque se edita en sitios distintos.

### Los que manda Supabase (se editan en el panel)

`Authentication` → `Emails` → `Templates`. Una pestaña por plantilla; el asunto va
en *Subject heading* y el cuerpo en *Message body*, **en el editor de HTML**.

| Pestaña del panel | Archivo con el HTML listo | Cuándo llega |
|---|---|---|
| Confirm sign up | `plantillas-correo/01-confirmar-registro.md` | Primer registro |
| Magic link or OTP | `plantillas-correo/02-codigo-de-acceso.md` | Quien ya tiene cuenta pide código |
| Invite user | `plantillas-correo/03-invitacion.md` | Un administrador crea una cuenta |
| Change email address | `plantillas-correo/04-cambio-de-correo.md` | Alguien cambia su correo |
| Reset password | `plantillas-correo/05-recuperar-clave.md` | Hoy no se usa |
| Reauthentication | `plantillas-correo/07-confirmar-operacion.md` | Hoy no se usa |

Para cambiar uno:

1. **Edita el archivo del repositorio primero** (es la copia de referencia: si
   alguien recrea el proyecto de Supabase, es lo único que queda).
2. Copia el bloque ` ```html ` completo al *Message body* de la pestaña y el asunto
   a *Subject heading*. Guarda.
3. Pruébalo con el paso A5.
4. Commitea el archivo, para que el repositorio y el panel digan lo mismo.

**Lo que se rompe si no se respeta** (el detalle está en `plantillas-correo/README.md`):

- `{{ .Token }}` tiene que estar en **Confirm sign up y en Magic link**: Supabase usa
  una u otra según la persona ya exista, y poner el código en una sola deja la mitad
  de los accesos sin número.
- El enlace del botón es **siempre**
  `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email`, **nunca**
  `{{ .ConfirmationURL }}`: ese devuelve a la portada sin sesión y sin ningún error.
- El texto dice «seis dígitos» porque `Email OTP Length` vale 6
  (Authentication → Sign In / Providers → Email). Si se cambia, se cambia el texto.
- El código **no va en el asunto**: se ve en la pantalla de bloqueo del teléfono.
- Estilos en línea, tablas, 560 px máximo, sin clases ni `<style>`. La razón y la
  paleta en hexadecimal están en `plantillas-correo/00-base.md`.

### Los que manda la aplicación (se editan en el código)

Viven en `src/lib/correo/plantillas.ts` y se despliegan con el repositorio. **No se
pega nada en ningún panel.**

| Función | Archivo con su texto | Estado |
|---|---|---|
| `correoBienvenida()` | — (ver `plantillas.ts`) | Conectado: se manda al crear la cuenta |
| `correoPedidoRecibido()` | — (ver `plantillas.ts`) | Conectado: se manda al hacer un pedido |
| `correoPostulacionRecibida()` | `plantillas-correo/06-postulacion-recibida.md` | Conectado: se manda al enviar `/vender` |
| `correoOfertaEnRevision()` | `plantillas-correo/08-oferta-en-revision.md` | Conectado: se manda al enviar una oferta a revisión |
| `correoOfertaPublicada()` | `plantillas-correo/09-oferta-publicada.md` | Conectado: se manda al aprobarla el equipo |
| `correoEstadoPedido()` | `plantillas-correo/10-estado-del-pedido.md` | Conectado: se manda al comprador al cambiar el estado |
| `correoPedidoPagadoProveedor()` | `plantillas-correo/11-pedido-pagado-proveedor.md` | Conectado: se manda a cada empresa al confirmarse el pago |

Para cambiar uno:

1. Edita el texto dentro de la función. Cada correo tiene **dos versiones del
   mismo texto**: el HTML (`html`) y el texto plano (`texto`). Cambia las dos, o
   quien lee en texto plano verá el mensaje viejo.
2. Todo lo que escribió una persona (nombre, empresa, título) pasa por `escapar()`.
   No lo quites: aquí no hay React que lo haga.
3. Los porcentajes y puntos del texto son **copias** de `src/lib/niveles.ts`: si
   cambia la comisión, hay que cambiarlos a mano.
4. Verifica: `npm run build`, `npx tsc --noEmit`, `npx eslint .`.
5. Para verlo sin esperar a que ocurra el evento, ejecuta la función desde un
   script y guarda `html` en un archivo que abras en el navegador.
6. Despliega. Estos correos cambian con el despliegue, no al guardar.

### Cómo se escribe el texto

Se aplica `redaccion-producto`: hablarle a la persona en segunda persona, decir lo
que hay y no lo que falta, y que cada correo sirva para **un solo paso**. Léelo en
voz alta como si se lo dijeras a un hotelero: si suena raro, está mal.

---

## Parte C — Qué correos existen y cuáles faltan

| Momento | ¿Quién lo manda? | Estado |
|---|---|---|
| Registro: código y enlace | Supabase | ✅ |
| Entrar con código | Supabase | ✅ |
| Cuenta creada por un administrador | Supabase | ✅ |
| Cambio de correo | Supabase | ✅ |
| Recuperar clave | Supabase | Plantilla lista, **el flujo no la usa** (recuperar es entrar con código) |
| Confirmar operación (reautenticación) | Supabase | Plantilla lista, **el flujo no la usa** |
| Bienvenida | Aplicación | ✅ conectado |
| Pedido recibido | Aplicación | ✅ conectado |
| Postulación recibida | Aplicación | ✅ conectado |
| Oferta enviada a revisión | Aplicación | ✅ conectado |
| Oferta publicada | Aplicación | ✅ conectado |
| Cambio de estado del pedido (pagado, preparación, entregado, cancelado, devuelto) | Aplicación | ✅ conectado |
| Aviso al proveedor de un pedido pagado | Aplicación | ✅ conectado |
| Oferta no aprobada | Aplicación | ❌ falta un campo de motivo en la base: una migración y una decisión de los dos |

**Dónde está conectado cada uno:** los de ofertas y de pedidos salen de
`src/lib/correo/notificaciones.ts`, que se llama **después** de guardar el
cambio y **nunca lanza**: un correo que falla queda en los registros del servidor y
no deshace nada. Los avisos a una empresa se mandan a **cada persona que la
gestiona** (`provider_members`); una empresa sin nadie asignado no recibe nada y no
da error.

**Para probarlos con una cuenta real**, sin esperar a que ocurra solo:

1. Con una cuenta de proveedor, manda una oferta a revisión → llega el 08.
2. Como administrador, apruébala en `/admin/ofertas` → llega el 09 a quien gestione la empresa.
3. Compra algo con otra cuenta; en `/admin/ordenes`, marca la orden como pagada →
   el comprador recibe el 10 y la empresa el 11. Pásala a «en preparación» y
   «entregada» y llega un 10 por cada cambio.

---

## Si algo sale mal

| Síntoma | Causa casi segura |
|---|---|
| Llega el código pero no la bienvenida ni el pedido | Faltan las `SMTP_*` en Vercel, o no se redesplegó |
| No llega ningún correo | Contraseña de aplicación mal copiada, o la verificación en dos pasos no está activa |
| El remitente sigue siendo el Gmail de Jesús | Falta A2 (Supabase) o A3 (Vercel): son dos sitios distintos |
| El logo sale como cuadro roto | `Site URL` en Supabase o `NEXT_PUBLIC_SITE_URL` en Vercel apuntan a `localhost` |
| El correo llega a spam | Normal con Gmail; con Workspace mejora. Si persiste, configurar SPF/DKIM del dominio |
| Cambié la plantilla y llega la vieja | Era un correo de la aplicación (se despliega) o se editó la pestaña equivocada |
