import { cache } from "react";
import { createClient } from "./supabase/server";
import { nivelesDesde } from "./niveles";
import type {
  AdminUsuario,
  Listing,
  ListingFilters,
  ListingKind,
  Provider,
  ProviderApplication,
  ProviderTrait,
  ReviewStatus,
  Role,
  Tier,
  Vertical,
} from "./types";

/**
 * Acceso a datos del catálogo. Única puerta a los datos.
 *
 * Consulta Postgres. `src/data/` sigue existiendo como semilla de
 * `scripts/seed.mts`, pero este archivo ya no lo importa — que es el criterio de
 * salida del Bloque 1 de `docs/BETA.md`.
 *
 * **Casi todo pasa por la vista `listings_publicos`** (`0003_busqueda.sql`), que
 * une oferta y proveedor y filtra a "aprobado de proveedor aprobado". Tres
 * motivos, y ninguno es comodidad:
 *
 * 1. El orden por defecto premia al proveedor con mejor puntaje, y ese puntaje
 *    vive en `providers`. PostgREST no sabe ordenar la tabla padre por una
 *    columna embebida.
 * 2. El filtro por nivel pasa a ser un `>=` sobre una columna normal.
 * 3. La búsqueda cubre el nombre del proveedor sin una segunda consulta.
 *
 * La vista es la *intención*; la barrera de verdad sigue siendo RLS
 * (`listings_public_read`), que exige lo mismo aunque alguien consulte las
 * tablas directamente.
 */

/** Columnas de `listings_publicos`. La vista es `listings.*` más las del proveedor. */
const COLUMNAS_LISTING = `
  id, slug, provider_id, kind, title, summary, description, category, verticals,
  images, price_cop, wholesale_price_cop, wholesale_min_qty, unit, quote_only,
  stock, co2_kg_saved, water_liters_saved, waste_kg_reduced, certifications,
  department, city, status, featured, duration_hours, min_people, max_people,
  meeting_point, includes, delivery_time, scope, created_at,
  listing_availability(date, slots_total, slots_taken)
`;

const COLUMNAS_PROVIDER = `
  id, slug, name, legal_name, tax_id, tagline, description, logo_url, cover_url,
  department, city, website, email, phone, status, sustainability_score, tier,
  experience_points, sustainability_verified_at, founded_year, traits, created_at,
  provider_certifications(certification_code)
`;

interface FilaDisponibilidad {
  date: string;
  slots_total: number;
  slots_taken: number;
}

interface FilaListing {
  id: string;
  slug: string;
  provider_id: string;
  kind: ListingKind;
  title: string;
  summary: string;
  description: string;
  category: string;
  verticals: Vertical[];
  images: string[];
  price_cop: number;
  wholesale_price_cop: number | null;
  wholesale_min_qty: number | null;
  unit: string;
  quote_only: boolean;
  stock: number | null;
  co2_kg_saved: number | string | null;
  water_liters_saved: number | string | null;
  waste_kg_reduced: number | string | null;
  certifications: string[];
  department: string | null;
  city: string | null;
  status: ReviewStatus;
  featured: boolean;
  duration_hours: number | null;
  min_people: number | null;
  max_people: number | null;
  meeting_point: string | null;
  includes: string[] | null;
  delivery_time: string | null;
  scope: string[] | null;
  created_at: string;
  listing_availability?: FilaDisponibilidad[] | null;
}

interface FilaProvider {
  id: string;
  slug: string;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  tagline: string;
  description: string;
  logo_url: string | null;
  cover_url: string | null;
  department: string;
  city: string;
  website: string | null;
  email: string;
  phone: string | null;
  status: ReviewStatus;
  sustainability_score: number;
  tier: Tier;
  experience_points: number | null;
  sustainability_verified_at: string | null;
  founded_year: number | null;
  traits: ProviderTrait[];
  created_at: string;
  provider_certifications?: { certification_code: string }[] | null;
}

