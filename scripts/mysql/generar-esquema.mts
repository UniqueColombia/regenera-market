/**
 * Genera el esquema de MariaDB a partir del Postgres de producción: lee su
 * catálogo (solo estructura, ningún dato) y escribe
 *
 *   mysql/esquema.sql          tablas, llaves, CHECK e índices
 *   src/lib/mysql/modelo.ts    lo que la capa compatible necesita saber de cada
 *                              tabla: columnas y tipos, llaves, relaciones y
 *                              las políticas RLS traducidas
 *
 *   node --env-file=.env scripts/mysql/generar-esquema.mts
 *
 * Mientras Supabase sea producción, **el esquema manda allá**: una migración
 * nueva en `supabase/migrations/` se aplica en Postgres y después se vuelve a
 * correr esto. Las funciones y los triggers no se generan: están traducidos a
 * mano en `mysql/logica.sql`, porque plpgsql no se traduce solo.
 *
 * Usa el token de administración de Supabase (`SUPABASE_ACCESS_TOKEN`) con
 * consultas de solo lectura.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const raiz = join(import.meta.dirname, "..", "..");

async function consultar<T>(query: string): Promise<T[]> {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, read_only: true }),
  });
  const cuerpo = await r.json();
  if (!r.ok) throw new Error(`${r.status}: ${JSON.stringify(cuerpo).slice(0, 300)}`);
  return cuerpo as T[];
}

interface ColumnaPg {
  t: string; c: string; o: number; u: string; n: "YES" | "NO"; def: string | null;
  g: string; ge: string | null; p: number | null; s: number | null; ident: string; vista: boolean;
}
interface Restriccion { t: string; n: string; k: string; def: string; cols: string[] }
interface Indice { t: string; n: string; def: string }
interface PoliticaPg { t: string; n: string; cmd: string; qual: string | null; with_check: string | null }

const columnas = await consultar<ColumnaPg>(`
  select c.table_name t, c.column_name c, c.ordinal_position o, c.udt_name u, c.is_nullable n,
         c.column_default def, c.is_generated g, c.generation_expression ge,
         c.numeric_precision p, c.numeric_scale s, c.is_identity ident,
         (t.table_type = 'VIEW') vista
    from information_schema.columns c
    join information_schema.tables t on t.table_name = c.table_name and t.table_schema = c.table_schema
   where c.table_schema = 'public' order by c.table_name, c.ordinal_position`);
const restricciones = await consultar<Restriccion>(`
  select cl.relname t, co.conname n, co.contype k, pg_get_constraintdef(co.oid) def,
         array(select a.attname from unnest(co.conkey) with ordinality k(n, i)
                join pg_attribute a on a.attrelid = co.conrelid and a.attnum = k.n order by k.i) cols
    from pg_constraint co join pg_class cl on cl.oid = co.conrelid join pg_namespace s on s.oid = cl.relnamespace
   where s.nspname = 'public' order by 1, 2`);
const indices = await consultar<Indice>(`select tablename t, indexname n, indexdef def from pg_indexes where schemaname = 'public' order by 1, 2`);
const politicas = await consultar<PoliticaPg>(`select tablename t, policyname n, cmd, qual, with_check from pg_policies where schemaname = 'public' order by 1, 2`);
const conRls = new Set(
  (await consultar<{ t: string }>(`select c.relname t from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity`)).map((x) => x.t),
);
const enums = new Map(
  (await consultar<{ n: string; v: string[] | string }>(`select t.typname n, array_agg(e.enumlabel order by e.enumsortorder) v from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace s on s.oid = t.typnamespace where s.nspname = 'public' group by 1`)).map(
    (x) => [x.n, Array.isArray(x.v) ? x.v : String(x.v).replace(/^\{|\}$/g, "").split(",")],
  ),
);
const comoArreglo = (v: string[] | string): string[] => (Array.isArray(v) ? v : String(v).replace(/^\{|\}$/g, "").split(",").filter(Boolean));
for (const r of restricciones) r.cols = comoArreglo(r.cols);

const tablas = [...new Set(columnas.filter((c) => !c.vista).map((c) => c.t))];
const vistas = [...new Set(columnas.filter((c) => c.vista).map((c) => c.t))];

// ---------------------------------------------------------------------------
// Lo que no se traduce solo, decidido aquí y no adivinado
// ---------------------------------------------------------------------------

/** Las cuatro columnas generadas de Postgres. `clave_tributaria` llama a una función: la mantiene un trigger. */
const GENERADAS: Record<string, string> = {
  "listings.busqueda":
    "text collate utf8mb4_uca1400_ai_ci generated always as (concat_ws(' ', coalesce(title, ''), coalesce(summary, ''), coalesce(description, ''), coalesce(category, ''))) stored",
  "listings.impacto":
    "decimal(20,6) generated always as (coalesce(co2_kg_saved, 0) + coalesce(water_liters_saved, 0) / 100 + coalesce(waste_kg_reduced, 0) * 2) stored",
  "providers.busqueda": "text collate utf8mb4_uca1400_ai_ci generated always as (coalesce(name, '')) stored",
};
const MANTENIDAS_POR_TRIGGER = new Set(["providers.clave_tributaria"]);

