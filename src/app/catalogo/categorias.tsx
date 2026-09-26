import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";
import { IconoCategoria } from "@/components/icono-categoria";
import { CATEGORIAS, categoriaPorId } from "@/lib/taxonomy";
import type { ListingFilters } from "@/lib/types";

/**
 * Las categorías del catálogo como puerta de entrada, no como un desplegable.
 *
 * Antes la categoría era una de ocho listas desplegables del formulario, con
 * nombres como «Tecnología» o «Servicios» que no decían qué había dentro. Aquí
 * cada una es una tarjeta con su icono, y **al pasar por encima dice a qué hace
 * referencia** y qué subcategorías agrupa: «Agua» es ahorro, tratamiento,
 * reutilización, captación y monitoreo.
 *
 * ## Sin JavaScript
 *
 * Es de servidor. La descripción flotante es CSS (`group-hover` y
 * `group-focus-visible`), así que llega también con teclado —al tabular sobre la
 * tarjeta— y no hace falta hidratar nada. En un teléfono no hay «pasar por
 * encima»: ahí la descripción va escrita debajo del nombre, recortada a dos
 * líneas, que es lo que sustituye al hover en táctil (regla de paridad de
 * `diseno-visual`).
 *
 * Cada tarjeta es un enlace GET que **conserva los demás filtros**: elegir
 * «Energía» después de haber filtrado por hoteles en Antioquia no los borra. Es
 * el contrato de la invariante 19 — cada combinación, una URL.
 */
export function Categorias({ filters }: { filters: ListingFilters }) {
  const activa = categoriaPorId(filters.category);

  return (
    <section aria-labelledby="titulo-categorias" className="mt-8">
      <h2 id="titulo-categorias" className="font-display text-xl text-ink">
        ¿Qué quieres resolver?
      </h2>

      <ul className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {CATEGORIAS.map((c) => {
          const elegida = activa?.id === c.id;
          const href = conFiltros(filters, {
            category: elegida ? undefined : c.id,
            subcategory: undefined,
          });

          return (
            <li key={c.id} className="group relative">
              <Link
                href={href}
                aria-current={elegida ? "true" : undefined}
                aria-describedby={`desc-${c.id}`}
                className={`flex h-full items-start gap-3 rounded-xl p-4 ring-1 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-900/5 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
                  elegida
                    ? "bg-brand-50 ring-brand-400"
                    : "bg-white ring-hairline hover:ring-brand-300"
                }`}
              >
                <span
                  className={`grid size-10 shrink-0 place-items-center rounded-full transition-colors ${
                    elegida
                      ? "bg-brand-600 text-white"
                      : "bg-brand-50 text-brand-600 group-hover:bg-brand-600 group-hover:text-white"
                  }`}
                >
                  {elegida ? (
                    <Check className="size-5" aria-hidden />
                  ) : (
                    <IconoCategoria id={c.id} className="size-5" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 font-display text-base leading-snug text-ink">
                    {c.label}
                    {c.avanzada && (
                      <ShieldCheck
                        className="size-4 shrink-0 text-clay-600"
                        aria-label="Solo proveedores verificados"
                      />
                    )}
                  </span>
                  {/* En táctil no hay hover: la descripción va aquí, corta. */}
                  <span className="mt-1 hidden text-xs leading-snug text-muted [@media(hover:none)]:line-clamp-2">
                    {c.descripcion}
                  </span>
                </span>
              </Link>

              {/* La descripción flotante. `pointer-events-none` para que no
                  robe el clic de la tarjeta de abajo cuando se despliega
                  encima. */}
              <div
                id={`desc-${c.id}`}
                role="tooltip"
                className="pointer-events-none invisible absolute left-0 right-0 top-full z-30 mt-2 translate-y-1 rounded-xl bg-ink p-4 text-left opacity-0 shadow-xl transition duration-150 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 motion-reduce:transition-none"
              >
                <p className="text-sm leading-relaxed text-white">{c.descripcion}</p>
                <p className="mt-2 text-xs text-brand-200">
                  {c.subcategorias.map((s) => s.label).join(" · ")}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {activa && (
        <div className="mt-4 animate-desplegar motion-reduce:animate-none">
          <p className="text-sm text-muted">{activa.descripcion}</p>
          <ul className="mt-3 flex flex-wrap gap-2" aria-label={`Subcategorías de ${activa.label}`}>
            <li>
              <Chip
                href={conFiltros(filters, { subcategory: undefined })}
                activo={!filters.subcategory}
              >
                Todo {activa.label.toLowerCase()}
              </Chip>
            </li>
            {activa.subcategorias.map((s) => (
              <li key={s.id}>
                <Chip
                  href={conFiltros(filters, {
                    subcategory: filters.subcategory === s.id ? undefined : s.id,
                  })}
                  activo={filters.subcategory === s.id}
                >
                  {s.label}
                </Chip>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Chip({
  href,
  activo,
  children,
}: {
  href: string;
  activo: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={activo ? "true" : undefined}
      className={`block rounded-full px-3.5 py-1.5 text-sm transition ${
        activo
          ? "bg-brand-700 font-medium text-white"
          : "bg-white text-ink ring-1 ring-hairline hover:bg-sand hover:text-brand-700"
      }`}
    >
      {children}
    </Link>
  );
}

/** La URL del catálogo con estos filtros, cambiando solo los que se pasan. */
export function conFiltros(
  actuales: ListingFilters,
  cambios: Partial<ListingFilters>,
): string {
  const todos = { ...actuales, ...cambios };
  const sp = new URLSearchParams();
  for (const [clave, valor] of Object.entries(todos)) {
    if (valor !== undefined && valor !== "") sp.set(clave, String(valor));
  }
  const q = sp.toString();
  return q ? `/catalogo?${q}` : "/catalogo";
}
