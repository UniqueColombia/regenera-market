# Imágenes de Seregenera — inventario y prompts de generación

Qué imágenes le faltan al sitio, dónde va cada una, con qué prompt se genera y
qué hago yo después con ella. Este documento es el encargo; `public/img/` es el
resultado.

**Estado al escribir esto:** el sitio no tenía **ninguna** imagen propia. Los cinco
SVG de `public/` son los que trae Next.js de fábrica y no se usan en ningún
lado. Todo lo visual sale hoy de iconos de `lucide-react` y degradados de la
paleta — funciona, pero un marketplace de productos que no enseña ningún
producto no vende.

## El agujero, en números

| Bloque | Faltan | Se generan con IA | Los deriva Claude |
|---|---|---|---|
| Logo e identidad | 21 archivos | 4 conceptos (eliges 1) | 21 → salieron 28 |
| Fotografía de sección | 9 | 9 | 9 (recortes) |
| Fotografía de oferta | 18 | 18 | 18 |
| Avatar de proveedor | 13 | **0** — ver abajo | 13 (monograma en código) |

**Total a generar en Gemini: 31 imágenes.** El resto son recortes, conversiones
y versiones que hago yo con ImageMagick: si cada tamaño se vuelve a pedirle a la
IA salen 16 logos ligeramente distintos, que es exactamente lo que hace que una
marca se vea improvisada.

### Por qué los proveedores no llevan logo generado

Los 13 proveedores de `src/data/providers.ts` son **ficticios** y se reemplazan
por reales en cuanto entre el primer lote de onboarding (lo dice el comentario
del propio archivo). Inventarles un logo a empresas que van a desaparecer es
trabajo que se tira, y peor: un logo falso de una asociación campesina que sí
podría existir es un problema, no un adorno.

En su lugar hago dos cosas, ambas en código y sin generar nada:

1. **Monograma determinista** — las iniciales del proveedor sobre un degradado
   estable derivado de su nombre, con el mismo criterio que ya usa
   `src/components/listing-media.tsx`. Cuando el proveedor real suba su logo, el
   campo `logoUrl` lo sustituye solo.
2. **La portada del proveedor es la foto de su mejor oferta**, no una imagen
   aparte. Se mantiene sola y siempre muestra algo que esa empresa vende de
   verdad.

## Cómo funciona esto

```
1. Generas en Gemini          → PNG grande, como salga
2. Lo dejas en                → tools/img-originales/<nombre-exacto>.png
3. Corro                      → bash scripts/optimizar-imagenes.sh
4. Aparece en                 → public/img/<carpeta>/<nombre>.webp
5. Lo conecto al código       → y corro build + tsc + eslint
```

**`tools/img-originales/` está en `.gitignore`**: los originales pesan MB y no
aportan al sitio, solo al reencuadre futuro. Lo que se versiona es el `.webp`
optimizado. Guardá los originales igual — cuando haga falta otro recorte no
querés partir de un WebP ya comprimido.

### Reglas de nombre — no son cosmética

- **Minúsculas, sin espacios, sin acentos, sin `ñ`.** El servidor distingue
  mayúsculas y Windows no: `Kit Amenities.png` funciona en tu máquina y da 404
  publicado.
- **El nombre exacto que dice la tabla.** Para las ofertas es el `slug` del
  listing, tal cual está en `src/data/listings.ts`. Si no coincide, el script no
  lo encuentra y la ficha se queda con el degradado.
- **La extensión da igual** (`.png`, `.jpg`, `.webp`): el script convierte.

### Los prompts están en inglés, a propósito

Todo en este repositorio va en español menos esto. Los modelos de imagen se
entrenaron con pies de foto mayoritariamente en inglés y responden bastante
mejor a un prompt en inglés — sobre todo en los términos de fotografía
(`shallow depth of field`, `diffused daylight`). Un prompt no es documentación
del proyecto, es la entrada de una herramienta externa.

## Dónde generarlas

Con tu cuenta Gemini PRO, en **Gemini → generación de imágenes** (modelo Nano
Banana Pro / Gemini 3 Pro Image). Dos cosas que cambian el resultado:

- **Pedí la relación de aspecto explícitamente** en el propio prompt y, si la
  interfaz lo ofrece, también en el selector. Está en cada ficha de abajo.
- **Pedí la resolución más alta que ofrezca (2K o 4K).** Bajar de tamaño no
  pierde nada; subir sí. El script se encarga de reducir.

## El estilo, en una línea

> Fotografía documental editorial, luz de día natural y difusa, paleta cálida y
> terrosa —verde bosque, terracota, crema, madera y fibra natural—, contexto
> colombiano real. Sin texto, sin logos, sin marcas de agua, sin HDR.

Ese bloque va literal al principio de cada prompt de foto. Está escrito abajo
como `[ESTILO]` para no repetirlo 27 veces.

```
[ESTILO] = Editorial documentary photography, natural diffused daylight, warm
earthy palette of forest green, terracotta, cream and natural wood and fiber
tones, authentic Colombian setting, realistic textures, subtle film grain.
No text, no lettering, no logos, no watermarks, no signage. No HDR, no oversaturation,
no plastic-looking stock-photo gloss, no AI-perfect symmetry.
```

Y el bloque de personas, cuando el encuadre las incluye:

