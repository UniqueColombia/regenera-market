// Aplica archivos .sql a la base de producción **desde el servidor**.
//
//   node aplicar-sql.mjs <carpeta con node_modules/mysql2> archivo.sql [más.sql…]
//
// Por qué desde el servidor y no desde el PC: MariaDB guarda como dueño
// (DEFINER) de cada función, trigger y vista la cuenta que los creó. Creados
// desde el PC quedan a nombre de `usuario@IP-del-PC`, y al cerrar ese acceso el
// sitio se cae («The user specified as a definer … does not exist»). Pasó el
// 2026-10-17: `docs/MODO-MYSQL.md`, «Trampas que ya costaron una caída».
//
// Lee las `MYSQL_*` de donde Hostinger guarda las variables de la app; la
// clave no sale del servidor ni aparece en ninguna línea de comando. Al
// terminar lista los DEFINER, que tienen que ser todos el usuario de la app.
//
// Plain JavaScript y sin dependencias propias: corre con el Node del servidor y
// con el `mysql2` que ya trae la app desplegada.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

// Los mismos de `AJUSTES_DE_SESION` en `src/lib/mysql/conexion.ts`.
const AJUSTES =
  "set session sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION', time_zone = '+00:00', transaction_isolation = 'READ-COMMITTED'";

const [, , desde, ...archivos] = process.argv;
if (!desde || archivos.length === 0) {
  console.error("Uso: node aplicar-sql.mjs <carpeta con node_modules/mysql2> archivo.sql [más.sql…]");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(join(homedir(), "domains/seregenera.com/hbuilds/config/.env"), "utf8")
    .split("\n")
    .map((l) => l.replace(/\r$/, ""))
    .filter((l) => /^[A-Z_][A-Z0-9_]*=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      let v = l.slice(i + 1);
      if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) v = v.slice(1, -1);
      return [l.slice(0, i), v];
    }),
);

const mysql = createRequire(join(desde, "package.json"))("mysql2/promise");
const con = await mysql.createConnection({
  host: "127.0.0.1",
  port: Number(env.MYSQL_PORT || 3306),
  user: env.MYSQL_USER,
  password: env.MYSQL_PASSWORD,
  database: env.MYSQL_DATABASE,
  multipleStatements: true,
});
try {
  await con.query(AJUSTES);
  for (const archivo of archivos) {
    await con.query(readFileSync(archivo, "utf8"));
    console.log(`  aplicado: ${archivo}`);
  }
  const [filas] = await con.query(
    `select definer, count(*) as n from (
       select definer from information_schema.routines where routine_schema = database()
       union all select definer from information_schema.triggers where trigger_schema = database()
       union all select definer from information_schema.views where table_schema = database()) d
     group by definer`,
  );
  for (const f of filas) console.log(`  DEFINER ${f.definer}: ${f.n}`);
} finally {
  await con.end();
}
