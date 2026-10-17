/**
 * Las tablas del espejo del catálogo en MariaDB (`mysql/espejo-catalogo.sql`),
 * con los tipos **tal como los entrega mysql2** con las opciones de
 * `conexion.ts`: enteros como `number`, `tinyint(1)` como `boolean`, decimales
 * y fechas como cadena, y `json` como cadena (MariaDB lo guarda como
 * `longtext` y el driver no sabe que es json; `catalogo.ts` lo parsea).
 *
 * Si se agrega una columna a `espejo-catalogo.sql`, va aquí también.
 */

type Estado = "draft" | "pending_review" | "approved" | "rejected" | "suspended";
type Nivel = "unverified" | "semilla" | "raiz" | "bosque";

export interface OfertaPublicaMysql {
  id: string;
  slug: string;
  provider_id: string;
  kind: "product" | "experience" | "service";
  title: string;
  summary: string;
  description: string;
  category: string;
  verticals: string;
  images: string;
  price_cop: number;
  wholesale_price_cop: number | null;
  wholesale_min_qty: number | null;
  unit: string;
  quote_only: boolean;
  stock: number | null;
  co2_kg_saved: string | null;
  water_liters_saved: string | null;
  waste_kg_reduced: string | null;
  certifications: string;
  department: string | null;
  city: string | null;
  status: Estado;
  featured: boolean;
  duration_hours: number | null;
  min_people: number | null;
  max_people: number | null;
  meeting_point: string | null;
  includes: string | null;
  delivery_time: string | null;
  scope: string | null;
  created_at: string;
  subcategory: string | null;
  aporte_ambiental: string | null;
  consecuencia_ambiental: string | null;
  huella_co2_kg: string | null;
  despacho: string | null;
  transportadora: string | null;
  envio_cop: number | null;
  entrega_dias_min: number | null;
  entrega_dias_max: number | null;
  version: number;
  envio_local_cop: number | null;
  envio_adicional_cop: number | null;
  peso_kg: string | null;
  largo_cm: number | null;
  ancho_cm: number | null;
  alto_cm: number | null;
  busqueda: string;
  impacto: string;
  provider_slug: string;
  provider_name: string;
  provider_score: number;
  provider_tier: Nivel;
  provider_busqueda: string;
}

export interface DisponibilidadMysql {
  id: string;
  listing_id: string;
  date: string;
  slots_total: number;
  slots_taken: number;
}

export interface BaseMysql {
  listings_publicos: OfertaPublicaMysql;
  listing_availability: DisponibilidadMysql;
}