```
[PERSONAS] = If people appear, they are real-looking Colombian adults of varied
ages and skin tones, dressed for actual work, absorbed in what they are doing and
not looking at the camera. No models posing, no forced smiles, no crossed arms.
```

---

# 1. Logo e identidad

## Cómo se hace un logo con IA sin que se note

Tres decisiones que cambian todo el resultado:

**La IA genera el símbolo, no la palabra.** Los modelos de imagen escriben mal:
te va a dar «Seregenerra», «Seregenra» o letras que no existen, y peor, cada
generación las escribe distinto. Vas a pedir **solo el símbolo (isotipo)**, sin
una sola letra. La palabra «Seregenera» la compongo yo en **Fraunces**, que ya
es la tipografía de titulares del sitio: sale coherente con el resto y se puede
reescribir en cualquier momento sin volver a generar nada.

**Se genera una vez y se deriva veintiún veces.** No le pidas a Gemini un logo
para LinkedIn y otro para el favicon: te dará dos marcas parecidas pero
distintas, y una marca que cambia de forma según dónde se mira no es una marca.
Eliges un concepto, y de ese único archivo salen los veintiuno.

**El entregable final es SVG, y lo escribo yo a mano.** Gemini devuelve píxeles.
Un logo en píxeles se ve borroso en pantalla retina, no se puede recolorear, no
sirve para imprimir y pesa cien veces más de lo necesario. Aquí no hay
vectorizador automático instalado, y los automáticos dejan curvas sucias de
todas formas — así que a partir del concepto que elijas escribo el SVG a mano:
formas limpias, dos colores, `currentColor` para que herede el color del
contexto. De ahí sale todo lo demás, incluida cualquier versión impresa.

## Los cuatro conceptos

Genera los cuatro (son cuatro prompts, un minuto), míralos juntos y eliges uno.
El que te guste, pídele a Gemini **3 o 4 variaciones más** con el mismo prompt
antes de decidir el definitivo.

**Formato para los cuatro:** cuadrado 1:1, la resolución más alta disponible.

### Concepto A — Semilla y raíz (el que recomiendo)

Una hoja arriba y un sistema de raíces abajo, que juntos cierran un círculo. Es
el único de los cuatro que **dice literalmente lo que el producto hace**: el
sitio clasifica a los proveedores en Semilla → Raíz → Bosque, y la marca
enseñaría ese mismo camino. Además funciona a 16 px, que es donde mueren los
logos bonitos.

```
Flat vector logo mark, minimalist and geometric. A single simplified leaf whose
stem continues downward and branches into a small root system; the leaf and the
roots together enclose a perfect circle of negative space. Symmetrical but
organic, drawn with confident even-weight strokes and a few solid shapes.
Two flat colors only: deep forest green (hex 1b5b3d) and warm terracotta (hex
b5824f) used as a small accent. Centered on a plain flat white background with
generous empty margin around the mark. Crisp edges, no gradients, no shading,
no texture, no 3D, no glow. No text, no letters, no numbers, no wordmark.
Square 1:1. Designed to stay legible at 16 pixels.
```

### Concepto B — El ciclo

Una hoja y una corriente de agua que se persiguen formando un círculo cerrado —
la idea de que nada sale del sistema. Es el más elegante de los cuatro y el más
genérico: hay muchos logos de sostenibilidad con esta forma.

```
Flat vector logo mark, minimalist and geometric. A leaf and a flowing water
current chase each other into a closed circular loop, like a two-part cycle
symbol, with a clean gap of negative space between them. Even-weight strokes,
smooth continuous curves, perfectly balanced.
Two flat colors only: deep forest green (hex 1b5b3d) and warm terracotta (hex
b5824f) used as a small accent. Centered on a plain flat white background with
generous empty margin around the mark. Crisp edges, no gradients, no shading,
no texture, no 3D, no glow. No text, no letters, no numbers, no wordmark.
Square 1:1. Designed to stay legible at 16 pixels.
```

### Concepto C — La S vegetal

La inicial de Seregenera dibujada como un tallo que crece, de un solo trazo
continuo. El más memorable si funciona; el más fácil de que salga mal, porque
una letra hecha planta se lee como garabato en cuanto se complica.

```
Flat vector logo mark, minimalist. A capital letter S formed by one single
continuous plant stem stroke, with two small simplified leaves growing from the
curve — one at the top, one at the bottom. The stroke has even weight and clean
geometric curves; the S must read clearly as a letter first and a plant second.
Two flat colors only: deep forest green (hex 1b5b3d) with one leaf in warm
terracotta (hex b5824f). Centered on a plain flat white background with generous
empty margin around the mark. Crisp edges, no gradients, no shading, no texture,
no 3D, no calligraphy, no handwriting. No other text, no letters besides the S.
Square 1:1. Designed to stay legible at 16 pixels.
```

### Concepto D — Tres brotes

Tres brotes de altura creciente dentro de un círculo: Semilla, Raíz, Bosque.
El más explícito sobre el sistema de niveles y el más frío de los cuatro —
parece más un gráfico que una marca.