/**
 * Los índices únicos de Postgres sobre una expresión, con su columna generada.
 * MariaDB no indexa expresiones; una columna `stored` con el mismo valor, sí.
 */
const UNICOS_POR_EXPRESION: Record<string, { tabla: string; columna: string; tipo: string; columnas: string[] }> = {
  experience_events_unicos: {
    tabla: "experience_events",
    columna: "referencia_clave",
    tipo: "varchar(255) generated always as (coalesce(referencia, '')) stored",
    columnas: ["provider_id", "clave", "referencia_clave"],
  },
  prospectos_correo_idx: {
    tabla: "prospectos",
    columna: "correo_unico",
    tipo: "varchar(255) generated always as (lower(correo)) stored",
    columnas: ["correo_unico"],
  },
};

/** Un CHECK que MariaDB no puede expresar (sin subconsultas ni operadores de arreglo) y que hace un trigger. */
const CHECK_EN_TRIGGER = new Set(["providers_giros_validos"]);

// ---------------------------------------------------------------------------
// Traducción de expresiones (CHECK y políticas)
// ---------------------------------------------------------------------------

/** De una expresión de Postgres a una de MariaDB. Cubre lo que usa este esquema; lo demás falla. */
function traducir(expr: string): string {
  let s = expr;
  s = s.replace(/\(\s*SELECT auth\.uid\(\) AS uid\)/g, "auth_uid()");
  s = s.replace(/\(\s*SELECT is_admin\(\) AS is_admin\)/g, "is_admin()");
  s = s.replace(/auth\.uid\(\)/g, "auth_uid()");
  s = s.replace(/auth\.role\(\)/g, "auth_role()");
  s = s.replace(/= ANY \(ARRAY\[([^\]]*)\]\)/g, " in ($1)");
  s = s.replace(/'([^']*)'::[a-z_]+(\[\])?/g, "'$1'");
  s = s.replace(/\((-?\d+(\.\d+)?)\)::numeric/g, "$1");
  s = s.replace(/TRIM\(BOTH FROM ([^)]+)\)/g, "trim($1)");
  // `~` de Postgres es REGEXP; en un literal de MariaDB la barra invertida se escapa.
  s = s.replace(/ ~ '([^']*)'/g, (_m, re: string) => ` regexp '${re.replace(/\\/g, "\\\\")}'`);
  if (/::|ARRAY|<@|@>|\bANY\b/.test(s)) throw new Error(`No sé traducir: ${expr}`);
  return s;
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type TipoColumna = "uuid" | "texto" | "entero" | "decimal" | "booleano" | "fecha" | "instante" | "json" | "enum";

