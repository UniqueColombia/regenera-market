/**
 * Arranca un Postgres desechable y deja lista la base `plantilla`: Supabase
 * mínimo + todas las migraciones, en orden. Corre una vez antes de todas las
 * pruebas de la base; cada archivo copia la plantilla (`baseNueva()`).
 *
 * Dos maneras de tener el Postgres:
 * - Sin nada configurado: `embedded-postgres` baja los binarios de Postgres 17
 *   por npm y lo levanta en una carpeta temporal. Funciona igual en Windows,
 *   macOS y el runner de Linux del CI, sin instalar nada.
 * - Con `PRUEBAS_PG_URL` (un superusuario de un Postgres cualquiera, p. ej. un
 *   Docker o la VPS de destino): se usa ese. Sirve para comprobar que las
 *   migraciones corren en el Postgres al que se quiere migrar.
 *
 * Que las migraciones se apliquen ya ES una prueba: si una deja de correr
 * sobre Postgres sin Supabase, falla aquí, antes de cualquier caso.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";
import type { TestProject } from "vitest/node";

const RAIZ = join(import.meta.dirname, "..");
const PLANTILLA = "plantilla";

export function migraciones(): { nombre: string; sql: string }[] {
  const dir = join(RAIZ, "migrations");
  return readdirSync(dir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort()
    .map((nombre) => ({ nombre, sql: readFileSync(join(dir, nombre), "utf8") }));
}

export default async function preparar(project: TestProject) {
  let detener = async () => {};
  let conexion: { host: string; port: number; user: string; password: string };

  if (process.env.PRUEBAS_PG_URL) {
    const u = new URL(process.env.PRUEBAS_PG_URL);
    conexion = {
      host: u.hostname,
      port: Number(u.port || 5432),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
    };
  } else {
    const { default: EmbeddedPostgres } = await import("embedded-postgres");
    const dir = mkdtempSync(join(tmpdir(), "seregenera-pg-"));
    const port = 55000 + Math.floor(Math.random() * 5000);
    const pg = new EmbeddedPostgres({
      databaseDir: join(dir, "datos"),
      user: "postgres",
      password: "postgres",
      port,
      persistent: false,
      // UTF-8 con el proveedor de locale propio de Postgres 17: minúsculas y
      // tildes iguales en Windows y en Linux, sin depender del locale del
      // sistema (en Windows sería WIN1252 y `lower('Á')` no sería `á`).
      initdbFlags: ["--encoding=UTF8", "--locale-provider=builtin", "--builtin-locale=C.UTF-8", "--locale=C"],
      onLog: () => {},
      onError: () => {},
    });
    await pg.initialise();
    await pg.start();
    conexion = { host: "localhost", port, user: "postgres", password: "postgres" };
    detener = async () => {
      await pg.stop();
      rmSync(dir, { recursive: true, force: true });
    };
  }

  const admin = new Client({ ...conexion, database: "postgres" });
  await admin.connect();
  await admin.query(`drop database if exists ${PLANTILLA} with (force)`);
  await admin.query(`create database ${PLANTILLA}`);
  await admin.end();

  const db = new Client({ ...conexion, database: PLANTILLA });
  await db.connect();
  // Los `notice` de las migraciones (p. ej. «pg_cron no disponible») no son
  // errores; se silencian para que la salida de las pruebas se lea.
  db.on("notice", () => {});
  await db.query(readFileSync(join(import.meta.dirname, "supabase-minimo.sql"), "utf8"));
  for (const m of migraciones()) {
    try {
      await db.query(m.sql);
    } catch (e) {
      await db.end();
      await detener();
      throw new Error(`La migración ${m.nombre} no corre sobre Postgres + supabase-minimo.sql: ${(e as Error).message}`);
    }
  }
  await db.end();

  // Una base que es plantilla no admite conexiones mientras se copia.
  const fin = new Client({ ...conexion, database: "postgres" });
  await fin.connect();
  await fin.query(`alter database ${PLANTILLA} with is_template true allow_connections false`);
  await fin.end();

  project.provide("postgres", { ...conexion, plantilla: PLANTILLA });
  return detener;
}