```
Flat vector logo mark, minimalist and geometric. Three simplified sprouts of
increasing height standing side by side, contained inside a thin perfect circle.
The shortest sprout is a seed with two tiny leaves, the middle one a young stem,
the tallest a small tree. Even-weight strokes and solid shapes, generous spacing
between the three.
Two flat colors only: deep forest green (hex 1b5b3d), with the tallest sprout in
warm terracotta (hex b5824f). Centered on a plain flat white background with
generous empty margin around the mark. Crisp edges, no gradients, no shading,
no texture, no 3D, no glow. No text, no letters, no numbers, no wordmark.
Square 1:1. Designed to stay legible at 16 pixels.
```

## Qué sale de ahí — los 21 archivos

Todos los deriva Claude del SVG. **No hay que generar ninguno.**

### Vectores, fondo transparente (`public/img/marca/`)

| Archivo | Qué es | Para qué |
|---|---|---|
| `isotipo.svg` | Solo el símbolo | Cabecera, favicon, avatar, sellos |
| `logotipo-horizontal.svg` | Símbolo + «Seregenera» al lado | Cabecera del sitio, firmas, documentos |
| `logotipo-vertical.svg` | Símbolo arriba, palabra debajo | Espacios cuadrados, merchandising |
| `logotipo-blanco.svg` | Todo en blanco, una tinta | Sobre `brand-900` — el pie del sitio y los héroes |
| `logotipo-negro.svg` | Todo en negro, una tinta | Impresión a una tinta, documentos oficiales |

Los cinco llevan `fill="currentColor"` en el trazo principal: cambiar el color
del logo pasa a ser una clase de Tailwind, no un archivo nuevo.

### Iconos de la aplicación (`src/app/`)

Next.js los detecta por el nombre del archivo y escribe las etiquetas `<link>`
solo. No hay que tocar el `layout.tsx`.

| Archivo | Tamaño | Qué resuelve |
|---|---|---|
| `favicon.ico` | 32 + 16 px | La pestaña. Hoy hay uno: el de Next de fábrica |
| `icon.png` | 512×512 | Pestañas modernas, PWA, marcador de Android |
| `apple-icon.png` | 180×180 | «Añadir a pantalla de inicio» en iPhone |
| `opengraph-image.jpg` | 1200×630 | La tarjeta al compartir en WhatsApp, Slack, Facebook |
| `twitter-image.jpg` | 1200×630 | Lo mismo en X |

Hoy, si alguien pega un enlace de Seregenera en un grupo de WhatsApp, sale un
rectángulo gris con la URL. Con `opengraph-image.jpg` sale la marca, el nombre y
la promesa — es la imagen que más veces se va a ver del proyecto y no existe.

### Redes sociales (`public/img/marca/redes/`)

Cada red recorta distinto. Los tamaños son los oficiales a agosto de 2026; los
compongo con la zona segura ya respetada, que es donde se estropea siempre —
un logo centrado en un cuadrado se decapita al volverse círculo.

| Archivo | Tamaño | Dónde va | Ojo con |
|---|---|---|---|
| `avatar-1080.png` | 1080×1080 | Instagram, Facebook, Threads | Se ve **circular**: el símbolo va dentro del 80 % central |
| `avatar-400.png` | 400×400 | X, LinkedIn (mín. 300×300) | Igual, circular en X |
| `avatar-800.png` | 800×800 | YouTube | |
| `avatar-640.png` | 640×640 | WhatsApp Business | Circular |
| `avatar-200.png` | 200×200 | TikTok | Circular |
| `banner-linkedin-empresa.png` | 1128×191 | Portada de página de empresa | Franja bajísima: solo logotipo horizontal y una línea |
| `banner-linkedin-personal.jpg` | 1584×396 | Tu perfil y el de Ivan | El avatar tapa la esquina inferior izquierda |
| `banner-facebook.jpg` | 1640×856 | Portada de página | En móvil recorta a los 1200×630 centrales |
| `banner-x.jpg` | 1500×500 | Cabecera de X | El avatar tapa la esquina inferior izquierda |
| `banner-youtube.jpg` | 2560×1440 | Canal | Solo se ve garantizado el centro de 1546×423 |
| `firma-correo.png` | 320×80 | Firma de Gmail | Fondo blanco, no transparente: Outlook lo pinta gris |

**Los banners no son el logo estirado.** Llevan el logotipo horizontal sobre un
fondo: o el verde `brand-900` liso, o una de las fotos de sección oscurecida. Se
los compongo con ImageMagick a partir del SVG y de `hero-home`.

## La única decisión que necesito

Cuál de los cuatro conceptos. Lo demás lo resuelvo yo.

---

# 2. Fotografía de sección — 9 imágenes

Son las que cambian la primera impresión. Hoy la portada es un degradado verde
liso: correcto, pero no cuenta nada de Colombia ni del producto.

**Nombre del archivo = el de la primera columna.** Déjalas en
`tools/img-originales/`.

