import Link from "next/link";
import { FileSpreadsheet, Plus } from "lucide-react";

/**
 * «¿Una oferta o varias?», arriba de «Nueva oferta» y de «Cargar desde Excel».
 *
 * La carga masiva existía pero se llegaba a ella por «Ver todas» → «Cargar
 * desde Excel»: quien abría «Nueva oferta» con veinte productos por subir
 * llenaba el formulario veinte veces sin saber que había otro camino. Este
 * selector está en las dos pantallas, así que desde cualquiera se pasa a la
 * otra de un clic. Es de servidor: son dos enlaces, no estado.
 */
export function ElegirCantidadOfertas({
  activa,
  hrefUna,
  hrefVarias,
}: {
  activa: "una" | "varias";
  hrefUna: string;
  hrefVarias: string;
}) {
  const base =
    "flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition sm:flex-none";
  const sel = "bg-brand-700 text-white";
  const libre = "text-brand-700 hover:bg-sand";

  return (
    <nav
      aria-label="Cuántas ofertas vas a publicar"
      className="mt-6 inline-flex w-full max-w-md gap-1 rounded-full bg-white p-1 ring-1 ring-control sm:w-auto"
    >
      <Link
        href={hrefUna}
        aria-current={activa === "una" ? "page" : undefined}
        className={`${base} ${activa === "una" ? sel : libre}`}
      >
        <Plus className="size-4" aria-hidden />
        Una oferta
      </Link>
      <Link
        href={hrefVarias}
        aria-current={activa === "varias" ? "page" : undefined}
        className={`${base} ${activa === "varias" ? sel : libre}`}
      >
        <FileSpreadsheet className="size-4" aria-hidden />
        Varias desde Excel
      </Link>
    </nav>
  );
}
