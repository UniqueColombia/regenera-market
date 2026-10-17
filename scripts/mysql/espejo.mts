/**
 * Etapa 1 del experimento MySQL (`.claude/hitos/2026-10-17-experimento-mysql-etapas-0-y-1.md`):
 * copia el catálogo público de Supabase al MariaDB de Hostinger y comprueba,
 * campo por campo, que llegó igual.
 *
 *   node --env-file=.env scripts/mysql/espejo.mts
 *
 * **Una sola dirección.** Lee Supabase con la llave *anónima* —lo mismo que ve
 * cualquier visitante de seregenera.com, a través de RLS— y escribe en MySQL.
 * Nunca escribe en Supabase, y al espejo no llega nada que no sea ya público.
 * Cada corrida borra el espejo y lo rehace con los archivos de `ESQUEMA`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import mysql from "mysql2/promise";
import { createClient } from "@supabase/supabase-js";
import { AJUSTES_DE_SESION, nuevaBaseMysql, opcionesMysql } from "../../src/lib/mysql/conexion.ts";
import { consultarOfertasMysql } from "../../src/lib/mysql/catalogo.ts";
import {
  COLUMNAS_LISTING_BASE,
  DE_LA_0012_LISTING,
  DE_LA_0014_LISTING,
  DE_LA_0017_LISTING,
} from "../../src/lib/columnas-ofertas.ts";

const raiz = join(import.meta.dirname, "..", "..");

/**
 * En este orden: `espejo-catalogo.sql` borra `listings`, y con ella los
 * triggers que pone `permisos-de-ofertas.sql`; y las tablas de permisos apuntan
 * a `usuarios`, que crea `cuentas.sql`.
 */
const ESQUEMA = ["espejo-catalogo.sql", "cuentas.sql", "permisos-de-ofertas.sql"];

/** Lo que se copia de cada tabla: lo que tiene `espejo-catalogo.sql`, menos las columnas generadas. */
const TABLAS = {
  providers: ["id", "slug", "name", "status", "sustainability_score", "tier", "sustainability_verified_at"],
  listings: [
    "id", "slug", "provider_id", "kind", "title", "summary", "description", "category",
    "verticals", "images", "price_cop", "wholesale_price_cop", "wholesale_min_qty", "unit",
    "quote_only", "stock", "co2_kg_saved", "water_liters_saved", "waste_kg_reduced",
    "certifications", "department", "city", "status", "featured", "duration_hours",
    "min_people", "max_people", "meeting_point", "includes", "delivery_time", "scope",
    "created_at", "subcategory", "aporte_ambiental", "consecuencia_ambiental", "huella_co2_kg",
    "despacho", "transportadora", "envio_cop", "entrega_dias_min", "entrega_dias_max", "version",
    "envio_local_cop", "envio_adicional_cop", "peso_kg", "largo_cm", "ancho_cm", "alto_cm",
  ],
  listing_availability: ["id", "listing_id", "date", "slots_total", "slots_taken"],
} as const;

type Fila = Record<string, unknown>;

const TIEMPO = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * Un `timestamptz` de PostgREST (`2026-10-14T15:20:11.1234+00:00`) en UTC con
 * los seis decimales: `["2026-10-14", "15:20:11.123400"]`. Supabase responde en
 * UTC; si algún día no, se pasa por `Date` y se pierden los microsegundos.
 */
function utc(v: string): [string, string] | undefined {
  const m = TIEMPO.exec(v);
  if (!m) return undefined;
  if (!m[4] || m[4] === "Z" || /^\+00:?00$/.test(m[4])) {
    return [m[1], `${m[2]}.${(m[3] ?? "").padEnd(6, "0").slice(0, 6)}`];
  }
  const iso = new Date(v).toISOString();
  return [iso.slice(0, 10), `${iso.slice(11, 23)}000`];
}

/** Un valor de PostgREST, listo para un `insert` de mysql2. */
function aMysql(v: unknown): unknown {
  if (Array.isArray(v)) return JSON.stringify(v);
  if (typeof v === "string") {
    const t = utc(v);
    if (t) return `${t[0]} ${t[1]}`;
  }
  return v;
}

/** Para comparar: decimales como número, fechas en UTC con seis decimales, llaves en orden. */
function normal(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    const t = utc(v);
    if (t) return `${t[0]}T${t[1]}`;
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    return v;
  }
  if (Array.isArray(v)) return v.map(normal);
  if (typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Fila)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, normal(x)]),
    );
  }
  return v;
}