| # | Archivo | Dónde va hoy | Aspecto | Generar a |
|---|---|---|---|---|
| S1 | `hero-home` | Portada, fondo del héroe (`src/app/page.tsx:19`) | 16:9 | 2400×1350 o más |
| S2 | `vertical-hoteles` | Tarjeta «Hoteles y Eco Lodges» | 4:3 | 1600×1200 |
| S3 | `vertical-hostales` | Tarjeta «Hostales y Glampings» | 4:3 | 1600×1200 |
| S4 | `vertical-restaurantes` | Tarjeta «Restaurantes y Cafés» | 4:3 | 1600×1200 |
| S5 | `vertical-transporte` | Tarjeta «Transporte Turístico» | 4:3 | 1600×1200 |
| S6 | `vertical-agencias` | Tarjeta «Agencias y Operadores» | 4:3 | 1600×1200 |
| S7 | `hero-verificacion` | Franja verde de `/verificacion` | 16:9 | 2400×1350 |
| S8 | `hero-vender` | Franja verde de `/vender` | 16:9 | 2400×1350 |
| S9 | `hero-proveedores` | Cabecera de `/proveedores` | 16:9 | 2400×1350 |

Las cuatro de 16:9 (S1, S7, S8, S9) van **detrás de texto blanco**, oscurecidas
con el degradado verde que ya existe. Por eso sus prompts piden cielo o follaje
en la mitad izquierda: es donde caen el titular y el buscador. Una foto con el
detalle importante a la izquierda queda tapada.

### Y en el teléfono se recorta al revés

Todo lo anterior vale para una pantalla ancha. En una de 375 px el bloque es más
alto que ancho, así que `object-cover` **descarta cerca del 70 % del ancho de la
foto** y se queda con una franja vertical. Con el anclaje por defecto esa franja
es el centro — justo el aire que el prompt pidió dejar vacío.

Por eso cada hero declara dónde anclar el recorte mientras la columna es
estrecha, y **ese número sale de mirar la foto**: es la posición horizontal del
sujeto, en porcentaje.

| Foto | Sujeto | Anclaje móvil | Dónde se declara |
|---|---|---|---|
| `hero-home` | rancho y pareja tejiendo, a la derecha | `object-[78%_50%]` | `src/app/page.tsx` |
| `hero-verificacion` | agrónomo agachado, a la derecha | `object-[80%_50%]` | `src/app/verificacion/page.tsx` |
| `hero-vender` | las dos personas empacando | `object-[62%_50%]` | `src/app/vender/page.tsx` |
| `hero-proveedores` | flat-lay parejo, sin sujeto único | centro (por defecto) | — |

**Si regeneras una de estas cuatro fotos, revisa el anclaje.** Un encuadre nuevo
con el mismo porcentaje viejo deja el hero enseñando fondo en todos los
teléfonos, y en el escritorio no se nota. Para comprobarlo sin abrir el móvil:
**tapa mentalmente todo menos una banda vertical del 27 % centrada en ese
porcentaje. Lo que queda tiene que seguir siendo una foto.**

El prop se llama `encuadreMovil` y lo recibe `src/components/hero-banner.tsx`;
la portada lo escribe directo porque no usa ese componente.

---

### S1 · `hero-home` — Portada

La imagen que más gente va a ver del proyecto. Paisaje amplio, no un producto.

```
[ESTILO]
Wide establishing landscape photograph of the Colombian Andes at mid-morning:
layered green mountain ridges wrapped in low mist, a small eco-lodge with a
wooden deck and a thatched roof nestled on the right third of the frame,
surrounded by wax palms and cloud forest. Open sky and soft empty haze fill the
entire left half of the frame. Shot on a 35mm lens, deep focus, calm and
spacious composition, muted natural greens, no strong contrast.
[PERSONAS]
Aspect ratio 16:9.
```

### S2 · `vertical-hoteles` — Hoteles y Eco Lodges

```
[ESTILO]
Interior of a boutique eco-lodge room in the Colombian coffee region, seen in
warm morning light through a large window: a bed with undyed cotton linen, a
handmade ceramic water jug on a reclaimed wood nightstand, a woven fique rug,
and potted native plants. Clean and uncluttered, natural materials everywhere,
no plastic. Shot on a 35mm lens, soft shadows.
Aspect ratio 4:3.
```

### S3 · `vertical-hostales` — Hostales y Glampings

```
[ESTILO]
A glamping site at golden hour on a green Andean hillside in Santander,
Colombia: two canvas bell tents with wooden platforms, string lights strung
between posts, folding wooden chairs around a small fire pit, hammocks. Warm
low sun, long soft shadows, mountains fading behind. Shot on a 35mm lens.
[PERSONAS]
Aspect ratio 4:3.
```

### S4 · `vertical-restaurantes` — Restaurantes y Cafés

```
[ESTILO]
The open kitchen pass of a small farm-to-table restaurant in Colombia: fresh
local vegetables in wicker baskets, herbs in clay pots, compostable bagasse
containers stacked neatly, a chalkboard with no legible writing, warm wood
counter. Busy but tidy, natural daylight from a side window, shallow depth of
field on the produce in the foreground.
[PERSONAS]
Aspect ratio 4:3.
```

### S5 · `vertical-transporte` — Transporte Turístico

```
[ESTILO]
A clean white tourist minibus parked on a dirt road at the edge of a Colombian
cloud forest, morning light, doors open, luggage being loaded. Green mountains
and mist behind it. The vehicle body is plain white with no lettering, no
graphics and no plates. Shot on a 50mm lens, natural colors.
[PERSONAS]
Aspect ratio 4:3.
```

### S6 · `vertical-agencias` — Agencias y Operadores

