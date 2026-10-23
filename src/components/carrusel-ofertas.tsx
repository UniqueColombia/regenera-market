"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Las ofertas de la portada en tandas de dos filas, con flechas y puntos para
 * pasar a la siguiente (pedido de Jesús, 2026-10-23: «10 o 20 por corrida, con
 * sliders para cambiar de tanda»).
 *
 * **Siempre dos filas, cambia cuántas columnas.** Con doce fijas, un teléfono
 * a dos columnas apilaba seis filas —casi dos pantallas— antes de llegar a las
 * flechas. Así la tanda mide lo mismo en todos los anchos: 4 en el teléfono,
 * 6 · 8 · 12 hacia arriba. Las columnas de `COLUMNAS` y las clases de la
 * rejilla tienen que decir lo mismo; si se separan, la última fila queda coja.
 *
 * Las tarjetas llegan ya pintadas por el servidor (`items`): este componente
 * solo las reparte y las mueve, así que la tarjeta sigue siendo de servidor.
 * Las tandas que no se ven van con `inert`: sin eso, el tabulador entraría en
 * tarjetas que están fuera del cuadro.
 *
 * ## El movimiento (2026-10-23)
 *
 * Ideas de React Bits escritas a mano en `globals.css` («Carrusel de ofertas»),
 * como el «Glass Tiles» de OPCIONES: sus componentes traen GSAP o Motion para
 * lo que aquí resuelve CSS.
 *
 * - **Cascada** (Animated Content): las tarjetas entran una tras otra, de
 *   izquierda a derecha, al llegar a la sección y al cambiar de tanda —desde el
 *   lado hacia el que se avanza—.
 * - **Foco**, **borde que sigue al cursor** y **destello**: en la tarjeta, ver
 *   `tarjeta-oferta-compacta.tsx`.
 *
 * La entrada sigue la regla de `Revelar`: el HTML sale visible, y solo se
 * esconde para animarlo lo que al montar está debajo del pliegue. Esconder lo
 * que ya se ve haría parpadear la portada justo después de hidratar.
 */

/** De mayor a menor: la primera consulta que se cumple decide. */
const COLUMNAS: [string, number][] = [
  ["(min-width: 1024px)", 6],
  ["(min-width: 768px)", 4],
  ["(min-width: 640px)", 3],
];

function columnasAhora(): number {
  return COLUMNAS.find(([q]) => window.matchMedia(q).matches)?.[1] ?? 2;
}

function suscribir(avisar: () => void) {
  const listas = COLUMNAS.map(([q]) => window.matchMedia(q));
  listas.forEach((l) => l.addEventListener("change", avisar));
  return () => listas.forEach((l) => l.removeEventListener("change", avisar));
}

/** En el servidor no hay ancho: se pinta la de escritorio y el cliente corrige. */
const columnasServidor = () => 6;

