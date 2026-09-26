import Link from "next/link";
import { ArrowRight, ChevronDown, Sprout } from "lucide-react";
import { TierBadge } from "@/components/tier-badge";
import {
  EXPERIENCIA,
  NIVELES,
  comisionEnPorcentaje,
  eventoExperiencia,
} from "@/lib/niveles";
import { GIROS, GIROS_POR_NIVEL } from "@/lib/taxonomy";

/**
 * Los niveles, de un vistazo, sin salir de la Comunidad.
 *
 * Aquí se pregunta mucho «¿cuánto me da publicar?» y «¿qué es Raíz?», y la
 * respuesta estaba a una página de distancia (`/niveles`) sin ningún enlace que
 * llevara a ella. Esto es el resumen: los tres niveles con lo que cuesta
 * llegar, lo que baja la comisión y cuántos giros abren, más las cinco cosas
 * que más suman. El detalle completo sigue en `/niveles`.
 *
 * Es un `<details>` y no un componente de cliente: se abre y se cierra sin
 * JavaScript, con teclado, y el lector de pantalla anuncia si está abierto. El
 * contenido sale de `src/lib/niveles.ts`, así que no hay un número escrito a mano
 * que se pueda quedar viejo.
 */
export function NivelesRapido() {
  const queMasSuma = [...EXPERIENCIA].sort((a, b) => b.puntos - a.puntos).slice(0, 5);
  const publicar = eventoExperiencia("articulo_publicado");

  return (
    <details className="group rounded-xl bg-white ring-1 ring-hairline [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl p-5 transition hover:bg-sand">
        <span className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
            <Sprout className="size-5" aria-hidden />
          </span>
          <span>
            <span className="block font-display text-lg text-ink">
              ¿Cómo se sube de nivel?
            </span>
            <span className="block text-sm text-muted">
              Semilla, Raíz y Bosque: qué da cada uno y qué suma puntos.
              Publicar aquí a nombre de tu empresa suma {publicar.puntos}.
            </span>
          </span>
        </span>
        <ChevronDown
          className="size-5 shrink-0 text-muted transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden
        />
      </summary>

      <div className="animate-desplegar border-t border-hairline p-5 motion-reduce:animate-none">
        <ol className="grid gap-3 sm:grid-cols-3">
          {NIVELES.map((n) => (
            <li key={n.id} className="rounded-xl bg-cream p-4 ring-1 ring-hairline">
              <TierBadge tier={n.id} />
              <p className="mt-3 text-sm text-ink">{n.resumen}</p>
              <dl className="mt-3 space-y-1 text-xs text-muted">
                <div className="flex justify-between gap-2">
                  <dt>Desde</dt>
                  <dd className="tabular-nums text-ink">
                    {n.minPuntos.toLocaleString("es-CO")} puntos
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Comisión</dt>
                  <dd className="tabular-nums text-ink">{comisionEnPorcentaje(n.comision)} %</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Giros a la vez</dt>
                  <dd className="tabular-nums text-ink">
                    {GIROS_POR_NIVEL[n.id] >= GIROS.length ? "Todos" : GIROS_POR_NIVEL[n.id]}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>

        <h3 className="mt-6 font-display text-base text-ink">Lo que más suma</h3>
        <ul className="mt-2 divide-y divide-hairline text-sm">
          {queMasSuma.map((e) => (
            <li key={e.clave} className="flex items-baseline justify-between gap-3 py-2">
              <span className="text-ink">{e.titulo}</span>
              <span className="shrink-0 font-display tabular-nums text-brand-700">
                +{e.puntos}
              </span>
            </li>
          ))}
        </ul>

        <Link
          href="/niveles"
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 underline-offset-4 hover:underline"
        >
          Ver todos los niveles y cómo se obtiene cada punto
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </details>
  );
}
