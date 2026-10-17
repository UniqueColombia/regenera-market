import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { AJUSTES_DE_SESION, opcionesMysql } from "../../src/lib/mysql/conexion";

/**
 * Antes de las pruebas de `mysql/pruebas/`, vuelve a aplicar `logica.sql`
 * (funciones, triggers y vistas): se prueba lo que está en el repositorio, no
 * lo que quedó en la base de la última vez.
 *
 * **No** rehace las tablas: borraría los datos copiados de Supabase. Las da por
 * hechas: hay que haber corrido `scripts/mysql/copiar-datos.mts` al menos una
 * vez. Las pruebas crean sus propios datos y los borran al terminar.
 */
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
    await con.query(readFileSync("mysql/logica.sql", "utf8"));
  } finally {
    await con.end();
  }
}
