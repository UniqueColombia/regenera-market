import { sql, type Kysely } from "kysely";
import type { ListingFilters } from "../types";
import type { BaseMysql, OfertaPublicaMysql } from "./esquema";

/**
 * El catálogo leído del espejo en MariaDB: la misma consulta que
 * `consultarOfertas()` de `src/lib/repo.ts` le hace a Postgres, con los mismos
 * filtros, el mismo orden y el mismo desempate.
 *
 * Devuelve filas con **la misma forma** que entrega PostgREST, para que
 * `aListing()` de repo.ts las convierta sin saber de dónde vienen. Lo que
 * decide la regla de negocio —normalizar el texto buscado, qué niveles entran,
 * si la subcategoría se puede filtrar— lo calcula repo.ts y llega hecho: así
 * sigue escrito una sola vez.
 *
 * Recibe la base como parámetro y no tiene imports relativos con valor:
 * `scripts/mysql/espejo.mts` lo importa con `node` pelado.
 */

export interface ConsultaCatalogo {
  /** `(await columnas()).listing` de repo.ts: las mismas columnas que se le piden a Postgres. */
  columnas: string;
  filters: ListingFilters;
  /** `patron(filters.q)` de repo.ts: sin tildes, en minúsculas y entre `%`. */
  patron?: string;
  /** `nivelesDesde(filters.tier)`: «de este nivel hacia arriba». */
  niveles?: OfertaPublicaMysql["provider_tier"][];
  /** Si se filtra por subcategoría (repo.ts lo decide con el sondeo de la 0012). */
  conSubcategoria: boolean;
  desdeHasta?: [number, number];
}

/**
 * Las columnas que en Postgres eran arreglos y aquí son `json`. mysql2 ya las
 * entrega como arreglo; si un servidor o un driver distinto las mandara como
 * texto, se parsean aquí y `aListing()` no se entera.
 */
const COLUMNAS_JSON = new Set(["verticals", "images", "certifications", "includes", "scope"]);

/**
 * `"id, slug, …, listing_availability(date, …)"` → las columnas planas y si se
 * pidió la disponibilidad embebida (que PostgREST resuelve con un join y aquí
 * es una segunda consulta).
 */
function separar(columnas: string): { planas: string[]; conCupos: boolean } {
  return {
    planas: columnas
      .replace(/\w+\s*\([^)]*\)/g, "")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean),
    conCupos: /listing_availability\s*\(/.test(columnas),
  };
}

/** `2026-10-14 15:20:11.123456` (UTC) → `2026-10-14T15:20:11.123456+00:00`, la forma de PostgREST. */
function aIso(v: string): string {
  return `${v.replace(" ", "T")}+00:00`;
}

export async function consultarOfertasMysql(
  db: Kysely<BaseMysql>,
  c: ConsultaCatalogo,
): Promise<{ filas: Record<string, unknown>[]; total: number }> {
  const f = c.filters;
  let q = db.selectFrom("listings_publicos");

  if (f.kind) q = q.where("kind", "=", f.kind);
  // `@>` de Postgres sobre un arreglo = json_contains sobre el json.
  if (f.vertical) q = q.where(sql<boolean>`json_contains(verticals, json_quote(${f.vertical}))`);
  if (f.category) q = q.where("category", "=", f.category);
  if (f.subcategory && c.conSubcategoria) q = q.where("subcategory", "=", f.subcategory);
  if (f.department) q = q.where("department", "=", f.department);
  if (f.certification) {
    q = q.where(sql<boolean>`json_contains(certifications, json_quote(${f.certification}))`);
  }
  if (f.minPrice !== undefined) q = q.where("price_cop", ">=", f.minPrice);
  if (f.maxPrice !== undefined) q = q.where("price_cop", "<=", f.maxPrice);
  if (c.niveles?.length) q = q.where("provider_tier", "in", c.niveles);
  if (c.patron) {
    const p = c.patron;
    // La colación de las columnas ya ignora tildes y mayúsculas: es el `ilike`
    // sobre `sin_tildes()` de Postgres.
    q = q.where((eb) => eb.or([eb("busqueda", "like", p), eb("provider_busqueda", "like", p)]));
  }

  const { planas, conCupos } = separar(c.columnas);
  let pagina = q.select(planas.map((col) => sql.ref<unknown>(col).as(col)));
  switch (f.sort) {
    case "price_asc":
      pagina = pagina.orderBy("price_cop", "asc");
      break;
    case "price_desc":
      pagina = pagina.orderBy("price_cop", "desc");
      break;
    case "impact":
      pagina = pagina.orderBy("impacto", "desc");
      break;
    case "newest":
      pagina = pagina.orderBy("created_at", "desc");
      break;
    default:
      pagina = pagina.orderBy("featured", "desc").orderBy("provider_score", "desc");
  }
  // El desempate único de repo.ts. `id` es ascii_bin, así que ordena byte a
  // byte como el uuid de Postgres y las páginas salen iguales en las dos bases.
  pagina = pagina.orderBy("id", "asc");
  if (c.desdeHasta) {
    const [desde, hasta] = c.desdeHasta;
    pagina = pagina.limit(hasta - desde + 1).offset(desde);
  }

  const [crudas, conteo] = await Promise.all([
    pagina.execute(),
    c.desdeHasta
      ? q.select((eb) => eb.fn.countAll<number>().as("total")).executeTakeFirstOrThrow()
      : undefined,
  ]);

  const filas = crudas.map((cruda) => {
    const fila: Record<string, unknown> = { ...cruda };
    for (const col of COLUMNAS_JSON) {
      if (typeof fila[col] === "string") fila[col] = JSON.parse(fila[col] as string);
    }
    if (typeof fila.created_at === "string") fila.created_at = aIso(fila.created_at);
    if (conCupos) fila.listing_availability = [];
    return fila;
  });

  if (conCupos && filas.length) {
    const porOferta = new Map(filas.map((fila) => [fila.id as string, fila]));
    const cupos = await db
      .selectFrom("listing_availability")
      .select(["listing_id", "date", "slots_total", "slots_taken"])
      .where("listing_id", "in", [...porOferta.keys()])
      .execute();
    for (const { listing_id, ...cupo } of cupos) {
      (porOferta.get(listing_id)?.listing_availability as unknown[]).push(cupo);
    }
  }

  return { filas, total: conteo ? Number(conteo.total) : filas.length };
}
