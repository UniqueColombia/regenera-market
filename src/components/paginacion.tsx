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
 *
 * El aspecto (2026-10-23) es el del paginador del carrusel de la portada: una
 * píldora blanca, «Anterior» y «Siguiente» en verde lleno y la página actual
 * marcada en verde claro. Antes eran números sueltos sobre el fondo y la barra
 * se perdía debajo de las tarjetas.
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
  const flecha = `${base} group/flecha bg-brand-700 font-semibold text-white shadow-sm hover:bg-brand-800 active:scale-95`;

  return (
    <nav aria-label="Páginas" className="mt-10 flex justify-center">
      {/* `rounded-xl` en el teléfono: si la barra parte en dos líneas, una
          píldora se deforma y una tarjeta redondeada no. */}
      <div className="flex flex-wrap items-center justify-center gap-1 rounded-xl bg-white sm:rounded-full p-1.5 shadow-sm ring-1 ring-hairline">
        {pagina > 1 ? (
          <Link href={url(pagina - 1)} rel="prev" className={flecha}>
            <span className="flex items-center gap-1">
              <ChevronLeft className="size-4 transition group-hover/flecha:-translate-x-0.5" aria-hidden />
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
            <span key={n} aria-current="page" className={`${base} bg-brand-50 font-semibold text-brand-800 ring-1 ring-brand-300`}>
              {n}
            </span>
          ) : (
            <Link key={n} href={url(n)} aria-label={`Página ${n}`} className={`${base} text-ink hover:bg-sand hover:text-brand-700`}>
              {n}
            </Link>
          ),
        )}

        {pagina < paginas ? (
          <Link href={url(pagina + 1)} rel="next" className={flecha}>
            <span className="flex items-center gap-1">
              <span className="max-sm:sr-only">Siguiente</span>
              <ChevronRight className="size-4 transition group-hover/flecha:translate-x-0.5" aria-hidden />
            </span>
          </Link>
        ) : (
          <span className={`${base} text-muted opacity-40`} aria-hidden>
            <ChevronRight className="size-4" />
          </span>
        )}
      </div>
    </nav>
  );
}
