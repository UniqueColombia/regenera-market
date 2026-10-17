/**
 * Copia **todo** de Supabase al MariaDB de Hostinger: el paso de datos del
 * corte (etapa 4f), y lo que deja la base de pruebas lista para usar la app en
 * el modo MySQL.
 *
 *   ALMACEN_CARPETA=… node --env-file=.env scripts/mysql/copiar-datos.mts
 *
 * **Una sola dirección.** Lee Supabase con la llave de servicio (las tablas) y
 * con el token de administración (las cuentas, de `auth.users`), y escribe solo
 * en MySQL y en la carpeta de fotos. En Supabase no cambia nada.
 *
 * Lo que hace, en orden:
 *
 * 1. Rehace el esquema desde cero: `cuentas.sql` y `esquema.sql`. **Borra lo
 *    que hubiera en la base de MySQL.**
 * 2. Copia las cuentas con su hash de contraseña (bcrypt de Supabase: entra con
 *    la misma contraseña, y el primer acceso la pasa a scrypt) y las 25 tablas.
 * 3. Si hay `ALMACEN_CARPETA`, baja cada foto pública de Storage que nombre algún
 *    dato y cambia su URL **en MySQL** por la de `/archivos/…`.
 * 4. Pone la lógica al final (`logica.sql`): con los triggers activos durante la
 *    copia, cada oferta aprobada volvería a dar puntos y cada usuario nuevo
 *    crearía un perfil que ya viene en los datos.
 * 5. Compara cuántas filas hay en cada tabla, en las dos bases.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import mysql from "mysql2/promise";
import { createClient } from "@supabase/supabase-js";
import { AJUSTES_DE_SESION, opcionesMysql } from "../../src/lib/mysql/conexion.ts";
import { TABLAS, type TipoColumna } from "../../src/lib/mysql/modelo.ts";

const raiz = join(import.meta.dirname, "..", "..");
type Fila = Record<string, unknown>;

const ISO_UTC = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(?:Z|[+-]00(?::?00)?)?$/;
function instante(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const m = ISO_UTC.exec(v);
  if (m) return `${m[1]} ${m[2]}.${(m[3] ?? "").padEnd(6, "0").slice(0, 6)}`;
  const t = Date.parse(v);
  return Number.isNaN(t) ? v : instante(new Date(t).toISOString());
}
function aMysql(tipo: TipoColumna | undefined, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (tipo === "json") return JSON.stringify(v);
  if (tipo === "instante") return instante(v);
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

async function consultarPg<T>(query: string): Promise<T[]> {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, read_only: true }),
  });
  const cuerpo = await r.json();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${JSON.stringify(cuerpo).slice(0, 200)}`);
  return cuerpo as T[];
}

// ---------------------------------------------------------------------------
// Fotos
// ---------------------------------------------------------------------------

const STORAGE = /^https:\/\/[^/]+\/storage\/v1\/object\/public\/(avatares|logos)\/([0-9a-f-]{36})\/([A-Za-z0-9._-]+)(?:\?v=(\d+))?$/;
const copiadas = new Map<string, string>();
let fallidas = 0;

/** La URL de `/archivos/…` de una foto de Storage, bajándola una sola vez. */
async function aDisco(carpeta: string, url: string): Promise<string> {
  const m = STORAGE.exec(url);
  if (!m) return url;
  // Solo del Supabase propio: el texto de una oferta lo escribe su empresa, y
  // sin esto una URL con la misma forma en otro dominio se bajaría y pisaría la
  // foto de otra empresa en el disco.
  if (new URL(url).host !== new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host) return url;
  const ya = copiadas.get(url);
  if (ya) return ya;
  const [, bucket, duenio, archivo, v] = m;
  const r = await fetch(url);
  if (!r.ok) {
    fallidas++;
    console.log(`  ✗ ${r.status} al bajar ${bucket}/${duenio}/${archivo}: se deja la URL de Supabase`);
    return url;
  }
  const bytes = Buffer.from(await r.arrayBuffer());
  await mkdir(join(carpeta, bucket, duenio), { recursive: true });
  await writeFile(join(carpeta, bucket, duenio, archivo), bytes);
  const nueva = `/archivos/${bucket}/${duenio}/${v ? Number(v).toString(36) : "0"}/${archivo}`;
  copiadas.set(url, nueva);
  return nueva;
}

async function reescribirFotos(carpeta: string, v: unknown): Promise<unknown> {
  if (typeof v === "string") return aDisco(carpeta, v);
  if (Array.isArray(v)) return Promise.all(v.map((x) => reescribirFotos(carpeta, x)));
  return v;
}

// ---------------------------------------------------------------------------

