# El esqueleto común

Las seis plantillas son el mismo HTML con el bloque del medio cambiado. Este
archivo explica por qué está hecho así, para que el día que alguien lo toque
sepa qué se rompe.

**Los demás archivos traen el HTML completo, listo para pegar.** Aquí no hay
nada que copiar: es la explicación.

---

## Por qué tablas y estilos en línea

Un correo no es una página web. Gmail borra el `<head>`, Outlook renderiza con
el motor de Word, y ninguno de los dos entiende flexbox ni grid. Lo único que
funciona en todos desde hace veinte años son tablas anidadas con `style=` en
cada celda. No es nostalgia: es el único denominador común.

De ahí las reglas que sigue este HTML:

- **Nada de clases CSS.** Todo `style=` en línea, en cada elemento.
- **Nada de `<style>` en el `<head>`.** Gmail lo respeta a medias y Outlook.com
  lo reescribe.
- **Ancho máximo 560 px**, que es lo que cabe sin scroll horizontal en el panel
  de lectura de Outlook de escritorio.
- **`role="presentation"` en cada tabla de maquetado.** Sin eso, un lector de
  pantalla anuncia «tabla de 1 fila por 1 columna» antes de cada párrafo.
- **Medidas en píxeles, nunca en `rem`.** `rem` depende de una raíz que en
  correo no existe.

## La paleta, en hexadecimal

En el sitio los colores son tokens de Tailwind (`src/app/globals.css`). Aquí hay
que escribirlos a mano, y son estos — **si cambia la paleta del sitio, cambia
aquí también, que es el único sitio donde no se entera nadie**:

| Rol | Token del sitio | Hex |
|---|---|---|
| Verde de marca | `brand-700` | `#1b5b3d` |
| Verde oscuro | `brand-900` | `#0f3221` |
| Verde claro de fondo | `brand-50` | `#eef7f1` |
| Fondo del mensaje | `sand` | `#f0ebe2` |
| Superficie de la tarjeta | blanco | `#ffffff` |
| Texto principal | `ink` | `#17241d` |
| Texto secundario | `muted` | `#55655c` |
| Separador | `hairline` | `#e3ded3` |

## Tipografía

`font-display` del sitio es Fraunces, que se sirve desde Google Fonts. **En un
correo no se puede cargar una fuente web**: Gmail las ignora y Outlook las
bloquea. El respaldo que ya declara `globals.css` para esa familia es Georgia, y
Georgia está instalada en Windows, macOS, iOS y Android. Así que los títulos van
en Georgia y llegan iguales en todas partes.

El cuerpo va con la pila del sistema (`-apple-system, Segoe UI, Roboto, …`), que
es lo que hace que el texto se vea nativo en cada aparato.

## El logo, y por qué el correo no depende de él

```html
<img src="{{ .SiteURL }}/img/marca/redes/firma-correo.png"
     width="160" height="40" alt="Seregenera"
     style="display:block;border:0;width:160px;height:40px;
            font-family:Georgia,serif;font-size:22px;color:#1b5b3d;">
```

Tres detalles que no son decoración:

1. **`{{ .SiteURL }}` por delante.** La imagen se sirve desde el propio sitio, no
   desde un CDN ni como adjunto. Si mañana el dominio cambia, el logo lo sigue.
2. **`font-family` y `color` dentro del `<img>`.** Parece absurdo darle tipografía
   a una imagen, y es justo lo que hace que valga la pena: cuando el cliente de
   correo **bloquea** la imagen, lo que queda es el texto del `alt`, y con esas
   dos propiedades ese texto sale «Seregenera» en Georgia y en verde de marca.
   La cabecera nunca queda como un cuadro roto.
3. **`display:block`.** Sin eso, Gmail deja un par de píxeles de hueco debajo de
   la imagen (el espacio del renglón) y la banda blanca se ve descuadrada.

El PNG es de 320×80 y se muestra a 160×40: al doble de resolución para que no
se vea borroso en pantalla retina.

## El código de seis dígitos

Va en una caja aparte, en Georgia, a 34 px, con `letter-spacing` generoso. Dos
razones concretas:

- **Se copia con el dedo.** Un número dentro de un párrafo obliga a seleccionar
  con precisión en un teléfono; uno en su propia caja se toca y se copia entero.
- **`letter-spacing` separa el 0 del O y el 1 del l.** El código es solo
  numérico, pero quien lo teclea no lo sabe.

No se pone el código en el **asunto**. Es cómodo y es una fuga: el asunto se ve
en la pantalla de bloqueo del teléfono sin desbloquearlo, y ese código es el
segundo factor de acceso a la cuenta. Quien tenga el teléfono a la vista entra.

## El enlace de cortesía

Debajo del código va un botón que hace lo mismo sin teclear nada. Apunta
**siempre** a:

```
{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email
```

y **nunca** a `{{ .ConfirmationURL }}`. La razón larga está en el `README.md` de
esta carpeta y en `docs/ESTADO.md`; la corta es que `ConfirmationURL` devuelve el
token en el fragmento `#` de la URL, que no viaja al servidor, y la persona
aterriza en la portada sin sesión y sin ningún error a la vista.

El botón se dibuja con una tabla y no con un `<a>` estilado, porque Outlook no
respeta `padding` en un `<a>`: el botón saldría como un enlace subrayado.

## El preencabezado

```html
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">…</div>
```

Es el texto que la bandeja de entrada enseña junto al asunto. Sin él, Gmail
rellena ese espacio con lo primero que encuentre en el HTML — que es el `alt`
del logo — y en la lista se lee «Seregenera Seregenera». Con él se lee de qué va
el mensaje antes de abrirlo.

## Modo oscuro

```html
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
```

El sitio se compromete con el modo claro (ver la skill `diseno-visual`) y el
correo hace lo mismo. Sin estas dos etiquetas, el Mail de iOS y Outlook invierten
los colores por su cuenta y el verde de marca sale de un tono que no es el
nuestro. **Aun así, Gmail para Android los invierte igual**: por eso ningún texto
depende solo del color para entenderse, y todos los fondos van declarados
explícitamente en vez de heredados.

## Qué NO lleva

- **Ningún píxel de seguimiento.** Nadie necesita saber quién abrió su correo de
  acceso.
- **Ningún enlace de baja.** Son correos transaccionales: se mandan porque la
  persona acaba de pedir entrar. Un «darse de baja» aquí es un botón para
  quedarse fuera de su propia cuenta.
- **Ninguna red social ni pie comercial.** Cuanto más corto es un correo de
  seguridad, más se distingue de uno de phishing.
