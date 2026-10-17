import { TABLAS, type TipoColumna } from "../modelo";

/**
 * Los valores, de MariaDB a lo que devuelve PostgREST y de vuelta.
 *
 * Importa porque el código de la app ya se escribió contra PostgREST: corta las
 * fechas con `slice(0, 10)`, suma decimales, recorre arreglos. Si aquí llegara
 * otra forma, fallaría lejos de la causa.
 */

const ISO_UTC = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(?:Z|[+-]00(?::?00)?)?$/;

/** `2026-10-14 15:20:11.123400` (MariaDB) → `2026-10-14T15:20:11.1234+00:00` (PostgREST). */
export function instanteDeSalida(v: string): string {
  const m = ISO_UTC.exec(v);
  if (!m) return v;
  const fraccion = (m[3] ?? "").replace(/0+$/, "");
  return `${m[1]}T${m[2]}${fraccion ? `.${fraccion}` : ""}+00:00`;
}

/**
 * Lo que manda la app (un ISO de `toISOString()`, con o sin zona) → lo que
 * acepta un `datetime(6)` en modo estricto. Se conserva la precisión si ya
 * viene en UTC; si trae otra zona, se pasa por `Date` (milisegundos).
 */
export function instanteDeEntrada(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (v instanceof Date) return instanteDeEntrada(v.toISOString());
  if (typeof v !== "string") return v;
  const m = ISO_UTC.exec(v);
  if (m) return `${m[1]} ${m[2]}.${(m[3] ?? "").padEnd(6, "0").slice(0, 6)}`;
  const t = Date.parse(v);
  if (Number.isNaN(t)) return v; // la base dirá que no es una fecha
  return instanteDeEntrada(new Date(t).toISOString());
}

export function tipoDe(tabla: string, columna: string): TipoColumna | undefined {
  return TABLAS[tabla]?.columnas[columna]?.tipo;
}

/** Un valor de una fila de MariaDB, en la forma de PostgREST. */
export function deSalida(tipo: TipoColumna | undefined, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  switch (tipo) {
    case "decimal":
      return typeof v === "string" ? Number(v) : v;
    case "instante":
      return typeof v === "string" ? instanteDeSalida(v) : v;
    case "json":
      return typeof v === "string" ? JSON.parse(v) : v;
    case "entero":
      return typeof v === "string" ? Number(v) : v;
    default:
      return v;
  }
}

/** Un valor que manda la app, listo para un parámetro de mysql2. */
export function deEntrada(tipo: TipoColumna | undefined, v: unknown): unknown {
  if (v === undefined) return null;
  if (v === null) return null;
  switch (tipo) {
    case "json":
      // Un arreglo suelto, mysql2 lo expandiría en una lista: va como texto json.
      return JSON.stringify(v);
    case "instante":
      return instanteDeEntrada(v);
    case "fecha":
      return typeof v === "string" ? v.slice(0, 10) : v;
    default:
      if (Array.isArray(v) || (typeof v === "object" && !(v instanceof Date))) return JSON.stringify(v);
      return v;
  }
}

/** Una fila entera de una tabla o vista, de MariaDB a PostgREST. */
export function filaDeSalida(tabla: string, fila: Record<string, unknown>): Record<string, unknown> {
  const columnas = TABLAS[tabla]?.columnas ?? {};
  const salida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fila)) salida[k] = deSalida(columnas[k]?.tipo, v);
  return salida;
}
