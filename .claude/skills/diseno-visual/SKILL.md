---
name: diseno-visual
description: Sistema visual de Seregenera — paleta, tipografía, espaciado, patrones de tarjeta y formulario, y accesibilidad. Úsala antes de escribir cualquier clase de Tailwind, elegir un color, maquetar una página nueva o ajustar el aspecto de un componente existente.
---

# Diseño visual

El sistema vive en `src/app/globals.css` como tokens de Tailwind 4 (`@theme`).
**Nunca escribas un color literal ni un hex en un componente.** Si un color no
existe como token, la decisión es agregarlo al tema, no incrustarlo.

## Paleta

| Familia | Uso |
|---|---|
| `brand-50…900` | Verde bosque, escala completa. Identidad, acciones primarias, enlaces activos. `brand-600` es el botón; `brand-700` el texto de marca |
| `clay-100`, `clay-300`, `clay-500`, `clay-600` | Terracota. Acento **secundario** — nunca compite con el verde por la acción principal. Solo existen esos cuatro pasos: si necesitas otro, agrégalo al tema |
| `cream` | Fondo del sitio. El blanco puro hace ver barato un marketplace artesanal |
| `sand` | Fondo de estados hover y superficies apoyadas |
| `ink` | Texto principal |
| `muted` | Texto secundario, metadatos, etiquetas |
| `hairline` | Bordes y separadores. Siempre `ring-1 ring-hairline`, no `border` grueso |

**Blanco** se reserva para superficies elevadas sobre `cream`: tarjetas,
paneles, menús desplegables.

## Modo claro, a propósito

`color-scheme: light` está declarado en `:root` (`globals.css:42`). El sitio
**no tiene modo oscuro** y esa es una decisión de producto: los productos se
juzgan por su foto y su ficha, y una inversión a oscuras cambia cómo se leen los
materiales naturales. No agregues variantes `dark:` — quedan muertas y confunden.

## Tipografía

- `font-display` (Fraunces, serif) — títulos, nombre de marca, encabezados de
  tarjeta. Da el aire artesanal.
- `font-sans` (Inter) — todo lo demás: cuerpo, interfaz, formularios.
- Nunca serif en texto corrido ni en controles.
- Cifras que se comparan en columna llevan `tabular-nums` (precios, cantidades,
  el contador del carrito).

## Forma y espaciado

- **Radio:** `rounded-full` en botones, chips y píldoras de navegación;
  `rounded-xl` en tarjetas y paneles. No mezcles otros radios.
- **Ancho:** todo contenido de página va dentro de `container-page`
  (utilidad propia, máx. 80rem con padding lateral). No inventes anchos.
- **Sombra:** casi nunca. Elevación se comunica con `ring-1 ring-hairline` sobre
  `cream`. `shadow-lg` solo en menús flotantes y en el hover de tarjeta.
- **Hover de tarjeta:** el patrón del repo es
  `transition hover:ring-brand-300 hover:shadow-lg hover:shadow-brand-900/5`,
  con la imagen escalando dentro de `overflow-hidden`
  (`group-hover:scale-105`). Ver `src/components/listing-card.tsx`.

## Imágenes

Los proveedores todavía no suben fotos. Mientras tanto,
`src/components/listing-media.tsx` dibuja un tapiz determinista derivado del
título. **Nunca pongas un `placeholder.svg` gris** — un catálogo de productos
naturales con cuadros vacíos se lee como roto, no como pendiente.

## Formularios

- Etiqueta visible siempre; el `placeholder` no es etiqueta.
- Validación con `zod` del lado del servidor en la Server Action. La validación
  del navegador es comodidad, nunca la única barrera.
- El error se muestra junto al campo, en texto, no solo con color rojo.
- Los filtros del catálogo son un **formulario GET**: cada combinación queda
  como URL compartible e indexable. Si agregas un filtro, mantén ese contrato —
  nada de estado de filtro que solo viva en memoria del cliente.

## La marca es Seregenera

El repositorio se llama `regenera-market` y así se queda; **todo lo que ve una
persona —usuario, proveedor o administrador— dice Seregenera**. Si encuentras
"Regenera Market" en un texto visible, es un error: corrígelo. En comentarios de
código y nombres internos no importa. Ver el hito
[marca Seregenera](../../hitos/2026-08-23-marca-seregenera.md).

## Paridad móvil — toda acción de escritorio existe en el teléfono

`MenuUsuario` de `src/components/site-header.tsx` es `hidden sm:block`. Durante
un tiempo eso significó que **por debajo de 640 px la única opción de la cuenta
era salir**: no se podía ver el perfil, ni llegar a la empresa, ni al panel de
administración. Nadie lo notó desde un escritorio, que es exactamente el modo de
fallo de esta clase de bug.

**La regla:** si un menú, un desplegable o una barra se oculta en una anchura,
sus acciones tienen que aparecer en el sustituto de esa anchura. No es opcional y
no se comprueba solo — el CI no mira anchos de pantalla.

Cómo se arregla y cómo no:

- **Sí:** repetir las filas dentro del menú desplegable de móvil, que es donde el
  usuario ya va a buscarlas. Es lo que ese mismo menú ya hacía con la navegación.
- **No:** enseñar el desplegable de escritorio en pantallas pequeñas. Queda un
  menú flotante encima de otro menú abierto, y en un teléfono no cabe.

Al terminar cualquier cambio de navegación, recórrela a 375 px y comprueba que
llegas a: tu cuenta, tu empresa, administración (si toca), el carrito y salir.

## Accesibilidad — no negociable

- Todo icono que actúa solo lleva `aria-label` o un `<span class="sr-only">`.
- Los desplegables llevan `aria-expanded` y cierran con `Escape` y con clic
  afuera. `src/components/site-header.tsx` tiene el patrón completo.
- Contraste mínimo AA: `muted` sobre `cream` cumple; `muted` sobre `brand-600`
  no — sobre fondos de marca, texto blanco.
- El anillo de foco global de `globals.css` no se pisa con `outline-none` sin
  reemplazo.
- Móvil primero: se maqueta la columna estrecha y se agregan `md:` / `lg:`. El
  comprador de un glamping mira el catálogo desde el teléfono.

## Antes de cerrar

- [ ] Cero hex y cero colores fuera de la paleta
- [ ] Serif solo en títulos
- [ ] Se ve bien a 375 px de ancho
- [ ] Toda acción del menú de escritorio se alcanza también desde el de móvil
- [ ] Interactivos alcanzables con teclado y con foco visible
- [ ] Ningún texto visible dice "Regenera Market"
