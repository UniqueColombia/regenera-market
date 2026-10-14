import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { numerosDePagina, urlDePagina } from "@/lib/paginacion";

/**
 * La barra de páginas: enlaces de verdad, no botones. Cada página es una URL
 * (`?pagina=3`) que conserva los filtros, así que funciona sin JavaScript, el
 * botón atrás vuelve a la página anterior y un buscador puede seguirla.
 *
 * Server Component: no tiene estado. Con una sola página no pinta nada.
 *
 * `ancla`: el `id` adonde aterriza cada página. En el catálogo, sin él, la
 * página 2 abría arriba de todo y había que volver a bajar pasando las
 * categorías y el formulario hasta llegar a las ofertas.
 */
export function Paginacion({
  ruta,
  params,
  pagina,
  paginas,
  ancla,
}: {
  ruta: string;
  params: Record<string, string | string[] | undefined>;
  pagina: number;
  paginas: number;
  ancla?: string;
}) {
  if (paginas <= 1) return null;
  const url = (n: number) => urlDePagina(ruta, params, n) + (ancla ? `#${ancla}` : "");

  // 40 px de alto: es el mínimo con el que se acierta con el pulgar sin mirar.
  const base = "grid h-10 min-w-10 place-items-center rounded-full px-3 text-sm tabular-nums transition";

  return (
    <nav aria-label="Páginas" className="mt-10 flex flex-wrap items-center justify-center gap-1">
      {pagina > 1 ? (
        <Link href={url(pagina - 1)} rel="prev" className={`${base} gap-1 text-brand-700 hover:bg-brand-50`}>
          <span className="flex items-center gap-1">
            <ChevronLeft className="size-4" aria-hidden />
            <span className="max-sm:sr-only">Anterior</span>
          </span>
        </Link>
      ) : (
        <span className={`${base} text-muted opacity-40`} aria-hidden>
          <ChevronLeft className="size-4" />
        </span>
      )}

      {numerosDePagina(pagina, paginas).map((n, i) =>
        n === null ? (
          <span key={`salto-${i}`} className="px-1 text-muted" aria-hidden>
            …
          </span>
        ) : n === pagina ? (
          <span key={n} aria-current="page" className={`${base} bg-brand-700 font-semibold text-white`}>
            {n}
          </span>
        ) : (
          <Link key={n} href={url(n)} aria-label={`Página ${n}`} className={`${base} text-ink hover:bg-brand-50`}>
            {n}
          </Link>
        ),
      )}

      {pagina < paginas ? (
        <Link href={url(pagina + 1)} rel="next" className={`${base} text-brand-700 hover:bg-brand-50`}>
          <span className="flex items-center gap-1">
            <span className="max-sm:sr-only">Siguiente</span>
            <ChevronRight className="size-4" aria-hidden />
          </span>
        </Link>
      ) : (
        <span className={`${base} text-muted opacity-40`} aria-hidden>
          <ChevronRight className="size-4" />
        </span>
      )}
    </nav>
  );
}
