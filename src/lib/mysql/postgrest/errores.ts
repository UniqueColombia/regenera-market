import { ErrorPg, type ErrorPostgrest } from "./tipos";

/**
 * Los errores de MariaDB, con el código y el mensaje que daría Postgres.
 *
 * La app los mira: `23505` y el nombre de la restricción para saber si una
 * oferta ya existía (`src/lib/ofertas.ts`), el `hint` de «sin stock» para decir
 * de qué producto (`src/app/admin/ordenes/actions.ts`), el texto de un
 * `raise exception` para elegir el mensaje. Los nombres de las restricciones son
 * los de Postgres porque `scripts/mysql/generar-esquema.mts` los copia.
 */

interface ErrorMysql {
  errno?: number;
  sqlState?: string;
  message: string;
  code?: string;
}

/** El error de Postgres que corresponde a uno de MariaDB (o a un `ErrorPg` de `rpc.ts`). */
export function aErrorPostgrest(e: unknown, contexto: { tabla?: string; pista?: string | null } = {}): ErrorPostgrest {
  if (e instanceof ErrorPg) {
    return { code: e.code, message: e.message, details: e.details, hint: e.hint };
  }
  const err = e as ErrorMysql;
  const mensaje = err?.message ?? String(e);
  const tabla = contexto.tabla ?? "";

  // `signal sqlstate '45000'` de `mysql/logica.sql`: el `raise exception` de
  // Postgres. El texto es el motivo y la pista viaja en @app_pista.
  if (err.sqlState === "45000") {
    return { code: "P0001", message: mensaje, details: null, hint: contexto.pista ?? null };
  }

  switch (err.errno) {
    case 1062: {
      const llave = /for key '([^']+)'/.exec(mensaje)?.[1] ?? "";
      const restriccion = llave === "PRIMARY" ? `${tabla}_pkey` : llave.replace(/^[^.]+\./, "");
      return {
        code: "23505",
        message: `duplicate key value violates unique constraint "${restriccion}"`,
        details: mensaje,
        hint: null,
      };
    }
    case 1451:
    case 1452: {
      const restriccion = /CONSTRAINT `([^`]+)`/.exec(mensaje)?.[1] ?? "";
      return {
        code: "23503",
        message: err.errno === 1451
          ? `update or delete on table "${tabla}" violates foreign key constraint "${restriccion}"`
          : `insert or update on table "${tabla}" violates foreign key constraint "${restriccion}"`,
        details: mensaje,
        hint: null,
      };
    }
    case 4025: {
      const restriccion = /CONSTRAINT `([^`]+)`/.exec(mensaje)?.[1] ?? "";
      return {
        code: "23514",
        message: `new row for relation "${tabla}" violates check constraint "${restriccion}"`,
        details: mensaje,
        hint: null,
      };
    }
    case 1048:
    case 1364: {
      const columna = /'([^']+)'/.exec(mensaje)?.[1] ?? "";
      return {
        code: "23502",
        message: `null value in column "${columna}" of relation "${tabla}" violates not-null constraint`,
        details: mensaje,
        hint: null,
      };
    }
    case 1406:
      return { code: "22001", message: `value too long: ${mensaje}`, details: null, hint: null };
    case 1265:
    case 1292:
    case 1366:
    case 3140:
    case 4038:
      return { code: "22P02", message: `invalid input syntax: ${mensaje}`, details: null, hint: null };
    case 1213:
      return { code: "40P01", message: "deadlock detected", details: mensaje, hint: null };
    case 1205:
      return { code: "55P03", message: "lock not available", details: mensaje, hint: null };
    case 1054:
      return { code: "42703", message: mensaje, details: null, hint: null };
  }
  return { code: err.code ?? "XX000", message: mensaje, details: null, hint: null };
}

/** El de una política que no deja: lo que dice Postgres. */
export function errorDePolitica(tabla: string): ErrorPostgrest {
  return {
    code: "42501",
    message: `new row violates row-level security policy for table "${tabla}"`,
    details: null,
    hint: null,
  };
}
