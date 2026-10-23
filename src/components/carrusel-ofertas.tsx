"use client";

import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
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

  if (tandas.length === 0) return null;

  function ir(n: number) {
    setPedida((n + tandas.length) % tandas.length);
  }

  return (
    <div role="region" aria-roledescription="carrusel" aria-label={etiqueta}>
      <div
        className="overflow-hidden"
        onTouchStart={(e) => (toque.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (toque.current === null) return;
          const dx = e.changedTouches[0].clientX - toque.current;
          toque.current = null;
          if (Math.abs(dx) > 50 && tandas.length > 1) ir(actual + (dx < 0 ? 1 : -1));
        }}
      >
        <div
          className="flex transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(-${actual * 100}%)` }}
        >
          {tandas.map((tanda, t) => (
            <ul
              key={t}
              inert={t !== actual}
              aria-label={`Tanda ${t + 1} de ${tandas.length}`}
              // `px-1 py-1`: el anillo y la sombra del hover de la tarjeta se
              // dibujan por fuera, y el `overflow-hidden` de arriba los cortaría.
              className="grid w-full shrink-0 grid-cols-2 content-start gap-3 px-1 py-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
            >
              {tanda.map((item, i) => (
                <li key={i} className="min-w-0">
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
            onClick={() => ir(actual - 1)}
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
                onClick={() => ir(t)}
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
            onClick={() => ir(actual + 1)}
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
