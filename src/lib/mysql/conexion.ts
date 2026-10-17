import { createPool, type PoolOptions } from "mysql2";
import { CompiledQuery, Kysely, MysqlDialect } from "kysely";
import type { BaseMysql } from "./esquema";

/**
 * La conexión al MariaDB de Hostinger. Es del experimento MySQL
 * (`.claude/hitos/2026-10-17-experimento-mysql-etapas-0-y-1.md`): hoy solo la
 * usa el catálogo, y solo con `FUENTE_CATALOGO=mysql`.
 *
 * No tiene imports relativos con valor, a propósito: `scripts/mysql/espejo.mts`
 * lo importa con `node` pelado, que exige la extensión en las rutas relativas
 * (mismo motivo que `../supabase/admin.ts`).
 */

/**
 * Lo que fija cada conexión al abrirse. Las dos cosas las midió
 * `scripts/mysql/sondeo.mts`, y las dos fallan en silencio si se quitan:
 *
 * - El `sql_mode` del servidor **no es estricto**. Sin esto, un texto demasiado
 *   largo se recorta y un número inválido se guarda como 0, con un aviso que
 *   nadie lee. Postgres rechaza las dos cosas, y el código cuenta con eso.
 * - `time_zone`: las fechas se guardan en UTC, como `timestamptz`.
 */
export const AJUSTES_DE_SESION =
  "set session sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION', time_zone = '+00:00'";

/** Cada conexión que entrega el pool empieza sin identidad: para la base, un visitante. */
export const SIN_IDENTIDAD = "set @app_usuario = null, @app_rol = null";

export function opcionesMysql(): PoolOptions {
  const faltan = ["MYSQL_HOST", "MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD"].filter(
    (v) => !process.env[v],
  );
  if (faltan.length) {
    throw new Error(`Faltan variables de MySQL: ${faltan.join(", ")} (ver docs/VARIABLES.md)`);
  }
  return {
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT ?? 3306),
    database: process.env.MYSQL_DATABASE,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    charset: "utf8mb4",
    // El servidor corta una conexión ociosa a los 20 s (`wait_timeout`). El
    // pool la suelta antes, a los 15, para no entregar una conexión muerta. El
    // usuario tiene un tope de 75 conexiones: 5 por proceso sobra.
    connectionLimit: 5,
    maxIdle: 2,
    idleTimeout: 15_000,
    enableKeepAlive: true,
    // Fechas y decimales como cadena: `soloFecha()` y `numero()` de repo.ts ya
    // saben leerlos así, igual que lo que llega de Postgres.
    dateStrings: true,
    timezone: "Z",
    // `tinyint(1)` es el boolean de MySQL. Sin esto llega 0/1, y `featured ===
    // true` o `quote_only` nunca se cumplen.
    typeCast(campo, siguiente) {
      if (campo.type === "TINY" && campo.length === 1) {
        const v = campo.string();
        return v === null ? null : v === "1";
      }
      return siguiente();
    },
  };
}

/** Una base nueva, con su propio pool. Los scripts la cierran con `destroy()`. */
export function nuevaBaseMysql(): Kysely<BaseMysql> {
  return new Kysely<BaseMysql>({
    dialect: new MysqlDialect({
      pool: createPool(opcionesMysql()),
      onCreateConnection: async (conexion) => {
        await conexion.executeQuery(CompiledQuery.raw(AJUSTES_DE_SESION));
      },
      // Quién escribe lo dicen variables de sesión (`comoUsuario()` de
      // `ofertas.ts`), y una variable de sesión sobrevive a la devolución de
      // la conexión al pool. Sin este borrado, la siguiente petición que
      // tomara esa conexión heredaría la identidad de la anterior, admin
      // incluido.
      onReserveConnection: async (conexion) => {
        await conexion.executeQuery(CompiledQuery.raw(SIN_IDENTIDAD));
      },
    }),
  });
}

const global_ = globalThis as typeof globalThis & { __seregeneraMysql?: Kysely<BaseMysql> };

/**
 * El pool de la app: uno por proceso. Vive en `globalThis` para que en
 * desarrollo cada recarga no abra otro y se coma el tope de conexiones.
 */
export function getMysql(): Kysely<BaseMysql> {
  global_.__seregeneraMysql ??= nuevaBaseMysql();
  return global_.__seregeneraMysql;
}
