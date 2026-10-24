/**
 * Buscar texto, igual en todo el sitio (invariante 20 de `dominio-regenera`:
 * «Amazonía» se encuentra con «amazonia»).
 *
 * Vivía dentro de `repo.ts`; salió el 2026-10-23 cuando el panel de
 * administración ganó buscadores en las listas que se cargan enteras
 * (proveedores, usuarios, postulaciones, reseñas, comunidad) y que filtran en
 * memoria con `coincide()`. Las que van por páginas (ofertas, órdenes,
 * prospectos) buscan en la base con `patron()`.
 *
 * Módulo neutral: sin nada de servidor ni de cliente.
 */

/** Minúsculas y sin tildes. Es el gemelo de `sin_tildes()` de la base. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** El patrón de un `ilike` contra una columna ya normalizada (`busqueda`). Escapa lo que PostgREST trata como sintaxis. */
export function patron(s: string): string {
  return `%${normalize(s).replace(/[%_,()]/g, " ").trim()}%`;
}

/**
 * El patrón de un `ilike` contra una columna **sin** normalizar (un nombre o un
 * correo tal como se escribieron). Solo baja a minúsculas: quitarle las tildes
 * a la búsqueda haría que «Jesús» dejara de encontrar «Jesús». La contrapartida
 * es que «jesus» no lo encuentra; para eso hace falta una columna normalizada.
 */
export function patronLiteral(s: string): string {
  return `%${s.toLowerCase().replace(/[%_,()]/g, " ").trim()}%`;
}

/** Cada palabra de `q` aparece en alguno de los campos, sin mirar tildes ni mayúsculas. */
export function coincide(q: string | undefined, ...campos: (string | null | undefined)[]): boolean {
  const palabras = normalize(q ?? "").split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return true;
  const texto = normalize(campos.filter(Boolean).join(" "));
  return palabras.every((p) => texto.includes(p));
}

/** El `?q=` de una URL, recortado. Vacío es «sin búsqueda». */
export function leerBusqueda(v: string | string[] | undefined): string | undefined {
  const q = (Array.isArray(v) ? v[0] : v)?.trim().slice(0, 100);
  return q || undefined;
}

/** `?a=1&b=2` con los que tienen valor, o nada. Para enlaces de filtro que conservan la búsqueda. */
export function conParametros(params: Record<string, string | undefined>): string {
  const llenos = Object.entries(params).filter((e): e is [string, string] => Boolean(e[1]));
  return llenos.length ? `?${new URLSearchParams(llenos)}` : "";
}
