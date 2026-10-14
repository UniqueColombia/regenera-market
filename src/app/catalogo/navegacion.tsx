"use client";

import { createContext, useContext, useTransition, type ReactNode, type TransitionStartFunction } from "react";
import { ID_RESULTADOS } from "./ancla";

/**
 * Lo que comparten las categorías y los resultados del catálogo: si hay una
 * búsqueda en camino, y cómo llevar a la persona hasta lo que encontró.
 *
 * ## Por qué existe
 *
 * Observación de beta del 2026-10-14, en el teléfono: al tocar una subcategoría
 * («Reutilización») el catálogo sí se filtraba, pero **los resultados quedaban
 * debajo de las ocho tarjetas de categoría y del formulario**, y había que bajar
 * pasándolos todos para saber si el toque había hecho algo. Ahora el toque lleva
 * a los resultados en el acto, y mientras el servidor contesta se ven atenuados,
 * con «Buscando ofertas…» en lugar del conteo viejo.
 *
 * La transición vive aquí, y no en `Categorias`, para que `Resultados` —que está
 * en otra parte de la página— sepa cuándo hay una búsqueda pendiente.
 */
const Contexto = createContext<{ pendiente: boolean; iniciar: TransitionStartFunction }>({
  pendiente: false,
  iniciar: (accion) => void accion(),
});

/** El contenedor de la página del catálogo, con la transición compartida dentro. */
export function NavegacionCatalogo({ className, children }: { className?: string; children: ReactNode }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <Contexto value={{ pendiente, iniciar }}>
      <div className={className}>{children}</div>
    </Contexto>
  );
}

export function useNavegacionCatalogo() {
  return useContext(Contexto);
}

/**
 * Lleva la pantalla hasta los resultados. Si su comienzo ya está a la vista, en
 * la mitad de arriba, no mueve nada: en escritorio suele estarlo, y un salto
 * que no hacía falta desorienta más de lo que ayuda.
 *
 * Con `prefers-reduced-motion` el salto es instantáneo, sin desplazamiento
 * animado (regla de movimiento de `diseno-visual`: apaga, no suaviza).
 */
export function irAResultados() {
  const bloque = document.getElementById(ID_RESULTADOS);
  if (!bloque) return;
  const { top } = bloque.getBoundingClientRect();
  if (top >= 0 && top < window.innerHeight / 2) return;
  const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  bloque.scrollIntoView({ behavior: quieto ? "instant" : "smooth", block: "start" });
}

/**
 * El bloque de resultados: conteo, rejilla y páginas. Recibe todo ya pintado
 * por el servidor; lo único que añade es el estado «buscando».
 *
 * `scroll-mt-20` deja el conteo debajo del encabezado del sitio, que es
 * `sticky` y lo taparía (mismo motivo que en `prosa-legal` de `globals.css`).
 */
export function Resultados({ conteo, children }: { conteo: string; children: ReactNode }) {
  const { pendiente } = useNavegacionCatalogo();
  return (
    <section
      id={ID_RESULTADOS}
      aria-label="Resultados"
      aria-busy={pendiente}
      className="mt-6 scroll-mt-20"
    >
      <p className="text-sm text-muted" aria-live="polite">
        {pendiente ? "Buscando ofertas…" : conteo}
      </p>
      <div
        className={`transition-opacity duration-200 motion-reduce:transition-none ${
          pendiente ? "pointer-events-none opacity-50" : ""
        }`}
      >
        {children}
      </div>
    </section>
  );
}
