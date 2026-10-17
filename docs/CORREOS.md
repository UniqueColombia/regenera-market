# Correos: el remitente y cómo editar las plantillas

Guía paso a paso. Está escrita para seguirla a mano y también para que un Claude
Code la use de mapa: si le pides «guíame con `docs/CORREOS.md`», debe llevarte
parte por parte, esperar a que confirmes cada paso y no pasar a la siguiente sin
que la anterior esté comprobada.

**Estado (2026-10-17):** todo correo de Seregenera sale de
**`info@seregenera.com`**, un buzón del correo de Hostinger, y ninguno del Gmail
personal de Jesús. Decisión de Jesús: reemplaza el plan anterior de esta guía
(un remitente de Google Workspace en `@uniquecolombia.com`), que queda en el
historial de Git. Desde el 2026-10-17 es también el correo de contacto de la
sociedad (`CONTACTO.correo`), y **las seis plantillas de Supabase están subidas
desde el repositorio** con `scripts/plantillas-supabase.mts` (parte B). Falta la
foto del remitente: parte D.

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
`https://seregenera.com` —**sin `www` y sin barra final**—, y
`https://seregenera.com/**` en *Redirect URLs*. Sin eso, los enlaces de los
correos llevan a otro dominio. El 2026-10-17 estaba en
`https://www.seregenera.com/`: con la barra, las plantillas pedían
`//img/…`; con `www`, la sesión del botón del correo quedaba en otro dominio
que el del sitio. Lo corrigió el script de la parte B (`--site-url`), que además
avisa si vuelve a pasar.

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

> **La pasada por las seis pestañas ya se hizo, y por la API** (2026-10-17).
> Solo *Confirm sign up* y *Magic link* tenían el texto del repositorio, en una
> versión vieja y sin logo; las otras cuatro seguían en inglés, de fábrica. Las
> seis se subieron con el script de abajo, que confirmó después que el panel
> coincide con estos archivos.

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

1. **Edita el archivo del repositorio** (`plantillas-correo/0X-….md`: el asunto
   en su bloque de «Asunto», el HTML en el de «Cuerpo»). El repositorio es la
   fuente; el panel, la copia.
2. Compara y sube con el script. Sin `--aplicar` no escribe nada:

   ```bash
   node --env-file=.env scripts/plantillas-supabase.mts            # qué cambió
   node --env-file=.env scripts/plantillas-supabase.mts --aplicar  # subirlo
   ```

   Necesita `SUPABASE_ACCESS_TOKEN` en el `.env`: un token **personal** de
   supabase.com/dashboard/account/tokens (de una cuenta con acceso al
   proyecto). Caduca; si el script responde 401, se genera otro. Nunca va a las
   variables de Hostinger: la app no lo usa.
3. Pruébalo con el paso A5.
4. Commitea el archivo, para que el repositorio y el panel digan lo mismo.

