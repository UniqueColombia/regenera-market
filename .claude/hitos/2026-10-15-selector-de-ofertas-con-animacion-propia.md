# El selector «Una oferta / Varias desde Excel» se anima solo

- **Fecha:** 2026-10-15
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-selector-oferta-animado` y `feat/js-selector-oferta-fluido` (entrega directa)
- **Fase del roadmap:** 3 (proveedores reales); corrige [la carga masiva a un clic](2026-10-15-carga-masiva-mas-a-la-mano.md)

## Qué se hizo

El selector de la entrega anterior se veía pegado al enlace de volver y el
cambio de una pantalla a otra era un salto. Dos arreglos:

1. **Aire.** Era un `inline-flex` y quedaba en la misma línea que «Tus ofertas».
   Ahora es un bloque debajo, con `mt-5`, y en las cuatro pantallas va justo
   después del enlace de volver y antes del título.
2. **Animación propia, en cliente.** Al pulsar, la píldora cruza (420 ms) y todo
   lo que hay debajo se difumina y se apaga; al terminar el cruce se navega; la
   pantalla nueva entra desde el desenfoque hasta quedar nítida.

## Por qué así

**El primer intento fue View Transitions del navegador** (la píldora con su
`view-transition-name`). En una prueba aislada la píldora cruzaba, pero Jesús lo
siguió viendo inmediato en la pantalla real: el contenido de la página se
reemplazaba al instante y el cruce, de existir, se perdía dentro de la
transición general del sitio. Dejar la animación en manos del selector es
determinista: no depende de qué haga el navegador ni de cuánto tarde la otra
pantalla.

**Se espera a que termine el cruce para navegar** (`MS_CRUCE`). Navegar al
empezar haría que la pantalla nueva montara el selector en su sitio final a mitad
del cruce: la píldora saltaría. Con `prefers-reduced-motion` no se espera.

**El contenido viejo se queda a medio apagar** (opacidad 0,25 y desenfoque)
hasta que llega el nuevo, en lugar de desaparecer: la espera del servidor se lee
como parte del cambio y no como una página en blanco.

**El selector conserva un `view-transition-name`, pero sin animación**
(`::view-transition-group(selector-oferta) { animation: none }`), igual que el
encabezado. Sin él, la transición general entre páginas funde la pantalla entera
y el selector se atenuaba y volvía justo cuando llegaba la otra.

## Qué se rompe si tocas esto

- **El selector tiene que estar en el mismo sitio en las dos pantallas.** Lo que
  se difumina son sus hermanos siguientes (`.selector-oferta ~ *`): si una
  pantalla lo pone después del título, el título no se difumina y la píldora
  «salta» al llegar.
- **`MS_CRUCE` (componente) y la duración de `.pildora-oferta` (`globals.css`)
  son el mismo número en dos sitios.** Si no coinciden, se navega antes de que
  la píldora llegue o después de que se detenga.
- **La entrada del contenido usa `animation-fill-mode: backwards`, no `both`.**
  Con `both` la animación conserva su valor final y pisa el apagado de
  `data-saliendo`, que es una regla normal.
- **El ancho y el recorrido de la píldora suponen dos columnas iguales y un
  `gap-1`** (`calc((100% - 0.75rem) / 2)` y `translateX(calc(100% + 0.25rem))`).
  Una tercera opción obliga a rehacer ese cálculo.

## Verificación

- `npm run build`, `npx tsc --noEmit`, `npx eslint .` (0 errores) y `npm test`.
- Con Playwright y dos páginas temporales (ya borradas), con 300 ms de espera
  simulada en la de destino, y capturando fotogramas con la captura continua de
  CDP: la píldora cruza entre los 430 y los 560 ms, el contenido viejo se
  difumina, el nuevo se aclara desde los 1.400 ms y el selector ya no parpadea
  al llegar. Escritorio (1000 px) y móvil (375 px).
- **No verificado**: con sesión real de empresa ni de administrador, ni con el
  tiempo real de las pantallas (consultan la base).
