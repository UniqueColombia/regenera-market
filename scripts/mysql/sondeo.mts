/**
 * Etapa 0 del experimento MySQL (`.claude/hitos/2026-10-17-experimento-mysql-etapas-0-y-1.md`):
 * ¿sirve el MySQL del plan de Hostinger para lo que hoy hace Postgres?
 *
 * Solo lee la configuración y crea objetos de prueba con prefijo `sondeo_`, que
 * borra al terminar. No toca Supabase ni la app.
 *
 *   node --env-file=.env scripts/mysql/sondeo.mts
 *
 * Desde el PC usa `MYSQL_HOST` (el host remoto, con la IP del PC autorizada en
 * hPanel). En el servidor de Hostinger el host es 127.0.0.1.
 */
import mysql from "mysql2/promise";

type Prueba = { nombre: string; sql: string[]; limpiar?: string[] };

// Lo que el esquema de Postgres usa y habría que tener en MySQL. Cada prueba es
// independiente: si una falla, las demás siguen y el resumen dice cuál.
const PRUEBAS: Prueba[] = [
  {
    nombre: "función almacenada (los gemelos SQL de precios y niveles)",
    sql: [
      "create function sondeo_doble(x int) returns int deterministic no sql return x * 2",
      "select sondeo_doble(21) as r",
    ],
    limpiar: ["drop function if exists sondeo_doble"],
  },
  {
    nombre: "trigger (stock, estados de una orden)",
    sql: [
      "create table sondeo_t (id int primary key, n int not null default 0)",
      "create trigger sondeo_trg before insert on sondeo_t for each row set new.n = new.id * 10",
      "insert into sondeo_t (id) values (3)",
      "select n as r from sondeo_t where id = 3",
    ],
    limpiar: ["drop table if exists sondeo_t"],
  },
  {
    nombre: "CHECK se cumple (precios > 0, estados válidos)",
    sql: [
      "create table sondeo_c (precio int check (precio > 0))",
      "insert into sondeo_c values (-1)",
    ],
    limpiar: ["drop table if exists sondeo_c"],
  },
  {
    nombre: "JSON (los jsonb de envío por zona, metadatos)",
    sql: [`select json_unquote(json_extract('{"zona":{"bogota":5000}}', '$.zona.bogota')) as r`],
  },
  {
    nombre: "JSON_TABLE (recorrer un arreglo como filas)",
    sql: [`select count(*) as r from json_table('[1,2,3]', '$[*]' columns (v int path '$')) t`],
  },
  {
    nombre: "CTE recursiva y funciones de ventana",
    sql: [
      "with recursive n(i) as (select 1 union all select i + 1 from n where i < 5) select sum(i) over () as r from n limit 1",
    ],
  },
  {
    nombre: "FOR UPDATE SKIP LOCKED (compra atómica y cupos)",
    sql: [
      "create table sondeo_l (id int primary key) engine=innodb",
      "insert into sondeo_l values (1)",
      "start transaction",
      "select id as r from sondeo_l where id = 1 for update skip locked",
      "commit",
    ],
    limpiar: ["drop table if exists sondeo_l"],
  },
  {
    nombre: "FULLTEXT en InnoDB (sustituto de pg_trgm/unaccent)",
    sql: [
      "create table sondeo_f (t varchar(200), fulltext (t)) engine=innodb default charset=utf8mb4 collate=utf8mb4_0900_ai_ci",
      "insert into sondeo_f values ('Café orgánico de Nariño'), ('Miel de abejas')",
      "select count(*) as r from sondeo_f where match(t) against ('cafe organico' in natural language mode)",
    ],
    limpiar: ["drop table if exists sondeo_f"],
  },
  {
    nombre: "evento programado (sustituto de pg_cron)",
    sql: [
      "create event sondeo_e on schedule every 1 day do select 1",
      "select status as r from information_schema.events where event_name = 'sondeo_e' and event_schema = database()",
    ],
    limpiar: ["drop event if exists sondeo_e"],
  },
];

const VARIABLES = [
  "version",
  "version_comment",
  "sql_mode",
  "character_set_server",
  "collation_server",
  "time_zone",
  "system_time_zone",
  "log_bin",
  "log_bin_trust_function_creators",
  "event_scheduler",
  "lower_case_table_names",
  "max_connections",
  "max_user_connections",
  "max_allowed_packet",
  "wait_timeout",
];

async function main(): Promise<number> {
  const faltan = ["MYSQL_HOST", "MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD"].filter((v) => !process.env[v]);
  if (faltan.length) {
    console.error(`Faltan en el .env: ${faltan.join(", ")}`);
    return 1;
  }
  const t0 = performance.now();
  const con = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT ?? 3306),
    database: process.env.MYSQL_DATABASE,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    connectTimeout: 15000,
  });
  console.log(`Conectado a ${process.env.MYSQL_HOST} en ${Math.round(performance.now() - t0)} ms\n`);

  console.log("▸ Configuración");
  for (const v of VARIABLES) {
    try {
      const [filas] = await con.query(`select @@${v} as valor`);
      console.log(`  ${v.padEnd(32)} ${(filas as { valor: unknown }[])[0].valor}`);
    } catch {
      console.log(`  ${v.padEnd(32)} (no existe en este servidor)`);
    }
  }
  const [permisos] = await con.query("show grants for current_user()");
  for (const fila of permisos as Record<string, string>[]) console.log(`  ${Object.values(fila)[0]}`);

  console.log("\n▸ Capacidades");
  let fallos = 0;
  for (const p of PRUEBAS) {
    let resultado = "";
    try {
      for (const s of p.sql) {
        const [filas] = await con.query(s);
        if (Array.isArray(filas) && filas.length) resultado = String((filas[0] as { r?: unknown }).r ?? "");
      }
      // El CHECK tiene que *rechazar* el insert: si llegó aquí, no se cumple.
      if (p.nombre.startsWith("CHECK")) {
        fallos++;
        console.log(`  ✗ ${p.nombre}: aceptó un precio negativo`);
      } else {
        console.log(`  ✓ ${p.nombre}${resultado ? ` → ${resultado}` : ""}`);
      }
    } catch (e) {
      const msj = (e as Error).message;
      if (p.nombre.startsWith("CHECK") && /check constraint|CONSTRAINT .* failed/i.test(msj)) {
        console.log(`  ✓ ${p.nombre}: rechazó el precio negativo`);
      } else {
        fallos++;
        console.log(`  ✗ ${p.nombre}: ${msj}`);
      }
      await con.query("rollback").catch(() => {});
    } finally {
      for (const s of p.limpiar ?? []) await con.query(s).catch(() => {});
    }
  }

  console.log("\n▸ Latencia (20 consultas `select 1` seguidas)");
  const tiempos: number[] = [];
  for (let i = 0; i < 20; i++) {
    const t = performance.now();
    await con.query("select 1");
    tiempos.push(performance.now() - t);
  }
  tiempos.sort((a, b) => a - b);
  console.log(`  mediana ${Math.round(tiempos[10])} ms · máx ${Math.round(tiempos[19])} ms`);

  await con.end();
  console.log(fallos ? `\n${fallos} capacidad(es) no disponibles.` : "\nTodo disponible.");
  return fallos ? 1 : 0;
}

process.exitCode = await main();