```
[ESTILO]
A small tour operator planning session at a wooden table in a bright office in
Bogotá: a paper map of Colombia, a notebook, wooden route markers, a camera and
a canvas tote bag, plants on the windowsill. Overhead three-quarter view, warm
daylight, shallow depth of field. No legible text on the map or notebook.
[PERSONAS]
Aspect ratio 4:3.
```

### S7 · `hero-verificacion` — Cómo verificamos

Va detrás del titular «Sostenible no es una etiqueta que se pone sola». La idea
es evidencia, no naturaleza bonita: alguien comprobando algo.

```
[ESTILO]
An agronomist in the field verifying a small Colombian farm: kneeling at the
edge of an agroforestry plot with a clipboard and a soil sample in hand,
inspecting the ground carefully. Rows of shade-grown crops and forest behind.
Late afternoon light. The subject sits in the right third of the frame; open
field and sky fill the left half. Shot on a 50mm lens, documentary framing.
[PERSONAS]
Aspect ratio 16:9.
```

### S8 · `hero-vender` — Postula tu empresa

Le habla al proveedor. Tiene que verse como alguien que produce, no como una
oficina.

```
[ESTILO]
Two Colombian artisan producers in a small rural workshop, packing finished
products into recycled cardboard boxes on a wooden work table: handmade soap
bars, woven fiber goods, plain unlabeled kraft packaging. Tools and raw
materials on the shelves behind. Warm daylight through an open doorway. The
people and table sit in the right half of the frame; the left half is the calm
empty workshop wall. Shot on a 35mm lens.
[PERSONAS]
Aspect ratio 16:9.
```

### S9 · `hero-proveedores` — Proveedores aliados

```
[ESTILO]
A wide flat-lay of Colombian regenerative products arranged on a raw linen
cloth: guadua bamboo pieces, coconut fiber rope, solid soap bars, bagasse
tableware, cacao pods, dried herbs and a small solar lamp. Shot straight from
above, evenly spaced with generous breathing room between objects, soft even
daylight. Completely unbranded, no labels, no packaging text.
Aspect ratio 16:9.
```

---

# 3. Fotografía de oferta — 18 imágenes

Una por cada listing de `src/data/listings.ts`. Hoy las 18 tienen
`images: []` y salen con el tapiz de degradado e icono de
`src/components/listing-media.tsx`.

**El nombre del archivo es el `slug` del listing, exacto.** Es lo que usa el
script para colocarla; si el nombre no coincide, la ficha se queda como está.

**Formato para las 18: 4:3, generadas a 1600×1200 o más.**

## La regla del encuadre, que importa más que el prompt

La misma foto se ve en dos sitios con dos recortes distintos:

- **La tarjeta del catálogo** la muestra en 4:3 — completa.
- **La ficha de la oferta** la muestra en 16:9 — recorta arriba y abajo, se
  queda con la **banda central**.

Por eso todos los prompts piden el sujeto centrado y con aire arriba y abajo.
Si el producto sale pegado al borde superior, en la ficha aparece decapitado.
Al revisar una imagen antes de darla por buena: **tapa mentalmente el 12 % de
arriba y el 12 % de abajo. Lo que queda tiene que seguir contando la oferta.**

---

## Productos

### 1 · `kit-amenities-organicos-hoteles`
*Kit de amenities orgánicos para hoteles — Aromas del Páramo, Villa de Leyva*

```
[ESTILO]
Product photograph of a hotel amenities set made of solid cosmetics: three
handmade soap bars in earthy colors, a solid shampoo bar, and a small kraft
seed-paper pouch, arranged on a grey stone bathroom counter with a folded white
cotton towel and a sprig of fresh rosemary. Completely unbranded, no printed
labels. Soft window light from the left, shallow depth of field, subject
centered with generous empty space above and below.
Aspect ratio 4:3.
```

### 2 · `sistema-ahorro-agua-banos`
*Sistema de ahorro de agua para baños — Hidrotec Verde, Medellín*

```
[ESTILO]
Close-up product photograph of a brushed brass low-flow tap aerator being fitted
onto a modern bathroom faucet, with a thin controlled stream of water falling
into a stone basin. A small unbranded aerator cartridge rests on the counter
beside it. Clean minimal hotel bathroom, soft daylight, shallow depth of field,
crisp water detail, subject centered with empty space above and below.
Aspect ratio 4:3.
```

### 3 · `mobiliario-bambu-zonas-comunes`
*Mobiliario de bambú para zonas comunes — Guadua Viva, Filandia, Quindío*

```
[ESTILO]
Product photograph of a lounge set made of thick Colombian guadua bamboo — a low
table and two armchairs with undyed cotton cushions — placed in the open-air
common area of an eco-lodge in the coffee region. Visible bamboo joints and
natural node texture, coffee plants and mist in the soft background. Morning
light, 35mm lens, furniture centered with empty space above and below.
Aspect ratio 4:3.
```

### 4 · `tiendas-campana-eco-friendly`
*Tiendas de campaña eco-friendly — Bahareque Camping, San Gil, Santander*

```
[ESTILO]
Photograph of a canvas bell tent made of recycled sand-colored fabric, pitched
on a wooden platform on a green Andean hillside in Santander, Colombia. The
door is rolled open showing a simple bed inside. Visible reinforced seams and
natural fiber guy lines. Late afternoon light, mountains softly out of focus
behind. 35mm lens, tent centered with empty space above and below.
Aspect ratio 4:3.
```

