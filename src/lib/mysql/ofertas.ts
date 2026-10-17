import { sql, type ExpressionBuilder, type Insertable, type Kysely, type Transaction, type Updateable } from "kysely";
import type { BaseMysql, OfertaMysql } from "./esquema";

/**
 * Escribir y leer una oferta en MariaDB **con los permisos de Postgres**.
 * Experimento MySQL, etapa 2 (hito `2026-10-17-experimento-mysql-etapas-2-y-3.md`).
 *
 * El reparto es el de Postgres, para que la seguridad no dependa de que cada
 * acción se acuerde de comprobar:
 *
 * - **Escribir**: lo deciden los triggers de `mysql/permisos-de-ofertas.sql`
 *   (quién gestiona la empresa, no autopublicarse, la versión). Este archivo
 *   solo dice quién escribe y traduce los errores.
 * - **Leer**: MariaDB no tiene RLS, así que el filtro de `listings_public_read`
 *   va en cada consulta (`visible()`), con las mismas funciones de la base que
 *   usan los triggers.
 *
 * Misma regla que `catalogo.ts`: la base llega por parámetro y no hay imports
 * relativos con valor, para que las pruebas la carguen sin Next.
 */

/** Quién hace la petición: el `auth.uid()` y el rol de Postgres. */
export interface Actor {
  id: string | null;
  rol: "anon" | "authenticated" | "servicio";
}

export const VISITANTE: Actor = { id: null, rol: "anon" };

/**
 * Corre `fn` en una transacción **como** `actor`: pone las variables que leen
 * los triggers y las funciones `es_admin()` y `gestiona_proveedor()`, y las
 * borra al terminar. Toda escritura y toda lectura con permisos pasa por aquí;
 * fuera de aquí la base ve a un visitante (ver `SIN_IDENTIDAD` en
 * `conexion.ts`).
 */
export async function comoUsuario<T>(
  db: Kysely<BaseMysql>,
  actor: Actor,
  fn: (trx: Transaction<BaseMysql>) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(async (trx) => {
    await sql`set @app_usuario = ${actor.id}, @app_rol = ${actor.rol}`.execute(trx);
    try {
      return await fn(trx);
    } finally {
      // Una variable de sesión no se deshace con el rollback: se borra a mano.
      await sql`set @app_usuario = null, @app_rol = null`.execute(trx).catch(() => {});
    }
  });
}

/**
 * `listings_public_read` de la 0001: lo aprobado de un proveedor aprobado, o
 * lo de una empresa que uno gestiona, o todo si es administrador.
 */
export function visible(eb: ExpressionBuilder<BaseMysql, "listings">) {
  return eb.or([
    eb.and([
      eb("listings.status", "=", "approved"),
      eb.exists(
        eb
          .selectFrom("providers")
          .select(sql`1`.as("uno"))
          .whereRef("providers.id", "=", "listings.provider_id")
          .where("providers.status", "=", "approved"),
      ),
    ]),
    sql<boolean>`gestiona_proveedor(listings.provider_id)`,
    sql<boolean>`es_admin()`,
  ]);
}

/** Una oferta, si quien la pide la puede ver. */
export async function leerOferta(
  db: Kysely<BaseMysql>,
  actor: Actor,
  id: string,
): Promise<Pick<OfertaMysql, "id" | "slug" | "provider_id" | "status" | "featured" | "version"> | undefined> {
  return comoUsuario(db, actor, (trx) =>
    trx
      .selectFrom("listings")
      .select(["id", "slug", "provider_id", "status", "featured", "version"])
      .where("id", "=", id)
      .where(visible)
      .executeTakeFirst(),
  );
}

export type ResultadoEscritura =
  | { ok: true; id: string; slug: string; repetida: boolean }
  | { ok: false; motivo: "conflicto" | "denegado" | "slug" | "error"; mensaje: string };

/** Los arreglos de la fila de `filaDeOferta()` (ofertas.ts) van como json. */
function aMysql(fila: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fila).map(([k, v]) => [k, Array.isArray(v) ? JSON.stringify(v) : v]),
  );
}

