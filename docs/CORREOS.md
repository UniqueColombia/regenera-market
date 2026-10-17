# Correos: el remitente y cómo editar las plantillas

Guía paso a paso. Está escrita para seguirla a mano y también para que un Claude
Code la use de mapa: si le pides «guíame con `docs/CORREOS.md`», debe llevarte
parte por parte, esperar a que confirmes cada paso y no pasar a la siguiente sin
que la anterior esté comprobada.

**Estado (2026-10-16):** todo correo de Seregenera sale de
**`info@seregenera.com`**, un buzón del correo de Hostinger, y ninguno del Gmail
personal de Jesús. Decisión de Jesús: reemplaza el plan anterior de esta guía
(un remitente de Google Workspace en `@uniquecolombia.com`), que queda en el
historial de Git.

> **Nunca se pega una contraseña en un chat, en el repositorio, en un hito ni en
> un mensaje de PR.** Va solo en los paneles que se nombran abajo y en el `.env`
> de cada PC.

---

## Por qué hay dos sitios donde configurar lo mismo

Los correos salen por **dos caminos independientes**, y cada uno guarda sus propias
credenciales:

| Quién lo manda | Qué correos | Dónde viven sus credenciales | Dónde vive su texto |
|---|---|---|---|
| **Supabase** | Código de acceso, confirmación de registro, invitación, cambio de correo, recuperar clave, confirmar operación | Supabase → Authentication → Emails → **SMTP Settings** | Supabase → Authentication → Emails → **Templates** (copias en `plantillas-correo/`) |
| **La aplicación** | Bienvenida, pedido recibido, postulación recibida, ofertas en revisión y publicadas, cambios de estado del pedido y aviso al proveedor | Variables `SMTP_*` de la Web App en **Hostinger** (y en el `.env` de cada PC) | `src/lib/correo/plantillas.ts` |

La aplicación no puede leer lo que hay en el panel de Supabase, así que las
mismas credenciales se escriben **en los dos sitios**. Si faltan las `SMTP_*`,
los correos de la aplicación **no se envían**: se escriben en los registros del
servidor y no da ningún error. Por eso puede llegar el código de acceso y no la
bienvenida.

---

## Parte A — El remitente: `info@seregenera.com` en Hostinger

Hecho el 2026-10-16. Estos pasos sirven para rehacerlo (otro buzón, otra
contraseña) o para comprobar que sigue bien.

### A1. El buzón

hPanel (con el acceso de administrador a la cuenta de Ivan) → **Correos
electrónicos** → `seregenera.com` → crear la cuenta `info@seregenera.com`. La
contraseña la elige quien la crea y va **directo al gestor de contraseñas**.

Por la API no se puede: el MCP de Hostinger no ve el correo de la cuenta de Ivan
(`mail_orders_list` sale vacío).

### A2. En Supabase

`Authentication` → `Emails` → pestaña **SMTP Settings**:

| Campo | Valor |
|---|---|
| Host | `smtp.hostinger.com` |
| Port number | `465` |
| Username | `info@seregenera.com` |
| Password | la del buzón |
| Sender email | `info@seregenera.com` |
| Sender name | `Seregenera` |

El **remitente tiene que ser el mismo buzón que autentica**: los servidores de
correo reescriben o rechazan otro `From`. Las plantillas no se tocan; son
configuración aparte y sobreviven al cambio.

En el mismo Supabase, `Authentication` → **URL Configuration**: *Site URL*
`https://seregenera.com`, y `https://seregenera.com/**` en *Redirect URLs*. Sin
eso, los enlaces de los correos llevan a otro dominio.

### A3. En Hostinger (la aplicación)

hPanel → `seregenera.com` → **Variables de entorno**:

