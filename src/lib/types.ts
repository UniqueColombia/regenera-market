/**
 * Modelo de dominio de Seregenera.
 *
 * Un "listing" es cualquier cosa vendible: producto físico, experiencia con
 * reserva o servicio profesional. Los tres comparten precio, impacto y
 * proveedor; los campos propios de cada tipo viven en bloques opcionales para
 * no ensuciar el tipo base.
 */

import type { ReaccionId } from "./comunidad";

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
  /**
   * Qué es y qué ofrece la empresa (`GIROS` de `src/lib/taxonomy.ts`). Desde
   * la 0012. Cuántos caben lo decide el nivel, y lo impone la base.
   */
  giros: string[];
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
  /** `id` de `CATEGORIAS` desde la 0012. Antes, una etiqueta suelta. */
  category: string;
  /** `id` de una subcategoría de esa categoría. Opcional. */
  subcategory?: string;
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
  /**
   * La otra cara del impacto, desde la 0012: lo que la oferta **aporta** y lo
   * que **cuesta** al ambiente, dicho por el proveedor en sus palabras.
   *
   * Van los dos porque un producto regenerativo no es uno sin huella —no
   * existe— sino uno que la declara. Una ficha que solo cuenta lo bueno se lee
   * como publicidad; una que dice también «se transporta en camión desde
   * Pasto» se lee como información, y es la que un hotel puede citar en su
   * reporte.
   */
  aporteAmbiental?: string;
  consecuenciaAmbiental?: string;
  /** kg de CO₂ que emite producir y entregar una unidad, si el proveedor lo sabe. */
  huellaCo2Kg?: number;
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
  /** La empresa en cuyo nombre se compró, si se compró como empresa. Desde la 0012. */
  buyerProviderId?: string;
  /** NIT, RUT, RUC… de la empresa compradora, para facturarle a ella. Desde la 0012. */
  buyerTaxId?: string;
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
  subcategory?: string;
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
  /** Desde la 0006. Las filas anteriores traen `Colombia` por defecto. */
  country: string;
  /** Departamento, provincia, región o estado: depende del país. */
  department: string;
  city: string;
  /** Forma jurídica declarada (`src/lib/paises.ts`). Vacío en las filas viejas. */
  orgType?: string;
  /** Cómo se llama el documento tributario en su país: NIT, RUC, RFC, CUIT… */
  taxIdKind?: string;
  taxId?: string;
  /** Verticales que dice atender. Hasta cinco. */
  categories: string[];
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

/**
 * Una publicación de la Comunidad.
 *
 * Vive en `community_posts` (migración 0007). La firma un usuario y,
 * opcionalmente, **también** la empresa que gestiona: por eso hay `authorName`
 * y además un bloque `provider`. La tarjeta dice «Ana, de Cooperativa X», que
 * no es ni lo uno ni lo otro.
 *
 * `authorName` está congelado en la fila y no se lee de `profiles`: esa tabla
 * solo la puede leer su dueño, así que un visitante sin cuenta no vería ningún
 * nombre. El porqué completo está en la cabecera de la columna, en la migración.
 */
export interface CommunityPost {
  id: string;
  title: string;
  body: string;
  topic: CommunityTopic;
  authorId: string;
  authorName: string;
  /**
   * Foto de quien escribió, en vivo desde `profiles`.
   *
   * A diferencia de `authorName`, esta NO está congelada en la fila: quien se
   * cambia la foto espera que cambie en todas partes. La trae
   * `avatares_publicos()`, que devuelve solo la foto y nunca el resto del
   * perfil — ver la sección 4.b de la migración 0008.
   */
  authorAvatarUrl?: string;
  /** La empresa que firma, si se publicó en su nombre. */
  provider?: {
    id: string;
    slug: string;
    name: string;
    logoUrl?: string;
    tier: Tier;
  };
  featured: boolean;
  /** La suma de las cinco. Es por lo que se ordena el muro. */
  reactionCount: number;
  /** Cuántas de cada una. Las que valen cero no vienen. */
  reactions: Partial<Record<ReaccionId, number>>;
  /**
   * Cuáles marcó quien está mirando. Vacío para quien no tiene sesión.
   *
   * Es una lista y no un booleano desde la migración 0008: una persona puede
   * marcar varias reacciones en la misma publicación.
   */
  misReacciones: ReaccionId[];
  createdAt: string;
}

/** De qué va una publicación. Espeja el `check` de `community_posts.topic`. */
export type CommunityTopic = "experiencia" | "noticia" | "practica" | "pregunta";