/**
 * `numeric` de Postgres llega como cadena por el driver, para no perder
 * precisión. Aquí son métricas de impacto que se pintan, no dinero, así que
 * pasarlas a número es seguro. **El dinero es `int` en el esquema justamente
 * para no tener que hacer esto** — ver la invariante 5 de `dominio-regenera`.
 */
function numero(v: number | string | null): number | undefined {
  if (v === null) return undefined;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : undefined;
}

/** Una fecha de Postgres puede venir con hora; el dominio la usa como AAAA-MM-DD. */
function soloFecha(v: string): string {
  return v.slice(0, 10);
}

function aListing(f: FilaListing): Listing {
  const cupos = f.listing_availability ?? [];
  return {
    id: f.id,
    slug: f.slug,
    providerId: f.provider_id,
    kind: f.kind,
    title: f.title,
    summary: f.summary,
    description: f.description,
    category: f.category,
    verticals: f.verticals,
    images: f.images,
    priceCop: f.price_cop,
    wholesalePriceCop: f.wholesale_price_cop ?? undefined,
    wholesaleMinQty: f.wholesale_min_qty ?? undefined,
    unit: f.unit,
    quoteOnly: f.quote_only,
    stock: f.stock ?? undefined,
    impact: {
      co2KgSaved: numero(f.co2_kg_saved),
      waterLitersSaved: numero(f.water_liters_saved),
      wasteKgReduced: numero(f.waste_kg_reduced),
    },
    certifications: f.certifications,
    department: f.department ?? undefined,
    city: f.city ?? undefined,
    status: f.status,
    featured: f.featured,
    createdAt: soloFecha(f.created_at),
    experience:
      f.kind === "experience" && f.min_people !== null
        ? {
            durationHours: f.duration_hours ?? 0,
            minPeople: f.min_people,
            maxPeople: f.max_people ?? f.min_people,
            meetingPoint: f.meeting_point ?? "",
            includes: f.includes ?? [],
            // El dominio habla de "cupos que quedan"; la base guarda total y
            // vendidos, que es lo único con lo que se puede impedir sobreventa
            // en una transacción. La resta se hace aquí.
            availability: cupos
              .map((c) => ({
                date: soloFecha(c.date),
                slotsLeft: c.slots_total - c.slots_taken,
              }))
              .sort((a, b) => a.date.localeCompare(b.date)),
          }
        : undefined,
    service:
      f.kind === "service" && f.delivery_time !== null
        ? { deliveryTime: f.delivery_time, scope: f.scope ?? [] }
        : undefined,
  };
}

function aProvider(f: FilaProvider): Provider {
  return {
    id: f.id,
    slug: f.slug,
    name: f.name,
    legalName: f.legal_name ?? undefined,
    taxId: f.tax_id ?? undefined,
    tagline: f.tagline,
    description: f.description,
    logoUrl: f.logo_url ?? undefined,
    coverUrl: f.cover_url ?? undefined,
    department: f.department,
    city: f.city,
    website: f.website ?? undefined,
    email: f.email,
    phone: f.phone ?? undefined,
    status: f.status,
    sustainabilityScore: f.sustainability_score,
    tier: f.tier,
    // `?? 0` y no un error: una fila anterior a la migración 0006 no tiene la
    // columna poblada, y un proveedor sin puntos es exactamente uno de cero.
    experiencePoints: f.experience_points ?? 0,
    evaluacionVerificada: f.sustainability_verified_at !== null,
    certifications: (f.provider_certifications ?? []).map(
      (c) => c.certification_code,
    ),
    foundedYear: f.founded_year ?? undefined,
    traits: f.traits,
    createdAt: soloFecha(f.created_at),
  };
}

/**
 * Quita tildes y baja a minúsculas: "Amazonía" debe encontrarse con "amazonia".
 *
 * Espeja `public.sin_tildes()` de `0003_busqueda.sql`, que es lo que alimenta la
 * columna `busqueda`. Si una cambia sin la otra, el término que escribe el
 * usuario deja de parecerse a lo que hay indexado y la búsqueda empieza a no
 * encontrar cosas que sí están.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** Escapa lo que PostgREST trata como sintaxis dentro de un `ilike`. */
