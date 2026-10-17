import { createPool, type Pool, type PoolOptions } from "mysql2";
import { Kysely, MysqlDialect } from "kysely";
import type { BaseMysql } from "./esquema";

/**
 * La conexión al MariaDB de Hostinger, para el modo MySQL (`BASE_DE_DATOS=mysql`,
 * `src/lib/modo.ts`). La usan la capa compatible con Supabase
 * (`src/lib/mysql/postgrest/`) y el motor de cuentas (`cuentas.ts`), sobre **un
 * solo pool por proceso**.
 *
 * No tiene imports relativos con valor, a propósito: los scripts de
 * `scripts/mysql/` lo importan con `node` pelado, que exige la extensión en las
 * rutas relativas (mismo motivo que `../supabase/admin.ts`).
 */

/**
 * Lo que fija cada conexión al abrirse. Las tres cosas fallan en silencio si se
 * quitan:
 *
 * - El `sql_mode` del servidor **no es estricto**. Sin esto, un texto demasiado
 *   largo se recorta y un número inválido se guarda como 0, con un aviso que
 *   nadie lee. Postgres rechaza las dos cosas, y el código cuenta con eso.
 * - `time_zone`: las fechas se guardan en UTC, como `timestamptz`.
 * - `transaction_isolation`: el de Postgres es *read committed*; el de MariaDB,
 *   *repeatable read*. Con el de MariaDB, una compra que espera a otra vería la
 *   foto vieja del stock y los candados de rango harían bloqueos que Postgres no.
 */
export const AJUSTES_DE_SESION =
  "set session sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION', time_zone = '+00:00', transaction_isolation = 'READ-COMMITTED'";

/**
 * Cada conexión que entrega el pool empieza sin identidad: para la base, un
 * visitante. Las variables son las que leen las funciones y los triggers de
 * `mysql/logica.sql` (`auth_uid()`, `es_cliente()`…).
 */
export const SIN_IDENTIDAD =
  "set @app_usuario = null, @app_rol = null, @app_definer = null, @app_derivados = null, @app_pista = null";

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
    // usuario tiene un tope de 75 conexiones: 8 por proceso sobra.
    connectionLimit: 8,
    maxIdle: 3,
    idleTimeout: 15_000,
    enableKeepAlive: true,
    // Fechas y decimales como cadena: la capa compatible los convierte a lo que
    // devuelve PostgREST (`postgrest/valores.ts`).
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

function poolNuevo(): Pool {
  const pool = createPool(opcionesMysql());
  // Antes que cualquier consulta de esa conexión: mysql2 las encola en orden.
  pool.on("connection", (conexion) => {
    conexion.query(AJUSTES_DE_SESION);
  });
  // Quién pide lo dicen variables de sesión, y una variable de sesión sobrevive
  // a la devolución de la conexión al pool. **Se borran al devolverla**: sin
  // esto, la siguiente petición que la tomara heredaría la identidad de la
  // anterior, admin incluido. Va en el evento y no al final de cada petición
  // porque así no le suma un viaje a la base a quien espera la respuesta: el
  // borrado queda encolado en la conexión antes de cualquier consulta del
  // siguiente que la use. La capa compatible, además, fija la identidad al
  // empezar (`postgrest/contexto.ts`).
  pool.on("release", (conexion) => {
    conexion.query(SIN_IDENTIDAD);
  });
  return pool;
}

function kyselySobre(pool: Pool): Kysely<BaseMysql> {
  return new Kysely<BaseMysql>({ dialect: new MysqlDialect({ pool }) });
}

/** Una base nueva, con su propio pool. Los scripts y las pruebas la cierran con `destroy()`. */
export function nuevaBaseMysql(): Kysely<BaseMysql> {
  return kyselySobre(poolNuevo());
}

const global_ = globalThis as typeof globalThis & {
  __seregeneraPool?: Pool;
  __seregeneraMysql?: Kysely<BaseMysql>;
};

/**
 * El pool de la app: uno por proceso. Vive en `globalThis` para que en
 * desarrollo cada recarga no abra otro y se coma el tope de conexiones.
 */
export function getPoolMysql(): Pool {
  global_.__seregeneraPool ??= poolNuevo();
  return global_.__seregeneraPool;
}

/** Kysely sobre el mismo pool de la app (el motor de cuentas lo usa). */
export function getMysql(): Kysely<BaseMysql> {
  global_.__seregeneraMysql ??= kyselySobre(getPoolMysql());
  return global_.__seregeneraMysql;
}

/**
 * Cierra el pool de la app y lo olvida. Para las pruebas y los scripts: un pool
 * abierto mantiene vivo el proceso, y uno cerrado que sigue en `globalThis`
 * haría fallar al siguiente que lo pida.
 */
export async function cerrarMysql(): Promise<void> {
  const pool = global_.__seregeneraPool;
  global_.__seregeneraPool = undefined;
  global_.__seregeneraMysql = undefined;
  if (pool) await pool.promise().end().catch(() => {});
}
