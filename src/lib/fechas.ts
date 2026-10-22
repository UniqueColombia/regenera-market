import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { shortDate } from "./format";

/**
 * Quién pone la fecha de una experiencia, y las fechas con cupo.
 *
 * ## Los dos modos
 *
 * - **`proveedor`**: quien la organiza abre fechas, cada una con su cupo, y la
 *   persona elige entre ellas. `crear_orden()` descuenta el cupo de la fecha en
 *   la misma transacción (invariante 10 de `dominio-regenera`).
 * - **`cliente`**: no hay fechas abiertas; la persona elige el día que la
 *   necesita y quien la organiza recibe el pedido con esa fecha.
 *
 * **El modo no es una columna: es si la oferta tiene filas en
 * `listing_availability`.** Es la misma pregunta que ya se hacía
 * `crear_orden()` para exigir fecha y cupo, así que la base y la pantalla no
 * pueden contradecirse. Por eso pasar a `cliente` borra todas las filas, también
 * las de fechas pasadas: si quedara una, la experiencia seguiría en `proveedor`
 * sin ninguna fecha abierta. Las reservas ya hechas no se pierden, porque
 * `order_items` guarda su propia fecha (invariante 6).
 *
 * Hasta el 2026-10-22 las fechas solo se sembraban con `scripts/seed.mts`: el
 * formulario de oferta le pedía a la empresa que las mandara por escrito.
 *
 * Las fechas se guardan aparte del formulario de oferta y **no la devuelven a
 * revisión**: abrir una fecha no cambia lo que el equipo aprobó.
 */

export type ModoFechas = "proveedor" | "cliente";

/** Una fecha abierta, tal como la ve quien la edita. */
export interface FechaConCupo {
  date: string;
  /** Cupo total de la fecha (`slots_total`). */
  total: number;
  /** Personas ya reservadas (`slots_taken`): el cupo no puede bajar de aquí. */
  tomados: number;
}

export interface FechasDeOferta {
  modo: ModoFechas;
  /** Solo de hoy en adelante: las pasadas no se editan. */
  fechas: FechaConCupo[];
}

export type ResultadoFechas = { ok: true } | { ok: false; errores: string[] };

/**
 * Lo que devuelve la acción al editor: las fechas como quedaron, para que la
 * pantalla las pinte sin recargar. Sin `fechas` no se escribió nada (el plan
 * no pasó la validación) y el editor conserva lo que la persona escribió.
 */
export type ResultadoGuardarFechas =
  | { ok: true; fechas: FechasDeOferta }
  | { ok: false; errores: string[]; fechas?: FechasDeOferta };

/** Hasta dónde se puede abrir o pedir una fecha: dos años. */
export const DIAS_HACIA_ADELANTE = 730;
export const MAX_FECHAS = 120;
export const MAX_CUPO = 10_000;

