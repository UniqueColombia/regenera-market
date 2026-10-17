/**
 * Las tablas que usa el motor de cuentas (`cuentas.ts`) con Kysely, con los
 * tipos **tal como los entrega mysql2** con las opciones de `conexion.ts`:
 * enteros como `number`, `tinyint(1)` como `boolean`, fechas como cadena y
 * `json` ya convertido. Para **escribir** un `json` hay que mandarlo como texto
 * (`JSON.stringify`): un objeto suelto, mysql2 lo expande.
 *
 * El resto del esquema no se tipa aquí: lo recorre la capa compatible con los
 * metadatos generados de `modelo.ts`.
 */
import type { ColumnType } from "kysely";

/** Se lee como valor, se escribe como texto json. */
type Json<T> = ColumnType<T, string, string>;

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

/** De `mysql/esquema.sql`: lo que las pruebas de cuentas tocan. */
export interface RolMysql {
  user_id: string;
  role: "buyer" | "provider" | "admin";
}

export interface BaseMysql {
  usuarios: UsuarioMysql;
  sesiones: SesionMysql;
  codigos: CodigoMysql;
  user_roles: RolMysql;
}
