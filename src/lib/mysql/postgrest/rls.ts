import { POLITICAS, TABLAS, type Politica } from "../modelo";
import type { Actor } from "./tipos";

/**
 * Las políticas RLS de Postgres, aplicadas como lo hace Postgres.
 *
 * Todas las de este esquema son permisivas: varias del mismo tipo se suman con
 * OR, y una tabla con RLS y **ninguna** política que cubra la orden niega todo.
 * Una política `ALL` cubre todas las órdenes; si no trae `with check`, su
 * `using` vale también para lo que se escribe.
 *
 * La llave de servicio y las vistas no pasan por aquí: allá también se saltan
 * las políticas (las vistas son `security_invoker`, y las de MariaDB ya llevan
 * dentro el filtro que necesitan; ver el final de `mysql/logica.sql`).
 *
 * Las expresiones las tradujo `scripts/mysql/generar-esquema.mts` y nombran
 * funciones de `mysql/logica.sql`; leen la identidad de las variables que pone
 * `contexto.ts`. Se escriben sin alias de tabla, como en Postgres: la consulta
 * que las lleva tampoco usa alias para la tabla principal.
 */

/**
 * Lo que sale por cada columna de `reviews` a un visitante. Es el único permiso
 * por columna del esquema (0015): sin él, cualquiera leería quién escribió cada
 * reseña. Lo leyó `generar-esquema.mts` de `pg_attribute.attacl`.
 */
export const COLUMNAS_DE_VISITANTE: Record<string, readonly string[]> = {
  reviews: ["autor_nombre", "body", "created_at", "id", "listing_id", "oculta", "rating", "updated_at"],
};

function aplica(actor: Actor, tabla: string): boolean {
  const t = TABLAS[tabla];
  return actor.rol !== "service_role" && Boolean(t) && !t.vista && t.rls;
}

function unir(expresiones: string[]): string {
  return expresiones.length ? expresiones.map((e) => `(${e})`).join(" or ") : "false";
}

function de(tabla: string, ...ordenes: Politica["orden"][]): Politica[] {
  return (POLITICAS[tabla] ?? []).filter((p) => ordenes.includes(p.orden));
}

/** El filtro de lectura de esa tabla para ese actor, o `null` si no hay que filtrar. */
export function filtroDeLectura(tabla: string, actor: Actor): string | null {
  if (!aplica(actor, tabla)) return null;
  return unir(de(tabla, "SELECT", "ALL").map((p) => p.usando ?? "true"));
}

/**
 * Para escribir. `usando` decide qué filas existentes se pueden tocar (update y
 * delete); `comprobando`, cómo tiene que quedar la fila (insert y update).
 * `null` en los dos: no hay que comprobar nada.
 */
export function reglasDeEscritura(
  tabla: string,
  actor: Actor,
  orden: "INSERT" | "UPDATE" | "DELETE",
): { usando: string | null; comprobando: string | null } {
  if (!aplica(actor, tabla)) return { usando: null, comprobando: null };
  const ps = de(tabla, orden, "ALL");
  if (orden === "INSERT") return { usando: null, comprobando: unir(ps.map((p) => p.comprobando ?? p.usando ?? "true")) };
  if (orden === "DELETE") return { usando: unir(ps.map((p) => p.usando ?? "true")), comprobando: null };
  return {
    usando: unir(ps.map((p) => p.usando ?? "true")),
    comprobando: unir(ps.map((p) => p.comprobando ?? p.usando ?? "true")),
  };
}