async function main(): Promise<number> {
  // Desde el 2026-10-17 la base de producción (`…_seregenera`) es la que manda:
  // rehacerla borraría todo lo escrito desde el corte. Este script queda para la
  // de pruebas. Y corrido desde un PC, deja como DEFINER de la lógica la cuenta
  // remota de ese PC (hito 2026-10-17-produccion-sobre-mariadb.md).
  if (/_seregenera$/.test(process.env.MYSQL_DATABASE ?? "")) {
    console.error("MYSQL_DATABASE es la base de producción: este script la borraría. Se para.");
    return 1;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const servicio = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !servicio || !process.env.SUPABASE_ACCESS_TOKEN) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o SUPABASE_ACCESS_TOKEN en el .env.");
    return 1;
  }
  const carpeta = process.env.ALMACEN_CARPETA;
  const supabase = createClient(url, servicio, { auth: { persistSession: false } });
  const tablas = Object.entries(TABLAS).filter(([, t]) => !t.vista).map(([n]) => n);

  console.log("▸ Leyendo Supabase");
  const datos: Record<string, Fila[]> = {};
  for (const t of tablas) {
    const orden = TABLAS[t].pk[0] ?? Object.keys(TABLAS[t].columnas)[0];
    datos[t] = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await supabase.from(t).select("*").order(orden).range(desde, desde + 999);
      if (error) throw new Error(`${t}: ${error.message}`);
      datos[t].push(...(data as Fila[]));
      if (data.length < 1000) break;
    }
  }
  const cuentas = await consultarPg<{
    id: string; email: string | null; encrypted_password: string | null; email_confirmed_at: string | null;
    raw_user_meta_data: Record<string, unknown> | null; created_at: string; last_sign_in_at: string | null;
  }>("select id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, last_sign_in_at from auth.users where deleted_at is null");
  console.log(`  ${cuentas.length} cuentas · ${tablas.map((t) => `${t} ${datos[t].length}`).join(" · ")}`);

  if (carpeta) {
    console.log(`\n▸ Fotos de Storage → ${carpeta}`);
    for (const t of tablas) for (const fila of datos[t]) for (const [k, v] of Object.entries(fila)) fila[k] = await reescribirFotos(carpeta, v);
    console.log(`  ${copiadas.size} fotos copiadas${fallidas ? `, ${fallidas} sin poder bajar` : ""}`);
  }

  console.log("\n▸ Rehaciendo MySQL");
  const con = await mysql.createConnection({ ...opcionesMysql(), multipleStatements: true });
  try {
    await con.query(AJUSTES_DE_SESION);
    await con.query("set @app_rol = null, @app_usuario = null, @app_definer = 1");
    for (const archivo of ["cuentas.sql", "esquema.sql"]) await con.query(await readFile(join(raiz, "mysql", archivo), "utf8"));

    // Las columnas que MariaDB calcula sola no se copian: las rechazaría.
    const [generadas] = await con.query(
      "select table_name t, column_name c from information_schema.columns where table_schema = database() and extra like '%GENERATED%'",
    );
    const noCopiar = new Set((generadas as { t: string; c: string }[]).map((g) => `${g.t}.${g.c}`));

    await con.query("set foreign_key_checks = 0");
    for (let i = 0; i < cuentas.length; i += 100) {
      const lote = cuentas.slice(i, i + 100).map((u) => [
        u.id,
        (u.email ?? `${u.id}@sin-correo.invalid`).trim().toLowerCase(),
        u.encrypted_password || null,
        instante(u.email_confirmed_at),
        JSON.stringify(u.raw_user_meta_data ?? {}),
        instante(u.created_at),
        instante(u.last_sign_in_at),
      ]);
      await con.query("insert into usuarios (id, email, clave, correo_confirmado_at, metadatos, creado_at, ultimo_acceso_at) values ?", [lote]);
    }
    for (const t of tablas) {
      const filas = datos[t];
      if (!filas.length) continue;
      const columnas = Object.keys(TABLAS[t].columnas).filter((c) => !noCopiar.has(`${t}.${c}`) && filas[0][c] !== undefined);
      for (let i = 0; i < filas.length; i += 100) {
        const lote = filas.slice(i, i + 100).map((f) => columnas.map((c) => aMysql(TABLAS[t].columnas[c].tipo, f[c])));
        await con.query(`insert into \`${t}\` (${columnas.map((c) => `\`${c}\``).join(", ")}) values ?`, [lote]);
      }
    }
    await con.query("set foreign_key_checks = 1");
    await con.query(await readFile(join(raiz, "mysql", "logica.sql"), "utf8"));

    console.log("\n▸ Filas en cada base");
    let distintas = 0;
    const [[{ n: enUsuarios }]] = (await con.query("select count(*) n from usuarios")) as unknown as [[{ n: number }]];
    const fila = (nombre: string, pg: number, my: number) => {
      if (pg !== Number(my)) distintas++;
      console.log(`  ${pg === Number(my) ? "✓" : "✗"} ${nombre.padEnd(28)} ${pg} · ${my}`);
    };
    fila("usuarios (auth.users)", cuentas.length, enUsuarios);
    for (const t of tablas) {
      const [[{ n }]] = (await con.query(`select count(*) n from \`${t}\``)) as unknown as [[{ n: number }]];
      fila(t, datos[t].length, n);
    }
    const conClave = cuentas.filter((u) => u.encrypted_password).length;
    console.log(`\n  ${conClave} de ${cuentas.length} cuentas con contraseña (las demás entran con código).`);
    const huella = createHash("sha256").update(JSON.stringify(cuentas.map((u) => u.id).sort())).digest("hex").slice(0, 12);
    console.log(`  Huella de las cuentas copiadas: ${huella}. Supabase, sin cambios.`);
    return distintas ? 1 : 0;
  } finally {
    await con.end();
  }
}

process.exitCode = await main();
