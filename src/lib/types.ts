/**
 * Modelo de dominio de Regenera Market.
 *
 * Un "listing" es cualquier cosa vendible: producto físico, experiencia con
 * reserva o servicio profesional. Los tres comparten precio, impacto y
 * proveedor; los campos propios de cada tipo viven en bloques opcionales para
 * no ensuciar el tipo base.
 */

export type ListingKind = "product" | "experience" | "service";

/** Verticales de negocio a las que sirve una oferta (taxonomía del menú). */
export type Vertical =
  | "hoteles"
  | "hostales"
  | "restaurantes"
  | "transporte"
  | "agencias";

/** Estado de moderación, compartido por proveedores y ofertas. */
export type ReviewStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "rejected"
  | "suspended";

/**
 * Nivel de verificación regenerativa. Se deriva del puntaje, nunca se escribe
 * a mano: ver `tierForScore` en lib/sustainability.ts
 */
export type Tier = "unverified" | "semilla" | "raiz" | "bosque";

export type Role = "buyer" | "provider" | "admin";

export interface ImpactMetrics {
  /** kg de CO₂ evitados por unidad frente a la alternativa convencional */
  co2KgSaved?: number;
  /** litros de agua ahorrados por unidad */
  waterLitersSaved?: number;
  /** kg de residuos evitados por unidad */
  wasteKgReduced?: number;
}

export interface Provider {
  id: string;
  slug: string;
  name: string;
  legalName?: string;
  /** NIT colombiano, requerido para poder cobrar */
  taxId?: string;
  tagline: string;
  description: string;
  logoUrl?: string;
  coverUrl?: string;
  department: string;
  city: string;
  website?: string;
  email: string;
  phone?: string;
  status: ReviewStatus;
  /** 0-100, calculado por el motor de verificación */
  sustainabilityScore: number;
  tier: Tier;
  /** Códigos de certificaciones reconocidas y verificadas por un admin */
  certifications: string[];
  foundedYear?: number;
  /** Rasgos de impacto social que el buscador expone como filtros */
  traits: ProviderTrait[];
  createdAt: string;
}

export type ProviderTrait =
  | "women_led"
  | "community_owned"
  | "indigenous"
  | "afro"
  | "campesino"
  | "b_corp"
  | "rural";

export interface Listing {
  id: string;
  slug: string;
  providerId: string;
  kind: ListingKind;
  title: string;
  summary: string;
  description: string;
  category: string;
  verticals: Vertical[];
  images: string[];
  /** Precio unitario al público, en COP sin decimales */
  priceCop: number;
  /** Precio mayorista B2B; null si no aplica */
  wholesalePriceCop?: number;
  /** Unidades mínimas para acceder al precio mayorista */
  wholesaleMinQty?: number;
  /** "unidad", "kit", "persona", "hora", "mes"… */
  unit: string;
  /** Si es true, no se compra directo: se pide cotización */
  quoteOnly: boolean;
  stock?: number;
  impact: ImpactMetrics;
  certifications: string[];
  department?: string;
  city?: string;
  status: ReviewStatus;
  featured: boolean;
  createdAt: string;

  /** Solo para kind === "experience" */
  experience?: {
    durationHours: number;
    minPeople: number;
    maxPeople: number;
    meetingPoint: string;
    includes: string[];
    /** Fechas ISO con cupo disponible */
    availability: { date: string; slotsLeft: number }[];
  };

  /** Solo para kind === "service" */
  service?: {
    /** "Entrega en 15 días hábiles", "Ciclo de 3 meses"… */
    deliveryTime: string;
    scope: string[];
  };
}

export interface CartLine {
  listingId: string;
  qty: number;
  /** Fecha reservada, solo para experiencias */
  date?: string;
}

export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "in_progress"
  | "fulfilled"
  | "cancelled"
  | "refunded";

export interface OrderItem {
  listingId: string;
  /** Se guarda el proveedor en el ítem: una orden puede tener varios */
  providerId: string;
  titleSnapshot: string;
  unitPriceCop: number;
  qty: number;
  date?: string;
  /** Comisión de Regenera Market sobre este ítem, en COP */
  commissionCop: number;
}

export interface Order {
  id: string;
  reference: string;
  buyerEmail: string;
  buyerName: string;
  buyerCompany?: string;
  buyerPhone?: string;
  items: OrderItem[];
  subtotalCop: number;
  commissionTotalCop: number;
  totalCop: number;
  status: OrderStatus;
  /** Impacto agregado de la orden, para el certificado del comprador */
  impact: ImpactMetrics;
  notes?: string;
  createdAt: string;
}

export interface ListingFilters {
  q?: string;
  kind?: ListingKind;
  vertical?: Vertical;
  category?: string;
  department?: string;
  tier?: Tier;
  minPrice?: number;
  maxPrice?: number;
  certification?: string;
  sort?: "relevance" | "price_asc" | "price_desc" | "impact" | "newest";
}
