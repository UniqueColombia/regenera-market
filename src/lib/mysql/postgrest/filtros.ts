import { partirPorComas } from "./seleccion";
import { deEntrada, tipoDe } from "./valores";

/**
 * Los filtros de PostgREST (`.eq()`, `.in()`, `.or("a.ilike.%x%,b.eq.y")`…),
 * como SQL de MariaDB con parámetros.
 *
 * Las semánticas que importan, y que no son las de MariaDB por defecto:
 *
 * - `ilike` no distingue mayúsculas **pero sí tildes**, como el de Postgres:
 *   `lower(col) like lower(?)` sobre una columna binaria. Las columnas de
 *   búsqueda (`busqueda`, `provider_busqueda`) tienen una colación que tampoco
 *   distingue tildes: con ellas, `lower()` no estorba y la búsqueda sigue
 *   encontrando «Nariño» con «narino», que es lo que hacía `sin_tildes()`.
 * - `contains` sobre un arreglo es el `@>` de Postgres: `json_contains`.
 * - `in` vacío no devuelve nada (como PostgREST), no es un error de SQL.
 */

export type Filtro =
  | { columna: string; op: string; valor: unknown; negado?: boolean }
  | { logico: "and" | "or"; hijos: Filtro[]; negado?: boolean };

const IDENT = /^[a-z_][a-z0-9_]*$/i;

export function columnaSql(columna: string): string {
  if (!IDENT.test(columna)) throw new Error(`columna inválida «${columna}»`);
  return `\`${columna}\``;
}

/** Un valor de un filtro en texto de PostgREST: `"x,y"` entre comillas, `null`, `(a,b)`… */
function valorDeTexto(op: string, texto: string): unknown {
  const sinComillas = (s: string) => (s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s);
  if (op === "in") {
    const dentro = texto.replace(/^\(/, "").replace(/\)$/, "");
    return dentro === "" ? [] : partirPorComas(dentro).map(sinComillas);
  }
  if (op === "is") return texto === "null" ? null : texto === "true" ? true : texto === "false" ? false : texto;
  if (op === "cs" || op === "cd" || op === "ov") {
    const dentro = texto.replace(/^[{(]/, "").replace(/[})]$/, "");
    return dentro === "" ? [] : partirPorComas(dentro).map(sinComillas);
  }
  return sinComillas(texto);
}

/** `"busqueda.ilike.%a%,and(status.eq.x,featured.is.true)"` → árbol de filtros. */
export function leerLogico(texto: string, logico: "and" | "or" = "or"): Filtro {
  const hijos = partirPorComas(texto).map((parte): Filtro => {
    const negado = parte.startsWith("not.");
    const resto = negado ? parte.slice(4) : parte;
    const anidado = /^(and|or)\(([\s\S]*)\)$/.exec(resto);
    if (anidado) return { ...leerLogico(anidado[2], anidado[1] as "and" | "or"), negado };
    const primero = resto.indexOf(".");
    const columna = resto.slice(0, primero);
    let despues = resto.slice(primero + 1);
    let negadoOp = false;
    if (despues.startsWith("not.")) {
      negadoOp = true;
      despues = despues.slice(4);
    }
    const segundo = despues.indexOf(".");
    const op = despues.slice(0, segundo);
    const valor = valorDeTexto(op, despues.slice(segundo + 1));
    return { columna, op, valor, negado: negado !== negadoOp };
  });
  return { logico, hijos };
}

/** Un filtro de `.filter(col, op, valor)` o `.not(col, op, valor)`: el valor puede venir en texto de PostgREST. */
export function filtroDeOperador(columna: string, op: string, valor: unknown, negado = false): Filtro {
  return { columna, op, valor: typeof valor === "string" ? valorDeTexto(op, valor) : valor, negado };
}

/** SQL de un filtro sobre `tabla`. `ref` antepone la tabla a cada columna (en subconsultas). */
export function aSql(f: Filtro, tabla: string, params: unknown[], ref = ""): string {
  if ("logico" in f) {
    const partes = f.hijos.map((h) => aSql(h, tabla, params, ref));
    const sql = partes.length ? `(${partes.join(f.logico === "or" ? " or " : " and ")})` : f.logico === "or" ? "false" : "true";
    return f.negado ? `not ${sql}` : sql;
  }
  const col = `${ref}${columnaSql(f.columna)}`;
  const tipo = tipoDe(tabla, f.columna);
  const v = (x: unknown) => {
    params.push(tipo === "json" ? x : deEntrada(tipo, x));
    return "?";
  };
  let sql: string;
  switch (f.op) {
    case "eq":
      sql = `${col} = ${v(f.valor)}`;
      break;
    case "neq":
      sql = `${col} <> ${v(f.valor)}`;
      break;
    case "gt":
      sql = `${col} > ${v(f.valor)}`;
      break;
    case "gte":
      sql = `${col} >= ${v(f.valor)}`;
      break;
    case "lt":
      sql = `${col} < ${v(f.valor)}`;
      break;
    case "lte":
      sql = `${col} <= ${v(f.valor)}`;
      break;
    case "like":
      sql = `${col} like ${v(String(f.valor).replace(/\*/g, "%"))}`;
      break;
    case "ilike":
      sql = `lower(${col}) like lower(${v(String(f.valor).replace(/\*/g, "%"))})`;
      break;
    case "is":
      sql = f.valor === null ? `${col} is null` : f.valor === true ? `${col} is true` : `${col} is false`;
      break;
    case "in": {
      const lista = f.valor as unknown[];
      sql = lista.length ? `${col} in (${lista.map((x) => v(x)).join(", ")})` : "false";
      break;
    }
    case "cs":
      params.push(JSON.stringify(f.valor));
      sql = `json_contains(${col}, ?)`;
      break;
    case "cd":
      params.push(JSON.stringify(f.valor));
      sql = `json_contains(?, ${col})`;
      break;
    case "ov":
      params.push(JSON.stringify(f.valor));
      sql = `json_overlaps(${col}, ?)`;
      break;
    default:
      throw new Error(`operador de filtro sin soporte: ${f.op}`);
  }
  return f.negado ? `not (${sql})` : sql;
}

/** Las columnas que nombra un filtro (para saber si es de la tabla o de una relación). */
export function columnasDe(f: Filtro): string[] {
  return "logico" in f ? f.hijos.flatMap(columnasDe) : [f.columna];
}
