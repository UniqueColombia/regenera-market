import type { Metadata } from "next";
import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { ListingCard } from "@/components/listing-card";
import { getProviderById, searchListings } from "@/lib/repo";
import {
  CATEGORIES,
  CERTIFICATIONS,
  DEPARTMENTS,
  KIND_LABEL,
  TIERS,
  VERTICALS,
} from "@/lib/taxonomy";
import type { ListingFilters, ListingKind, Tier, Vertical } from "@/lib/types";

export const metadata: Metadata = {
  title: "Catálogo",
  description:
    "Productos, experiencias y servicios regenerativos de proveedores colombianos verificados, filtrables por vertical turística, categoría, departamento y nivel de verificación.",
};

/**
 * El filtro es un formulario GET, no estado de cliente: cada combinación queda
 * en una URL compartible e indexable. Para un marketplace que necesita tráfico
 * orgánico, eso vale más que la fluidez de filtrar sin recargar.
 */
export default async function CatalogoPage(props: PageProps<"/catalogo">) {
  const sp = await props.searchParams;
  const filters = parseFilters(sp);

  const listings = await searchListings(filters);
  const providers = await Promise.all(
    listings.map((l) => getProviderById(l.providerId)),
  );

  const activeCount = countActive(filters);

  return (
    <div className="container-page py-10">
      <header>
        <h1 className="font-display text-3xl text-ink sm:text-4xl">
          Catálogo regenerativo
        </h1>
        <p className="mt-2 max-w-2xl text-muted">
          Cada oferta pertenece a un proveedor verificado y muestra el impacto
          que evita por unidad.
        </p>
      </header>

      <form
        method="get"
        className="mt-8 rounded-xl bg-white p-5 ring-1 ring-hairline"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-lg text-ink">
            <SlidersHorizontal className="size-4 text-brand-600" />
            Filtrar
          </h2>
          {activeCount > 0 && (
            <Link
              href="/catalogo"
              className="text-sm text-muted underline hover:text-brand-700"
            >
              Limpiar {activeCount} {activeCount === 1 ? "filtro" : "filtros"}
            </Link>
          )}
        </div>

        <div className="mt-4 grid gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
          <Field label="Buscar" htmlFor="q" className="min-[420px]:col-span-2 lg:col-span-1">
            <input
              id="q"
              name="q"
              defaultValue={filters.q ?? ""}
              placeholder="Nombre, material, lugar…"
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </Field>

          <Field label="Tipo de oferta" htmlFor="kind">
            <Select id="kind" name="kind" defaultValue={filters.kind ?? ""}>
              <option value="">Todos</option>
              {(Object.keys(KIND_LABEL) as ListingKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Tipo de negocio" htmlFor="vertical">
            <Select
              id="vertical"
              name="vertical"
              defaultValue={filters.vertical ?? ""}
            >
              <option value="">Todos</option>
              {VERTICALS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Categoría" htmlFor="category">
            <Select
              id="category"
              name="category"
              defaultValue={filters.category ?? ""}
            >
              <option value="">Todas</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Departamento" htmlFor="department">
            <Select
              id="department"
              name="department"
              defaultValue={filters.department ?? ""}
            >
              <option value="">Todos</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Nivel de verificación" htmlFor="tier">
            <Select id="tier" name="tier" defaultValue={filters.tier ?? ""}>
              <option value="">Cualquiera</option>
              {(["semilla", "raiz", "bosque"] as const).map((t) => (
                <option key={t} value={t}>
                  {TIERS[t].label} o superior
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Certificación" htmlFor="certification">
            <Select
              id="certification"
              name="certification"
              defaultValue={filters.certification ?? ""}
            >
              <option value="">Cualquiera</option>
              {Object.entries(CERTIFICATIONS).map(([code, c]) => (
                <option key={code} value={code}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Ordenar por" htmlFor="sort">
            <Select id="sort" name="sort" defaultValue={filters.sort ?? ""}>
              <option value="">Relevancia</option>
              <option value="price_asc">Menor precio</option>
              <option value="price_desc">Mayor precio</option>
              <option value="impact">Mayor impacto</option>
              <option value="newest">Más recientes</option>
            </Select>
          </Field>
        </div>

        <button
          type="submit"
          className="mt-4 rounded-full bg-brand-700 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
        >
          Aplicar filtros
        </button>
      </form>

      <p className="mt-6 text-sm text-muted" aria-live="polite">
        {listings.length}{" "}
        {listings.length === 1 ? "oferta encontrada" : "ofertas encontradas"}
      </p>

      {listings.length === 0 ? (
        <div className="mt-6 rounded-xl bg-white p-10 text-center ring-1 ring-hairline">
          <p className="font-display text-xl text-ink">
            Nada coincide con esa búsqueda
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            El catálogo todavía es pequeño y estamos sumando proveedores cada
            semana. Prueba con menos filtros, o cuéntanos qué estás buscando.
          </p>
          <Link
            href="/catalogo"
            className="mt-5 inline-block rounded-full bg-brand-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-800"
          >
            Ver todo el catálogo
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing, i) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              provider={providers[i]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  className = "",
  children,
}: {
  label: string;
  htmlFor: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-xs font-medium text-muted"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function Select(props: React.ComponentProps<"select">) {
  return (
    <select
      {...props}
      className="w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
    />
  );
}

/** Niveles que se pueden filtrar: "sin verificar" no se ofrece como opción. */
const FILTERABLE_TIERS = ["semilla", "raiz", "bosque"] as const;

/** Toma un valor de searchParams (que puede venir repetido) y lo deja en string. */
function one(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.length > 0 ? s : undefined;
}

function parseFilters(
  sp: Record<string, string | string[] | undefined>,
): ListingFilters {
  const kind = one(sp.kind);
  const vertical = one(sp.vertical);
  const tier = one(sp.tier);
  const sort = one(sp.sort);

  return {
    q: one(sp.q),
    kind: (["product", "experience", "service"] as const).includes(
      kind as ListingKind,
    )
      ? (kind as ListingKind)
      : undefined,
    vertical: VERTICALS.some((v) => v.id === vertical)
      ? (vertical as Vertical)
      : undefined,
    category: one(sp.category),
    department: one(sp.department),
    tier: FILTERABLE_TIERS.includes(tier as (typeof FILTERABLE_TIERS)[number])
      ? (tier as Tier)
      : undefined,
    certification: one(sp.certification),
    sort: (
      ["price_asc", "price_desc", "impact", "newest", "relevance"] as const
    ).includes(sort as NonNullable<ListingFilters["sort"]>)
      ? (sort as ListingFilters["sort"])
      : undefined,
  };
}

function countActive(f: ListingFilters): number {
  return Object.values(f).filter((v) => v !== undefined).length;
}
