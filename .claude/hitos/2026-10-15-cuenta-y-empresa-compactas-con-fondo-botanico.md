# «Tu empresa» y «Tu cuenta» compactas, y un fondo botánico para los formularios

- **Fecha:** 2026-10-15
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-cuenta-compacta-y-viva` (entrega directa)
- **Fase del roadmap:** 3 (proveedores reales); sigue a [el formulario de oferta compacto](2026-10-15-formulario-de-oferta-compacto-y-obligatorios.md)

## Qué se hizo

Pedidos de Jesús, con capturas:

1. **`/cuenta/empresa` compacta.** Las dos columnas terminaban a alturas muy
   distintas y «De dónde salen tus puntos» y «Cerrar la empresa» quedaban
   descolgados a la derecha, al lado de un hueco. Ahora: «Lo que vendes» a lo
   ancho con sus botones en una fila; «Tu giro» y «Tu nivel» lado a lado y de
   la misma altura (en «Tu nivel», «Lo que más te suma ahora»: las tres
   acciones que más puntos dan y todavía se pueden conseguir); logo y portada
   en una sola tarjeta; los puntos a lo ancho en rejilla de tres; «Cerrar la
   empresa» centrada y estrecha debajo de todo.
2. **`/cuenta`:** «Eliminar tu cuenta» sale de la columna derecha y va centrada
   y estrecha debajo de las dos columnas, igual que «Cerrar la empresa».
3. **Lista de ofertas:** «Ver» va arriba a la derecha, encima de «Editar»; antes
   quedaba entre «Editar» y «Retirar» como una tercera acción.
4. **Más atractivo, con el tema del sitio.** Dos piezas nuevas, usadas en
   `/cuenta`, `/cuenta/empresa`, la lista de ofertas, «Nueva oferta», «Cargar
   desde Excel» y «Editar»:
   - `FondoBotanico`: un velo verde muy claro, un bosque dibujado en SVG que se
     mece despacio arriba a la derecha y unas pocas hojas que caen
     (`FondoHero` con `densidad` 0,3; prop nueva). Solo en la cabecera, detrás
     de todo, desvanecido hacia abajo.
   - `Tarjeta`: los bloques brotan uno detrás de otro al cargar y se iluminan
     (anillo verde y sombra suave) mientras se escribe dentro. La usan también
     el formulario de oferta y los tres pasos de la carga desde Excel.

## Por qué así

**Un bosque dibujado y no una foto.** Una foto detrás de un formulario compite
con lo que hay que leer y pesa; el SVG son unas decenas de líneas, usa los
tokens de la paleta (sigue al modo oscuro sin hacer nada) y se puede mecer con
CSS. Las hojas que caen son las mismas de los heros del sitio, en menos
cantidad: acompañan, no distraen.

**Solo en la cabecera.** Las tarjetas quedan sobre crema lisa, que es donde se
lee y se escribe. El bosque asoma por detrás de la primera fila de tarjetas,
que le da profundidad.

**«Lo que más te suma ahora» en vez de estirar o encoger «Tu nivel».** La
tarjeta medía la mitad que «Tu giro»; dejarla corta dejaba el hueco, y estirarla
vacía también. Así el espacio dice cómo subir de nivel, que es lo que alguien
que mira su nivel quiere saber.

## Qué se rompe si tocas esto

- **El velo no puede ser `from-brand-50`.** La capa 3 del modo oscuro devuelve
  la paleta clara a todo lo que lleve `from-brand-…`, y el velo salía verde
  claro sobre la página oscura con el texto ilegible encima. Es `.velo-botanico`
  en `globals.css`, con `var(--color-brand-50)`. Anotado en `diseno-visual`.
- **`FondoBotanico` necesita que la página envuelva su contenido en
  `relative isolate`.** Sin eso, el `-z-10` lo manda detrás del `body` y no se
  ve.
- **Un botón sin fondo encima del bosque deja ver un árbol detrás del texto**
  («Cargar desde Excel» en la lista de ofertas). Los botones secundarios de esas
  cabeceras llevan `bg-white`.
- **«Nueva oferta» y «Cargar desde Excel» siguen teniendo el selector en el
  mismo sitio** (ver [su hito](2026-10-15-selector-de-ofertas-con-animacion-propia.md)):
  el fondo va fuera del `container-page`, así que no es hermano del selector y
  no se difumina con él.

## Verificación

- `npm run build`, `npx tsc --noEmit`, `npx eslint .` (0 errores) y `npm test`.
- Con Playwright, sobre copias temporales de las cuatro páginas con datos de
  prueba en lugar de la base (ya borradas; aquí no hay `.env.local`): escritorio
  1440 px y móvil 390 px sin desbordes, y modo oscuro (de ahí salió el error del
  velo).
- **No verificado**: con sesión y datos reales, y la animación en un teléfono
  real.
