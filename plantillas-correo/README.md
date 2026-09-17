# Plantillas de correo de Seregenera

Los correos de acceso los manda **Supabase**, no la aplicación. Su HTML vive en
el panel del proyecto y **no en este repositorio**: si alguien recrea el
proyecto de Supabase, esta carpeta es lo único que queda para reconstruirlos.

Esta carpeta es la copia de referencia. Se pega a mano en el panel.

> **Los correos que sí manda la aplicación** (respaldo de una postulación, por
> ejemplo) no se pegan en ningún lado: viven en `src/lib/correo/plantillas.ts` y
> se despliegan con el código. El archivo
> [`06-postulacion-recibida.md`](06-postulacion-recibida.md) documenta cómo se
> ve ese, para que se pueda revisar sin leer TypeScript.

---

## Qué hay aquí

| Archivo | Plantilla de Supabase | Cuándo se dispara |
|---|---|---|
| [`00-base.md`](00-base.md) | — | El esqueleto común. Léelo primero: explica por qué está hecho así |
| [`01-confirmar-registro.md`](01-confirmar-registro.md) | **Confirm signup** | Alguien se registra por primera vez en `/registro` |
| [`02-codigo-de-acceso.md`](02-codigo-de-acceso.md) | **Magic Link** | Alguien que ya tiene cuenta pide código en `/entrar` |
| [`03-invitacion.md`](03-invitacion.md) | **Invite user** | Un administrador crea una cuenta desde el panel |
| [`04-cambio-de-correo.md`](04-cambio-de-correo.md) | **Change Email Address** | Alguien cambia su correo |
| [`05-recuperar-clave.md`](05-recuperar-clave.md) | **Reset Password** | Hoy no se usa — ver la advertencia de ese archivo |
| [`06-postulacion-recibida.md`](06-postulacion-recibida.md) | — (la manda la app) | Alguien envía el formulario de `/vender` |

---

## Dónde se pegan

**Authentication → Emails → Templates**, una pestaña por plantilla.

Cada archivo trae el asunto y el cuerpo. El asunto va en *Subject heading* y el
cuerpo en *Message body*, en el editor de HTML (no en el de texto plano).

---

## Las cuatro cosas que se rompen si no se respetan

Están todas documentadas en `docs/ESTADO.md`; se repiten aquí porque es donde
se van a leer cuando haga falta.

### 1. `{{ .Token }}` va en **dos** plantillas, no en una

`signInWithOtp` elige *Magic Link* o *Confirm signup* según el usuario exista o
no. Poner el código en una sola deja la mitad de los accesos rotos, y cuál de
las dos mitades depende de a quién le toque.

### 2. El enlace **nunca** es `{{ .ConfirmationURL }}`

Esa variable apunta al `/auth/v1/verify` de Supabase, que devuelve al *Site URL*
con el token en el fragmento `#`. Un fragmento no viaja al servidor: la persona
aterriza en la portada sin sesión y sin ningún error visible.

El enlace correcto, el único que pasa por `src/app/auth/callback/route.ts`:

```
{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email
```

### 3. Hace falta un SMTP propio para que estas plantillas se usen

Desde el 3 de junio de 2026, los proyectos gratuitos que usan el enviador por
defecto de Supabase tienen las plantillas **bloqueadas**. Configurar un SMTP
propio (Authentication → SMTP Settings) las desbloquea y de paso quita el límite
de 2 correos/hora.

El remitente tiene que ser la misma cuenta que autentica: Gmail reescribe o
rechaza un `From` que no sea suyo ni un alias verificado.

### 4. `Email OTP Length` tiene que valer lo mismo que dice la pantalla

Authentication → Sign In / Providers → Email → *Email OTP Length*. Está en **6**.
La aplicación acepta de 6 a 10 a propósito (ver `src/app/entrar/actions.ts`),
así que subirlo no rompe el acceso — pero el texto de estas plantillas dice
«seis dígitos» y habría que cambiarlo.

---

## Sobre el logo

Las plantillas anteriores iban **sin imágenes** a propósito: el isotipo solo
existía en SVG, que Gmail no admite, y las imágenes remotas llegan bloqueadas
hasta que el destinatario las pide.

Eso ya no aplica, por dos motivos:

1. **El logo existe en PNG**: `public/img/marca/redes/firma-correo.png`, 320×80,
   logo verde sobre **fondo blanco macizo** — no transparente, porque Outlook
   pinta de gris lo que tenga canal alfa. Lo genera `scripts/generar-marca.sh`;
   no se edita a mano.
2. **Se sirve desde el propio sitio**, con `{{ .SiteURL }}` por delante. No hay
   que subirlo a ningún CDN ni adjuntarlo, y sigue al dominio si cambia.

Y por si acaso, **la plantilla no depende de que la imagen cargue**: si el
cliente de correo la bloquea, queda el `alt` («Seregenera») en Georgia y verde
`#1b5b3d`, que es exactamente lo que se veía antes. Nunca hay un renglón donde
el logo era lo único que decía de quién es el correo.

> La imagen se declara a `320×80` reales y se muestra a `160×40`. Es el truco de
> siempre para que no se vea borrosa en una pantalla retina.

---

## Cómo se comprueba que quedó bien

No hay forma automática: no tenemos cliente de correo en el CI.

```bash
# 1. Registrarse con un correo limpio y mirar el mensaje que llega
#    Tiene que traer los SEIS DÍGITOS y el enlace, y los dos tienen que entrar.

# 2. Pedir código desde /entrar con ese mismo correo (ya existe → Magic Link)
#    Mismo mensaje, otra plantilla. Si una de las dos falla, es esta.

# 3. Mirar el remitente: tiene que ser la cuenta del SMTP configurado.
```

Míralo al menos en Gmail web y en Gmail para Android: son los dos que más
recortan CSS y donde primero se ve si algo se cayó.
