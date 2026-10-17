/**
 * Los tipos de la capa compatible: lo mínimo de PostgREST y de supabase-js que
 * la app usa, con los mismos nombres de campos, para que el código que hoy
 * habla con Supabase no note la diferencia.
 */

/**
 * Quién hace la petición: el `auth.uid()` y el `auth.role()` de Supabase.
 * `service_role` es la llave de servicio: se salta las políticas, como allá.
 */
export interface Actor {
  id: string | null;
  rol: "anon" | "authenticated" | "service_role";
}

export const VISITANTE: Actor = { id: null, rol: "anon" };
export const SERVICIO: Actor = { id: null, rol: "service_role" };

/** El error de PostgREST: `code` es el de Postgres (`23505`, `P0001`…) o el suyo (`PGRST116`…). */
export interface ErrorPostgrest {
  code: string;
  message: string;
  details: string | null;
  hint: string | null;
}

export interface Respuesta<T = unknown> {
  data: T | null;
  error: ErrorPostgrest | null;
  count: number | null;
  status: number;
  statusText: string;
}

/** Un error con forma de Postgres, para lanzar desde las funciones (`rpc.ts`). */
export class ErrorPg extends Error {
  readonly code: string;
  readonly hint: string | null;
  readonly details: string | null;

  constructor(message: string, opciones: { code?: string; hint?: string | null; details?: string | null } = {}) {
    super(message);
    this.code = opciones.code ?? "P0001";
    this.hint = opciones.hint ?? null;
    this.details = opciones.details ?? null;
  }
}