### 5 · `kit-bienvenida-sostenible-huespedes`
*Kit de bienvenida sostenible para huéspedes — Aromas del Páramo*

```
[ESTILO]
Overhead product photograph of a guest welcome kit laid out on undyed linen: a
small cotton drawstring pouch, a wooden comb, a soap bar, a bamboo toothbrush,
a seed-paper card and a tiny jar of honey. Objects evenly spaced with generous
breathing room, no labels or printed text anywhere. Soft even daylight,
composition centered with empty space above and below.
Aspect ratio 4:3.
```

### 6 · `vajilla-biodegradable-cana-azucar`
*Vajilla biodegradable de caña de azúcar — Caña Limpia, Palmira, Valle*

```
[ESTILO]
Product photograph of biodegradable sugarcane bagasse tableware: a neat stack of
cream-colored plates and bowls beside one plate served with fresh Colombian
food, on a rustic wooden restaurant table. The fibrous pressed texture of the
bagasse is clearly visible at the rim. Unbranded, no printed text. Warm side
daylight, shallow depth of field, subject centered with empty space above and
below.
Aspect ratio 4:3.
```

### 7 · `kit-limpieza-ecologica-flotas`
*Kit de limpieza ecológica para flotas — Hidrotec Verde, Medellín*

```
[ESTILO]
Product photograph of an eco cleaning kit for vehicle fleets laid out on a
concrete workshop floor: three refillable amber glass spray bottles, a coconut
fiber brush, folded microfiber cloths and a metal bucket, with the wheel and
lower body of a white tourist van softly out of focus behind. All containers
completely unlabeled. Cool even daylight, subject centered with empty space
above and below.
Aspect ratio 4:3.
```

### 8 · `sistema-purificacion-aire-buses`
*Sistema de purificación de aire para buses — Hidrotec Verde, Medellín*

```
[ESTILO]
Photograph of a compact matte white air purification unit mounted on the ceiling
panel above the aisle inside a modern tourist bus, seen from a passenger seat.
Clean grey upholstery, empty seats, daylight through the windows showing blurred
green mountains. Technical but calm, no branding or lettering on the unit.
50mm lens, unit centered with empty space above and below.
Aspect ratio 4:3.
```

### 9 · `merchandising-fibra-coco-personalizado`
*Merchandising de fibra de coco personalizado — Coco Pacífico, Nuquí, Chocó*

```
[ESTILO]
Product photograph of handcrafted coconut fiber merchandise from the Colombian
Pacific coast: a woven tote bag, a set of round coasters, a keychain and a small
pot, arranged on dark volcanic beach sand with a few green palm leaves. Coarse
natural fiber texture clearly visible. Unbranded, no printed logos. Overcast
diffused coastal light, objects centered with empty space above and below.
Aspect ratio 4:3.
```

### 10 · `iluminacion-solar-led-exteriores`
*Iluminación solar LED para exteriores — Solar Andina, Pasto, Nariño*

```
[ESTILO]
Photograph at blue hour of a row of solar LED path lights lining a stone walkway
through the garden of an Andean eco-lodge. Each fixture has a small dark solar
panel on top and casts a warm pool of light on the ground. Deep blue sky,
silhouetted plants, the lodge glowing faintly behind. 35mm lens, path leading
into the frame, lights centered with empty space above and below.
Aspect ratio 4:3.
```

### 11 · `duchas-solares-portatiles`
*Duchas solares portátiles — Bahareque Camping, San Gil, Santander*

```
[ESTILO]
Photograph of a portable solar camping shower installed at a glamping site: a
dark heat-absorbing water bag hanging from a wooden frame, with a simple
showerhead and a slatted wooden floor beneath, screened by a canvas panel.
Green Andean vegetation around it, midday sun catching drops of water. 35mm
lens, structure centered with empty space above and below.
Aspect ratio 4:3.
```

## Servicios

Los servicios son lo más difícil de fotografiar: no hay objeto. La salida es
mostrar **el trabajo ocurriendo**, no una metáfora abstracta.

### 12 · `programa-compostaje-restaurantes`
*Programa de compostaje para restaurantes — Ciclo Cero, Bogotá*

```
[ESTILO]
Documentary photograph inside the back of a restaurant kitchen in Bogotá: a
cook in an apron scraping vegetable peels into a clearly separated organic waste
bin, with two other color-coded bins beside it and a wall chart with no legible
text. Stainless steel surfaces, crates of produce, working daylight. 35mm lens,
action centered with empty space above and below.
[PERSONAS]
Aspect ratio 4:3.
```

### 13 · `aceite-cocina-reciclado-biodiesel`
*Aceite de cocina reciclado a biodiésel — Ciclo Cero, Bogotá*

```
[ESTILO]
Documentary photograph of a used cooking oil collection at a restaurant service
door: a worker in gloves sealing a blue collection drum on a hand trolley, with
a second sealed drum beside it and a funnel resting on top. Grey city street,
morning light, tidy and professional, no lettering on the drums. 35mm lens,
subject centered with empty space above and below.
[PERSONAS]
Aspect ratio 4:3.
```

### 14 · `capacitacion-turismo-sostenible-guias`
*Capacitación en turismo sostenible para guías — Ruta Regenerativa, Bogotá*