| Variable | Valor |
|---|---|
| `SMTP_HOST` | `smtp.hostinger.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | `info@seregenera.com` |
| `SMTP_PASSWORD` | la del buzón |
| `SMTP_REMITENTE` | `Seregenera <info@seregenera.com>` |

Se cambian **en el panel**, no con el MCP: la operación del MCP reemplaza todas
las variables de una vez, y el agente no conoce `SMTP_PASSWORD`. No hace falta
recompilar: estas variables se leen al arrancar, y el propio cambio reinicia la
aplicación.

En el `.env` de cada PC van los mismos valores, salvo en el de Jesús: allí Avast
(Web/Mail Shield) intercepta el SMTP con un certificado propio, y en el 465 falla
con «unable to verify the first certificate». Para que la app envíe desde ese PC:
`SMTP_PORT=587` y arrancar con `NODE_OPTIONS=--use-system-ca`, que hace que Node
confíe en la raíz de Avast instalada en Windows (ver A5).

### A4. Que no caigan en spam

El DNS de `seregenera.com` ya trae lo necesario para el correo de Hostinger, y se
comprobó el 2026-10-16: `MX` a `mx1`/`mx2.hostinger.com`, un SPF
(`v=spf1 include:_spf.mail.hostinger.com ~all`), DKIM (`hostingermail-a._domainkey`)
y DMARC (`_dmarc`). **Debe haber un solo registro SPF**: si algún día se agrega
otro servicio de envío, se le **añade** un `include` al que existe; dos registros
SPF se anulan entre sí.

```bash
nslookup -type=MX seregenera.com 8.8.8.8
nslookup -type=TXT seregenera.com 8.8.8.8
nslookup -type=TXT _dmarc.seregenera.com 8.8.8.8
```

### A5. Comprobar que quedó

1. Regístrate en `https://seregenera.com/registro` con un correo real que no
   hayas usado.
2. Tiene que llegar el **código de 6 dígitos** (lo manda Supabase) **y** la
   **bienvenida** (la manda la aplicación). Si llega el código y no la bienvenida,
   falta A3.
3. En cada correo, «Mostrar original»: remitente `Seregenera <info@seregenera.com>`,
   `SPF: PASS` y `DKIM: PASS`, y `ichbinseiler@gmail.com` no aparece en ninguna
   parte.

Para probar solo las credenciales desde un PC, sin mandar nada (lee el `.env` y
no imprime la contraseña):

```bash
node --use-system-ca -e '
const fs=require("fs"),e={};for(const l of fs.readFileSync(".env","utf8").split(/\r?\n/)){const m=l.match(/^([A-Z_]+)=(.*)$/);if(m)e[m[1]]=m[2].replace(/^["\x27]|["\x27]$/g,"")}
require("nodemailer").createTransport({host:e.SMTP_HOST,port:587,secure:false,requireTLS:true,auth:{user:e.SMTP_USER,pass:e.SMTP_PASSWORD}})
.verify().then(()=>console.log("login OK"),x=>console.log("FALLA:",x.message))'
```

Se comprobó así el 2026-10-16, y llegaron a la bandeja de entrada (no a spam) un
código de acceso de Supabase y un correo de prueba de la aplicación.

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
| Llega el código pero no la bienvenida ni el pedido | Faltan las `SMTP_*` en Hostinger (A3) |
| No llega ningún correo | Contraseña del buzón mal copiada en Supabase (A2), o el buzón se borró o cambió de clave en hPanel |
| El remitente sigue siendo el Gmail de Jesús | Falta A2 (Supabase) o A3 (Hostinger): son dos sitios distintos |
| El logo sale como cuadro roto | `Site URL` en Supabase o `NEXT_PUBLIC_SITE_URL` en Hostinger apuntan a `localhost` |
| El correo llega a spam | Revisar A4: que siga habiendo un solo SPF y que DKIM dé `PASS` en «Mostrar original» |
| En el PC de Jesús: «unable to verify the first certificate» | Avast intercepta el SMTP. Puerto `587` y `NODE_OPTIONS=--use-system-ca` (A3). Producción no pasa por Avast |
| Cambié la plantilla y llega la vieja | Era un correo de la aplicación (se despliega) o se editó la pestaña equivocada |
