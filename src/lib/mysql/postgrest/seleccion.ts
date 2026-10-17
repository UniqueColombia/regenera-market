/**
 * El `select` de PostgREST: `"id, slug, providers(name, tier), listing_availability(*)"`.
 *
 * Cubre lo que usa la app: columnas, `*`, `alias:columna`, relaciones anidadas
 * con o sin `!inner` (o `!nombre_de_la_llave`) y `rel(count)`. Lo demás
 * (conversiones `::tipo`, agregados, JSON con `->`) no aparece en el código y
 * aquí falla con un mensaje claro en vez de hacer otra cosa.
 */

export type Elemento =
  | { tipo: "todo" }
  | { tipo: "columna"; nombre: string; alias: string }
  | { tipo: "conteo"; alias: string }
  | { tipo: "relacion"; tabla: string; alias: string; interna: boolean; pista: string | null; elementos: Elemento[] };

const IDENT = /^[a-z_][a-z0-9_]*$/i;

/**
 * Parte por comas que no estén dentro de paréntesis, llaves ni comillas. Las
 * llaves cuentan: un arreglo de PostgREST (`verticals.ov.{hoteles,hostales}`)
 * lleva comas dentro, y partirlo ahí rompe el filtro.
 */
export function partirPorComas(texto: string): string[] {
  const partes: string[] = [];
  let profundidad = 0;
  let comillas = false;
  let actual = "";
  for (const c of texto) {
    if (c === '"') comillas = !comillas;
    if (!comillas && (c === "(" || c === "{")) profundidad++;
    if (!comillas && (c === ")" || c === "}")) profundidad--;
    if (!comillas && c === "," && profundidad === 0) {
      partes.push(actual);
      actual = "";
    } else actual += c;
  }
  if (actual.trim()) partes.push(actual);
  return partes.map((p) => p.trim()).filter(Boolean);
}

export function leerSeleccion(texto: string | undefined): Elemento[] {
  const limpio = (texto ?? "*").replace(/\s+/g, " ").trim() || "*";
  return partirPorComas(limpio).map(leerElemento);
}

function leerElemento(parte: string): Elemento {
  if (parte === "*") return { tipo: "todo" };
  const abre = parte.indexOf("(");
  if (abre > 0) {
    if (!parte.endsWith(")")) throw new Error(`select mal formado: ${parte}`);
    let cabeza = parte.slice(0, abre).trim();
    const dentro = parte.slice(abre + 1, -1);
    let alias: string | null = null;
    if (cabeza.includes(":")) [alias, cabeza] = cabeza.split(":").map((s) => s.trim());
    let interna = false;
    let pista: string | null = null;
    if (cabeza.includes("!")) {
      const [tabla, ...mods] = cabeza.split("!");
      cabeza = tabla;
      for (const m of mods) {
        if (m === "inner") interna = true;
        else if (m !== "left") pista = m;
      }
    }
    if (!IDENT.test(cabeza)) throw new Error(`select: relación inválida «${cabeza}»`);
    return { tipo: "relacion", tabla: cabeza, alias: alias ?? cabeza, interna, pista, elementos: leerSeleccion(dentro) };
  }
  let nombre = parte;
  let alias: string | null = null;
  if (nombre.includes(":")) [alias, nombre] = nombre.split(":").map((s) => s.trim());
  if (nombre === "count") return { tipo: "conteo", alias: alias ?? "count" };
  if (!IDENT.test(nombre)) throw new Error(`select: columna inválida «${nombre}»`);
  return { tipo: "columna", nombre, alias: alias ?? nombre };
}
