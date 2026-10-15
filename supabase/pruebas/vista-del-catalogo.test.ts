/**
 * Que la vista del catálogo y la tabla de ofertas tengan todas las columnas que
 * el código les pide.
 *
 * Existe por el 2026-10-14: la 0017 agregó columnas a `listings` sin recrear
 * `listings_publicos` (que congela su `l.*`), el código se las pidió a la vista
 * y el catálogo entero dejó de cargar en producción. Las demás pruebas no lo
 * vieron porque ninguna consulta la vista con las columnas de `repo.ts`.
 *
 * Si esto falla después de agregar una columna: la migración tiene que recrear
 * la vista (ver la 0020).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  COLUMNAS_LISTING_BASE,
  COLUMNAS_PROVIDER_BASE,
  DE_LA_0012_LISTING,
  DE_LA_0012_PROVIDER,
  DE_LA_0014_LISTING,
  DE_LA_0017_LISTING,
} from "@/lib/columnas-ofertas";
import { baseNueva, type Sql } from "./arnes";

let sql: Sql;
let cerrar: () => Promise<void>;
beforeAll(async () => ({ sql, cerrar } = await baseNueva()));
afterAll(() => cerrar());

/** Las columnas sueltas de una lista de PostgREST, sin los recursos embebidos `tabla(...)`. */
function sueltas(...listas: string[]): string[] {
  return listas
    .join(",")
    .replace(/\w+\([^)]*\)/g, "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

async function columnasDe(relacion: string): Promise<Set<string>> {
  const { rows } = await sql.query(
    `select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`,
    [relacion],
  );
  return new Set(rows.map((r) => r.column_name as string));
}

describe("columnas que pide repo.ts", () => {
  const deOferta = sueltas(COLUMNAS_LISTING_BASE, DE_LA_0012_LISTING, DE_LA_0014_LISTING, DE_LA_0017_LISTING);

  it.each(["listings_publicos", "listings"])("%s tiene todas las de una oferta", async (relacion) => {
    const hay = await columnasDe(relacion);
    expect(deOferta.filter((c) => !hay.has(c))).toEqual([]);
  });

  it("providers tiene todas las de un proveedor", async () => {
    const hay = await columnasDe("providers");
    expect(sueltas(COLUMNAS_PROVIDER_BASE, DE_LA_0012_PROVIDER).filter((c) => !hay.has(c))).toEqual([]);
  });

  it("la vista se puede consultar con esa lista de verdad", async () => {
    await expect(sql.query(`select ${deOferta.join(", ")} from listings_publicos limit 1`)).resolves.toBeDefined();
  });
});
