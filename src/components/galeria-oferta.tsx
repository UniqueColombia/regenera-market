"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { FotoOferta } from "./foto-oferta";

/**
 * Todas las fotos de una oferta, en su ficha.
 *
 * Hasta el 2026-10-14 la ficha enseñaba solo la primera aunque el proveedor
 * hubiera subido seis. Es el sitio donde un comprador decide, y donde más
 * importa ver el producto por todos lados.
 *
 * **La pista es un desplazamiento horizontal con `scroll-snap`, no un carrusel
 * que cambie el `src`.** Así el gesto de deslizar en el teléfono es el del
 * propio navegador —con su inercia, sin librerías y sin pelearse con el scroll
 * vertical—, funciona sin JavaScript, y todas las fotos están en el HTML para
 * quien las lea con un lector de pantalla. Las flechas y las miniaturas solo
 * mueven esa pista.
 *
 * La primera va con `priority`: es la del LCP, igual que cuando era la única.
 * Las demás cargan perezosas, cuando la pista se acerca a ellas.
 *
 * Con `prefers-reduced-motion` el salto es inmediato en vez de deslizarse.
 */
export function GaleriaOferta({
  fotos,
  titulo,
  sizes,
}: {
  fotos: string[];
  titulo: string;
  sizes: string;
}) {
  const pista = useRef<HTMLDivElement>(null);
  const [activa, setActiva] = useState(0);
  const total = fotos.length;

  function ir(i: number) {
    const el = pista.current;
    if (!el) return;
    const destino = (i + total) % total;
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: destino * el.clientWidth, behavior: quieto ? "auto" : "smooth" });
  }

  function alDesplazar() {
    const el = pista.current;
    if (!el || el.clientWidth === 0) return;
    setActiva(Math.min(total - 1, Math.round(el.scrollLeft / el.clientWidth)));
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl bg-sand">
        <div
          ref={pista}
          onScroll={alDesplazar}
          tabIndex={0}
          role="region"
          aria-roledescription="galería"
          aria-label={`Fotos de ${titulo}`}
          className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
        >
          {fotos.map((src, i) => (
            <div
              key={`${i}-${src}`}
              role="group"
              aria-roledescription="foto"
              aria-label={`${i + 1} de ${total}`}
              className="relative aspect-3/2 w-full shrink-0 snap-center"
            >
              <FotoOferta
                src={src}
                alt={i === 0 ? titulo : `${titulo}, foto ${i + 1} de ${total}`}
                sizes={sizes}
                priority={i === 0}
              />
            </div>
          ))}
        </div>

        {/* En el teléfono se desliza con el dedo; las flechas son para el ratón. */}
        <button
          type="button"
          onClick={() => ir(activa - 1)}
          aria-label="Foto anterior"
          data-tema-fijo
          className="absolute left-3 top-1/2 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink shadow-sm ring-1 ring-ink/10 transition hover:bg-white sm:grid"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => ir(activa + 1)}
          aria-label="Foto siguiente"
          data-tema-fijo
          className="absolute right-3 top-1/2 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink shadow-sm ring-1 ring-ink/10 transition hover:bg-white sm:grid"
        >
          <ChevronRight className="size-5" aria-hidden />
        </button>

        <span
          data-tema-fijo
          aria-live="polite"
          className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-ink/60 px-2.5 py-1 text-xs font-medium tabular-nums text-white backdrop-blur-sm"
        >
          {activa + 1} / {total}
        </span>
      </div>

      {/* `p-1` porque una lista que desplaza en horizontal recorta también en
          vertical, y el anillo de la miniatura activa va por fuera de la caja
          (mismo problema que en `nav-admin.tsx`). */}
      <ul className="no-scrollbar -mx-1 mt-2 flex gap-2 overflow-x-auto p-1">
        {fotos.map((src, i) => (
          <li key={`${i}-${src}`} className="shrink-0">
            <button
              type="button"
              onClick={() => ir(i)}
              aria-label={`Ver foto ${i + 1} de ${total}`}
              aria-current={i === activa ? "true" : undefined}
              className={`relative block h-14 w-[4.5rem] overflow-hidden rounded-lg bg-sand ring-2 transition sm:h-16 sm:w-20 ${
                i === activa ? "ring-brand-600" : "opacity-70 ring-transparent hover:opacity-100"
              }`}
            >
              <FotoOferta src={src} alt="" sizes="80px" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
