# Los heros cobran vida y el movimiento cuenta el tema del sitio

- **Fecha:** 2026-10-03
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-animaciones-tematicas` → entrega directa (sin PR)
- **Fase del roadmap:** —

## Qué se hizo

Las siete páginas con `HeroBanner` llevan una capa animada según su tema, el
titular entra palabra por palabra y lo demás entra detrás. La portada turna sus
cuatro fotos con un fundido lento, cuenta sus cifras desde cero y su buscador
escribe sugerencias solo. Las tarjetas tienen un
brillo tenue que sigue al cursor, los botones del hero de `/vender` y `/niveles`
se acercan al cursor, y agregar a la cesta suelta un puñado de hojas.

| Pieza | Archivo | Tipo |
|---|---|---|
| Capa del hero: `semillas`, `luciernagas`, `hojas`, `primavera` | `src/components/fondo-hero.tsx` | cliente (canvas 2D) |
| Titular por palabras + cascada | `hero-banner.tsx` + `globals.css` (`.palabra-hero`, `.cascada-hero`, `.entrada-hero`) | **solo CSS** |
| Fotos de la portada que se turnan con fundido | `src/components/fundido-fotos.tsx` + prop `fotosExtra` del `HeroBanner` | cliente |
| Cifras que suben | `src/components/contador.tsx` | cliente |
| Placeholder que se escribe | `src/components/campo-busqueda-hero.tsx` | cliente |
| Brillo en tarjetas / imán en botones | `src/components/efectos-puntero.tsx` (montado en el layout) + `[data-brillo]` / `[data-iman]` en `globals.css` | un único listener |
| Hojas al agregar a la cesta | `src/lib/hojas.ts`, llamado desde `add-to-cart.tsx` | evento |
| Curva de `Revelar` | `revelar.tsx`: `ease-out` → `cubic-bezier(0.22,1,0.36,1)` | — |

Qué capa lleva cada página, y por qué:

| Página | Capa | Lo que cuenta |
|---|---|---|
| `/` | hojas de **primavera**: las mismas que verificación, en verdes amarillentos de brote (`--color-brote-*`, tokens nuevos) | la cara del sitio, en estación que empieza |
| `/vender`, `/niveles` | semillas que suben y se mecen | lo que se planta y crece |
| `/comunidad`, `/proveedores`, `/proveedor/[slug]` | luciérnagas cálidas que se acercan al cursor | gente, territorio |
| `/verificacion` | hojas pequeñas que caen girando y meciéndose; el cursor las aparta como una brisa | el bosque visto de cerca, donde se verifica en campo |

## Por qué así

- **Sin dependencias nuevas.** Se miró React Bits (MIT + Commons Clause: se usa
  dentro del sitio, no se redistribuye) y se tomó la idea, no el código. Sus
  fondos usan `ogl`/`three` y redibujan a 60 fps siempre. Los de aquí son canvas
  2D, se pausan fuera de pantalla y con la pestaña oculta, y pintan un único
  fotograma con `prefers-reduced-motion`.
- **Las tarjetas siguen siendo Server Components.** El brillo y el imán no
  convierten cada tarjeta en cliente: llevan un atributo `data-*` y un solo
  componente en el layout reparte la posición del cursor. Es la regla de
  `componentizacion` (empujar el `"use client"` hacia abajo), llevada al límite.
- **El titular es CSS, no JavaScript.** Arranca con el primer pintado y no
  espera a hidratar, así que no hay «se ve, se esconde, aparece». Sin JS se
  anima igual. El texto del `<h1>` sigue siendo texto continuo con espacios:
  buscadores y lectores de pantalla leen el titular entero.
- **Palabra por palabra y no letra por letra.** Un titular de ocho palabras
  letra a letra tarda varios segundos; palabra a palabra son ~0,7 s. La entrada
  es una bruma que se enfoca (`blur` → nítido), la imagen de algo que brota.
- **Descartado:** máquina de escribir en el titular (lenta y se lee como
  terminal, no como naturaleza); estelas o efectos de cursor globales (ruido en
  un catálogo); hojas en «Comprar ahora» (navega en el mismo clic y se las
  llevaría por delante); modo oscuro para lucir las partículas (decisión de
  producto en contra, ver `diseno-visual`).
- **La portada tuvo primero semillas** que subían; en la revisión, Jesús prefirió
  las hojas de verificación con colores de primavera.
- **Verificación tuvo primero una cuadrícula de puntos** que se apartaba del
  cursor («parcela de muestreo»). Se descartó en la revisión de Jesús: muchos
  puntos pequeños se leían como ruido. La reemplazan hojas con forma de hoja
  —dos curvas en punta y el nervio—, que giran sobre su eje largo al caer
  (se ven de canto en cada vuelta), más escasas que las semillas a propósito.

**El fundido de la portada.** La foto de siempre (`hero-home`) sigue saliendo
del servidor con `priority`: es la del LCP y la que ve quien no tiene
JavaScript. Las otras tres (`hero-verificacion`, `hero-vender`,
`hero-proveedores`) se montan encima 2,5 s después, transparentes, y se
encienden de una en una cada 7 s con un fundido de 1,8 s; volver a la primera es
apagarlas, porque debajo seguía. Así la primera visita no paga 1,5 MB de fotos
antes de tiempo. Entran solo esas cuatro porque las cuatro son 16:9 a 2400 px y
están encuadradas para el velo (sujeto a la derecha, aire a la izquierda): el
hero no cambia de tamaño. Las `vertical-*` quedaron fuera: son 4:3 a 1600 px y
a todo el ancho se verían borrosas. Sin controles ni puntos de paginación: es
fondo, el contenido es el mismo en las cuatro. Solo la portada lo usa.

## Qué quedó pendiente

- **Visto bueno visual de Ivan y Jesús** en un navegador real, sobre todo la
  intensidad de las hojas en la portada y en verificación.
- Probar en un teléfono real: la capa se pausa fuera de pantalla, pero el coste
  en un móvil modesto no se midió.
- La ficha de oferta (`/oferta/[slug]`) y el catálogo no tienen `HeroBanner` y
  no se tocaron más allá de la tarjeta y el botón de compra.

## Qué se rompe si tocas esto

- **`titulo` del `HeroBanner` tiene que ser texto liso.** Se parte en palabras
  en el servidor. Si algún día el titular lleva degradado recortado al texto
  (`bg-clip-text`), las palabras animadas dejan de heredar el recorte y el
  titular **desaparece** (se comprobó en otro proyecto). Si hace falta ese
  efecto, quita el partido en palabras primero.
- **`Contador` reescribe el mismo nodo de texto que pintó React**, no
  `textContent`. Con `textContent` React se queda apuntando a un nodo fuera del
  DOM y deja de actualizar la cifra.
- **`[data-iman]` usa la propiedad `translate`.** Un `translate-*` de Tailwind
  en el mismo botón la pisaría (es la misma propiedad). Si un botón con imán
  necesita desplazarse, hazlo con `transform`.
- **`[data-brillo]` pone `position: relative`** al elemento (solo con ratón). Si
  una tarjeta necesita otro `position`, saca el atributo.
- `retrasoResto` en `hero-banner.tsx` y el `650` de `contador.tsx` van juntos:
  el conteo espera a que la cascada termine de entrar.

## Verificación

- `npm run build`, `npx tsc --noEmit` y `npx eslint .` en limpio. Los 94 avisos
  de `eslint` son de `.claude/skills/impeccable/scripts/*.js`, minificados y
  previos a este cambio; `npx eslint src` sale sin nada.
- Playwright contra `next start` (build de producción):
  - las siete páginas montan su capa y su titular por palabras, con el texto
    del `<h1>` íntegro;
  - las cifras de la portada suben de 0 a su valor;
  - el placeholder se escribe solo y vuelve al original al enfocar el campo;
  - brillo con `--mx` en la tarjeta del catálogo, imán de 7 px en `/vender`;
  - las hojas de `/verificacion` caen, giran y el cursor las aparta;
  - la portada turna sus cuatro fotos (a los 12 s la segunda, a los 19 s la
    tercera) y el hero mide lo mismo con todas (684 px a 1440×900); con
    movimiento reducido no se monta ninguna foto extra;
  - 9 hojas al agregar a la cesta, retiradas del DOM a los 1,5 s;
  - con `prefers-reduced-motion`: sin animación, cifras y placeholder finales;
  - sin desborde horizontal a 375 px en `/`, `/vender` y `/proveedores`;
  - sin errores de consola.