```
[ESTILO]
Documentary photograph of a training workshop for Colombian tour guides held
outdoors under a wooden shelter: eight adults sitting in a semicircle on
benches, one standing and explaining with a paper flipchart, notebooks on laps.
Green landscape beyond the shelter, soft afternoon light. No legible text on the
flipchart. 35mm lens, group centered with empty space above and below.
[PERSONAS]
Aspect ratio 4:3.
```

### 15 · `acompanamiento-certificacion-nts-ts`
*Acompañamiento a la certificación NTS-TS — Ruta Regenerativa, Bogotá*

```
[ESTILO]
Documentary photograph of a sustainability consultant and a hotel manager
reviewing documents together at the reception desk of a small Colombian hotel:
papers, a folder and a laptop on the counter, one of them pointing at a page,
both focused on the work. Plants and warm wood in the background, daylight from
the entrance. No legible text on the documents or screen. 50mm lens, both
figures centered with empty space above and below.
[PERSONAS]
Aspect ratio 4:3.
```

## Experiencias

Aquí la foto vende el viaje. Menos producto, más momento.

### 16 · `experiencia-turismo-regenerativo-amazonia`
*Experiencia de turismo regenerativo — Amazonía, Selva Viva, Leticia*

```
[ESTILO]
Documentary photograph on a black-water river in the Colombian Amazon near
Leticia: a wooden canoe carrying an indigenous local guide and three visitors,
gliding past a dense wall of flooded rainforest. Early morning mist on the
water, mirrored reflections, muted greens and browns. 35mm lens, canoe centered
in the frame with river and mist above and below.
[PERSONAS]
Aspect ratio 4:3.
```

### 17 · `siembra-de-coral-islas-del-rosario`
*Siembra de coral en Islas del Rosario — Coralina Azul, Cartagena*

```
[ESTILO]
Underwater photograph in the clear turquoise Caribbean at Islas del Rosario,
Colombia: a diver carefully attaching a coral fragment to a rope nursery
structure, with rows of growing staghorn coral fragments around. Sunlight rays
filtering from the surface, small reef fish, white sand below. Natural
underwater color, not oversaturated. Diver and nursery centered with clear water
above and below.
Aspect ratio 4:3.
```

### 18 · `ruta-del-cacao-regenerativo`
*Ruta del cacao regenerativo — Cacao Guane, San Vicente de Chucurí*

```
[ESTILO]
Documentary photograph on an agroforestry cacao farm in Santander, Colombia: a
farmer opening a ripe yellow cacao pod with a machete to show the white pulp
inside, while two visitors watch. Cacao trees under tall shade trees behind,
dappled sunlight through the canopy. 50mm lens, shallow depth of field on the
opened pod, action centered with empty space above and below.
[PERSONAS]
Aspect ratio 4:3.
```

---


# 4. Qué quedó hecho — 2026-08-29

Las 28 imágenes llegaron y están conectadas. Lo de abajo es el estado real, no
el plan.

## Las dos máquinas

```
tools/img-originales/          98 MB de JPG grandes, sin versionar
        │
        ├── bash scripts/optimizar-imagenes.sh   →  public/img/{ofertas,secciones}/  9,7 MB en WebP
        │      27 fotos. El logo lo salta a propósito: es vector, no fotografía.
        │
        └── bash scripts/generar-marca.sh        →  28 archivos de marca
               Parte de los SVG de public/img/marca/, no del JPG.
```

Las dos son idempotentes: se pueden volver a correr cuantas veces haga falta.
**Si mañana cambia el logo, se edita el SVG y se corre `generar-marca.sh`.** Es
lo único que mantiene el favicon, el avatar de LinkedIn y la tarjeta de WhatsApp
siendo el mismo logo dentro de un año.

## El logo

El concepto que llegó es el A —hoja, mundo y raíz— con un mundo añadido en el
centro. Se dibujó a mano en SVG, no se vectorizó automáticamente.

**Son dos dibujos, no uno**, y esa es la decisión de diseño que importa aquí:

| Archivo | Cuándo | Qué tiene |
|---|---|---|
| `isotipo.svg` | De 32 px hacia arriba | Nervios de hoja, continentes, cuatro pares de raíces |
| `isotipo-compacto.svg` | Por debajo de 32 px | Silueta sola, trazo más grueso, dos pares de raíces |

El original a 16 px se convierte en una mancha: las raíces finas y el mapa se
empastan hasta que no queda nada reconocible. La versión compacta conserva la
silueta de hoja, mundo y raíz, que es lo único que alguien identifica a ese
tamaño. Comparten `viewBox`, así que se intercambian en el mismo hueco sin
recalcular nada.

Los dos usan `currentColor` en todo el trazo: **no hay un solo hex dentro del
SVG**. Recolorear el logo es `text-brand-600` o `text-white`, no un archivo
nuevo. Las variantes con color escrito (`-blanco`, `-negro`, `-verde`) existen
solo para quien abre el archivo fuera del sitio, en Illustrator o en un Word.

Dentro de la aplicación no se usan estos archivos sino
`src/components/isotipo.tsx`, que lleva la misma geometría inline. A través de
`<img src="…svg">` el SVG se carga en su propio documento y `currentColor` deja
de resolver contra el texto de alrededor; inline, el mismo componente sale verde
en la cabecera y blanco en el pie sin una petición de red extra.