export function CarruselOfertas({
  items,
  etiqueta,
}: {
  items: ReactNode[];
  /** Nombre del carrusel para un lector de pantalla («Ofertas destacadas»). */
  etiqueta: string;
}) {
  const columnas = useSyncExternalStore(suscribir, columnasAhora, columnasServidor);
  const porTanda = columnas * 2;
  const tandas: ReactNode[][] = [];
  for (let i = 0; i < items.length; i += porTanda) tandas.push(items.slice(i, i + porTanda));

  const [pedida, setPedida] = useState(0);
  // Al girar el teléfono cambian las columnas y puede haber menos tandas: se
  // queda en la última que existe en vez de mostrar un hueco.
  const actual = Math.min(pedida, tandas.length - 1);
  const toque = useRef<number | null>(null);

  const raiz = useRef<HTMLDivElement>(null);
  /** quieta: sin animar · esperando: escondida bajo el pliegue · cascada: entrando. */
  const [entrada, setEntrada] = useState<"quieta" | "esperando" | "cascada">("quieta");
  /** Desde dónde entran las tarjetas: la siguiente tanda llega por la derecha. */
  const [desde, setDesde] = useState<"izquierda" | "derecha">("izquierda");
  /** Cambia en cada paso de tanda: es la `key` que vuelve a lanzar la cascada. */
  const [paso, setPaso] = useState(0);

  useEffect(() => {
    const el = raiz.current;
    if (!el || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Ya se ve: se queda quieta (ver la cabecera).
    if (el.getBoundingClientRect().top < window.innerHeight) return;

    // Por debajo del pliegue: se esconde hasta que asome (patrón de `Revelar`).
    setEntrada("esperando");
    const observador = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        setEntrada("cascada");
        observador.disconnect();
      },
      { rootMargin: "0px 0px -15% 0px" },
    );
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  if (tandas.length === 0) return null;

  function ir(n: number, hacia: "izquierda" | "derecha") {
    setPedida((n + tandas.length) % tandas.length);
    setDesde(hacia);
    setPaso((p) => p + 1);
    setEntrada("cascada");
  }

  return (
    <div
      ref={raiz}
      role="region"
      aria-roledescription="carrusel"
      aria-label={etiqueta}
      className={entrada === "esperando" ? "carrusel-esperando" : undefined}
    >
      <div
        className="overflow-hidden"
        onTouchStart={(e) => (toque.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (toque.current === null) return;
          const dx = e.changedTouches[0].clientX - toque.current;
          toque.current = null;
          if (Math.abs(dx) > 50 && tandas.length > 1) {
            if (dx < 0) ir(actual + 1, "derecha");
            else ir(actual - 1, "izquierda");
          }
        }}
      >
        <div
          className="flex transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(-${actual * 100}%)` }}
        >
          {tandas.map((tanda, t) => (
            <ul
              // Solo la tanda visible cambia de `key` al pasar: se vuelve a
              // montar y su cascada arranca de nuevo.
              key={t === actual ? `${t}-${paso}` : t}
              inert={t !== actual}
              aria-label={`Tanda ${t + 1} de ${tandas.length}`}
              data-desde={desde}
              // `px-1.5 py-2`: el anillo, la sombra y el salto del hover de la
              // tarjeta se dibujan por fuera, y el `overflow-hidden` de arriba
              // los cortaría.
              className={`carrusel-tanda grid w-full shrink-0 grid-cols-2 content-start gap-3 px-1.5 py-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 ${
                entrada === "cascada" && t === actual ? "cascada" : ""
              }`}
            >
              {tanda.map((item, i) => (
                // `--i` escalona la cascada en diagonal: columna más fila. La
                // ola cruza la tanda de izquierda a derecha y las dos filas
                // avanzan juntas, en vez de esperar la segunda a que acabe la
                // primera.
                <li
                  key={i}
                  className="min-w-0"
                  style={{ "--i": (i % columnas) + Math.floor(i / columnas) } as CSSProperties}
                >
                  {item}
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>

      {tandas.length > 1 && (
        <div className="mt-5 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => ir(actual - 1, "izquierda")}
            aria-label="Tanda anterior"
            className="flex size-9 items-center justify-center rounded-full bg-white text-brand-700 ring-1 ring-hairline transition hover:bg-sand"
          >
            <ChevronLeft className="size-4" />
          </button>
          <div className="flex items-center gap-1.5">
            {tandas.map((_, t) => (
              <button
                key={t}
                type="button"
                onClick={() => ir(t, t > actual ? "derecha" : "izquierda")}
                aria-label={`Ver la tanda ${t + 1} de ${tandas.length}`}
                aria-current={t === actual ? "true" : undefined}
                className={`h-2 rounded-full transition-all ${
                  t === actual ? "w-6 bg-brand-700" : "w-2 bg-hairline hover:bg-brand-300"
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => ir(actual + 1, "derecha")}
            aria-label="Tanda siguiente"
            className="flex size-9 items-center justify-center rounded-full bg-white text-brand-700 ring-1 ring-hairline transition hover:bg-sand"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
