# El sitio tiene identidad visual: logo, favicon y 27 fotografías

- **Fecha:** 2026-08-29
- **Autor:** Jesús Seiler (`seiler18`), imágenes generadas por Jesús Seiler
- **Rama / PR:** `feat/js-identidad-visual`
- **Fase del roadmap:** 0 — Prototipo (habilitante)

## Qué se hizo

El sitio no tenía **ninguna** imagen propia: los cinco SVG de `public/` eran los
de fábrica de Next y no se usaban en ningún lado, las 18 ofertas tenían
`images: []`, la marca era un icono `Leaf` de `lucide-react` y el favicon era el
de Next. Pegar un enlace de Seregenera en WhatsApp daba un rectángulo gris.

Ahora hay:

- **Logo propio en SVG**, dibujado a mano en dos versiones, más 28 archivos
  derivados: favicon, iconos de aplicación, tarjeta al compartir, cinco avatares
  y cinco banners de redes, firma de correo.
- **27 fotografías** generadas con IA: 4 cabeceras, 5 tarjetas de vertical y una
  por cada oferta del catálogo, conectadas a las páginas.
- **Dos scripts idempotentes** que producen todo lo anterior desde los
  originales, y un documento, `docs/IMAGENES.md`, con el prompt exacto de cada
  imagen.

## Por qué así

### El logo se generó una vez y se derivó, no se generó 28 veces

Pedirle a un modelo de imagen un logo para el favicon y otro para LinkedIn da
dos marcas parecidas pero distintas, y una marca que cambia de forma según dónde
se mira no es una marca. Se generó **un** símbolo, se dibujó a mano en SVG, y
`scripts/generar-marca.sh` deriva de ese vector los 28 archivos. El día que la
marca cambie, se edita el SVG y se vuelve a correr el script: es lo único que
mantiene el favicon y el avatar de LinkedIn siendo el mismo logo dentro de un
año.

También se le pidió al modelo el símbolo **sin una sola letra**. Los modelos de
imagen escriben mal y cada generación escribe distinto; la palabra «Seregenera»
se compone aparte, en Fraunces, que ya es la tipografía de titulares del sitio.

### Hay dos isotipos porque uno no sobrevive a 16 px

`isotipo.svg` tiene nervios de hoja, continentes y cuatro pares de raíces. A
tamaño de favicon todo eso se empasta hasta que no queda nada reconocible — se
comprobó rasterizando a 16 px antes de decidir. `isotipo-compacto.svg` es la
misma marca con el detalle quitado: silueta, trazo más grueso, dos pares de
raíces. Comparten `viewBox`, así que se intercambian en el mismo hueco sin
recalcular nada.

La cabecera usa el compacto (36 px), el pie el de detalle (40 px), el favicon y
los avatares el compacto.

### El trazo es `currentColor` y no hay un solo hex dentro del SVG

Recolorear el logo es `text-brand-600` o `text-white`, no un archivo nuevo. Es
la misma regla que `diseno-visual` ya impone para el resto del sitio: ningún
color literal fuera del tema.

De ahí sale otra decisión: dentro de la aplicación el logo no se sirve como
`<img src="/img/marca/isotipo.svg">` sino inline, desde
`src/components/isotipo.tsx`. A través de `<img>` el SVG se carga en su propio
documento y `currentColor` deja de resolver contra el texto de alrededor. La
geometría queda duplicada entre el componente y los archivos de
`public/img/marca/`, que son el juego para quien **no** es el sitio —
documentos, redes, prensa.

### Los proveedores no llevan logo generado

Son datos de demostración y se reemplazan por reales en el primer lote de
onboarding, lo dice el propio comentario de `src/data/providers.ts`.
Inventarle una identidad gráfica a una asociación campesina que sí podría
existir crea un problema, no resuelve uno.

En su lugar: `src/components/provider-avatar.tsx` dibuja un monograma
determinista —sus iniciales sobre un degradado estable derivado del nombre—, con
el mismo criterio que `listing-media.tsx` ya usaba para las ofertas sin foto. Y
**la portada de la ficha de un proveedor es la foto de su propia oferta**, no
una imagen aparte: siempre muestra algo que esa empresa vende de verdad y se
mantiene sola cuando el catálogo cambia. Cuando el proveedor real suba su logo,
`logoUrl` deja de estar vacío y el monograma desaparece solo.

