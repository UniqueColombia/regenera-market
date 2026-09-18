/**
 * Modelo de dominio de Seregenera.
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
 * Nivel público del proveedor.
 *
 * **Se deriva de los puntos de experiencia** (`src/lib/niveles.ts`), lo escribe
 * un trigger y nunca un formulario. `unverified` es un valor heredado que no se
 * asigna a nadie nuevo: todo proveedor nace en `semilla`.
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
  /** 0-100, calculado por el motor de verificación de sostenibilidad */
  sustainabilityScore: number;
  /**
   * Nivel público. **Desde la migración 0006 se deriva de `experiencePoints`**,
   * no del puntaje de sostenibilidad — ver `src/lib/niveles.ts`.
   */
  tier: Tier;
  /** Puntos de experiencia acumulados. Suben con la actividad y nunca bajan. */
  experiencePoints: number;
  /** ¿Pasó la evaluación de sostenibilidad? Es un sello aparte del nivel. */
  evaluacionVerificada: boolean;
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
  /** Comisión de Seregenera sobre este ítem, en COP */
  commissionCop: number;
  /**
   * La tasa con la que se calculó esa comisión (0.12, 0.10, 0.08…).
   *
   * Se congela en el ítem igual que el título y el precio (invariante 6): la
   * tasa depende del nivel del proveedor y el nivel sube con el tiempo, así que
   * recalcularla contra el nivel de hoy daría un número distinto del que se
   * aplicó. Sin esto, una orden vieja no se puede auditar.
   */
  commissionRate: number;
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

/**
 * Postulación de proveedor: lo que llega de `/vender`.
 *
 * Vive en `provider_applications` (migración 0004). Antes era un array en
 * memoria del servidor y se perdía en cada redespliegue.
 */
export interface ProviderApplication {
  id: string;
  /** Quién postuló, si tenía sesión. Al aprobar, queda como dueño de la empresa. */
  userId?: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  department: string;
  city: string;
  website?: string;
  description: string;
  status: ReviewStatus;
  reviewerNotes?: string;
  /** El proveedor que se creó al aprobarla. */
  providerId?: string;
  createdAt: string;
}

/**
 * Un usuario visto desde administración.
 *
 * Sale de la función `admin_listar_usuarios()` y no de una consulta normal: el
 * correo vive en `auth.users`, esquema que la clave anon no puede leer.
 */
export interface AdminUsuario {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  roles: Role[];
  lastSignInAt?: string;
  emailConfirmedAt?: string;
  createdAt: string;
}