function patron(s: string): string {
  return `%${normalize(s).replace(/[%_,()]/g, " ").trim()}%`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function searchListings(
  filters: ListingFilters = {},
): Promise<Listing[]> {
  const db = await createClient();
  let q = db.from("listings_publicos").select(COLUMNAS_LISTING);

  if (filters.kind) q = q.eq("kind", filters.kind);
  if (filters.vertical) q = q.contains("verticals", [filters.vertical]);
  if (filters.category) q = q.eq("category", filters.category);
  if (filters.department) q = q.eq("department", filters.department);
  if (filters.certification)
    q = q.contains("certifications", [filters.certification]);
  if (filters.minPrice !== undefined) q = q.gte("price_cop", filters.minPrice);
  if (filters.maxPrice !== undefined) q = q.lte("price_cop", filters.maxPrice);

  // "De este nivel hacia arriba": quien busca Raíz también quiere ver Bosque.
  // Invariante 16 de `dominio-regenera`; no lo conviertas en igualdad.
  //
  // **Filtra por `provider_tier` y ya no por `provider_score`.** Eran la misma
  // cosa mientras el nivel salía del puntaje de sostenibilidad (0-100); desde
  // que sale de los puntos de experiencia, comparar contra `TIERS[x].min` mezcla
  // dos escalas y el filtro empieza a devolver cualquier cosa. Ver
  // `src/lib/niveles.ts`.
  if (filters.tier) q = q.in("provider_tier", nivelesDesde(filters.tier));

  if (filters.q) {
    const p = patron(filters.q);
    // El texto de la oferta y el nombre del proveedor, en una sola pasada.
    // Las dos columnas están en la vista y las dos tienen índice trigrama.
    q = q.or(`busqueda.ilike.${p},provider_busqueda.ilike.${p}`);
  }

  switch (filters.sort) {
    case "price_asc":
      q = q.order("price_cop", { ascending: true });
      break;
    case "price_desc":
      q = q.order("price_cop", { ascending: false });
      break;
    case "impact":
      q = q.order("impacto", { ascending: false });
      break;
    case "newest":
      q = q.order("created_at", { ascending: false });
      break;
    default:
      // Relevancia: destacados primero, luego mejor puntaje de sostenibilidad.
      // Premia al proveedor que sí completó su evaluación — es una regla de
      // producto, no un detalle de presentación.
      q = q
        .order("featured", { ascending: false })
        .order("provider_score", { ascending: false });
  }

  const { data, error } = await q;
  if (error) throw new Error(`searchListings: ${error.message}`);
  return (data as unknown as FilaListing[]).map(aListing);
}

export async function getListingBySlug(
  slug: string,
): Promise<Listing | undefined> {
  const db = await createClient();
  const { data, error } = await db
    .from("listings_publicos")
    .select(COLUMNAS_LISTING)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`getListingBySlug: ${error.message}`);
  return data ? aListing(data as unknown as FilaListing) : undefined;
}

/**
 * Ofertas por identificador. Es la que usa el carrito para poner precios.
 *
 * Va contra la vista pública, así que una oferta en borrador o suspendida
 * **no** se puede valorizar ni comprar: cae sola de la cesta por la vía de
 * `droppedIds`. La versión en memoria leía de todo el catálogo y sí las
 * valorizaba, lo que contradecía la invariante 17 de `dominio-regenera`.
 */
export async function getListingsByIds(ids: string[]): Promise<Listing[]> {
  // Un carrito guardado antes de la migración trae identificadores como
  // "l-amenities-organicos". Mandarlos a un `in` contra una columna uuid hace
  // que Postgres rechace la consulta entera —y con ella, el carrito completo—
  // en vez de ignorar los que no encajan.
  const uuids = ids.filter((id) => UUID.test(id));
  if (uuids.length === 0) return [];

  const db = await createClient();
  const { data, error } = await db
    .from("listings_publicos")
    .select(COLUMNAS_LISTING)
    .in("id", uuids);
  if (error) throw new Error(`getListingsByIds: ${error.message}`);
  return (data as unknown as FilaListing[]).map(aListing);
}

