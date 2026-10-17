import type { PoolConnection } from "mysql2/promise";
import { getPoolMysql } from "../conexion";
import type { Actor } from "./tipos";

/**
 * Una petición de PostgREST es una transacción con la identidad de quien pide.
 * Esto es lo mismo, en MariaDB.
 *
 * Fija las variables que leen las funciones y los triggers de
 * `mysql/logica.sql` (`auth_uid()`, `auth_role()`, `es_cliente()`) **antes** de
 * empezar, y las borra **al terminar**, pase lo que pase: una variable de sesión
 * sobrevive a la devolución de la conexión al pool, y sin el borrado la
 * siguiente petición heredaría la identidad de esta.
 *
 * `definer` es el «security definer» de Postgres: las funciones de la app que
 * allá lo son (`rpc.ts`) corren con él, y los triggers las tratan como si no
 * vinieran de un cliente — igual que `current_user` cambia allá.
 *
 * `soloLectura` se salta el `begin`/`commit`: con *read committed* (el
 * aislamiento de Postgres, `conexion.ts`) cada `select` ve lo confirmado al
 * empezar, con transacción o sin ella, y son dos viajes menos a la base. Las
 * escrituras y las funciones siempre van en transacción.
 *
 * El borrado de la identidad al terminar lo hace el pool al recibir la
 * conexión de vuelta (`conexion.ts`), fuera del camino de la respuesta.
 */
export async function enTransaccion<T>(
  actor: Actor,
  fn: (con: PoolConnection) => Promise<T>,
  opciones: { definer?: boolean; soloLectura?: boolean } = {},
): Promise<T> {
  const con = await getPoolMysql().promise().getConnection();
  try {
    // Solo pesa en `next dev`: React guarda el valor de cada `await` del código
    // propio para sus herramientas y lo recorre por sus propiedades. Dentro de
    // `con.connection` está la cola de mysql2, y una consulta encolada tiene un
    // `then()` trampa que imprime «…on the result of query that is not a
    // promise…» y lanza. Va justo después del `await`, antes de que React lo
    // recorra; mysql2 lee la propiedad por nombre y no lo nota.
    Object.defineProperty(con, "connection", { enumerable: false });
    await con.query("set @app_usuario = ?, @app_rol = ?, @app_definer = ?, @app_derivados = null, @app_pista = null", [
      actor.id,
      actor.rol,
      opciones.definer ? 1 : 0,
    ]);
    if (opciones.soloLectura) return await fn(con);
    await con.beginTransaction();
    try {
      const resultado = await fn(con);
      await con.commit();
      return resultado;
    } catch (e) {
      // La pista del `signal` se lee antes de deshacer: es de esta conexión.
      const pista = await leerPista(con);
      await con.rollback().catch(() => {});
      throw Object.assign(e as object, { pista });
    }
  } finally {
    con.release();
  }
}

async function leerPista(con: PoolConnection): Promise<string | null> {
  try {
    const [filas] = await con.query("select @app_pista as pista");
    return ((filas as { pista: string | null }[])[0]?.pista ?? null) || null;
  } catch {
    return null;
  }
}

/** Una consulta con parámetros, devolviendo las filas como objetos. */
export async function filas<T = Record<string, unknown>>(con: PoolConnection, sql: string, params: unknown[] = []): Promise<T[]> {
  const [r] = await con.query(sql, params);
  return r as T[];
}

/** Una escritura: cuántas filas tocó y el id autoincremental, si hubo. */
export async function escribir(con: PoolConnection, sql: string, params: unknown[] = []): Promise<{ filas: number; id: number }> {
  const [r] = await con.query(sql, params);
  const res = r as { affectedRows: number; insertId: number };
  return { filas: res.affectedRows, id: res.insertId };
}
