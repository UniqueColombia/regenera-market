import type { CSSProperties } from "react";
import { FondoHero } from "./fondo-hero";

/**
 * El fondo de las pantallas de la cuenta y de los formularios: un bosque
 * dibujado que se mece despacio arriba a la derecha, unas pocas hojas que caen
 * y un velo verde muy claro que se funde con la página.
 *
 * Pedido de Jesús el 2026-10-15: los formularios eran «un conjunto de recuadros
 * y botones». Esto les da el tema del sitio sin tocar lo que hay que llenar:
 *
 * - **Va detrás de todo** (`-z-10`) y no recibe clics. La página que lo usa
 *   tiene que envolver su contenido en `relative isolate`, o el fondo se iría
 *   detrás del `body`.
 * - **Solo ocupa la cabecera** (`h-[30rem]`) y se desvanece hacia abajo: las
 *   tarjetas del formulario quedan sobre crema lisa, que es donde se lee.
 * - **Los árboles son de la paleta** (`fill-brand-100`, `fill-brand-200`), así
 *   que siguen al modo oscuro, y se mecen con CSS (`.arbol-bosque`). Las hojas
 *   son `FondoHero` con poca densidad. Con `prefers-reduced-motion`, todo
 *   quieto.
 * - **El velo es una clase propia (`.velo-botanico`) y no `from-brand-50`.** El
 *   modo oscuro devuelve la paleta clara a todo lo que lleve `from-brand-…`
 *   (capa 3, para los degradados que ya eran oscuros), y con esa clase el velo
 *   salía verde claro sobre la página oscura y el texto de la cabecera no se
 *   leía.
 * - **El bosque va pegado al borde derecho** y su suelo se desvanece hacia
 *   abajo: con un margen a la derecha, el suelo terminaba en un corte recto.
 *
 * `hojas` elige la variante de las que caen: `primavera` (brote nuevo) donde se
 * publica algo, `hojas` en la cuenta y la empresa.
 */
export function FondoBotanico({ hojas = "hojas" }: { hojas?: "hojas" | "primavera" }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[30rem] overflow-hidden"
    >
      <div className="velo-botanico absolute inset-0" />
      <Bosque className="absolute -right-16 top-6 h-44 w-[19.25rem] opacity-60 [mask-image:linear-gradient(to_bottom,black_70%,transparent)] sm:-right-8 md:right-0 md:h-72 md:w-[31.5rem] md:opacity-100" />
      <div className="absolute inset-0 [mask-image:linear-gradient(to_bottom,black_35%,transparent_90%)]">
        <FondoHero variante={hojas} densidad={0.3} />
      </div>
    </div>
  );
}

const BASE = 320;

/** Un pino de tres pisos que se solapan, del más angosto arriba al más ancho abajo. */
function pino(x: number, alto: number, ancho: number): string {
  const pisos = [0, 1, 2].map((k) => {
    const arriba = BASE - alto + k * alto * 0.24;
    const abajo = arriba + alto * 0.42;
    const medio = (ancho / 2) * (0.5 + 0.25 * k);
    return `M${x} ${arriba} L${x + medio} ${abajo} Q${x} ${abajo + alto * 0.06} ${x - medio} ${abajo} Z`;
  });
  const tronco = `M${x - 3.5} ${BASE} L${x - 3.5} ${BASE - alto * 0.14} L${x + 3.5} ${BASE - alto * 0.14} L${x + 3.5} ${BASE} Z`;
  return [...pisos, tronco].join(" ");
}

/** Un árbol de copa redonda: un tronco y cuatro círculos que se solapan. */
function frondoso(x: number, cy: number, r: number) {
  const copa: [number, number, number][] = [
    [x, cy, r],
    [x - r * 0.62, cy + r * 0.3, r * 0.72],
    [x + r * 0.6, cy + r * 0.24, r * 0.78],
    [x - r * 0.12, cy - r * 0.5, r * 0.7],
  ];
  const tronco = `M${x - 5} ${BASE} C${x - 4} ${cy + r} ${x - 2} ${cy + r * 0.6} ${x} ${cy + r * 0.3} C${x + 2} ${cy + r * 0.6} ${x + 4} ${cy + r} ${x + 5} ${BASE} Z`;
  return { copa, tronco };
}

/** Lo que tarda cada árbol en ir y volver, y en qué punto de su vaivén empieza. */
const vaiven = (segundos: number, desfase: number) =>
  ({ "--d": `${segundos}s`, "--r": `-${desfase}s` }) as CSSProperties;

function Arbol({ x, cy, r, estilo }: { x: number; cy: number; r: number; estilo: CSSProperties }) {
  const { copa, tronco } = frondoso(x, cy, r);
  return (
    <g className="arbol-bosque" style={estilo}>
      <path d={tronco} />
      {copa.map(([cx, cyy, rr], i) => (
        <circle key={i} cx={cx} cy={cyy} r={rr} />
      ))}
    </g>
  );
}

/** El bosque: una fila lejana más clara y una cercana un tono más verde. */
function Bosque({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 560 320" className={className} preserveAspectRatio="xMaxYMax meet">
      <g className="fill-brand-100">
        <path d="M0 320 C 90 272 190 262 290 284 S 470 250 560 266 L560 320 Z" />
        <path className="arbol-bosque" style={vaiven(10, 3)} d={pino(70, 150, 70)} />
        <path className="arbol-bosque" style={vaiven(8, 1)} d={pino(128, 112, 56)} />
        <Arbol x={205} cy={210} r={38} estilo={vaiven(11, 5)} />
        <path className="arbol-bosque" style={vaiven(9, 6)} d={pino(510, 178, 80)} />
      </g>
      <g className="fill-brand-200">
        <path d="M150 320 C 260 298 400 300 560 292 L560 320 Z" />
        <path className="arbol-bosque" style={vaiven(9, 2)} d={pino(262, 142, 64)} />
        <Arbol x={335} cy={150} r={66} estilo={vaiven(12, 4)} />
        <path className="arbol-bosque" style={vaiven(10, 7)} d={pino(455, 262, 122)} />
      </g>
    </svg>
  );
}