export async function getFeaturedListings(limit = 6): Promise<Listing[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("listings_publicos")
    .select(COLUMNAS_LISTING)
    .order("featured", { ascending: false })
    .order("provider_score", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getFeaturedListings: ${error.message}`);
  return (data as unknown as FilaListing[]).map(aListing);
}

export async function getRelatedListings(
  listing: Listing,
  limit = 3,
): Promise<Listing[]> {
  const db = await createClient();
  const verticales = listing.verticals.join(",");
  const { data, error } = await db
    .from("listings_publicos")
    .select(COLUMNAS_LISTING)
    .neq("id", listing.id)
    .or(
      `category.eq."${listing.category}"` +
        (verticales ? `,verticals.ov.{${verticales}}` : ""),
    )
    .limit(limit);
  if (error) throw new Error(`getRelatedListings: ${error.message}`);
  return (data as unknown as FilaListing[]).map(aListing);
}

export async function getProviderBySlug(
  slug: string,
): Promise<Provider | undefined> {
  const db = await createClient();
  const { data, error } = await db
    .from("providers")
    .select(COLUMNAS_PROVIDER)
    .eq("slug", slug)
    .eq("status", "approved")
    .maybeSingle();
  if (error) throw new Error(`getProviderBySlug: ${error.message}`);
  return data ? aProvider(data as unknown as FilaProvider) : undefined;
}

/**
 * Proveedor por identificador.
 *
 * Envuelto en `cache()` de React porque las páginas lo llaman una vez por
 * oferta: el catálogo con 18 tarjetas haría 18 consultas, muchas al mismo
 * proveedor. `cache()` deduplica por argumento dentro de un mismo render, así
 * que quedan tantas consultas como proveedores distintos. Es la razón de que las
 * páginas no hayan tenido que cambiar.
 */
export const getProviderById = cache(
  async (id: string): Promise<Provider | undefined> => {
    if (!UUID.test(id)) return undefined;
    const db = await createClient();
    const { data, error } = await db
      .from("providers")
      .select(COLUMNAS_PROVIDER)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`getProviderById: ${error.message}`);
    return data ? aProvider(data as unknown as FilaProvider) : undefined;
  },
);

export async function getListingsByProvider(
  providerId: string,
): Promise<Listing[]> {
  if (!UUID.test(providerId)) return [];
  const db = await createClient();
  const { data, error } = await db
    .from("listings_publicos")
    .select(COLUMNAS_LISTING)
    .eq("provider_id", providerId);
  if (error) throw new Error(`getListingsByProvider: ${error.message}`);
  return (data as unknown as FilaListing[]).map(aListing);
}

export async function getApprovedProviders(): Promise<Provider[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("providers")
    .select(COLUMNAS_PROVIDER)
    .eq("status", "approved")
    .order("sustainability_score", { ascending: false });
  if (error) throw new Error(`getApprovedProviders: ${error.message}`);
  return (data as unknown as FilaProvider[]).map(aProvider);
}

/**
 * El nivel de varios proveedores de una vez.
 *
 * Existe por el carrito: la comisión depende del nivel de quien vende
 * (`src/lib/niveles.ts`), así que valorizar una cesta con ítems de cinco
 * empresas necesita cinco niveles. Traer los cinco proveedores enteros con
 * `getProviderById` serían cinco viajes y cinco filas completas para leer una
 * columna.
 *
 * Un proveedor que no aparezca en el resultado —porque RLS lo ocultó o porque el
 * id no existe— simplemente no sale en el mapa, y quien llama aplica la tasa
 * base. Eso es deliberado: **a falta de nivel se cobra la comisión más alta**.
 */
export async function getProviderTiers(
  ids: string[],
): Promise<Map<string, Tier>> {
  const unicos = [...new Set(ids)].filter((id) => UUID.test(id));
  if (unicos.length === 0) return new Map();

  const db = await createClient();
  const { data, error } = await db
    .from("providers")
    .select("id, tier")
    .in("id", unicos);
  if (error) throw new Error(`getProviderTiers: ${error.message}`);

  return new Map((data as { id: string; tier: Tier }[]).map((f) => [f.id, f.tier]));
}

/**
 * Todos los proveedores, en cualquier estado. Para el panel de administración.
 *
 * **No lleva comprobación de rol y no es un descuido.** La política
 * `providers_public_read` de `0001_init.sql` ya decide qué filas devuelve: a un
 * visitante solo las aprobadas, a un admin todas. Si esta función filtrara
 * además por rol en JavaScript, habría dos reglas que mantener de acuerdo y la
 * de abajo sería la única que de verdad protege.
 *
 * Orden: primero lo que espera decisión, y dentro de eso lo más antiguo — quien
 * lleva más tiempo esperando se atiende antes.
 */
export async function getProvidersForReview(): Promise<Provider[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("providers")
    .select(COLUMNAS_PROVIDER)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`getProvidersForReview: ${error.message}`);
  return (data as unknown as FilaProvider[]).map(aProvider);
}

/**
 * Cifras del home. Salen del catálogo real, no están escritas a mano.
 *
 * Se piden solo las columnas que se cuentan, no las filas enteras: son cuatro
 * números y no hace falta traerse el catálogo para calcularlos.
 */
export async function getMarketplaceStats() {
  const db = await createClient();

  const [proveedores, ofertas] = await Promise.all([
    db
      .from("providers")
      .select("department, tier")
      .eq("status", "approved"),
    db.from("listings_publicos").select("id", { count: "exact", head: true }),
  ]);

  if (proveedores.error)
    throw new Error(`getMarketplaceStats: ${proveedores.error.message}`);
  if (ofertas.error)
    throw new Error(`getMarketplaceStats: ${ofertas.error.message}`);

  const filas = proveedores.data;
  const departamentos = new Set(filas.map((p) => p.department));
  const conNivel = filas.filter((p) => p.tier !== "unverified").length;

  return {
    providers: filas.length,
    listings: ofertas.count ?? 0,
    departments: departamentos.size,
    verifiedShare: filas.length
      ? Math.round((conNivel / filas.length) * 100)
      : 0,
  };
}

// ---------------------------------------------------------------------------
// Lecturas del panel de administración
//
// Van aquí, y no en cada página, por la invariante 18: `repo.ts` es la única
// puerta a los datos. Y **ninguna comprueba el rol**, igual que
// `getProvidersForReview()`: quien decide qué filas se devuelven es RLS. Si
// además filtraran por rol en JavaScript habría dos reglas que mantener de
// acuerdo, y la de abajo sería la única que de verdad protege.
// ---------------------------------------------------------------------------

/** Una oferta con el nombre de su proveedor, para las listas del panel. */
export interface ListingAdmin extends Listing {
  providerName: string;
  providerStatus: ReviewStatus;
}

/**
 * Todas las ofertas, en cualquier estado.
 *
 * Consulta `listings` y **no** la vista `listings_publicos`: la vista filtra a
 * "aprobado de proveedor aprobado", que es justo lo contrario de lo que hace
 * falta aquí — el panel existe para ver lo que todavía no está publicado.
 */
export async function getListingsForAdmin(): Promise<ListingAdmin[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("listings")
    .select(`${COLUMNAS_LISTING}, providers(name, status)`)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`getListingsForAdmin: ${error.message}`);

  return (data as unknown as (FilaListing & {
    providers: { name: string; status: ReviewStatus } | null;
  })[]).map((fila) => ({
    ...aListing(fila),
    providerName: fila.providers?.name ?? "Sin proveedor",
    providerStatus: fila.providers?.status ?? "draft",
  }));
}

/** Una oferta por id, en cualquier estado. Para el formulario de edición. */
export async function getListingByIdForAdmin(
  id: string,
): Promise<Listing | undefined> {
  if (!UUID.test(id)) return undefined;
  const db = await createClient();
  const { data, error } = await db
    .from("listings")
    .select(COLUMNAS_LISTING)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getListingByIdForAdmin: ${error.message}`);
  return data ? aListing(data as unknown as FilaListing) : undefined;
}