/** «2026-10-22» más `n` días, en el mismo formato. */
export function sumarDias(fecha: string, n: number): string {
  return new Date(Date.parse(`${fecha}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** AAAA-MM-DD y además un día que existe: «2026-02-30» no pasa. */
export function esFecha(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !Number.isNaN(Date.parse(`${v}T12:00:00Z`)) &&
    new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v
  );
}

const Plan = z.discriminatedUnion("modo", [
  z.object({ modo: z.literal("cliente") }),
  z.object({
    modo: z.literal("proveedor"),
    fechas: z.array(z.object({ date: z.string(), total: z.unknown() })).max(MAX_FECHAS),
  }),
]);

export type PlanFechas =
  | { modo: "cliente" }
  | { modo: "proveedor"; fechas: { date: string; total: number }[] };

/**
 * Lo que manda el editor, validado contra `hoy`. Los errores se dicen por
 * fecha, para que la persona sepa cuál corregir.
 */
export function revisarPlan(
  datos: unknown,
  hoy: string,
): { ok: true; plan: PlanFechas } | { ok: false; errores: string[] } {
  const parsed = Plan.safeParse(datos);
  if (!parsed.success) return { ok: false, errores: ["No pudimos leer las fechas. Recarga la página."] };
  if (parsed.data.modo === "cliente") return { ok: true, plan: { modo: "cliente" } };

  const errores: string[] = [];
  const vistas = new Set<string>();
  const fechas: { date: string; total: number }[] = [];
  const limite = sumarDias(hoy, DIAS_HACIA_ADELANTE);

  for (const f of parsed.data.fechas) {
    if (!esFecha(f.date)) {
      errores.push("Hay una fecha sin elegir o mal escrita.");
      continue;
    }
    const dia = shortDate(f.date);
    const total = typeof f.total === "string" ? Number(f.total.trim()) : f.total;
    if (f.date < hoy) errores.push(`El ${dia} ya pasó.`);
    else if (f.date > limite) errores.push(`El ${dia} está a más de dos años.`);
    else if (vistas.has(f.date)) errores.push(`El ${dia} está repetido.`);
    else if (typeof total !== "number" || !Number.isInteger(total) || total < 1 || total > MAX_CUPO) {
      errores.push(`Escribe cuántas personas caben el ${dia}, en número entero.`);
    } else fechas.push({ date: f.date, total });
    vistas.add(f.date);
  }
  if (errores.length === 0 && fechas.length === 0) {
    errores.push("Abre al menos una fecha, o deja que cada persona elija el día.");
  }
  return errores.length > 0
    ? { ok: false, errores: [...new Set(errores)] }
    : { ok: true, plan: { modo: "proveedor", fechas } };
}

/**
 * Deja las fechas de la oferta como dice el plan, sin pisar reservas.
 *
 * Cada escritura lleva su condición dentro (invariante 25): una fecha se borra
 * solo `where slots_taken = 0` y un cupo baja solo `where slots_taken <=
 * nuevo`. Si una compra entra entre que se pintó el editor y se guarda, la
 * escritura no encuentra la fila y se dice qué fecha no se pudo tocar. No es
 * una transacción: si una fecha falla, las demás quedan guardadas y la
 * pantalla se recarga con lo que hay.
 *
 * Lo esperado (una reserva que lo impide) vuelve en `errores`; un fallo de la
 * base se lanza, para que la acción lo registre con `registrarFallo()`.
 *
 * `db` es el cliente de sesión: las políticas `availability_write` (empresa que
 * gestiona la oferta) y `availability_admin` son las que autorizan.
 */
export async function escribirFechas(
  db: SupabaseClient,
  listingId: string,
  plan: PlanFechas,
  hoy: string,
): Promise<ResultadoFechas> {
  if (plan.modo === "cliente") {
    const { error } = await db.from("listing_availability").delete().eq("listing_id", listingId);
    if (error) throw new Error(`escribirFechas: ${error.message}`);
    return { ok: true };
  }

  const { data, error } = await db
    .from("listing_availability")
    .select("date, slots_total, slots_taken")
    .eq("listing_id", listingId);
  if (error) throw new Error(`escribirFechas: ${error.message}`);
  const actuales = new Map(
    ((data ?? []) as { date: string; slots_total: number; slots_taken: number }[]).map((f) => [
      String(f.date).slice(0, 10),
      f,
    ]),
  );
  const pedidas = new Map(plan.fechas.map((f) => [f.date, f.total]));
  const errores: string[] = [];

  // Las que se quitan. Las pasadas no se tocan: el editor no las muestra.
  for (const [fecha] of actuales) {
    if (fecha < hoy || pedidas.has(fecha)) continue;
    const r = await db
      .from("listing_availability")
      .delete()
      .eq("listing_id", listingId)
      .eq("date", fecha)
      .eq("slots_taken", 0)
      .select("date");
    if (r.error) throw new Error(`escribirFechas: ${r.error.message}`);
    if (!r.data?.length) errores.push(`El ${shortDate(fecha)} ya tiene reservas: no se puede quitar.`);
  }

  const cambiarCupo = async (fecha: string, total: number) => {
    const r = await db
      .from("listing_availability")
      .update({ slots_total: total })
      .eq("listing_id", listingId)
      .eq("date", fecha)
      .lte("slots_taken", total)
      .select("date");
    if (r.error) throw new Error(`escribirFechas: ${r.error.message}`);
    if (!r.data?.length) {
      errores.push(`El ${shortDate(fecha)} ya tiene más de ${total} personas reservadas: el cupo no puede ser menor.`);
    }
  };

  for (const [fecha, total] of pedidas) {
    const previa = actuales.get(fecha);
    if (previa) {
      if (previa.slots_total !== total) await cambiarCupo(fecha, total);
      continue;
    }
    const r = await db
      .from("listing_availability")
      .insert({ listing_id: listingId, date: fecha, slots_total: total, slots_taken: 0 });
    // La abrió otra pestaña entretanto: se trata como un cambio de cupo.
    if (r.error?.code === "23505") await cambiarCupo(fecha, total);
    else if (r.error) throw new Error(`escribirFechas: ${r.error.message}`);
  }

  return errores.length > 0 ? { ok: false, errores } : { ok: true };
}
