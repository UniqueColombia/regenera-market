# Auditoría de credenciales, sesiones y datos personales, y lo que se corrigió

- **Fecha:** 2026-10-22
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `fix/js-auditoria-credenciales` → `staging` → `main` (entrega directa), tag `v0.13.4`
- **Fase del roadmap:** — (seguridad)
- **Sigue a:** [2026-10-22-contrasena-en-la-url.md](2026-10-22-contrasena-en-la-url.md)

## Por qué

Después de encontrar la contraseña en la URL, Jesús pidió una auditoría de todo
lo relacionado: credenciales y sesiones, fugas de datos personales,
autorización y abuso, y configuración expuesta. Se hizo en cuatro frentes, solo
leyendo el código, con unas 47 peticiones anónimas a producción para las
cabeceras. Cada hallazgo se verificó en el código antes de tocarlo.

**El informe completo no se versiona**: describe debilidades que siguen abiertas
y el repositorio es público. Está en `outputs/auditoria-2026-10-22.md` en el PC
de Jesús (fuera de git, como el del 2026-10-20).

**Nada crítico.** Lo que ya estaba bien está en el informe: scrypt con sal y
comparación en tiempo constante, sesiones de 32 bytes guardadas como hash,
cookies `HttpOnly`/`Secure`/`Lax`, códigos de un solo uso con intentos contados
en transacción, redirects sin redirector abierto, webhook con firma, subidas
con bytes mágicos, ningún secreto en el repo ni en sus 423 commits, `npm audit`
limpio.

## Lo que se corrigió

| Hallazgo | Arreglo |
|---|---|
| Entrar solo con el código del correo y entrar con contraseña + código abrían la misma sesión; y quien olvidaba la contraseña no podía ponerse otra (`/cuenta/clave` pedía la actual) | `src/lib/pase.ts`: pases firmados con `SESION_SECRETO`. La contraseña demostrada deja `sgr_clave_ok`; un código canjeado sin él en una cuenta con contraseña es una **recuperación** (`sgr_recuperacion`): se lleva a la persona a ponerse una nueva sin pedir la actual. Vale igual para el enlace del correo (`/auth/callback`) |
| Quien registraba primero el correo de otro le dejaba su contraseña puesta | El registro comprueba si la clave escrita es la de la cuenta; si no, el código es una recuperación. La cookie sale siempre (válida o señuelo) para que no sirva de oráculo de contraseñas |
| Cambiar la contraseña no avisaba y dejaba los demás aparatos de confianza | Al cambiarla: se cierran las demás sesiones (ya pasaba), se retira la confianza de los demás aparatos y llega el correo «Tu contraseña cambió» (`correoClaveCambiada`) |
| Probar la contraseña actual (cambio de clave, baja) no tenía tope | 5 cada 15 minutos por cuenta |
| «Entrar con código» decía si un correo tenía cuenta | Responde igual exista o no |
| Contraseñas sin largo máximo | 256 caracteres |
| La barrera de URLs solo cubría contraseñas y códigos | También documento, NIT, teléfono, dirección (`url-sensible.ts`); y una regla de ESLint exige `method` en todo `<form>` |
| El error del SMTP y el de la base podían llevar correos a los registros | `sinCorreos()` (`src/lib/enmascarar.ts`) en el SMTP y en `registrarFallo()`, que ya no escribe `details` |
| 20 acciones del panel devolvían el error crudo de la base | Código de incidencia, como el resto de la app |
| El traductor de Google recibía el texto de la cuenta, los pedidos y el panel | `translate="no"` en `/admin`, `/cuenta` y `/orden`; declarado en la política de privacidad |
| La política de privacidad decía que Supabase y Vercel conservaban copias | Corregida (Supabase se borró el 2026-10-21); vigencia al 2026-10-22, con las cookies nuevas |
| El enlace de invitación de un prospecto no caducaba | Deja de valer con la baja y a los 90 días del último envío |
| Nada avisaba que el correo y el teléfono de `/vender` se publican | Lo dice la ayuda de cada campo |
| Sesiones vencidas y aparatos de hace un año quedaban en la base | `limpiarCuentas()` los borra |
| El token de los workflows heredaba permisos de escritura | `permissions: contents: read` en los tres |

## Lo que queda

Once puntos abiertos, ordenados por prioridad, en el informe fuera del repo.
Ninguno es una fuga de credenciales; los más altos son de abuso del negocio y
necesitan una decisión de producto. `docs/ESTADO.md` los nombra sin detalle.
