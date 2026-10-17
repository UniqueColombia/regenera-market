/**
 * Experimento MySQL: el código de `src/lib/mysql/` corriendo **en el servidor
 * de Hostinger**, contra 127.0.0.1, con el Node 22 de la app. Responde lo que
 * desde el PC no se puede medir: la latencia real, el pool con 30 consultas a
 * la vez, si sobrevive al `wait_timeout` de 20 s y si Node puede escribir
 * fotos fuera de la carpeta del sitio.
 *
 * No toca el sitio: se sube a `~/pruebas-mysql/` (fuera de `domains/`), las
 * variables `MYSQL_*` llegan por la entrada del SSH y no se escriben en el
 * servidor, y al terminar se borra la carpeta. El paso a paso, y por qué no se
 * ha corrido todavía, está en el hito `2026-10-17-experimento-mysql-etapas-2-y-3.md`.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { sql } from "kysely";
import { AlmacenDisco, leerImagen } from "../../src/lib/almacen-disco.ts";
import { nuevaBaseMysql } from "../../src/lib/mysql/conexion.ts";
import { consultarOfertasMysql, type ConsultaCatalogo } from "../../src/lib/mysql/catalogo.ts";
import {
  COLUMNAS_LISTING_BASE,
  DE_LA_0012_LISTING,
  DE_LA_0014_LISTING,
  DE_LA_0017_LISTING,
} from "../../src/lib/columnas-ofertas.ts";

const columnas = [COLUMNAS_LISTING_BASE, DE_LA_0012_LISTING, DE_LA_0014_LISTING, DE_LA_0017_LISTING].join(", ");

/** Los mismos casos que `comparar-catalogo.mts`; el total esperado es el que dieron Supabase y MySQL en el PC. */
const CASOS: [string, Omit<ConsultaCatalogo, "columnas" | "conSubcategoria" | "desdeHasta">, number][] = [
  ["sin filtros", { filters: {} }, 19],
  ["kind=product", { filters: { kind: "product" } }, 12],
  ["vertical=hoteles", { filters: { vertical: "hoteles" } }, 12],
  ["department=Nariño", { filters: { department: "Nariño" } }, 1],
  ["department=Narino", { filters: { department: "Narino" } }, 0],
  ["certification=b-corp", { filters: { certification: "b-corp" } }, 2],
  ["tier=raiz", { filters: { tier: "raiz" }, niveles: ["raiz", "bosque"] }, 15],
  ["q=organico", { filters: { q: "organico" }, patron: "%organico%" }, 3],
  ["q=bambu", { filters: { q: "bambu" }, patron: "%bambu%" }, 2],
];

function mediana(xs: number[]): number {
  const o = xs.toSorted((a, b) => a - b);
  return o[Math.floor(o.length / 2)];
}

async function main(): Promise<number> {
  const db = nuevaBaseMysql();
  let fallos = 0;
  try {
    const sesion = await sql<{ modo: string; zona: string }>`select @@session.sql_mode as modo, @@session.time_zone as zona`.execute(db);
    const { modo, zona } = sesion.rows[0];
    const estricto = modo.includes("STRICT_ALL_TABLES") && zona === "+00:00";
    if (!estricto) fallos++;
    console.log(`${estricto ? "✓" : "✗"} sesión: ${modo} · ${zona}`);

    for (const [nombre, c, esperado] of CASOS) {
      const { total, filas } = await consultarOfertasMysql(db, { columnas, conSubcategoria: true, desdeHasta: [0, 23], ...c });
      const ok = total === esperado && filas.length === Math.min(esperado, 24);
      if (!ok) fallos++;
      console.log(`${ok ? "✓" : "✗"} ${nombre.padEnd(22)} ${total} (esperado ${esperado})`);
    }

    const tiempos: number[] = [];
    for (let i = 0; i < 50; i++) {
      const t = performance.now();
      await consultarOfertasMysql(db, { columnas, filters: {}, conSubcategoria: true, desdeHasta: [0, 23] });
      tiempos.push(performance.now() - t);
    }
    console.log(`  catálogo completo (página + conteo + cupos), 50 seguidas: mediana ${mediana(tiempos).toFixed(1)} ms · máx ${Math.max(...tiempos).toFixed(1)} ms`);

    let t = performance.now();
    const paralelas = await Promise.allSettled(
      Array.from({ length: 30 }, () => consultarOfertasMysql(db, { columnas, filters: {}, conSubcategoria: true, desdeHasta: [0, 23] })),
    );
    const caidas = paralelas.filter((r) => r.status === "rejected");
    if (caidas.length) fallos++;
    console.log(`${caidas.length ? "✗" : "✓"} 30 a la vez con un pool de 5: ${30 - caidas.length} bien en ${Math.round(performance.now() - t)} ms${caidas.length ? ` — ${(caidas[0] as PromiseRejectedResult).reason}` : ""}`);

    console.log("  esperando 25 s sin consultas (el servidor corta a los 20)…");
    await new Promise((r) => setTimeout(r, 25_000));
    t = performance.now();
    try {
      const { total } = await consultarOfertasMysql(db, { columnas, filters: {}, conSubcategoria: true });
      console.log(`✓ después de 25 s ociosa: ${total} ofertas en ${Math.round(performance.now() - t)} ms`);
    } catch (e) {
      fallos++;
      console.log(`✗ después de 25 s ociosa: ${(e as Error).message}`);
    }
  } finally {
    await db.destroy();
  }

  // Etapa 3: que Node pueda escribir y leer fotos fuera de la carpeta del
  // sitio. Ojo: lo prueba el usuario del SSH; la app corre con el mismo
  // usuario, pero detrás de las jaulas de CloudLinux, y eso solo lo confirma
  // la app desplegada.
  const carpeta = join(homedir(), "pruebas-mysql", "almacen");
  const almacen = new AlmacenDisco(carpeta);
  const duenio = "11111111-2222-4333-8444-555555555555";
  const guardada = await almacen.guardar("logos", duenio, new Blob(["foto de prueba"], { type: "image/webp" }), "image/webp");
  const leida = guardada.ok ? await leerImagen(carpeta, guardada.url.replace(/^\/archivos\//, "").split("/")) : undefined;
  const fotoOk = Boolean(leida) && new TextDecoder().decode(leida?.cuerpo) === "foto de prueba";
  if (!fotoOk) fallos++;
  console.log(`${fotoOk ? "✓" : "✗"} foto escrita y leída en ${carpeta}`);
  await almacen.borrarCarpeta("logos", duenio);

  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien.");
  return fallos ? 1 : 0;
}

process.exitCode = await main();