Antes de subir, el script comprueba las reglas de la lista de abajo y no sube
nada si una falla. Si el token no está a mano, el camino de antes sigue valiendo:
copiar el bloque ` ```html ` al *Message body* de la pestaña y el asunto a
*Subject heading*.

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

**Supabase solo manda los correos de acceso** (las seis primeras filas). Todo lo
demás —empresa, compra, entrega, ofertas— lo manda **la aplicación** desde
`src/lib/correo/plantillas.ts`, por el mismo SMTP. Así que «el formato de un
correo» de una empresa o de un pedido se cambia en el código, no en el panel de
Supabase.

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
| Pedido despachado (`correoPedidoDespachado`) | Aplicación | ✅ conectado |
| Ofertas cargadas desde Excel (`correoOfertasImportadas`) | Aplicación | ✅ conectado |
| Cuenta eliminada (`correoCuentaEliminada`) | Aplicación | ✅ conectado, pero **necesita la `0021`**, todavía sin aplicar |
| Empresa cerrada (`correoEmpresaCerrada`) | Aplicación | ✅ conectado, pero **necesita la `0021`**, todavía sin aplicar |
| Oferta no aprobada | Aplicación | ❌ falta un campo de motivo en la base: una migración y una decisión de los dos |
| Empresa creada con éxito | Aplicación | ✅ ya existía: con sesión, `correoPostulacionRecibida` manda la versión «activada» (asunto «<empresa> ya está en Seregenera», con los siguientes pasos y el botón a su ficha). La de «recibimos tu postulación» es solo para quien postula sin cuenta. Comprobado leyendo el código el 2026-10-17 |
| Plazo de entrega en los correos del pedido | Aplicación | ✅ desde el 2026-10-17: «llega entre 2 y 5 días hábiles» por línea en `correoPedidoRecibido`, y lo que prometió el vendedor en `correoPedidoDespachado`. Mismo `plazoDeEntrega()` que la cesta |
| Liquidación al proveedor («te pagamos tu venta») | Aplicación | ❌ no existe: hace falta la liquidación misma (ver `docs/ENVIOS-Y-PAGOS.md`). Los términos del 2026-10-17 ya prometen cuándo se paga |

### Pendiente: repasar el formato de todos los correos (2026-10-16)

Ahora que el remitente es `info@seregenera.com` y el SMTP funciona en producción,
toca una pasada por todos los correos con la skill `redaccion-producto`:
empresa creada, empresa cerrada, cuenta eliminada, compra, despacho y plazo de
entrega, cambios de estado, ofertas. Que digan lo mismo que la pantalla, con el
mismo tono, y que cada uno lleve a un solo paso. Primero las dos filas ❌
pendientes de la tabla, después el resto. Las plantillas de Supabase (Parte B)
entran en la misma pasada.

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

## Parte D — La foto del remitente

La foto (o el círculo con la inicial) que sale **junto al remitente** en la
bandeja de entrada **no la pone el correo**. Ni Supabase ni las plantillas
pueden cambiarla: cada buzón la busca por su cuenta, fuera del mensaje. Hay tres
caminos, de más barato a más completo, y se pueden sumar.

**El logo *dentro* del correo es otra cosa y ya está**: la cabecera de todas
las plantillas (las seis de Supabase y las de la app) lleva
`img/marca/redes/firma-correo.png`, servido desde el propio sitio.

### D1. Gmail: una cuenta de Google con `info@seregenera.com` (gratis, 10 minutos)

Gmail enseña la foto de perfil de la cuenta de Google del remitente. Una cuenta
de Google se puede crear **con un correo que no es de Gmail**:

1. accounts.google.com → Crear cuenta → «Para mi uso personal» → **«Usar mi
   dirección de correo electrónico actual»** → `info@seregenera.com`.
2. Google manda un código a ese buzón: se lee en el correo web de Hostinger.
3. En la cuenta: Información personal → Foto →
   `public/img/marca/redes/avatar-400.png`, con visibilidad **«Cualquier
   persona»**.

Lo hace quien tenga la contraseña del buzón (Jesús o Ivan); el agente no. Google
no lo promete como garantía, pero es lo que Gmail usa en la práctica, y los
mensajes tienen que pasar SPF y DKIM, que ya pasan (A4).

### D2. BIMI: el estándar, para Yahoo y AOL sin pagar, y para Gmail y Apple con certificado

BIMI es un registro DNS que le dice al buzón dónde está el logo oficial del
dominio. El logo ya está publicado en el formato que exige (SVG Tiny PS):
**`https://seregenera.com/bimi.svg`** (`public/bimi.svg`, lo genera
`scripts/generar-marca.sh`). Faltan dos registros, y los tiene que poner
**Ivan en hPanel**: el dominio está en su cuenta y el MCP de Hostinger no ve su
DNS (respondió `Customer does not own seregenera.com domain` el 2026-10-17).

