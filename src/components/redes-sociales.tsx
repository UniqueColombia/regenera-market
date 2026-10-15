import { ArrowUpRight } from "lucide-react";
import { IconoRed } from "./iconos-redes";
import { redesParaMostrar } from "@/lib/legal";

/**
 * Los íconos de las redes de Seregenera, en tres lugares: el pie, el
 * desplegable «Síguenos» del encabezado y el final del menú del teléfono.
 *
 * Se ven siempre (Jesús, 2026-10-15). **La red que todavía no tiene dirección
 * en `REDES` sale como «pronto» y no es un enlace**: un `<span>` con su nombre
 * para lectores de pantalla, un poco más apagado y sin reacción al pasar el
 * puntero. En cuanto se escribe la dirección en `src/lib/legal.ts`, ese mismo
 * ícono pasa a ser un enlace que abre el perfil en otra pestaña, sin tocar
 * nada aquí.
 *
 * Es neutral (ni servidor ni cliente): la usan el pie, que es de servidor, y el
 * encabezado, que es de cliente.
 */

/** ¿Hay alguna con dirección? Si no, quien muestra la lista dice que abren pronto. */
export function hayRedesActivas(): boolean {
  return redesParaMostrar().some((r) => r.url);
}

/**
 * Fila de círculos. `oscuro` sobre el verde del pie; `claro` sobre blanco (el
 * menú del teléfono).
 */
export function FilaRedes({ fondo }: { fondo: "oscuro" | "claro" }) {
  const base = "grid size-10 place-items-center rounded-full ring-1 transition";
  const activa =
    fondo === "oscuro"
      ? "text-brand-200 ring-brand-700 hover:bg-brand-800 hover:text-white active:text-white"
      : "text-brand-700 ring-control hover:bg-sand active:bg-sand";
  const pendiente = fondo === "oscuro" ? "text-brand-300/70 ring-brand-800" : "text-muted ring-hairline";

  return (
    <ul className="flex flex-wrap gap-2" aria-label="Seregenera en redes">
      {redesParaMostrar().map((r) => (
        <li key={r.red}>
          {r.url ? (
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer me"
              aria-label={`Seregenera en ${r.nombre}`}
              title={r.nombre}
              className={`${base} ${activa}`}
            >
              <IconoRed red={r.red} className="size-[1.125rem]" />
            </a>
          ) : (
            <span
              role="img"
              aria-label={`${r.nombre}: pronto`}
              title={`${r.nombre} — pronto`}
              className={`${base} ${pendiente} cursor-default`}
            >
              <IconoRed red={r.red} className="size-[1.125rem]" />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Lista con nombre, para el desplegable «Síguenos» del encabezado. Una columna:
 * en dos, la etiqueta «Pronto» cortaba los nombres («I…», «F…»).
 */
export function ListaRedes() {
  return (
    <ul className="space-y-0.5">
      {redesParaMostrar().map((r) => (
        <li key={r.red}>
          {r.url ? (
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer me"
              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-ink transition-colors hover:bg-sand hover:text-brand-700 active:bg-sand"
            >
              <IconoRed red={r.red} className="size-4 shrink-0 text-brand-700" />
              <span className="min-w-0 flex-1 truncate">{r.nombre}</span>
              <ArrowUpRight className="size-3.5 shrink-0 text-muted" aria-hidden />
            </a>
          ) : (
            <span className="flex cursor-default items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted">
              <IconoRed red={r.red} className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{r.nombre}</span>
              <span className="rounded-full bg-sand px-1.5 py-px text-[0.625rem] font-medium uppercase tracking-wide">
                Pronto
              </span>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
