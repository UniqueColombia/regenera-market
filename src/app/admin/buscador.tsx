import Link from "next/link";
import { Search, X } from "lucide-react";

/**
 * El buscador de las listas del panel (2026-10-23): ofertas, órdenes,
 * proveedores, usuarios, postulaciones, reseñas y comunidad.
 *
 * Un formulario GET, como los filtros del catálogo (invariante 19): la búsqueda
 * queda en la URL (`?q=`), se puede recargar y compartir, y funciona sin
 * JavaScript. `conservar` lleva los demás filtros de la pantalla (el estado
 * elegido, por ejemplo) para que buscar no los borre; la página no se conserva,
 * porque con otra búsqueda la página 4 puede no existir.
 *
 * Server Component: no tiene estado.
 */
export function BuscadorAdmin({
  ruta,
  q,
  placeholder,
  conservar = {},
}: {
  ruta: string;
  q?: string;
  placeholder: string;
  conservar?: Record<string, string | undefined>;
}) {
  const otros = Object.entries(conservar).filter((e): e is [string, string] => Boolean(e[1]));
  const limpiar = otros.length ? `${ruta}?${new URLSearchParams(otros)}` : ruta;

  return (
    <form role="search" action={ruta} className="mt-6 flex max-w-2xl flex-wrap items-center gap-2">
      {otros.map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label className="relative min-w-56 flex-1">
        <span className="sr-only">Buscar</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={placeholder}
          maxLength={100}
          className="w-full rounded-full border border-control bg-white py-2 pl-10 pr-4 text-sm outline-none focus:border-brand-500"
        />
      </label>
      <button
        type="submit"
        className="rounded-full bg-brand-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-800"
      >
        Buscar
      </button>
      {q && (
        <Link
          href={limpiar}
          className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm text-muted transition hover:bg-sand hover:text-ink"
        >
          <X className="size-4" aria-hidden />
          Limpiar
        </Link>
      )}
    </form>
  );
}