interface ErrorMysql {
  errno?: number;
  sqlState?: string;
  message: string;
}

/**
 * La misma oferta que `escribirOferta()` de `src/lib/ofertas.ts`, con los
 * mismos resultados, para que las acciones no tengan que saber qué base hay
 * detrás. La única diferencia con Postgres: allá una escritura sin permiso
 * afecta cero filas en silencio; aquí el trigger la rechaza con `denegado`.
 * Para quien llama, los dos son `motivo: "denegado"`.
 */
export async function escribirOfertaMysql(
  db: Kysely<BaseMysql>,
  actor: Actor,
  op:
    | { tipo: "crear"; clave?: string | null; fila: Record<string, unknown> }
    | { tipo: "editar"; id: string; version: number | null; fila: Record<string, unknown> },
): Promise<ResultadoEscritura> {
  try {
    return await comoUsuario(db, actor, async (trx): Promise<ResultadoEscritura> => {
      if (op.tipo === "crear") {
        // Postgres pone el id con `gen_random_uuid()`; aquí lo pone la app.
        // Con `clave`, lo eligió el navegador: un doble envío choca con la
        // llave primaria en vez de crear dos ofertas.
        const id = op.clave ?? crypto.randomUUID();
        try {
          await trx
            .insertInto("listings")
            .values(aMysql({ ...op.fila, id }) as unknown as Insertable<OfertaMysql>)
            .execute();
        } catch (e) {
          const err = e as ErrorMysql;
          if (op.clave && err.errno === 1062 && /for key 'PRIMARY'/.test(err.message)) {
            // La misma oferta, mandada otra vez. Si la puede ver quien llama, es suya.
            const previa = await trx
              .selectFrom("listings")
              .select(["id", "slug"])
              .where("id", "=", op.clave)
              .where(visible)
              .executeTakeFirst();
            if (previa) return { ok: true, id: previa.id, slug: previa.slug, repetida: true };
          }
          throw e;
        }
        const creada = await trx
          .selectFrom("listings")
          .select(["id", "slug"])
          .where("id", "=", id)
          .executeTakeFirstOrThrow();
        return { ok: true, ...creada, repetida: false };
      }

      let cambio = trx
        .updateTable("listings")
        .set(aMysql(op.fila) as Updateable<OfertaMysql>)
        .where("id", "=", op.id);
      if (op.version !== null) cambio = cambio.where("version", "=", op.version);
      const { numUpdatedRows } = await cambio.executeTakeFirstOrThrow();
      if (numUpdatedRows === BigInt(0)) {
        // Cero filas: la oferta no existe, no se ve, o la versión ya no es la
        // que se editó. Se distingue leyéndola con los mismos permisos.
        const actual = await trx
          .selectFrom("listings")
          .select("version")
          .where("id", "=", op.id)
          .where(visible)
          .executeTakeFirst();
        if (actual && op.version !== null && actual.version !== op.version) {
          return {
            ok: false,
            motivo: "conflicto",
            mensaje:
              "Alguien cambió esta oferta mientras la editabas (o se vendió una unidad). Recarga la página para ver la versión nueva y vuelve a hacer tus cambios.",
          };
        }
        return { ok: false, motivo: "denegado", mensaje: "sin filas" };
      }
      const editada = await trx
        .selectFrom("listings")
        .select(["id", "slug"])
        .where("id", "=", op.id)
        .executeTakeFirstOrThrow();
      return { ok: true, ...editada, repetida: false };
    });
  } catch (e) {
    const err = e as ErrorMysql;
    // `signal sqlstate '45000'` de los triggers: el mensaje es el motivo.
    if (err.sqlState === "45000" && err.message === "denegado") {
      return { ok: false, motivo: "denegado", mensaje: "sin permiso" };
    }
    if (err.errno === 1062 && /for key 'slug'/.test(err.message)) {
      return { ok: false, motivo: "slug", mensaje: err.message };
    }
    // `categoria-avanzada` llega aquí con su nombre en el mensaje, que es lo
    // que busca la acción de la empresa, igual que con Postgres.
    return { ok: false, motivo: "error", mensaje: err.message };
  }
}
