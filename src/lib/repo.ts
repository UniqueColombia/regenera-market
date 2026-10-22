import { cache } from "react";
import { getUser } from "./auth";
import { createClient } from "./supabase/server";
import { nivelesDesde } from "./niveles";
import { cuantasPaginas, rango, type Pagina } from "./paginacion";
import {
  COLUMNAS_LISTING_BASE,
  COLUMNAS_PROVIDER_BASE,
  DE_LA_0012_LISTING,
  DE_LA_0012_PROVIDER,
  DE_LA_0014_LISTING,
  DE_LA_0017_LISTING,
} from "./columnas-ofertas";
import { esReaccion, leerConteos, type ReaccionId } from "./comunidad";
import { hoyEnBogota } from "./envios";
import type { FechasDeOferta } from "./fechas";
import type { Encaje, EstadoProspecto, Prospecto } from "./prospectos";
import type {
  AdminUsuario,
  Calificacion,
  CommunityPost,
  CommunityTopic,
  Despacho,
  Listing,
  ListingFilters,
  ListingKind,
  Provider,
  ProviderApplication,
  ProviderTrait,
  Resena,
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

/**
 * ¿Está aplicada la migración 0012?
 *
 * ## Por qué el código pregunta, en vez de exigirla
 *
 * Hasta la 0011, una migración que agregaba columnas obligaba a un orden: se
 * aplicaba a mano en el panel **antes** de desplegar, o el catálogo entero
 * respondía 500 (así fue con la 0006). Es un orden que depende de que alguien
 * se acuerde, entre dos personas que despliegan por separado.
 *
 * Esto lo quita de en medio: una consulta barata la primera vez, y según la
 * respuesta se piden o no las columnas nuevas. **Sin la 0012 el sitio sigue
 * funcionando como antes**: se ve el catálogo, se compra por el camino viejo
 * (`saveOrder()`), y lo que sí depende de las columnas nuevas —publicar desde
 * la empresa, el giro— falla con su código de incidencia en vez de tumbar
 * páginas que no lo usan.
 *
 * El «sí» se recuerda para siempre en el proceso —una migración no se
 * desaplica sola— y el «no» solo un minuto, para enterarse pronto de que ya se
 * aplicó sin tener que redesplegar. `42703` es «la columna no existe».
 */
let sondeo0012: { aplicada: boolean; hasta: number } | null = null;

let sondeo0014: { aplicada: boolean; hasta: number } | null = null;

/**
 * ¿Está aplicada la migración 0014 (envíos, reseñas, versión de las ofertas)?
 *
 * El mismo sondeo que el de la 0012, y por lo mismo: **sin la 0014 el sitio
 * sigue como antes** —sin envío, sin reseñas, comprando por la `crear_orden()`
 * vieja—, y cuando alguien la aplique se enciende sola en menos de un minuto,
 * sin redesplegar. Lo usan el formulario de ofertas, la cesta, el pedido y la
 * ficha para decidir si muestran lo nuevo.
 */
export async function logisticaDisponible(): Promise<boolean> {
  const ahora = Date.now();
  if (!sondeo0014 || (!sondeo0014.aplicada && ahora > sondeo0014.hasta)) {
    const db = await createClient();
    const { error } = await db.from("listings").select("despacho").limit(1);
    sondeo0014 = { aplicada: error?.code !== "42703", hasta: ahora + 60_000 };
    if (!sondeo0014.aplicada) {
      console.warn("[repo] la migración 0014 no está aplicada: sin envíos ni reseñas");
    }
  }
  return sondeo0014.aplicada;
}

let sondeo0017: { aplicada: boolean; hasta: number } | null = null;

/**
 * ¿Están las columnas de la 0017 (envío según destino y unidades) **en la vista
 * del catálogo**?
 *
 * El mismo sondeo que los de la 0012 y la 0014: sin ellas el envío sigue siendo
 * la tarifa fija por línea y el formulario no pregunta la local ni la de cada
 * unidad adicional; con ellas, se enciende solo en menos de un minuto.
 *
 * **Pregunta a `listings_publicos` y no a `listings`, y es lo que importa.** El
 * 2026-10-14 preguntaba a la tabla: la 0017 le agregó las columnas pero no
 * recreó la vista (que congela su `l.*`), el sondeo dijo «sí», `columnas()` se
 * las pidió a la vista y el catálogo, la portada y las fichas dejaron de cargar.
 * La vista las tiene desde la 0020; si la vista las tiene, la tabla también.
 */
export async function enviosPorZonaDisponible(): Promise<boolean> {
  if (!(await logisticaDisponible())) return false;
  const ahora = Date.now();
  if (!sondeo0017 || (!sondeo0017.aplicada && ahora > sondeo0017.hasta)) {
    const db = await createClient();
    const { error } = await db.from("listings_publicos").select("envio_local_cop").limit(1);
    sondeo0017 = { aplicada: error?.code !== "42703", hasta: ahora + 60_000 };
    if (!sondeo0017.aplicada) {
      console.warn("[repo] la vista del catálogo no tiene las columnas de la 0017 (falta la 0020): envío con tarifa fija por línea");
    }
  }
  return sondeo0017.aplicada;
}

async function columnas(): Promise<{ listing: string; provider: string }> {
  const ahora = Date.now();
  if (!sondeo0012 || (!sondeo0012.aplicada && ahora > sondeo0012.hasta)) {
    const db = await createClient();
    const { error } = await db.from("providers").select("giros").limit(1);
    sondeo0012 = { aplicada: error?.code !== "42703", hasta: ahora + 60_000 };
    if (!sondeo0012.aplicada) {
      console.warn("[repo] la migración 0012 no está aplicada: se leen las columnas de antes");
    }
  }

  if (!sondeo0012.aplicada) {
    return { listing: COLUMNAS_LISTING_BASE, provider: COLUMNAS_PROVIDER_BASE };
  }

  const con0014 = await logisticaDisponible();
  const con0017 = con0014 && (await enviosPorZonaDisponible());
  return {
    listing: `${COLUMNAS_LISTING_BASE}, ${DE_LA_0012_LISTING}${con0014 ? `, ${DE_LA_0014_LISTING}` : ""}${con0017 ? `, ${DE_LA_0017_LISTING}` : ""}`,
    provider: `${COLUMNAS_PROVIDER_BASE}, ${DE_LA_0012_PROVIDER}`,
  };
}

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
  /** Las cuatro, desde la 0012: llegan `undefined` mientras no esté aplicada. */
  subcategory?: string | null;
  aporte_ambiental?: string | null;
  consecuencia_ambiental?: string | null;
  huella_co2_kg?: number | string | null;
  /** Las seis, desde la 0014. */
  despacho?: Despacho | null;
  transportadora?: string | null;
  envio_cop?: number | null;
  entrega_dias_min?: number | null;
  entrega_dias_max?: number | null;
  version?: number | null;
  /** Las seis, desde la 0017. */
  envio_local_cop?: number | null;
  envio_adicional_cop?: number | null;
  peso_kg?: number | string | null;
  largo_cm?: number | null;
  ancho_cm?: number | null;
  alto_cm?: number | null;
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
  /** Desde la 0012. */
  giros?: string[] | null;
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
  const hoy = hoyEnBogota();
  return {
    id: f.id,
    slug: f.slug,
    providerId: f.provider_id,
    kind: f.kind,
    title: f.title,
    summary: f.summary,
    description: f.description,
    category: f.category,
    subcategory: f.subcategory ?? undefined,
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
    aporteAmbiental: f.aporte_ambiental ?? undefined,
    consecuenciaAmbiental: f.consecuencia_ambiental ?? undefined,
    huellaCo2Kg: numero(f.huella_co2_kg ?? null),
    certifications: f.certifications,
    department: f.department ?? undefined,
    city: f.city ?? undefined,
    status: f.status,
    featured: f.featured,
    createdAt: soloFecha(f.created_at),
    // Toda experiencia lleva su bloque, aunque le falten datos. Hasta el
    // 2026-10-12 solo se armaba con `min_people`, que el formulario no exige:
    // una experiencia publicada sin grupo llegaba sin bloque y la ficha se caía
    // en el botón de reservar, y al editarla el formulario salía vacío.
    experience:
      f.kind === "experience"
        ? {
            durationHours: f.duration_hours ?? undefined,
            minPeople: f.min_people ?? undefined,
            maxPeople: f.max_people ?? f.min_people ?? undefined,
            meetingPoint: f.meeting_point ?? undefined,
            includes: f.includes ?? [],
            // El dominio habla de "cupos que quedan"; la base guarda total y
            // vendidos, que es lo único con lo que se puede impedir sobreventa
            // en una transacción. La resta se hace aquí.
            // Las pasadas no se ofrecen: `crear_orden()` tampoco las vende.
            availability: cupos
              .map((c) => ({
                date: soloFecha(c.date),
                slotsLeft: c.slots_total - c.slots_taken,
              }))
              .filter((c) => c.date >= hoy)
              .sort((a, b) => a.date.localeCompare(b.date)),
            fechasPropias: cupos.length > 0,
          }
        : undefined,
    service:
      f.kind === "service" && f.delivery_time !== null
        ? { deliveryTime: f.delivery_time, scope: f.scope ?? [] }
        : undefined,
    envio:
      f.kind === "product" && (f.despacho || f.envio_cop != null || f.entrega_dias_max != null)
        ? {
            despacho: f.despacho ?? undefined,
            transportadora: f.transportadora ?? undefined,
            costoCop: f.envio_cop ?? undefined,
            costoLocalCop: f.envio_local_cop ?? undefined,
            adicionalCop: f.envio_adicional_cop ?? undefined,
            pesoKg: numero(f.peso_kg ?? null),
            medidasCm:
              f.largo_cm != null || f.ancho_cm != null || f.alto_cm != null
                ? {
                    largo: f.largo_cm ?? undefined,
                    ancho: f.ancho_cm ?? undefined,
                    alto: f.alto_cm ?? undefined,
                  }
                : undefined,
            diasMin: f.entrega_dias_min ?? undefined,
            diasMax: f.entrega_dias_max ?? undefined,
          }
        : undefined,
    version: f.version ?? undefined,
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
    giros: f.giros ?? [],
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

/** Todas las ofertas que cumplen los filtros, sin paginar. Para el sitemap. */
export async function searchListings(
  filters: ListingFilters = {},
): Promise<Listing[]> {
  return (await consultarOfertas(filters)).listings;
}

/** Ofertas por página del catálogo: múltiplo de 2 y de 3, las columnas de la rejilla. */
export const OFERTAS_POR_PAGINA = 24;

/**
 * Una página del catálogo, con el total de ofertas que cumplen los filtros.
 * Si la página pedida ya no existe, devuelve `filas: []` con el total real,
 * para que quien llama pueda llevar a la última (ver `src/lib/paginacion.ts`).
 */
export async function buscarOfertas(
  filters: ListingFilters,
  pagina: number,
  porPagina = OFERTAS_POR_PAGINA,
): Promise<Pagina<Listing>> {
  const { listings, total } = await consultarOfertas(filters, rango(pagina, porPagina));
  return { filas: listings, total, pagina, porPagina, paginas: cuantasPaginas(total, porPagina) };
}

async function consultarOfertas(
  filters: ListingFilters,
  desdeHasta?: [number, number],
): Promise<{ listings: Listing[]; total: number }> {
  const db = await createClient();
  let q = db
    .from("listings_publicos")
    .select((await columnas()).listing, desdeHasta ? { count: "exact" } : undefined);

  if (filters.kind) q = q.eq("kind", filters.kind);
  if (filters.vertical) q = q.contains("verticals", [filters.vertical]);
  if (filters.category) q = q.eq("category", filters.category);
  // Sin la 0012 la columna no existe: filtrar por ella tumbaría el catálogo.
  if (filters.subcategory && sondeo0012?.aplicada) {
    q = q.eq("subcategory", filters.subcategory);
  }
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
  // Desempate único, siempre el último. Sin él, dos ofertas con el mismo
  // puntaje (todas las de un proveedor, por ejemplo) salen en cualquier orden
  // en cada consulta, y al paginar una se repite en dos páginas y otra no sale
  // en ninguna.
  q = q.order("id", { ascending: true });

  if (desdeHasta) q = q.range(desdeHasta[0], desdeHasta[1]);

  const { data, error, count } = await q;
  // PGRST103: se pidió un rango más allá de la última fila (la página ya no
  // existe). No es un error: se devuelve vacía con el total, que sale de pedir
  // la primera fila con los mismos filtros (desde 0 nunca da PGRST103).
  if (error?.code === "PGRST103" && desdeHasta && desdeHasta[0] > 0) {
    const { total } = await consultarOfertas(filters, [0, 0]);
    return { listings: [], total };
  }
  if (error) throw new Error(`searchListings: ${error.message}`);
  const listings = (data as unknown as FilaListing[]).map(aListing);
  return { listings, total: count ?? listings.length };
}

export async function getListingBySlug(
  slug: string,
): Promise<Listing | undefined> {
  const db = await createClient();
  const { data, error } = await db
    .from("listings_publicos")
    .select((await columnas()).listing)
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
    .select((await columnas()).listing)
    .in("id", uuids);
  if (error) throw new Error(`getListingsByIds: ${error.message}`);
  return (data as unknown as FilaListing[]).map(aListing);
}

export async function getFeaturedListings(limit = 6): Promise<Listing[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("listings_publicos")
    .select((await columnas()).listing)
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
    .select((await columnas()).listing)
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
    .select((await columnas()).provider)
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
      .select((await columnas()).provider)
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
    .select((await columnas()).listing)
    .eq("provider_id", providerId);
  if (error) throw new Error(`getListingsByProvider: ${error.message}`);
  return (data as unknown as FilaListing[]).map(aListing);
}

export async function getApprovedProviders(): Promise<Provider[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("providers")
    .select((await columnas()).provider)
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
 * Varios proveedores enteros de una vez, por id.
 *
 * Para las listas que pintan una tarjeta por oferta (catálogo, relacionados).
 * `getProviderById` con `cache()` deduplica, pero sigue siendo una consulta por
 * proveedor distinto: con un catálogo de 40 empresas eran 40 viajes a la base en
 * cada visita. Aquí es uno. El que no aparezca (RLS lo ocultó o ya no existe) no
 * sale en el mapa, y la tarjeta se pinta sin proveedor, igual que antes.
 */
export async function getProvidersByIds(ids: string[]): Promise<Map<string, Provider>> {
  const unicos = [...new Set(ids)].filter((id) => UUID.test(id));
  if (unicos.length === 0) return new Map();

  const db = await createClient();
  const { data, error } = await db
    .from("providers")
    .select((await columnas()).provider)
    .in("id", unicos);
  if (error) throw new Error(`getProvidersByIds: ${error.message}`);

  return new Map(
    (data as unknown as FilaProvider[]).map((f) => {
      const p = aProvider(f);
      return [p.id, p];
    }),
  );
}

/**
 * Cuántas ofertas publicadas tiene cada proveedor, en una consulta.
 *
 * `/proveedores` llamaba a `getListingsByProvider()` por cada empresa y se
 * traía todas sus ofertas completas solo para hacer `.length`: con 500
 * proveedores, 501 consultas. Aquí se pide una sola columna de la vista pública
 * (que ya filtra lo aprobado, invariante 17) y se cuenta en memoria. Cuando el
 * catálogo pase de unas decenas de miles de ofertas conviene una vista con
 * `count(*) group by provider_id`; hasta entonces esto es una consulta liviana.
 */
export async function getConteoDeOfertasPorProveedor(): Promise<Map<string, number>> {
  const db = await createClient();
  const { data, error } = await db.from("listings_publicos").select("provider_id");
  if (error) throw new Error(`getConteoDeOfertasPorProveedor: ${error.message}`);

  const conteo = new Map<string, number>();
  for (const f of data as { provider_id: string }[]) {
    conteo.set(f.provider_id, (conteo.get(f.provider_id) ?? 0) + 1);
  }
  return conteo;
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
    .select((await columnas()).provider)
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

/** Ofertas por página en `/admin/ofertas`: filas de una línea, caben más. */
export const OFERTAS_ADMIN_POR_PAGINA = 40;

/**
 * Una página de ofertas en cualquier estado, las más nuevas primero, y cuántas
 * hay en cada estado. Reemplaza a `getListingsForAdmin()`, que las traía todas
 * (2026-10-12). Ver `src/lib/paginacion.ts`.
 *
 * Consulta `listings` y **no** la vista `listings_publicos`: la vista filtra a
 * "aprobado de proveedor aprobado", que es justo lo contrario de lo que hace
 * falta aquí — el panel existe para ver lo que todavía no está publicado.
 */
export async function getOfertasParaAdmin(
  estado: ReviewStatus | undefined,
  pagina: number,
  porPagina = OFERTAS_ADMIN_POR_PAGINA,
): Promise<Pagina<ListingAdmin> & { porEstado: Record<ReviewStatus, number> }> {
  const db = await createClient();
  const [desde, hasta] = rango(pagina, porPagina);
  const ESTADOS: ReviewStatus[] = ["draft", "pending_review", "approved", "rejected", "suspended"];

  let q = db
    .from("listings")
    .select(`${(await columnas()).listing}, providers(name, status)`, { count: "exact" });
  if (estado) q = q.eq("status", estado);

  const [pag, ...conteos] = await Promise.all([
    q.order("created_at", { ascending: false }).order("id", { ascending: true }).range(desde, hasta),
    ...ESTADOS.map((e) => db.from("listings").select("id", { count: "exact", head: true }).eq("status", e)),
  ]);
  for (const c of conteos) if (c.error) throw new Error(`getOfertasParaAdmin: ${c.error.message}`);
  const porEstado = Object.fromEntries(ESTADOS.map((e, i) => [e, conteos[i].count ?? 0])) as Record<ReviewStatus, number>;
  const total = estado ? porEstado[estado] : ESTADOS.reduce((s, e) => s + porEstado[e], 0);
  const paginas = cuantasPaginas(total, porPagina);

  // PGRST103: la página ya no existe. Vacía, con el total real.
  if (pag.error?.code === "PGRST103") return { filas: [], total, pagina, porPagina, paginas, porEstado };
  if (pag.error) throw new Error(`getOfertasParaAdmin: ${pag.error.message}`);

  const filas = (pag.data as unknown as (FilaListing & {
    providers: { name: string; status: ReviewStatus } | null;
  })[]).map((fila) => ({
    ...aListing(fila),
    providerName: fila.providers?.name ?? "Sin proveedor",
    providerStatus: fila.providers?.status ?? "draft",
  }));
  return { filas, total, pagina, porPagina, paginas, porEstado };
}

/**
 * Las fechas de una experiencia para su editor: el modo y las de hoy en
 * adelante, con el cupo total y lo ya reservado. Ver `src/lib/fechas.ts`.
 *
 * `availability_read` deja leer a cualquiera; quién puede **escribirlas** lo
 * deciden la acción y las políticas.
 */
export async function getFechasDeOferta(listingId: string): Promise<FechasDeOferta> {
  if (!UUID.test(listingId)) return { modo: "cliente", fechas: [] };
  const db = await createClient();
  const { data, error } = await db
    .from("listing_availability")
    .select("date, slots_total, slots_taken")
    .eq("listing_id", listingId)
    .order("date", { ascending: true });
  if (error) throw new Error(`getFechasDeOferta: ${error.message}`);
  const filas = (data ?? []) as FilaDisponibilidad[];
  const hoy = hoyEnBogota();
  return {
    modo: filas.length > 0 ? "proveedor" : "cliente",
    fechas: filas
      .map((f) => ({ date: soloFecha(f.date), total: f.slots_total, tomados: f.slots_taken }))
      .filter((f) => f.date >= hoy),
  };
}

/** Una oferta por id, en cualquier estado. Para el formulario de edición. */
export async function getListingByIdForAdmin(
  id: string,
): Promise<Listing | undefined> {
  if (!UUID.test(id)) return undefined;
  const db = await createClient();
  const { data, error } = await db
    .from("listings")
    .select((await columnas()).listing)
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
  country: string | null;
  department: string;
  city: string;
  org_type: string | null;
  tax_id_kind: string | null;
  tax_id: string | null;
  categories: string[] | null;
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
      "id, user_id, name, contact_name, email, phone, country, department, city, org_type, tax_id_kind, tax_id, categories, website, description, status, reviewer_notes, provider_id, created_at",
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
    // `?? "Colombia"` y no un error: las postulaciones anteriores a la 0006 se
    // guardaron cuando el formulario solo preguntaba por departamento.
    country: f.country ?? "Colombia",
    department: f.department,
    city: f.city,
    orgType: f.org_type ?? undefined,
    taxIdKind: f.tax_id_kind ?? undefined,
    taxId: f.tax_id ?? undefined,
    categories: f.categories ?? [],
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

/** Los números de las tarjetas de `/admin`. */
export interface ResumenAdmin {
  postulacionesPendientes: number;
  proveedores: number;
  proveedoresPendientes: number;
  ofertas: number;
  ofertasSinPublicar: number;
  ordenesPorCobrar: number;
  porCobrarCop: number;
}

/**
 * Lo que cuenta el resumen de `/admin`, con conteos y no con listas.
 *
 * Antes la página bajaba todos los proveedores, postulaciones, ofertas (con su
 * proveedor) y órdenes (con todos sus ítems) para sacar cinco números en
 * JavaScript. Con unos miles de órdenes eso es un megabyte por visita al panel.
 * `head: true` hace que Postgres devuelva solo el conteo.
 *
 * Mismo cliente de sesión que el resto del panel: RLS decide qué se cuenta,
 * igual que antes. `porCobrarCop` trae una sola columna de las órdenes sin
 * pagar, que son pocas por definición (vencen a las 72 h); si alguna vez no lo
 * fueran, una RPC con `sum(total_cop)` lo resuelve en la base.
 */
export async function getResumenAdmin(): Promise<ResumenAdmin> {
  const db = await createClient();
  const contar = { count: "exact" as const, head: true };

  const [postulaciones, proveedores, proveedoresPend, ofertas, ofertasPub, porCobrar] =
    await Promise.all([
      db.from("provider_applications").select("id", contar).eq("status", "pending_review"),
      db.from("providers").select("id", contar),
      db.from("providers").select("id", contar).eq("status", "pending_review"),
      db.from("listings").select("id", contar),
      db.from("listings").select("id", contar).eq("status", "approved"),
      db.from("orders").select("total_cop").eq("status", "pending_payment"),
    ]);

  for (const r of [postulaciones, proveedores, proveedoresPend, ofertas, ofertasPub, porCobrar]) {
    if (r.error) throw new Error(`getResumenAdmin: ${r.error.message}`);
  }

  const cobrar = (porCobrar.data ?? []) as { total_cop: number | null }[];
  return {
    postulacionesPendientes: postulaciones.count ?? 0,
    proveedores: proveedores.count ?? 0,
    proveedoresPendientes: proveedoresPend.count ?? 0,
    ofertas: ofertas.count ?? 0,
    ofertasSinPublicar: (ofertas.count ?? 0) - (ofertasPub.count ?? 0),
    ordenesPorCobrar: cobrar.length,
    porCobrarCop: cobrar.reduce((suma, o) => suma + (o.total_cop ?? 0), 0),
  };
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

// ---------------------------------------------------------------------------
// Comunidad
// ---------------------------------------------------------------------------

const COLUMNAS_POST_BASE = `
  id, title, body, topic, author_id, author_name, featured, reaction_count,
  reaction_counts, created_at, providers(id, slug, name, logo_url, tier)
`;

/**
 * ¿Está aplicada la migración 0013 (`edited_at`)?
 *
 * Mismo patrón que `sondeo0012`: el sitio tiene que seguir funcionando entre que
 * se despliega el código y se aplica la migración. Sin la columna, pedirla
 * tumbaría el muro entero. `42703` es «la columna no existe»; el «sí» se
 * recuerda, el «no» solo un minuto.
 */
let sondeo0013: { aplicada: boolean; hasta: number } | null = null;

export async function edicionDisponible(): Promise<boolean> {
  const ahora = Date.now();
  if (!sondeo0013 || (!sondeo0013.aplicada && ahora > sondeo0013.hasta)) {
    const db = await createClient();
    const { error } = await db.from("community_posts").select("edited_at").limit(1);
    sondeo0013 = { aplicada: error?.code !== "42703", hasta: ahora + 60_000 };
  }
  return sondeo0013.aplicada;
}

async function columnasPost(): Promise<string> {
  return (await edicionDisponible())
    ? `${COLUMNAS_POST_BASE}, edited_at`
    : COLUMNAS_POST_BASE;
}

interface FilaPost {
  id: string;
  title: string;
  body: string;
  topic: CommunityTopic;
  author_id: string;
  author_name: string;
  featured: boolean;
  reaction_count: number;
  reaction_counts: unknown;
  created_at: string;
  edited_at?: string | null;
  providers: {
    id: string;
    slug: string;
    name: string;
    logo_url: string | null;
    tier: Tier;
  } | null;
}

function aPost(
  fila: FilaPost,
  mias: Map<string, ReaccionId[]>,
  avatares: Map<string, string>,
): CommunityPost {
  return {
    id: fila.id,
    title: fila.title,
    body: fila.body,
    topic: fila.topic,
    authorId: fila.author_id,
    authorName: fila.author_name || "Alguien de la comunidad",
    authorAvatarUrl: avatares.get(fila.author_id),
    provider: fila.providers
      ? {
          id: fila.providers.id,
          slug: fila.providers.slug,
          name: fila.providers.name,
          logoUrl: fila.providers.logo_url ?? undefined,
          tier: fila.providers.tier,
        }
      : undefined,
    featured: fila.featured,
    reactionCount: fila.reaction_count,
    reactions: leerConteos(fila.reaction_counts),
    misReacciones: mias.get(fila.id) ?? [],
    createdAt: fila.created_at,
    editedAt: fila.edited_at ?? undefined,
  };
}

/**
 * Qué marcó quien está mirando, publicación por publicación.
 *
 * Una sola consulta para toda la página en vez de una por tarjeta.
 * `community_reactions_read_own` hace el filtro: sin sesión devuelve cero filas
 * y los botones salen todos sin marcar, que es exactamente lo que se le quiere
 * mostrar a quien todavía no tiene cuenta.
 *
 * Devuelve un mapa y no un conjunto desde la migración 0008: lo que hay que
 * saber ya no es «¿reaccionó?» sino «¿con cuáles de las cinco?».
 */
async function reaccionesPropias(
  ids: string[],
): Promise<Map<string, ReaccionId[]>> {
  const mapa = new Map<string, ReaccionId[]>();
  if (ids.length === 0) return mapa;

  const db = await createClient();
  const { data, error } = await db
    .from("community_reactions")
    .select("post_id, kind")
    .in("post_id", ids);
  // Un fallo aquí no debe tumbar el muro: lo peor que pasa es que los botones
  // aparezcan sin marcar. Lo que NO puede pasar es que una segunda pulsación
  // sobre algo ya marcado se lea como éxito sin mover el número — por eso
  // `alternarReaccion()` comprueba cuántas filas tocó en vez de fiarse de esto.
  if (error || !data) return mapa;

  for (const fila of data as { post_id: string; kind: string }[]) {
    if (!esReaccion(fila.kind)) continue;
    const previas = mapa.get(fila.post_id);
    if (previas) previas.push(fila.kind);
    else mapa.set(fila.post_id, [fila.kind]);
  }
  return mapa;
}

/**
 * Las fotos de perfil de quienes escribieron, en vivo.
 *
 * Por `avatares_publicos()`, que es `security definer` y devuelve **solo la
 * foto**: `profiles` sigue siendo privada, así que ni el teléfono ni el
 * documento de un comprador salen de aquí. Ver la sección 4.b de la migración
 * 0008.
 *
 * Falla en silencio por lo mismo que la anterior: sin foto se dibuja el
 * monograma de iniciales, que es un estado válido y no un error.
 */
async function avataresDeAutores(ids: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (ids.length === 0) return mapa;

  const db = await createClient();
  const { data, error } = await db.rpc("avatares_publicos", {
    _ids: [...new Set(ids)],
  });
  if (error || !data) return mapa;

  for (const fila of data as { id: string; avatar_url: string | null }[]) {
    if (fila.avatar_url) mapa.set(fila.id, fila.avatar_url);
  }
  return mapa;
}

/**
 * El muro, lo más reciente primero.
 *
 * **Los destacados van arriba y no mezclados por fecha.** Destacar es el único
 * gesto editorial que tiene el equipo sobre la Comunidad, y si el orden lo
 * disolviera en dos días no serviría para nada — ni para el proveedor, a quien
 * le vale 80 puntos de experiencia.
 *
 * El filtro por `status` no se escribe aquí: lo impone `community_posts_read`.
 * Escribirlo a mano sería pedirle al código que garantice lo que garantiza la
 * base, y el día que se olvide en otra consulta ahí sí habría fuga.
 */
export async function getCommunityPosts(limite = 20): Promise<CommunityPost[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("community_posts")
    .select(await columnasPost())
    .eq("status", "approved")
    .order("featured", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`getCommunityPosts: ${error.message}`);

  const filas = data as unknown as FilaPost[];
  const [mias, avatares] = await Promise.all([
    reaccionesPropias(filas.map((f) => f.id)),
    avataresDeAutores(filas.map((f) => f.author_id)),
  ]);
  return filas.map((f) => aPost(f, mias, avatares));
}

/**
 * Las empresas en cuyo nombre puede publicar esta persona.
 *
 * Sale de `provider_members`, que es la tabla que decide quién gestiona qué
 * —nunca de un rol ni de un texto del formulario—. Si devuelve vacío, el
 * formulario no ofrece la opción de firmar como empresa, y el `with check` de
 * `community_posts_insert` la rechazaría igual si alguien la forzara.
 */
export async function getEmpresasQueGestiono(): Promise<
  { id: string; name: string }[]
> {
  const db = await createClient();
  const { data, error } = await db
    .from("provider_members")
    .select("provider_id, providers(name)");
  if (error || !data) return [];

  return (data as unknown as {
    provider_id: string;
    providers: { name: string } | null;
  }[])
    .filter((v) => v.providers)
    .map((v) => ({ id: v.provider_id, name: v.providers!.name }));
}

/** Una publicación vista desde administración: trae también las ocultas. */
export interface PostAdmin extends CommunityPost {
  status: ReviewStatus;
}

/**
 * El muro entero para moderar, incluidas las ocultas.
 *
 * El alcance lo decide `community_posts_read`, que a un administrador le
 * devuelve todo y a cualquier otro solo lo aprobado y lo suyo. Es la misma razón
 * por la que `getApplications()` tampoco filtra a mano: si el filtro viviera
 * aquí, el día que se olvide en otra consulta ahí sí habría fuga.
 *
 * `misReacciones` viene vacío y se ignora en el panel: moderar no es reaccionar.
 */
export async function getPostsForAdmin(): Promise<PostAdmin[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("community_posts")
    .select(`${await columnasPost()}, status`)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`getPostsForAdmin: ${error.message}`);

  return (data as unknown as (FilaPost & { status: ReviewStatus })[]).map((f) => ({
    ...aPost(f, new Map(), new Map()),
    status: f.status,
  }));
}

// ---------------------------------------------------------------------------
// Medición de uso
// ---------------------------------------------------------------------------

/** Una fila de un ranking del panel: una página, un origen, un país… */
export interface FilaAnalitica {
  /** Vacío cuando no hay dato: visita directa, o país que Vercel no resolvió. */
  clave: string;
  visitas: number;
  visitantes: number;
}

export interface Analiticas {
  dias: number;
  desde: string;
  hasta: string;
  visitas: number;
  visitantes: number;
  /** Las mismas cifras en el periodo anterior de igual largo, para comparar. */
  visitasAntes: number;
  visitantesAntes: number;
  porDia: { dia: string; visitas: number; visitantes: number }[];
  paginas: FilaAnalitica[];
  origenes: FilaAnalitica[];
  dispositivos: FilaAnalitica[];
  paises: FilaAnalitica[];
  negocio: {
    cuentas: number;
    postulaciones: number;
    ordenes: number;
    ordenesCop: number;
    publicaciones: number;
  };
}

/**
 * El resumen del panel de analíticas, o `null` si falta la migración 0010.
 *
 * Todo lo agrega `admin_analiticas()` en Postgres: aquí no llega ni una fila de
 * `page_views`. La función lleva su propio `is_admin()`, así que llamada por
 * cualquier otro lanza `solo-admin` en vez de devolver cifras.
 *
 * El `null` existe para que el panel pueda decir «falta aplicar la 0010» en
 * vez de caerse: la migración se aplica a mano y puede ir por detrás del
 * despliegue. `42883` es la función inexistente en Postgres y `PGRST202` la
 * misma cosa dicha por PostgREST.
 */
export async function getAnaliticas(dias: number): Promise<Analiticas | null> {
  const db = await createClient();
  const { data, error } = await db.rpc("admin_analiticas", { _dias: dias });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") return null;
    throw new Error(`getAnaliticas: ${error.message}`);
  }

  const d = data as {
    dias: number;
    desde: string;
    hasta: string;
    visitas: number;
    visitantes: number;
    visitas_antes: number;
    visitantes_antes: number;
    por_dia: { dia: string; visitas: number; visitantes: number }[];
    paginas: FilaAnalitica[];
    origenes: FilaAnalitica[];
    dispositivos: FilaAnalitica[];
    paises: FilaAnalitica[];
    negocio: {
      cuentas: number;
      postulaciones: number;
      ordenes: number;
      ordenes_cop: number;
      publicaciones: number;
    };
  };

  return {
    dias: d.dias,
    desde: d.desde,
    hasta: d.hasta,
    visitas: d.visitas,
    visitantes: d.visitantes,
    visitasAntes: d.visitas_antes,
    visitantesAntes: d.visitantes_antes,
    porDia: d.por_dia,
    paginas: d.paginas,
    origenes: d.origenes,
    dispositivos: d.dispositivos,
    paises: d.paises,
    negocio: {
      cuentas: d.negocio.cuentas,
      postulaciones: d.negocio.postulaciones,
      ordenes: d.negocio.ordenes,
      ordenesCop: d.negocio.ordenes_cop,
      publicaciones: d.negocio.publicaciones,
    },
  };
}

// ---------------------------------------------------------------------------
// Tu empresa
// ---------------------------------------------------------------------------

/**
 * La empresa que gestiona quien está mirando, o `undefined`.
 *
 * Sale de `provider_members`, que es la tabla que decide quién gestiona qué —
 * nunca del rol `provider`, que dice que alguien *es* proveedor pero no *de
 * qué*. Un administrador que no gestione ninguna empresa no recibe ninguna.
 *
 * Si alguien gestiona varias devuelve la primera, priorizando aquella de la que
 * es dueño. Hoy no puede pasar: `postular_proveedor()` enlaza a lo sumo una por
 * persona. El día que pase, esto es lo que hay que convertir en un selector —
 * y el sitio donde hacerlo es `/cuenta/empresa`, no cada página que la use.
 */
export async function getMiEmpresa(): Promise<Provider | undefined> {
  const user = await getUser();
  if (!user) return undefined;
  const db = await createClient();
  // **El `eq("user_id")` sí hace falta aquí**, al revés que en las lecturas
  // del panel. RLS deja a un administrador leer todas las filas de
  // `provider_members`, y sin el filtro esta función le devolvía la primera
  // empresa de cualquiera: desde `/cuenta/empresa` habría editado el logo, el
  // giro o las ofertas de otra empresa creyendo que eran las suyas.
  const { data, error } = await db
    .from("provider_members")
    .select("provider_id, is_owner")
    .eq("user_id", user.id)
    .order("is_owner", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return undefined;

  return getProviderById((data[0] as { provider_id: string }).provider_id);
}

/** Un punto de experiencia ganado: qué lo dio, cuánto y cuándo. */
export interface EventoExperiencia {
  id: string;
  clave: string;
  puntos: number;
  createdAt: string;
}

/**
 * De dónde salieron los puntos de una empresa, lo más reciente primero.
 *
 * Es lo que hace auditable el nivel: la invariante 14 de `dominio-regenera`
 * exige que el puntaje se pueda seguir punto por punto, y hasta ahora los
 * eventos se escribían sin que nadie pudiera verlos. El alcance lo decide
 * `experience_events_read` — quien gestiona la empresa y un administrador, no el
 * público: la lista dice cuánto vendió y cuándo, y eso es información comercial
 * suya.
 *
 * Un evento con una clave que `src/lib/niveles.ts` no conozca —`migracion_0006`,
 * por ejemplo— se devuelve igual. Quien pinta decide cómo llamarlo; esconderlo
 * aquí haría que la suma de la lista no cuadrara con el total, que es justo lo
 * que una auditoría tiene que poder comprobar.
 */
export async function getEventosDeExperiencia(
  providerId: string,
  limite = 50,
): Promise<EventoExperiencia[]> {
  if (!UUID.test(providerId)) return [];

  const db = await createClient();
  const { data, error } = await db
    .from("experience_events")
    .select("id, clave, puntos, created_at")
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error || !data) return [];

  return (data as {
    id: string;
    clave: string;
    puntos: number;
    created_at: string;
  }[]).map((e) => ({
    id: e.id,
    clave: e.clave,
    puntos: e.puntos,
    createdAt: e.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Las ofertas de tu empresa
// ---------------------------------------------------------------------------

/**
 * Todas las ofertas de una empresa, en cualquier estado.
 *
 * Contra `listings` y no contra la vista pública: quien la gestiona tiene que
 * ver también lo que está en borrador o esperando revisión, que es justo lo que
 * la vista esconde. El alcance lo decide `listings_public_read`, que deja ver a
 * `manages_provider()` lo suyo — un id ajeno devuelve solo lo ya publicado, que
 * es lo mismo que vería cualquiera.
 */
export async function getOfertasDeEmpresa(providerId: string): Promise<Listing[]> {
  if (!UUID.test(providerId)) return [];
  const db = await createClient();
  const { data, error } = await db
    .from("listings")
    .select((await columnas()).listing)
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`getOfertasDeEmpresa: ${error.message}`);
  return (data as unknown as FilaListing[]).map(aListing);
}

/**
 * Una oferta de la empresa que se gestiona, para editarla.
 *
 * Se filtra por las dos columnas a la vez: si el id es de otra empresa, no
 * vuelve nada aunque la oferta esté publicada. Sin el `provider_id` en el
 * `where`, el formulario abriría con los datos de una oferta ajena — no podría
 * guardarla (RLS), pero enseñaría un formulario que promete algo que no va a
 * pasar.
 */
export async function getOfertaDeEmpresa(
  providerId: string,
  id: string,
): Promise<Listing | undefined> {
  if (!UUID.test(providerId) || !UUID.test(id)) return undefined;
  const db = await createClient();
  const { data, error } = await db
    .from("listings")
    .select((await columnas()).listing)
    .eq("provider_id", providerId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getOfertaDeEmpresa: ${error.message}`);
  return data ? aListing(data as unknown as FilaListing) : undefined;
}

// ---------------------------------------------------------------------------
// Reseñas
//
// Desde la 0014. Todas devuelven vacío si la migración no está aplicada: una
// ficha sin reseñas es una ficha normal, y tumbarla por una tabla que todavía
// no se puede leer sería castigar la página entera por una sección.
// ---------------------------------------------------------------------------

interface FilaResena {
  id: string;
  listing_id: string;
  rating: number;
  body: string;
  autor_nombre: string | null;
  created_at: string;
  updated_at: string | null;
}

function aResena(f: FilaResena): Resena {
  return {
    id: f.id,
    listingId: f.listing_id,
    rating: f.rating,
    body: f.body,
    autorNombre: f.autor_nombre ?? "Comprador verificado",
    createdAt: f.created_at,
    editada: f.updated_at !== null,
  };
}

const COLUMNAS_RESENA = "id, listing_id, rating, body, autor_nombre, created_at, updated_at";

/** El promedio de una oferta. `undefined` si nadie la ha reseñado. */
export async function getCalificacionDeOferta(
  listingId: string,
): Promise<Calificacion | undefined> {
  if (!UUID.test(listingId) || !(await logisticaDisponible())) return undefined;
  const db = await createClient();
  const { data, error } = await db
    .from("calificaciones_oferta")
    .select("promedio, cantidad")
    .eq("listing_id", listingId)
    .maybeSingle();
  // Sin mirar `error`, una caída de la base se leía como «nadie la ha reseñado».
  if (error) throw new Error(`getCalificacionDeOferta: ${error.message}`);
  return data ? { promedio: Number(data.promedio), cantidad: data.cantidad } : undefined;
}

/** El promedio de todo lo que vende una empresa. */
export async function getCalificacionDeProveedor(
  providerId: string,
): Promise<Calificacion | undefined> {
  if (!UUID.test(providerId) || !(await logisticaDisponible())) return undefined;
  const db = await createClient();
  const { data, error } = await db
    .from("calificaciones_proveedor")
    .select("promedio, cantidad")
    .eq("provider_id", providerId)
    .maybeSingle();
  if (error) throw new Error(`getCalificacionDeProveedor: ${error.message}`);
  return data ? { promedio: Number(data.promedio), cantidad: data.cantidad } : undefined;
}

/**
 * Las reseñas visibles de una oferta, las más recientes primero.
 *
 * `oculta = false` a mano y no solo por RLS: la política deja al autor ver la
 * suya aunque el equipo la haya ocultado, y en la ficha pública no pinta nada.
 */
export async function getResenasDeOferta(listingId: string, limite = 20): Promise<Resena[]> {
  if (!UUID.test(listingId) || !(await logisticaDisponible())) return [];
  const db = await createClient();
  const { data, error } = await db
    .from("reviews")
    .select(COLUMNAS_RESENA)
    .eq("listing_id", listingId)
    .eq("oculta", false)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`getResenasDeOferta: ${error.message}`);
  return (data as FilaResena[]).map(aResena);
}

/** Las reseñas que escribió quien mira, por ítem comprado. Para su pedido. */
export async function getMisResenas(
  orderItemIds: string[],
): Promise<Map<string, { rating: number; body: string; oculta: boolean }>> {
  const ids = orderItemIds.filter((id) => UUID.test(id));
  if (ids.length === 0 || !(await logisticaDisponible())) return new Map();
  const user = await getUser();
  if (!user) return new Map();
  const db = await createClient();
  const { data, error } = await db
    .from("reviews")
    .select("order_item_id, rating, body, oculta")
    .eq("author_id", user.id)
    .in("order_item_id", ids);
  if (error) throw new Error(`getMisResenas: ${error.message}`);
  return new Map(
    (data as { order_item_id: string; rating: number; body: string; oculta: boolean }[]).map(
      (r) => [r.order_item_id, { rating: r.rating, body: r.body, oculta: r.oculta }],
    ),
  );
}

/** Una reseña vista desde la moderación: con su oferta y si está oculta. */
export interface ResenaAdmin extends Resena {
  oculta: boolean;
  listingTitle: string;
  listingSlug: string;
}

/**
 * Todas las reseñas, para `/admin/resenas`. Sin comprobación de rol, como el
 * resto de lecturas del panel: RLS decide. A quien no es admin le llegan solo
 * las visibles, que es lo mismo que ve cualquiera.
 */
export async function getResenasParaModerar(limite = 200): Promise<ResenaAdmin[]> {
  if (!(await logisticaDisponible())) return [];
  const db = await createClient();
  const { data, error } = await db
    .from("reviews")
    .select(`${COLUMNAS_RESENA}, oculta, listings(title, slug)`)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`getResenasParaModerar: ${error.message}`);
  return (
    data as unknown as (FilaResena & {
      oculta: boolean;
      listings: { title: string; slug: string } | null;
    })[]
  ).map((f) => ({
    ...aResena(f),
    oculta: f.oculta,
    listingTitle: f.listings?.title ?? "Oferta retirada",
    listingSlug: f.listings?.slug ?? "",
  }));
}

// ---------------------------------------------------------------------------
// Contactar proveedores (0018)
// ---------------------------------------------------------------------------

let sondeo0018: { aplicada: boolean; hasta: number } | null = null;

/**
 * ¿Está aplicada la migración 0018 (prospectos e invitaciones)?
 *
 * El mismo sondeo que los demás: sin ella, «Contactar proveedores» dice qué
 * falta en vez de reventar, y `/vender?invitacion=…` se abre vacío como
 * siempre.
 */
export async function contactarDisponible(): Promise<boolean> {
  const ahora = Date.now();
  if (!sondeo0018 || (!sondeo0018.aplicada && ahora > sondeo0018.hasta)) {
    const db = await createClient();
    const { error } = await db.from("prospectos").select("id").limit(1);
    sondeo0018 = { aplicada: !error, hasta: ahora + 60_000 };
    if (error) console.warn(`[repo] la migración 0018 no está aplicada: ${error.code}`);
  }
  return sondeo0018.aplicada;
}

let sondeo0021: { aplicada: boolean; hasta: number } | null = null;

/**
 * ¿Está aplicada la 0021 (cerrar la empresa y eliminar la cuenta)?
 *
 * Pregunta por la columna `providers.cerrada_at`, que nace con las dos
 * funciones. **Esa columna no se agrega a las listas de `columnas-ofertas.ts`**:
 * nadie la necesita para pintar nada, y pedirla sin la migración rompería
 * cada consulta de proveedores (lo que pasó con la 0017).
 */
export async function bajaDisponible(): Promise<boolean> {
  const ahora = Date.now();
  if (!sondeo0021 || (!sondeo0021.aplicada && ahora > sondeo0021.hasta)) {
    const db = await createClient();
    const { error } = await db.from("providers").select("cerrada_at").limit(1);
    sondeo0021 = { aplicada: error?.code !== "42703", hasta: ahora + 60_000 };
    if (!sondeo0021.aplicada) console.warn("[repo] la migración 0021 no está aplicada: sin baja de cuenta ni de empresa");
  }
  return sondeo0021.aplicada;
}

/**
 * Las empresas que cerró su dueña, con la fecha (0021). Para que el panel diga
 * «Cerrada por su dueña» en vez de un «suspendida» que se confunde con una
 * decisión del equipo. Consulta aparte y no una columna más de
 * `columnas-ofertas.ts`: así, sin la 0021, no rompe nada.
 */
export async function getEmpresasCerradas(): Promise<Map<string, string>> {
  if (!(await bajaDisponible())) return new Map();
  const db = await createClient();
  const { data, error } = await db.from("providers").select("id, cerrada_at").not("cerrada_at", "is", null);
  if (error) {
    console.error(`[repo] empresas cerradas: ${error.message}`);
    return new Map();
  }
  return new Map(((data ?? []) as { id: string; cerrada_at: string }[]).map((f) => [f.id, f.cerrada_at]));
}

interface FilaProspecto {
  id: string;
  nombre: string;
  nit: string | null;
  correo: string | null;
  telefono: string | null;
  sitio_web: string | null;
  instagram: string | null;
  ciudad: string | null;
  departamento: string | null;
  categoria: string | null;
  encaje: Encaje | null;
  fuente: string | null;
  notas: string | null;
  estado: EstadoProspecto;
  token: string;
  baja_at: string | null;
  ultimo_envio_at: string | null;
  created_at: string;
  envios_de_campana?: { count: number }[] | null;
}

/**
 * Tipado como `string` y no como literal a propósito: con el literal, el
 * analizador de tipos de `select()` de supabase-js se mete en el `count`
 * embebido y TypeScript corta con «excessively deep».
 */
const COLUMNAS_PROSPECTO: string =
  "id, nombre, nit, correo, telefono, sitio_web, instagram, ciudad, departamento, categoria, encaje, fuente, notas, estado, token, baja_at, ultimo_envio_at, created_at, envios_de_campana(count)";

export interface FiltrosProspectos {
  estado?: EstadoProspecto | "baja";
  encaje?: Encaje;
  contacto?: "correo" | "telefono" | "ninguno";
  q?: string;
}

/** Solo dígitos y los primeros nueve: el NIT con o sin dígito de verificación. */
function nitBase(v: string | null | undefined): string | undefined {
  const d = (v ?? "").replace(/\D/g, "");
  return d.length >= 6 ? d.slice(0, 9) : undefined;
}

/**
 * Los filtros, como condiciones de la consulta. Se aplican igual a la página y
 * a «todos los que cumplen el filtro» (para mandarles a todos), así que viven
 * en un solo sitio. Genérico sobre el constructor de PostgREST para no
 * depender de sus tipos internos, que cambian entre versiones.
 */
interface Filtrable {
  eq(c: string, v: unknown): Filtrable;
  is(c: string, v: null): Filtrable;
  not(c: string, o: string, v: unknown): Filtrable;
  or(f: string): Filtrable;
}

function filtrarProspectos<T>(consulta: T, f: FiltrosProspectos): T {
  // El tipo de la consulta se lleva tal cual y se mira por esta ventana
  // estrecha: comparar los tipos completos de PostgREST contra una restricción
  // genérica hace que TypeScript corte con «excessively deep».
  let c = consulta as unknown as Filtrable;
  if (f.estado === "baja") c = c.not("baja_at", "is", null);
  else if (f.estado) c = c.eq("estado", f.estado).is("baja_at", null);
  if (f.encaje) c = c.eq("encaje", f.encaje);
  if (f.contacto === "correo") c = c.not("correo", "is", null);
  if (f.contacto === "telefono") c = c.not("telefono", "is", null);
  if (f.contacto === "ninguno") c = c.is("correo", null).is("telefono", null);
  // Fuera lo que PostgREST lee como sintaxis dentro de un `or`.
  const q = (f.q ?? "").replace(/[%_,()*\\.:]/g, " ").trim();
  if (q) {
    c = c.or(
      ["nombre", "ciudad", "departamento", "categoria", "correo", "nit"]
        .map((k) => `${k}.ilike.%${q}%`)
        .join(","),
    );
  }
  return c as unknown as T;
}

/**
 * Una página de prospectos, con cuántos correos recibió cada uno y si ya está
 * registrado en Seregenera (mismo correo o mismo NIT que una empresa de
 * `providers`). Lo segundo se calcula aquí y no se guarda: una empresa se
 * puede dar de alta por su cuenta sin pasar por la invitación.
 */
export async function getProspectos(
  filtros: FiltrosProspectos,
  pagina: number,
  porPagina = 50,
): Promise<Pagina<Prospecto>> {
  const db = await createClient();
  const [desde, hasta] = rango(pagina, porPagina);
  const { data, error, count } = await filtrarProspectos(
    db
      .from("prospectos")
      .select(COLUMNAS_PROSPECTO, { count: "exact" })
      .eq("envios_de_campana.estado", "enviado"),
    filtros,
  )
    .order("created_at", { ascending: false })
    .order("id")
    .range(desde, hasta);
  if (error) throw new Error(`prospectos: ${error.message}`);

  const empresas = await getProvidersForReview();
  const porCorreo = new Map(empresas.map((e) => [e.email.toLowerCase(), e]));
  const porNit = new Map<string, Provider>();
  for (const e of empresas) {
    const n = nitBase(e.taxId);
    if (n) porNit.set(n, e);
  }

  const filas = ((data ?? []) as unknown as FilaProspecto[]).map((f): Prospecto => {
    const n = nitBase(f.nit);
    const empresa =
      (f.correo ? porCorreo.get(f.correo.toLowerCase()) : undefined) ?? (n ? porNit.get(n) : undefined);
    return {
      id: f.id,
      nombre: f.nombre,
      nit: f.nit ?? undefined,
      correo: f.correo ?? undefined,
      telefono: f.telefono ?? undefined,
      sitioWeb: f.sitio_web ?? undefined,
      instagram: f.instagram ?? undefined,
      ciudad: f.ciudad ?? undefined,
      departamento: f.departamento ?? undefined,
      categoria: f.categoria ?? undefined,
      encaje: f.encaje ?? undefined,
      fuente: f.fuente ?? undefined,
      notas: f.notas ?? undefined,
      estado: f.estado,
      token: f.token,
      bajaAt: f.baja_at ?? undefined,
      ultimoEnvioAt: f.ultimo_envio_at ?? undefined,
      envios: f.envios_de_campana?.[0]?.count ?? 0,
      registrada: empresa ? { slug: empresa.slug, nombre: empresa.name } : undefined,
      createdAt: f.created_at,
    };
  });

  const total = count ?? filas.length;
  return { filas, total, pagina, porPagina, paginas: cuantasPaginas(total, porPagina) };
}

/** Los `id` de todos los que cumplen el filtro, para mandarles a todos. Hasta 2.000. */
export async function getIdsDeProspectos(filtros: FiltrosProspectos): Promise<string[]> {
  const db = await createClient();
  const { data, error } = await filtrarProspectos(db.from("prospectos").select("id"), filtros)
    .order("created_at", { ascending: false })
    .order("id")
    .limit(2000);
  if (error) throw new Error(`prospectos (ids): ${error.message}`);
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

export interface ResumenProspectos {
  total: number;
  conCorreo: number;
  invitados: number;
  interesados: number;
  bajas: number;
  enviadosHoy: number;
}

/** Las cifras de arriba del panel, contadas en la base y no sobre la página. */
export async function getResumenProspectos(): Promise<ResumenProspectos> {
  const db = await createClient();
  const contar = async (f: FiltrosProspectos) => {
    const { count } = await filtrarProspectos(
      db.from("prospectos").select("id", { count: "exact", head: true }),
      f,
    );
    return count ?? 0;
  };
  const [total, conCorreo, invitados, interesados, bajas, hoy] = await Promise.all([
    contar({}),
    contar({ contacto: "correo" }),
    contar({ estado: "invitado" }),
    contar({ estado: "interesado" }),
    contar({ estado: "baja" }),
    db.rpc("envios_de_hoy"),
  ]);
  return {
    total,
    conCorreo,
    invitados,
    interesados,
    bajas,
    enviadosHoy: (hoy.data as number | null) ?? 0,
  };
}

export interface Invitacion {
  nombre: string;
  nit?: string;
  correo?: string;
  telefono?: string;
  sitioWeb?: string;
  ciudad?: string;
  departamento?: string;
}

/**
 * Los datos que trae un enlace de invitación, para no volver a preguntarlos en
 * `/vender`. Con la clave pública: la función solo devuelve la fila de ese
 * token. Cualquier fallo —token raro, 0018 sin aplicar— es «sin datos».
 */
export async function getInvitacion(token: string | undefined): Promise<Invitacion | undefined> {
  if (!token || !UUID.test(token)) return undefined;
  const db = await createClient();
  const { data, error } = await db.rpc("invitacion_de_prospecto", { _token: token });
  if (error || !Array.isArray(data) || data.length === 0) return undefined;
  const f = data[0] as Record<string, string | null>;
  return {
    nombre: f.nombre ?? "",
    nit: f.nit ?? undefined,
    correo: f.correo ?? undefined,
    telefono: f.telefono ?? undefined,
    sitioWeb: f.sitio_web ?? undefined,
    ciudad: f.ciudad ?? undefined,
    departamento: f.departamento ?? undefined,
  };
}
