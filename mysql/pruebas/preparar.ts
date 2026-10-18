import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { AJUSTES_DE_SESION, opcionesMysql } from "../../src/lib/mysql/conexion";

/**
 * Antes de las pruebas de `mysql/pruebas/`, deja la base lista:
 *
 * - **Vacía** (la del CI, un MariaDB recién levantado; o una propia en el PC):
 *   crea las tablas con `cuentas.sql` y `esquema.sql`.
 * - **Siempre**: vuelve a aplicar `logica.sql` (funciones, triggers y vistas),
 *   para probar lo que está en el repositorio y no lo que quedó de la última vez.
 *
 * Con tablas ya hechas **no** las rehace: borraría lo que hubiera. Las pruebas
 * crean sus propios datos y los borran al terminar.
 *
 * **Nunca contra producción** (`…_seregenera`): aplicaría `logica.sql` desde
 * esta máquina —y su DEFINER sería una cuenta que no existe allí, que es lo que
 * tumbó el sitio el 2026-10-17— y escribiría gente de prueba en la base de verdad.
 */
export default async function preparar(): Promise<void> {
  try {
    process.loadEnvFile(".env");
  } catch {
    /* sin .env: el CI pone las MYSQL_* en el entorno */
  }
  if (!process.env.MYSQL_HOST || !process.env.MYSQL_PASSWORD) return;
  if (/_seregenera$/.test(process.env.MYSQL_DATABASE ?? "")) {
    throw new Error("MYSQL_DATABASE es la base de producción: las pruebas no corren contra ella.");
  }
  const con = await mysql.createConnection({ ...opcionesMysql(), multipleStatements: true });
  try {
    await con.query(AJUSTES_DE_SESION);
    const [[{ n }]] = (await con.query(
      "select count(*) as n from information_schema.tables where table_schema = database() and table_name = 'usuarios'",
    )) as unknown as [[{ n: number }]];
    if (!Number(n)) {
      for (const archivo of ["cuentas.sql", "esquema.sql"]) await con.query(readFileSync(`mysql/${archivo}`, "utf8"));
    }
    await con.query(readFileSync("mysql/logica.sql", "utf8"));
  } finally {
    await con.end();
  }
}
