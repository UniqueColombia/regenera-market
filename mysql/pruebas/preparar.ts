import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { AJUSTES_DE_SESION, opcionesMysql } from "../../src/lib/mysql/conexion";

/**
 * Antes de las pruebas de `mysql/pruebas/`, vuelve a aplicar el esquema de las
 * cuentas y de los permisos: se prueba lo que está en el repositorio, no lo que
 * quedó en la base de la última vez.
 *
 * **No** toca `espejo-catalogo.sql`: rehacerlo vaciaría el espejo del catálogo,
 * y las pruebas no lo necesitan (crean sus propias empresas y ofertas). Pero lo
 * da por hecho: sin `scripts/mysql/espejo.mts` corrido al menos una vez, no
 * existe `listings` y los triggers de permisos no tienen dónde ponerse.
 */
const ESQUEMA = ["mysql/cuentas.sql", "mysql/permisos-de-ofertas.sql"];

export default async function preparar(): Promise<void> {
  try {
    process.loadEnvFile(".env");
  } catch {
    /* sin .env (el CI): las pruebas se saltan */
  }
  if (!process.env.MYSQL_HOST || !process.env.MYSQL_PASSWORD) return;
  const con = await mysql.createConnection({ ...opcionesMysql(), multipleStatements: true });
  try {
    await con.query(AJUSTES_DE_SESION);
    for (const archivo of ESQUEMA) await con.query(readFileSync(archivo, "utf8"));
  } finally {
    await con.end();
  }
}