async function main(): Promise<number> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonima = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonima) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en el .env.");
    return 1;
  }
  const supabase = createClient(url, anonima, { auth: { persistSession: false } });

  async function leerTodo(tabla: string, columnas: string): Promise<Fila[]> {
    const filas: Fila[] = [];
    // PostgREST entrega como mucho 1000 filas por respuesta.
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await supabase
        .from(tabla)
        .select(columnas)
        .order("id")
        .range(desde, desde + 999);
      if (error) throw new Error(`${tabla}: ${error.message}`);
      filas.push(...(data as unknown as Fila[]));
      if (data.length < 1000) return filas;
    }
  }

  console.log("▸ Leyendo Supabase (llave anónima: solo lo público)");
  let t = performance.now();
  const datos: Record<keyof typeof TABLAS, Fila[]> = {
    providers: await leerTodo("providers", TABLAS.providers.join(", ")),
    listings: await leerTodo("listings", TABLAS.listings.join(", ")),
    listing_availability: await leerTodo("listing_availability", TABLAS.listing_availability.join(", ")),
  };
  // RLS puede dejar ver una oferta y no su proveedor (o sus cupos sin la
  // oferta). En MySQL la llave foránea la rechazaría: se queda fuera, y se dice.
  const proveedores = new Set(datos.providers.map((p) => p.id));
  const huerfanas = datos.listings.filter((l) => !proveedores.has(l.provider_id));
  datos.listings = datos.listings.filter((l) => proveedores.has(l.provider_id));
  const ofertas = new Set(datos.listings.map((l) => l.id));
  datos.listing_availability = datos.listing_availability.filter((c) => ofertas.has(c.listing_id));
  for (const [tabla, filas] of Object.entries(datos)) console.log(`  ${tabla.padEnd(22)} ${filas.length}`);
  if (huerfanas.length) console.log(`  (${huerfanas.length} ofertas sin proveedor visible, no se copian)`);
  console.log(`  ${Math.round(performance.now() - t)} ms`);

  console.log("\n▸ Rehaciendo el espejo en MySQL");
  t = performance.now();
  const con = await mysql.createConnection({ ...opcionesMysql(), multipleStatements: true });
  try {
    await con.query(AJUSTES_DE_SESION);
    // El `postgres` de los scripts: los triggers de permisos no lo frenan.
    await con.query("set @app_rol = 'servicio', @app_usuario = null");
    for (const archivo of ESQUEMA) await con.query(readFileSync(join(raiz, "mysql", archivo), "utf8"));
    for (const [tabla, columnas] of Object.entries(TABLAS)) {
      const filas = datos[tabla as keyof typeof TABLAS];
      for (let i = 0; i < filas.length; i += 200) {
        const lote = filas.slice(i, i + 200).map((f) => columnas.map((c) => aMysql(f[c])));
        await con.query(`insert into ${tabla} (${columnas.map((c) => `\`${c}\``).join(", ")}) values ?`, [lote]);
      }
    }
  } finally {
    await con.end();
  }
  console.log(`  ${Math.round(performance.now() - t)} ms`);

  console.log("\n▸ Comparando listings_publicos campo por campo");
  const columnas = [COLUMNAS_LISTING_BASE, DE_LA_0012_LISTING, DE_LA_0014_LISTING, DE_LA_0017_LISTING].join(", ");
  const enPostgres = await leerTodo("listings_publicos", columnas);
  const db = nuevaBaseMysql();
  let enMysql: Fila[];
  try {
    ({ filas: enMysql } = await consultarOfertasMysql(db, { columnas, filters: {}, conSubcategoria: true }));
  } finally {
    await db.destroy();
  }
  const porId = new Map(enMysql.map((f) => [f.id, f]));
  const diferencias: string[] = [];
  if (enPostgres.length !== enMysql.length) {
    diferencias.push(`filas: Postgres ${enPostgres.length}, MySQL ${enMysql.length}`);
  }
  for (const pg of enPostgres) {
    const my = porId.get(pg.id);
    if (!my) {
      diferencias.push(`${pg.slug}: no está en MySQL`);
      continue;
    }
    for (const [col, valor] of Object.entries(pg)) {
      let a = normal(valor);
      let b = normal(my[col]);
      // El orden de los cupos embebidos no está definido en ninguna de las dos.
      if (col === "listing_availability") {
        const porFecha = (x: unknown) =>
          ((x as Fila[] | null) ?? []).toSorted((p, q) => String(p.date).localeCompare(String(q.date)));
        a = porFecha(a);
        b = porFecha(b);
      }
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        diferencias.push(`${pg.slug}.${col}: Postgres ${JSON.stringify(a)} ≠ MySQL ${JSON.stringify(b)}`);
      }
    }
  }
  const campos = enPostgres.length * (enPostgres[0] ? Object.keys(enPostgres[0]).length : 0);
  console.log(`  ${enPostgres.length} ofertas públicas, ${campos} campos comparados`);
  if (diferencias.length) {
    for (const d of diferencias.slice(0, 15)) console.log(`  ✗ ${d}`);
    if (diferencias.length > 15) console.log(`  … y ${diferencias.length - 15} más`);
    return 1;
  }
  console.log("  ✓ idénticas");
  return 0;
}

process.exitCode = await main();