### La palabra

«Seregenera» va en Fraunces, la tipografía de titulares que el sitio ya carga.
En la cabecera es texto HTML, no una imagen: se puede seleccionar, escala solo y
siempre sale con la fuente correcta.

**En lo rasterizado —banners, firma de correo, tarjeta de compartir— la palabra
va en Georgia.** Fraunces se sirve desde Google Fonts y no está instalada en
esta máquina, así que ImageMagick no puede componerla. Georgia es el respaldo
que `globals.css` ya declara para `--font-display`, y a tamaño de banner la
diferencia es pequeña. Si en algún momento importa que sea Fraunces exacta,
hay que sacar las curvas en un editor vectorial: aquí no hay forma.

## Los 28 archivos de marca

| Dónde | Qué |
|---|---|
| `public/img/marca/*.svg` | 3 fuentes (isotipo, compacto, logotipo horizontal) × 3 colores + las 3 originales con `currentColor` = 12 |
| `src/app/` | `favicon.ico`, `icon.png`, `apple-icon.png`, `opengraph-image.jpg`, `twitter-image.jpg` = 5 |
| `public/img/marca/redes/` | 5 avatares, 5 banners, firma de correo = 11 |

Dos cambios respecto al plan:

- **Los banners con foto y la tarjeta de compartir son JPG, no PNG.** Son
  fotografías: en PNG, el banner de YouTube pesaba 3,8 MB y ahora pesa 671 KB.
  Lo que sigue en PNG es lo que tiene color plano o transparencia — avatares,
  banner de LinkedIn de empresa, firma.
- **El favicon y los avatares llevan fondo verde macizo**, con la marca en
  crema. Un favicon de fondo claro desaparece en una fila de pestañas que ya son
  todas blancas.

## Dónde quedó cada foto

| Foto | Se ve en |
|---|---|
| `hero-home` | Portada, detrás del velo. También el banner de LinkedIn personal y la tarjeta de compartir |
| `hero-verificacion` | Cabecera de `/verificacion`. También el banner de YouTube |
| `hero-vender` | Cabecera de `/vender`. También el banner de Facebook |
| `hero-proveedores` | Cabecera de `/proveedores`, y respaldo de la ficha de un proveedor sin ofertas con foto. También el banner de X |
| `vertical-*` (5) | Tarjetas de «Soluciones para cada tipo de negocio» en la portada |
| Las 18 de oferta | Tarjeta del catálogo y ficha de la oferta |

`/catalogo` se quedó **sin** fotografía de cabecera a propósito. Es una
herramienta de trabajo con filtros: una franja alta con foto empuja los
resultados fuera de la pantalla y estorba a quien vino a buscar algo.
`/proveedores` sí la lleva porque es una página que cuenta quiénes son antes de
listarlos.

## Decisiones que se tomaron al conectarlas

**La ficha de oferta pasó de 16:9 a 3:2.** Las fotos llegaron en 4:3. En un
hueco 16:9 el recorte se come el 12 % de arriba y el 12 % de abajo; en 3:2 se
queda en un 6 % por lado. Con 18 fotos, esa diferencia es entre perderle la
cabeza a un producto y no perdérsela.

**Las rutas locales pasan por `next/image`; las de Supabase Storage, no.**
`listing-media.tsx` mira si la ruta empieza por `/`. Las de aquí las recorta y
las sirve Next en el tamaño de cada hueco; las del futuro Storage siguen con
`<img>` pelado porque el dominio no se conoce en build y `next/image` exige
declararlo en `next.config` antes de tocarlo. El día que exista el bucket, se
declara el dominio y se borra la segunda rama.

**El velo de las cabeceras vive en un solo componente.**
`src/components/hero-banner.tsx`. Es lo único que separa un titular blanco de
una foto con niebla clara detrás: repetido a mano en cuatro páginas, basta con
que alguien lo aclare en una para dejar un titular ilegible sin que nadie lo
note.

**Los proveedores no tienen logo generado, tienen monograma.**
`src/components/provider-avatar.tsx` dibuja sus iniciales sobre un degradado
estable derivado del nombre. Y la portada de la ficha de un proveedor es la foto
de su propia oferta, no una imagen aparte: siempre muestra algo que esa empresa
vende de verdad, y se mantiene sola cuando el catálogo cambia.

## Lo que falta revisar, y no lo puedo revisar yo

La revisión visual la hace una persona: aquí no hay navegador. Lo verificado es
que `npm run build`, `npx tsc --noEmit` y `npx eslint .` pasan los tres en
limpio, que las 18 ofertas tienen ruta y que ningún archivo pesa más de lo que
debería.

Tres sitios donde mirar con atención:

1. **El isotipo a tamaño de favicon.** La silueta de hoja sobre círculo con
   raíces puede leerse como una figura humana antes que como una planta. Es la
   pieza con más probabilidad de necesitar un ajuste.
2. **El contraste del titular sobre la portada.** El velo está calculado para
   que el blanco pase AA sobre la parte clara de la niebla, pero calculado no es
   lo mismo que mirado.
3. **Las 18 fotos en la tarjeta del catálogo**, que las muestra en 4:3 completo,
   contra la ficha, que recorta a 3:2.