1. **Primero, el DMARC con reportes**, para ver durante unos días que todo lo que
   sale del dominio pasa SPF y DKIM. Cambia el `TXT` de `_dmarc` de
   `v=DMARC1; p=none` a:

   ```
   v=DMARC1; p=none; rua=mailto:info@seregenera.com
   ```

   Llegan reportes diarios (XML) de Google y otros. Si en una semana no aparece
   ningún remitente legítimo fallando, el paso 2.

2. **Endurecer el DMARC**, que es lo que BIMI exige:

   ```
   v=DMARC1; p=quarantine; pct=100; rua=mailto:info@seregenera.com
   ```

   **Ojo**: desde aquí, un correo que diga venir de `@seregenera.com` y no salga
   por Hostinger va a spam. Hoy todo sale por Hostinger (Supabase y la app usan
   su SMTP), pero si algún día se agrega otro servicio de envío, primero se le
   da su `include` en el SPF y su DKIM.

3. **El registro BIMI**, un `TXT` con nombre `default._bimi`:

   ```
   v=BIMI1; l=https://seregenera.com/bimi.svg;
   ```

Con eso, **Yahoo y AOL** muestran el logo. **Gmail y Apple Mail** además piden un
certificado de marca: un VMC (exige la marca registrada) o un CMC (exige haber
usado el logo en público al menos un año), de una entidad como DigiCert o
Entrust, con costo anual. Es una decisión de gasto de los dos; si se compra, se
agrega `a=https://…/certificado.pem` al registro del paso 3.

Comprobar: `nslookup -type=TXT default._bimi.seregenera.com 8.8.8.8` y el
validador de bimigroup.org.

### D3. Gravatar (gratis, opcional)

Algunas aplicaciones de correo y muchos sitios buscan la foto en Gravatar por la
dirección. gravatar.com → entrar con `info@seregenera.com` → subir el mismo
`avatar-400.png`. No le hace nada a Gmail; cuesta cinco minutos.

### Si cambia el logo

Si la marca cambia (Ivan está revisando un logo nuevo), se cambia el SVG de
`public/img/marca/`, se corre `scripts/generar-marca.sh` —que regenera
`firma-correo.png`, los avatares y `bimi.svg`— y se vuelve a subir la foto de D1
y D3. El registro DNS de D2 no cambia: apunta a la misma ruta.

---

## Si algo sale mal

| Síntoma | Causa casi segura |
|---|---|
| Llega el código pero no la bienvenida ni el pedido | Faltan las `SMTP_*` en Hostinger (A3) |
| No llega ningún correo | Contraseña del buzón mal copiada en Supabase (A2), o el buzón se borró o cambió de clave en hPanel |
| El remitente sigue siendo el Gmail de Jesús | Falta A2 (Supabase) o A3 (Hostinger): son dos sitios distintos |
| El logo sale como cuadro roto | `Site URL` en Supabase o `NEXT_PUBLIC_SITE_URL` en Hostinger apuntan a `localhost` |
| El correo del código llega en inglés o sin logo | El panel de Supabase volvió a la plantilla de fábrica: `node --env-file=.env scripts/plantillas-supabase.mts` dice cuál y `--aplicar` la repone |
| El botón «Entrar sin escribir el código» deja a la persona fuera | `Site URL` con `www` o con barra final (A2). Antes del 2026-10-17, además, la app redirigía a `https://0.0.0.0:3000` (arreglado en `src/app/auth/callback/route.ts`) |
| Junto al remitente sale una inicial y no el logo | Es la parte D: el correo no lo controla |
| El correo llega a spam | Revisar A4: que siga habiendo un solo SPF y que DKIM dé `PASS` en «Mostrar original» |
| En el PC de Jesús: «unable to verify the first certificate» | Avast intercepta el SMTP. Puerto `587` y `NODE_OPTIONS=--use-system-ca` (A3). Producción no pasa por Avast |
| Cambié la plantilla y llega la vieja | Era un correo de la aplicación (se despliega) o se editó la pestaña equivocada |