interface FilaPostulacion {
  id: string;
  user_id: string | null;
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  department: string;
  city: string;
  website: string | null;
  description: string;
  status: ReviewStatus;
  reviewer_notes: string | null;
  provider_id: string | null;
  created_at: string;
}

/**
 * Las postulaciones de `/vender`.
 *
 * Orden: lo más antiguo primero dentro de lo pendiente. Quien lleva más tiempo
 * esperando respuesta se atiende antes — el mismo criterio que en proveedores.
 */
export async function getApplications(): Promise<ProviderApplication[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("provider_applications")
    .select(
      "id, user_id, name, contact_name, email, phone, department, city, website, description, status, reviewer_notes, provider_id, created_at",
    )
    .order("created_at", { ascending: true });
  if (error) throw new Error(`getApplications: ${error.message}`);

  return (data as FilaPostulacion[]).map((f) => ({
    id: f.id,
    userId: f.user_id ?? undefined,
    name: f.name,
    contactName: f.contact_name,
    email: f.email,
    phone: f.phone,
    department: f.department,
    city: f.city,
    website: f.website ?? undefined,
    description: f.description,
    status: f.status,
    reviewerNotes: f.reviewer_notes ?? undefined,
    providerId: f.provider_id ?? undefined,
    // `soloFecha` porque `longDate()` espera AAAA-MM-DD: con la marca de tiempo
    // entera arma una cadena imposible y pinta «Invalid Date».
    createdAt: soloFecha(f.created_at),
  }));
}

