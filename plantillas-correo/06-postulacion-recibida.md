# 06 · Postulación recibida

**Plantilla de Supabase:** ninguna — **este correo lo manda la aplicación.**
**Se dispara cuando:** alguien envía el formulario de `/vender`.

> **Aquí no hay nada que pegar en ningún panel.** El HTML de este correo vive en
> `src/lib/correo/plantillas.ts`, se despliega con el código y se revisa en un
> PR. Este archivo existe para poder leer qué dice sin abrir TypeScript, y para
> que quien lo cambie sepa qué decisiones hay detrás.
>
> Los cinco anteriores sí hay que pegarlos: los manda Supabase y su HTML no vive
> en el repositorio.

## Quién lo manda

`src/lib/correo/` es la capacidad «mandar un mensaje», no el proveedor:
`getEnviadorCorreo()` devuelve SMTP si hay credenciales y, si no, un enviador que
escribe el correo en la consola. Las credenciales son **las mismas que ya usa
Supabase** para los correos de acceso (Authentication → SMTP Settings); en la
aplicación se declaran como `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` y, si hace
falta, `SMTP_PORT` y `SMTP_REMITENTE` (ver `.env.example`).

**Sin esas variables el formulario funciona igual**: la postulación se guarda y
el correo se registra en la consola del servidor. Es deliberado — que falle el
correo de cortesía no puede deshacer un alta que ya ocurrió.

## Tiene dos versiones, y la diferencia importa

`postular_proveedor()` devuelve si la cuenta quedó activada o no, y el correo
cambia entero según eso. Fingir que son un solo caso es lo que convierte un
correo útil en un acuse de recibo que nadie lee.

| Caso | Cuándo | Qué dice |
|---|---|---|
| **Activada** | Postuló con sesión abierta | Bienvenida. Su ficha ya existe, su nivel es Semilla y puede publicar hoy. Botón a su ficha pública |
| **Sin activar** | Postuló sin cuenta | La postulación está guardada y falta **un paso suyo**: registrarse con ese mismo correo. Botón a `/registro` |

En ningún caso dice «te responderemos en cinco días hábiles». Ya no es verdad, y
era justo lo que hacía que el formulario se sintiera una solicitud de permiso.

## Asuntos

```
{empresa} ya está en Seregenera          ← activada
Recibimos tu postulación a Seregenera    ← sin activar
```

## Qué dice, en texto plano

Es la versión que va en el `text/plain` del mismo mensaje. **No es un resumen**:
un correo solo-HTML puntúa peor en los filtros de spam, y hay clientes que solo
leen esto.

### Activada

```
Ya estás dentro, {nombre}

{empresa} ya tiene su ficha en Seregenera y su nivel Semilla.
No hay nada que esperar: puedes publicar lo que vendes desde hoy.

Siguientes pasos:
1. Completa tu perfil (logo, descripción, ubicación) — 80 puntos.
2. Publica tu primera oferta con su precio y su impacto por unidad.
3. Responde la evaluación de sostenibilidad cuando quieras — 300 puntos y el sello.

Tu ficha: {sitio}/proveedor/{slug}

Publicar es gratis. La comisión solo se cobra cuando vendes, y baja con tu
nivel: 12 % en Semilla, 10 % en Raíz, 8 % en Bosque.
Cómo funcionan los niveles: {sitio}/niveles

— Seregenera
```

### Sin activar

```
Recibimos tu postulación

Guardamos lo que nos contaste de {empresa}.
Falta un solo paso para que puedas publicar:

Crea tu cuenta con este mismo correo ({correo}) y tu empresa queda
activa en el acto, con su ficha y su nivel Semilla.

Crear cuenta: {sitio}/registro

No revisamos ni aprobamos nada: publicar es gratis y la comisión solo se
cobra cuando vendes.

— Seregenera
```

## Las tres cosas que se rompen si no se respetan

1. **Los porcentajes y los puntos que aparecen en el texto son copias.** Salen de
   `src/lib/niveles.ts` y de la migración 0006, y aquí están escritos a mano
   porque un correo no puede pedirle nada a la base. Si cambia la comisión o lo
   que da un evento, **este correo hay que cambiarlo a mano**. Ver
   `docs/NIVELES.md`.
2. **Todo lo que escribió la persona pasa por `escapar()`.** El nombre de la
   empresa viene de un formulario público y aquí no hay React que escape nada:
   una empresa con un `<` en el nombre rompe el correo que lee un administrador.
3. **Los enlaces cuelgan de `NEXT_PUBLIC_SITE_URL`.** Si esa variable se queda en
   `localhost`, el botón del correo lleva a la máquina de quien desplegó y el
   logo sale como cuadro roto. Es la misma trampa que `docs/ESTADO.md` anota para
   el `og:image`.

## El resto es igual a los demás

La estructura, la paleta, Georgia en los títulos, el ancho de 560 px y el
preencabezado son los mismos de [`00-base.md`](00-base.md), y por las mismas
razones. En el código son las funciones `envolver()`, `h1()`, `p()`, `boton()` y
`separador()` de `plantillas.ts`: si se cambia el esqueleto ahí, **también hay que
cambiarlo en las cinco plantillas de Supabase**, que no lo comparten.