/** Columnas que van en una llave o un índice: en MariaDB tienen que ser varchar, no text. */
const indexadas = new Set<string>();
for (const r of restricciones) if ("puf".includes(r.k)) for (const c of r.cols) indexadas.add(`${r.t}.${c}`);
for (const i of indices) {
  const m = /USING btree \(([^)]*)\)/.exec(i.def);
  if (m) for (const c of m[1].split(",")) indexadas.add(`${i.t}.${c.trim().split(" ")[0]}`);
}
// La otra punta de una llave foránea también tiene que ser varchar.
for (const r of restricciones.filter((x) => x.k === "f")) {
  const m = /REFERENCES (?:public\.)?([a-z_.]+)\(([^)]+)\)/.exec(r.def);
  if (m) for (const c of m[2].split(",")) indexadas.add(`${m[1]}.${c.trim()}`);
}

function tipoDe(c: ColumnaPg): { sql: string; tipo: TipoColumna } {
  const clave = `${c.t}.${c.c}`;
  if (c.u === "uuid") return { sql: "char(36) character set ascii collate ascii_bin", tipo: "uuid" };
  if (c.u === "text" || c.u === "varchar") {
    if (!indexadas.has(clave)) return { sql: "text", tipo: "texto" };
    return { sql: /email|correo/.test(c.c) ? "varchar(320)" : "varchar(255)", tipo: "texto" };
  }
  if (c.u === "int4" || c.u === "int2") return { sql: "int", tipo: "entero" };
  if (c.u === "int8") return { sql: "bigint", tipo: "entero" };
  if (c.u === "numeric") return { sql: c.p ? `decimal(${c.p},${c.s ?? 0})` : "decimal(20,6)", tipo: "decimal" };
  if (c.u === "bool") return { sql: "boolean", tipo: "booleano" };
  if (c.u === "date") return { sql: "date", tipo: "fecha" };
  if (c.u === "timestamptz") return { sql: "datetime(6)", tipo: "instante" };
  if (c.u === "jsonb" || c.u === "json" || c.u.startsWith("_")) return { sql: "json", tipo: "json" };
  const valores = enums.get(c.u);
  if (valores) return { sql: `enum(${valores.map((v) => `'${v}'`).join(",")})`, tipo: "enum" };
  throw new Error(`Tipo sin traducir: ${clave} ${c.u}`);
}

function defectoDe(c: ColumnaPg, tipo: TipoColumna): string | null {
  const d = c.def;
  if (!d) return null;
  if (d === "now()") return "current_timestamp(6)";
  if (d === "gen_random_uuid()") return "(uuid())";
  if (d === "auth.uid()") return null; // lo pone la capa compatible (modelo: defectoUsuario)
  if (d === "true" || d === "false") return d;
  if (/^-?\d+(\.\d+)?$/.test(d)) return d;
  const literal = /^'([^']*)'::([a-z_]+)(\[\])?$/.exec(d);
  if (literal) {
    if (tipo === "json") return `('${literal[1] === "{}" && literal[3] ? "[]" : literal[1]}')`;
    return `'${literal[1]}'`;
  }
  throw new Error(`Valor por defecto sin traducir: ${c.t}.${c.c} = ${d}`);
}

// ---------------------------------------------------------------------------
// esquema.sql
// ---------------------------------------------------------------------------

const sql: string[] = [
  "-- GENERADO por scripts/mysql/generar-esquema.mts desde el Postgres de producción.",
  "-- No se edita a mano: se cambia la migración en supabase/migrations/ y se vuelve a generar.",
  "--",
  "-- Va después de `cuentas.sql` (las llaves que apuntaban a auth.users apuntan a",
  "-- `usuarios`) y antes de `logica.sql` (funciones, triggers y vistas).",
  "",
  "set foreign_key_checks = 0;",
  ...vistas.map((v) => `drop view if exists ${v};`),
  ...tablas.map((t) => `drop table if exists ${t};`),
  "set foreign_key_checks = 1;",
  "",
];