/**
 * Los usuarios y sus roles.
 *
 * Pasa por la función `admin_listar_usuarios()` de la migración 0004, que es
 * `security definer` para poder leer `auth.users` y lleva `where is_admin()`
 * dentro. **Ese `where` es la política**: a quien no sea administrador la
 * llamada le devuelve cero filas en vez de un error, que es como niega RLS.
 */
export async function getUsuarios(): Promise<AdminUsuario[]> {
  const db = await createClient();
  const { data, error } = await db.rpc("admin_listar_usuarios");
  if (error) throw new Error(`getUsuarios: ${error.message}`);

  return (data as {
    id: string;
    email: string;
    full_name: string;
    phone: string | null;
    roles: Role[] | null;
    last_sign_in_at: string | null;
    email_confirmed_at: string | null;
    created_at: string;
  }[]).map((u) => ({
    id: u.id,
    email: u.email,
    fullName: u.full_name,
    phone: u.phone ?? undefined,
    roles: u.roles ?? [],
    lastSignInAt: u.last_sign_in_at ?? undefined,
    emailConfirmedAt: u.email_confirmed_at ?? undefined,
    createdAt: u.created_at,
  }));
}

/** Quién gestiona qué empresa. Para la pantalla de usuarios del panel. */
export interface VinculoProveedor {
  userId: string;
  providerId: string;
  providerName: string;
  esDueno: boolean;
}

/**
 * Los vínculos persona ↔ empresa.
 *
 * La política `provider_members_read` decide el alcance: un administrador los ve
 * todos, cualquier otro solo los suyos. Sin filtro escrito a mano, otra vez a
 * propósito.
 */
export async function getVinculosProveedor(): Promise<VinculoProveedor[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("provider_members")
    .select("user_id, provider_id, is_owner, providers(name)");
  if (error) throw new Error(`getVinculosProveedor: ${error.message}`);

  return (data as unknown as {
    user_id: string;
    provider_id: string;
    is_owner: boolean;
    providers: { name: string } | null;
  }[]).map((v) => ({
    userId: v.user_id,
    providerId: v.provider_id,
    providerName: v.providers?.name ?? "Empresa",
    esDueno: v.is_owner,
  }));
}
