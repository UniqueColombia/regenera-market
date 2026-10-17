/**
 * Las tablas de MariaDB (`mysql/espejo-catalogo.sql` y
 * `mysql/permisos-de-ofertas.sql`), con los tipos **tal como los entrega
 * mysql2** con las opciones de `conexion.ts`: enteros como `number`,
 * `tinyint(1)` como `boolean`, decimales y fechas como cadena, y `json` ya
 * convertido en arreglo. Para **escribir** un `json` hay que mandarlo como
 * texto (`JSON.stringify`): un arreglo suelto, mysql2 lo expande en una lista.
 *
 * Si se agrega una columna a esos archivos, va aquí también.
 */

import type { ColumnType } from "kysely";

/** Se lee como arreglo, se escribe como texto json. */
type Json<T> = ColumnType<T, string, string>;

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
  verticals: Json<string[]>;
  images: Json<string[]>;
  price_cop: number;
  wholesale_price_cop: number | null;
  wholesale_min_qty: number | null;
  unit: string;
  quote_only: boolean;
  stock: number | null;
  co2_kg_saved: string | null;
  water_liters_saved: string | null;
  waste_kg_reduced: string | null;
  certifications: Json<string[]>;
  department: string | null;
  city: string | null;
  status: Estado;
  featured: boolean;
  duration_hours: number | null;
  min_people: number | null;
  max_people: number | null;
  meeting_point: string | null;
  includes: Json<string[] | null>;
  delivery_time: string | null;
  scope: Json<string[] | null>;
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

/** `listings`: la vista sin las columnas del proveedor. */
export type OfertaMysql = Omit<
  OfertaPublicaMysql,
  "provider_slug" | "provider_name" | "provider_score" | "provider_tier" | "provider_busqueda"
>;

export interface ProveedorMysql {
  id: string;
  slug: string;
  name: string;
  status: Estado;
  sustainability_score: number;
  tier: Nivel;
  sustainability_verified_at: string | null;
  busqueda: string;
}

/** `mysql/permisos-de-ofertas.sql`. */
export interface MiembroMysql {
  provider_id: string;
  user_id: string;
}

export interface RolMysql {
  user_id: string;
  role: "buyer" | "provider" | "admin";
}

/** `mysql/cuentas.sql`. */
export interface UsuarioMysql {
  id: string;
  email: string;
  clave: string | null;
  correo_confirmado_at: string | null;
  metadatos: Json<Record<string, unknown>>;
  creado_at: ColumnType<string, never, never>;
  ultimo_acceso_at: string | null;
}

export interface SesionMysql {
  token_hash: string;
  usuario_id: string;
  creada_at: ColumnType<string, never, string>;
  vista_at: ColumnType<string, never, string>;
  aparato: string | null;
}

export interface CodigoMysql {
  id: string;
  email: string;
  proposito: "registro" | "acceso";
  codigo_hash: string;
  creado_at: ColumnType<string, never, string>;
  vence_at: string;
  intentos: ColumnType<number, never, number>;
  usado_at: string | null;
}

export interface BaseMysql {
  listings_publicos: OfertaPublicaMysql;
  listing_availability: DisponibilidadMysql;
  listings: OfertaMysql;
  providers: ProveedorMysql;
  provider_members: MiembroMysql;
  user_roles: RolMysql;
  usuarios: UsuarioMysql;
  sesiones: SesionMysql;
  codigos: CodigoMysql;
}
