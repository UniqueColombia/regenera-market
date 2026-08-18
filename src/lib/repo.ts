import { LISTINGS, listingById } from "@/data/listings";
import { PROVIDERS, providerById } from "@/data/providers";
import { TIERS } from "./taxonomy";
import type { Listing, ListingFilters, Provider } from "./types";

/**
 * Acceso a datos del catálogo.
 *
 * Hoy lee de los datos semilla en memoria, por eso el MVP se puede navegar sin
 * ninguna credencial. Las funciones son async a propósito: cuando exista el
 * proyecto de Supabase, cada una se reemplaza por su consulta equivalente
 * (ver supabase/migrations/0001_init.sql) sin tocar ni una página.
 */

const PUBLIC = LISTINGS.filter((l) => l.status === "approved");

function effectiveTier(listing: Listing) {
  return providerById.get(listing.providerId)?.tier ?? "unverified";
}

/** Puntaje de impacto normalizado, para ordenar por "mayor impacto". */
function impactScore(listing: Listing): number {
  const { co2KgSaved = 0, waterLitersSaved = 0, wasteKgReduced = 0 } =
    listing.impact;
  return co2KgSaved + waterLitersSaved / 100 + wasteKgReduced * 2;
}

function matches(listing: Listing, f: ListingFilters): boolean {
  if (f.kind && listing.kind !== f.kind) return false;
  if (f.vertical && !listing.verticals.includes(f.vertical)) return false;
  if (f.category && listing.category !== f.category) return false;
  if (f.department && listing.department !== f.department) return false;
  if (f.certification && !listing.certifications.includes(f.certification))
    return false;
  if (f.minPrice !== undefined && listing.priceCop < f.minPrice) return false;
  if (f.maxPrice !== undefined && listing.priceCop > f.maxPrice) return false;

  if (f.tier) {
    // El filtro por nivel es "de este nivel hacia arriba": quien busca Raíz
    // también quiere ver Bosque.
    const min = TIERS[f.tier].min;
    const provider = providerById.get(listing.providerId);
    if (!provider || provider.sustainabilityScore < min) return false;
  }

  if (f.q) {
    const needle = normalize(f.q);
    const provider = providerById.get(listing.providerId);
    const haystack = normalize(
      [
        listing.title,
        listing.summary,
        listing.description,
        listing.category,
        provider?.name ?? "",
      ].join(" "),
    );
    if (!haystack.includes(needle)) return false;
  }

  return true;
}

/** Quita tildes y baja a minúsculas: "Amazonía" debe encontrarse con "amazonia". */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export async function searchListings(
  filters: ListingFilters = {},
): Promise<Listing[]> {
  const results = PUBLIC.filter((l) => matches(l, filters));

  switch (filters.sort) {
    case "price_asc":
      return results.sort((a, b) => a.priceCop - b.priceCop);
    case "price_desc":
      return results.sort((a, b) => b.priceCop - a.priceCop);
    case "impact":
      return results.sort((a, b) => impactScore(b) - impactScore(a));
    case "newest":
      return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    default:
      // Relevancia por defecto: destacados primero, luego mejor nivel de
      // verificación. Premia al proveedor que sí completó su evaluación.
      return results.sort((a, b) => {
        if (a.featured !== b.featured) return a.featured ? -1 : 1;
        const sa = providerById.get(a.providerId)?.sustainabilityScore ?? 0;
        const sb = providerById.get(b.providerId)?.sustainabilityScore ?? 0;
        return sb - sa;
      });
  }
}

export async function getListingBySlug(
  slug: string,
): Promise<Listing | undefined> {
  return PUBLIC.find((l) => l.slug === slug);
}

export async function getListingsByIds(ids: string[]): Promise<Listing[]> {
  return ids
    .map((id) => listingById.get(id))
    .filter((l): l is Listing => l !== undefined);
}

export async function getFeaturedListings(limit = 6): Promise<Listing[]> {
  const featured = await searchListings({ sort: "relevance" });
  return featured.slice(0, limit);
}

export async function getRelatedListings(
  listing: Listing,
  limit = 3,
): Promise<Listing[]> {
  const sameVertical = PUBLIC.filter(
    (l) =>
      l.id !== listing.id &&
      (l.category === listing.category ||
        l.verticals.some((v) => listing.verticals.includes(v))),
  );
  return sameVertical.slice(0, limit);
}

export async function getProviderBySlug(
  slug: string,
): Promise<Provider | undefined> {
  return PROVIDERS.find((p) => p.slug === slug && p.status === "approved");
}

export async function getProviderById(
  id: string,
): Promise<Provider | undefined> {
  return providerById.get(id);
}

export async function getListingsByProvider(
  providerId: string,
): Promise<Listing[]> {
  return PUBLIC.filter((l) => l.providerId === providerId);
}

export async function getApprovedProviders(): Promise<Provider[]> {
  return PROVIDERS.filter((p) => p.status === "approved").sort(
    (a, b) => b.sustainabilityScore - a.sustainabilityScore,
  );
}

/** Cifras del home. Se calculan del catálogo real, no están escritas a mano. */
export async function getMarketplaceStats() {
  const approved = PROVIDERS.filter((p) => p.status === "approved");
  const departments = new Set(approved.map((p) => p.department));
  const co2 = PUBLIC.reduce((sum, l) => sum + (l.impact.co2KgSaved ?? 0), 0);
  return {
    providers: approved.length,
    listings: PUBLIC.length,
    departments: departments.size,
    co2PerUnit: Math.round(co2),
    verifiedShare: Math.round(
      (approved.filter((p) => p.tier !== "unverified").length /
        approved.length) *
        100,
    ),
  };
}

export { effectiveTier };