for (const t of tablas) {
  const lineas: string[] = [];
  for (const c of columnas.filter((x) => x.t === t)) {
    const clave = `${t}.${c.c}`;
    if (GENERADAS[clave]) {
      lineas.push(`  ${c.c} ${GENERADAS[clave]}`);
      continue;
    }
    const { sql: tipo, tipo: clase } = tipoDe(c);
    const partes = [`  ${c.c} ${tipo}`];
    if (c.n === "NO" && !MANTENIDAS_POR_TRIGGER.has(clave)) partes.push("not null");
    if (c.ident === "YES" || (c.def ?? "").startsWith("nextval(")) partes.push("auto_increment");
    else {
      const d = defectoDe(c, clase);
      if (d) partes.push(`default ${d}`);
    }
    lineas.push(partes.join(" "));
  }
  for (const u of Object.values(UNICOS_POR_EXPRESION)) {
    if (u.tabla === t) lineas.push(`  ${u.columna} ${u.tipo}`);
  }
  const propias = restricciones.filter((r) => r.t === t);
  const pk = propias.find((r) => r.k === "p");
  if (pk) lineas.push(`  primary key (${pk.cols.join(", ")})`);
  for (const u of propias.filter((r) => r.k === "u")) lineas.push(`  unique key ${u.n} (${u.cols.join(", ")})`);
  for (const [nombre, u] of Object.entries(UNICOS_POR_EXPRESION)) {
    if (u.tabla === t) lineas.push(`  unique key ${nombre} (${u.columnas.join(", ")})`);
  }
  for (const i of indices.filter((x) => x.t === t)) {
    if (propias.some((r) => r.n === i.n) || UNICOS_POR_EXPRESION[i.n]) continue;
    const m = /^CREATE (UNIQUE )?INDEX \S+ ON \S+ USING btree \(([^)]*)\)/.exec(i.def);
    if (!m) continue; // gin/trigramas: la búsqueda en MariaDB va por colación
    const cols = m[2].split(",").map((x) => x.trim());
    if (cols.some((x) => /\(/.test(x))) continue; // expresión sin columna generada
    lineas.push(`  ${m[1] ? "unique " : ""}key ${i.n} (${cols.join(", ")})`);
  }
  for (const ch of propias.filter((r) => r.k === "c")) {
    if (CHECK_EN_TRIGGER.has(ch.n)) {
      lineas.push(`  -- ${ch.n}: en un trigger de logica.sql (MariaDB no lo puede expresar como CHECK)`);
      continue;
    }
    lineas.push(`  constraint ${ch.n} check (${traducir(ch.def.replace(/^CHECK \(([\s\S]*)\)$/, "$1"))})`);
  }
  // Las comas: entre definiciones, no después de un comentario ni al final.
  const definiciones = lineas.filter((l) => !l.trimStart().startsWith("--"));
  const comentarios = lineas.filter((l) => l.trimStart().startsWith("--"));
  sql.push(`create table ${t} (`, definiciones.join(",\n"), ...comentarios, ") engine = innodb default charset = utf8mb4 collate = utf8mb4_bin;", "");
}

sql.push("-- Llaves foráneas, al final: así el orden de las tablas no importa.");
for (const f of restricciones.filter((r) => r.k === "f")) {
  const def = f.def.replace(/REFERENCES auth\.users\(id\)/, "REFERENCES usuarios(id)").replace(/REFERENCES public\./, "REFERENCES ");
  sql.push(`alter table ${f.t} add constraint ${f.n} ${def};`);
}
sql.push("");
writeFileSync(join(raiz, "mysql", "esquema.sql"), sql.join("\n"));

// ---------------------------------------------------------------------------
// modelo.ts
// ---------------------------------------------------------------------------