### El velo de las cabeceras es un componente, no cuatro copias

`src/components/hero-banner.tsx`. El degradado sobre la fotografía es lo único
que separa un titular blanco de una foto con niebla clara detrás. Repetido a
mano en cuatro páginas, basta con que alguien lo aclare en una para dejar un
titular ilegible sin que nadie lo note. El componente no existe por el
maquetado: existe por el contraste.

El degradado va **hacia la derecha** porque las cuatro fotos de cabecera se
encargaron con el sujeto a la derecha y aire a la izquierda, que es donde cae el
titular.

### La ficha de oferta pasó de 16:9 a 3:2

Las fotos llegaron en 4:3. En un hueco 16:9 el recorte se come el 12 % de arriba
y el 12 % de abajo; en 3:2 se queda en un 6 % por lado. Con 18 fotos, esa
diferencia es entre perderle la cabeza a un producto y no perdérsela. La tarjeta
del catálogo sigue en 4:3 y muestra la foto completa.

### `next/image` solo para lo local

`listing-media.tsx` mira si la ruta empieza por `/`. Las de aquí las recorta y
sirve Next en el tamaño de cada hueco; las que vendrán de Supabase Storage
siguen con `<img>` pelado, porque el dominio no se conoce en build y
`next/image` exige declararlo en `next.config` antes de tocarlo. El día que
exista el bucket, se declara el dominio y se borra la segunda rama.

### `/catalogo` se quedó sin fotografía de cabecera

Es una herramienta de trabajo con filtros: una franja alta con foto empuja los
resultados fuera de la pantalla y estorba a quien vino a buscar algo.
`/proveedores` sí la lleva porque cuenta quiénes son antes de listarlos.

## Lo que se descartó

**Vectorizar el logo automáticamente.** No hay trazador instalado y los
automáticos dejan curvas sucias. Se dibujó a mano, midiendo las proporciones
sobre la imagen generada. Las tres que importan y no se pueden tocar sin romper
la marca: la hoja es algo más ancha que alta y con la punta arriba, su base se
apoya en el mundo, y la raíz se abre casi el doble del ancho del mundo —
estrecharla convierte el símbolo en un ojo de cerradura.

**Fraunces en los archivos rasterizados.** Se sirve desde Google Fonts, no está
instalada, y ImageMagick no puede componerla. Los banners y la firma de correo
llevan Georgia, que es el respaldo que `globals.css` ya declara para
`--font-display`. Si alguna vez importa que sea Fraunces exacta, hay que sacar
las curvas en un editor vectorial: aquí no hay forma.

**PNG para los banners con fotografía.** El de YouTube pesaba 3,8 MB. Pasados a
JPG con calidad 88 pesan 671 KB y nadie distingue la diferencia. Siguen en PNG
los de color plano o con transparencia.

## Qué quedó pendiente

- **La revisión visual.** Aquí no hay navegador. Lo verificado es que
  `npm run build`, `npx tsc --noEmit` y `npx eslint .` pasan los tres en limpio.
  Tres sitios donde mirar con atención están listados al final de
  `docs/IMAGENES.md`; el primero es el isotipo a tamaño de favicon, que puede
  leerse como una figura humana antes que como una planta.
- **El `.gitignore` de esta rama repite las reglas de `.claude/prospectos/` y
  `outputs/`** que trae la rama de prospección, todavía sin mergear. Sin ellas,
  un `git add -A` en esta rama sube datos de empresas identificables a un
  repositorio público. Si al mergear hay conflicto ahí, se quedan ambos bloques.
- `public/img/` pesa 9,7 MB. Es peso de repositorio, no de descarga:
  `next/image` sirve recortes mucho menores. Si crece mucho más, conviene
  revisarlo.

## Referencias

- `docs/IMAGENES.md` — el prompt exacto de cada imagen, los tamaños de cada red
  y qué quedó conectado dónde
- `scripts/optimizar-imagenes.sh` · `scripts/generar-marca.sh`
- Hito [marca Seregenera](2026-08-23-marca-seregenera.md) — de dónde viene el
  nombre que compone el logotipo
