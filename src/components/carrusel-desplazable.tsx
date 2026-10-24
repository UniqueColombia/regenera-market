"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

/** Cada cuánto avanza solo. Menos de cinco segundos no da a leer una tarjeta. */
const INTERVALO_MS = 6000;
/** Cuánto espera tras tocarlo, desplazarlo o usar las flechas antes de volver a moverse solo. */
const RESPIRO_MS = 12000;

/**
 * Una fila de tarjetas que se desplaza de lado, avanza sola y tiene barra de
 * desplazamiento (pedido de Jesús, 2026-10-23, para las ofertas de un
 * proveedor: «se ven de a dos y continúa hacia abajo, lo que hace eterna la
 * página»).
 *
 * **Desplazamiento nativo, no `transform`.** A diferencia de `CarruselOfertas`
 * (la portada, por tandas), aquí la fila es un contenedor con
 * `overflow-x: auto` y `scroll-snap`: se arrastra con el dedo, con la rueda
 * horizontal o con la barra, y cada tarjeta se detiene en su sitio. Las flechas,
 * los puntos y el avance solo mueven ese mismo desplazamiento.
 *
 * **Se queda quieto cuando alguien lo está usando**: con el cursor o el foco
 * dentro, durante `RESPIRO_MS` después de tocarlo, fuera de la pantalla, con la
 * pestaña oculta y siempre con `prefers-reduced-motion`. Y tiene botón de pausa:
 * un contenido que se mueve solo más de cinco segundos tiene que poder
 * detenerse (WCAG 2.2.2).
 *
 * Las tarjetas llegan pintadas por el servidor: todas están en el HTML, así que
 * un buscador las ve aunque una persona solo vea dos.
 */
export function CarruselDesplazable({ items, etiqueta }: { items: ReactNode[]; etiqueta: string }) {
  const pista = useRef<HTMLUListElement>(null);
  const [pagina, setPagina] = useState(0);
  const [paginas, setPaginas] = useState(1);
  const [enPausa, setEnPausa] = useState(false);
  const ocupado = useRef(false); // cursor o foco dentro
  const visible = useRef(true);
  const ultimoUso = useRef(0);

  const medir = useCallback(() => {
    const el = pista.current;
    if (!el || el.clientWidth === 0) return;
    setPaginas(Math.max(1, Math.round(el.scrollWidth / el.clientWidth)));
    const alFinal = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
    setPagina(alFinal ? Math.round(el.scrollWidth / el.clientWidth) - 1 : Math.round(el.scrollLeft / el.clientWidth));
  }, []);

  const ir = useCallback((n: number, porUsuario: boolean) => {
    const el = pista.current;
    if (!el) return;
    if (porUsuario) ultimoUso.current = Date.now();
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: n * el.clientWidth, behavior: quieto ? "auto" : "smooth" });
  }, []);

  // Medir al montar y cada vez que cambia el ancho (girar el teléfono, abrir
  // el panel lateral): cuántas páginas hay depende de cuántas tarjetas caben.
  useEffect(() => {
    const el = pista.current;
    if (!el) return;
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, [medir]);

  // Solo se mueve si se está viendo: un carrusel que avanza fuera de la
  // pantalla gasta batería y, al volver, ya no está donde se dejó.
  useEffect(() => {
    const el = pista.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const observador = new IntersectionObserver(([e]) => (visible.current = e.isIntersecting), { threshold: 0.3 });
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  useEffect(() => {
    if (enPausa || paginas <= 1) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const reloj = window.setInterval(() => {
      const el = pista.current;
      if (!el || ocupado.current || !visible.current || document.hidden) return;
      if (Date.now() - ultimoUso.current < RESPIRO_MS) return;
      const alFinal = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
      ir(alFinal ? 0 : Math.round(el.scrollLeft / el.clientWidth) + 1, false);
    }, INTERVALO_MS);
    return () => window.clearInterval(reloj);
  }, [enPausa, paginas, ir]);

  const usado = () => (ultimoUso.current = Date.now());

  return (
    <div
      role="region"
      aria-roledescription="carrusel"
      aria-label={etiqueta}
      onMouseEnter={() => (ocupado.current = true)}
      onMouseLeave={() => (ocupado.current = false)}
      onFocus={() => (ocupado.current = true)}
      onBlur={() => (ocupado.current = false)}
    >
      <ul
        ref={pista}
        onScroll={medir}
        onPointerDown={usado}
        onWheel={usado}
        onTouchStart={usado}
        // `py-2 px-1`: el salto y la sombra de la tarjeta al pasar por encima
        // se dibujan por fuera, y un contenedor con desplazamiento los corta.
        // `barra-desplazamiento` (globals.css): la barra fina en verde.
        className="grupo-foco barra-desplazamiento flex snap-x snap-mandatory gap-5 overflow-x-auto px-1 pt-2 pb-4"
      >
        {items.map((item, i) => (
          // 85 % en el teléfono, para que asome la siguiente y se entienda que
          // hay más hacia el lado; dos por vista desde 640 px.
          <li key={i} className="flex w-[85%] shrink-0 snap-start sm:w-[calc((100%-1.25rem)/2)] [&>*]:flex-1">
            {item}
          </li>
        ))}
      </ul>

      {paginas > 1 && (
        <div className="mt-3 flex justify-center">
          <div className="flex items-center gap-2.5 rounded-full bg-white p-1.5 shadow-sm ring-1 ring-hairline">
            <button
              type="button"
              onClick={() => ir(pagina - 1 < 0 ? paginas - 1 : pagina - 1, true)}
              aria-label="Anteriores"
              className="group/flecha flex size-9 items-center justify-center rounded-full bg-brand-700 text-white shadow-sm transition hover:bg-brand-800 active:scale-90"
            >
              <ChevronLeft className="size-4 transition group-hover/flecha:-translate-x-0.5" />
            </button>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: paginas }, (_, t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => ir(t, true)}
                  aria-label={`Ir al grupo ${t + 1} de ${paginas}`}
                  aria-current={t === pagina ? "true" : undefined}
                  className={`h-2.5 rounded-full transition-all duration-300 ${
                    t === pagina ? "w-8 bg-brand-600" : "w-2.5 bg-brand-200 hover:bg-brand-400"
                  }`}
                />
              ))}
            </div>
            <span className="min-w-10 text-center text-xs font-semibold text-brand-700 tabular-nums">
              {pagina + 1} / {paginas}
            </span>
            <button
              type="button"
              onClick={() => setEnPausa((p) => !p)}
              aria-label={enPausa ? "Que avance solo" : "Detener el avance automático"}
              aria-pressed={enPausa}
              className="flex size-9 items-center justify-center rounded-full text-brand-700 ring-1 ring-hairline transition hover:bg-sand"
            >
              {enPausa ? <Play className="size-4" /> : <Pause className="size-4" />}
            </button>
            <button
              type="button"
              onClick={() => ir(pagina + 1 >= paginas ? 0 : pagina + 1, true)}
              aria-label="Siguientes"
              className="group/flecha flex size-9 items-center justify-center rounded-full bg-brand-700 text-white shadow-sm transition hover:bg-brand-800 active:scale-90"
            >
              <ChevronRight className="size-4 transition group-hover/flecha:translate-x-0.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