const modelo: Record<string, unknown> = {};
for (const t of [...tablas, ...vistas]) {
  const cols: Record<string, Record<string, unknown>> = {};
  for (const c of columnas.filter((x) => x.t === t)) {
    const clave = `${t}.${c.c}`;
    const { tipo } = GENERADAS[clave]
      ? { tipo: (clave.endsWith("impacto") ? "decimal" : "texto") as TipoColumna }
      : tipoDe(c);
    const col: Record<string, unknown> = { tipo, nula: c.n === "YES" };
    if (GENERADAS[clave] || c.g === "ALWAYS") col.generada = true;
    if (c.def === "auth.uid()") col.defectoUsuario = true;
    if (c.def === "gen_random_uuid()") col.uuidPorDefecto = true;
    if (c.ident === "YES") col.autoincremental = true;
    cols[c.c] = col;
  }
  const propias = restricciones.filter((r) => r.t === t);
  modelo[t] = {
    vista: vistas.includes(t),
    rls: conRls.has(t),
    columnas: cols,
    pk: propias.find((r) => r.k === "p")?.cols ?? [],
    unicas: Object.fromEntries([
      ...propias.filter((r) => r.k === "u").map((r) => [r.n, r.cols]),
      ...Object.entries(UNICOS_POR_EXPRESION).filter(([, u]) => u.tabla === t).map(([n, u]) => [n, u.columnas]),
    ]),
    fks: propias
      .filter((r) => r.k === "f")
      .map((r) => {
        const m = /REFERENCES (?:public\.)?([a-z_.]+)\(([^)]+)\)/.exec(r.def)!;
        return { nombre: r.n, columnas: r.cols, tabla: m[1] === "auth.users" ? "usuarios" : m[1], referencias: m[2].split(",").map((x) => x.trim()) };
      }),
  };
}

const politicasTraducidas: Record<string, unknown[]> = {};
for (const p of politicas) {
  (politicasTraducidas[p.t] ??= []).push({
    nombre: p.n,
    orden: p.cmd,
    usando: p.qual ? traducir(p.qual) : null,
    comprobando: p.with_check ? traducir(p.with_check) : null,
  });
}

const ts = `/**
 * GENERADO por \`scripts/mysql/generar-esquema.mts\` desde el Postgres de producción.
 * No se edita a mano.
 *
 * Lo que la capa compatible (\`src/lib/mysql/postgrest/\`) necesita saber de cada
 * tabla para hacer lo que hace PostgREST: los tipos (para devolver lo mismo),
 * las llaves (para \`onConflict\` y los mensajes de error), las relaciones (para
 * \`providers(name)\` dentro de un \`select\`) y las políticas RLS, ya traducidas a
 * MariaDB. Las funciones que nombran (\`is_admin()\`, \`manages_provider()\`…)
 * están en \`mysql/logica.sql\`.
 */

export type TipoColumna = "uuid" | "texto" | "entero" | "decimal" | "booleano" | "fecha" | "instante" | "json" | "enum";

export interface Columna {
  tipo: TipoColumna;
  nula: boolean;
  generada?: boolean;
  /** \`default auth.uid()\` en Postgres: lo pone la capa al insertar. */
  defectoUsuario?: boolean;
  /** \`default gen_random_uuid()\`: si no viene, la capa pone uno. */
  uuidPorDefecto?: boolean;
  autoincremental?: boolean;
}

export interface Tabla {
  vista: boolean;
  /** Con RLS y sin una política que lo permita, Postgres niega: aquí también. */
  rls: boolean;
  columnas: Record<string, Columna>;
  pk: string[];
  unicas: Record<string, string[]>;
  fks: { nombre: string; columnas: string[]; tabla: string; referencias: string[] }[];
}

export interface Politica {
  nombre: string;
  orden: "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "ALL";
  usando: string | null;
  comprobando: string | null;
}

export const TABLAS: Record<string, Tabla> = ${JSON.stringify(modelo, null, 2)};

export const POLITICAS: Record<string, Politica[]> = ${JSON.stringify(politicasTraducidas, null, 2)};
`;
writeFileSync(join(raiz, "src", "lib", "mysql", "modelo.ts"), ts);
console.log(`${tablas.length} tablas, ${vistas.length} vistas, ${politicas.length} políticas → mysql/esquema.sql y src/lib/mysql/modelo.ts`);
