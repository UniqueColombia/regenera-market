"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ETIQUETA_ESTADO, TRANSICIONES } from "@/lib/order-status";
import type { OrderStatus } from "@/lib/types";

/**
 * Mover una orden de estado. Hoy eso es, sobre todo, **confirmar un pago a
 * mano**.
 *
 * Seregenera todavía no cobra: `ManualGateway` le muestra al comprador los datos
 * para transferir y alguien mira la cuenta y confirma. Este botón es ese
 * «alguien». Cuando entre Wompi, el webhook hará lo mismo **validando la firma
 * con `WOMPI_EVENTS_SECRET` antes de tocar nada** (invariante 9): un webhook sin
 * verificar es un botón de «marcar como pagado» abierto a internet.
 *
 * Con el cliente de sesión: la política `orders_admin` es la que autoriza.
 */

const CambioSchema = z.object({
  orderId: z.uuid("Identificador de orden inválido"),
  estado: z.enum([
    "pending_payment",
    "paid",
    "in_progress",
    "fulfilled",
    "cancelled",
    "refunded",
  ]),
});

export type ResultadoOrden = { ok: true } | { ok: false; error: string };

export async function cambiarEstadoOrden(datos: unknown): Promise<ResultadoOrden> {
  await requireAdmin();

  const parsed = CambioSchema.safeParse(datos);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();

  const { data: actual, error: errorLectura } = await supabase
    .from("orders")
    .select("status")
    .eq("id", parsed.data.orderId)
    .maybeSingle();

  if (errorLectura) return { ok: false, error: errorLectura.message };
  if (!actual) {
    return {
      ok: false,
      error: "No encontramos la orden. ¿Sigues teniendo permiso de administrador?",
    };
  }

  const desde = actual.status as OrderStatus;
  if (!TRANSICIONES[desde].includes(parsed.data.estado)) {
    return {
      ok: false,
      error: `Una orden ${ETIQUETA_ESTADO[desde].toLowerCase()} no puede pasar a ${ETIQUETA_ESTADO[parsed.data.estado].toLowerCase()}.`,
    };
  }

  const { data, error } = await supabase
    .from("orders")
    .update({ status: parsed.data.estado })
    .eq("id", parsed.data.orderId)
    .select("id");

  if (error) return { ok: false, error: error.message };
  // RLS no da error cuando niega: devuelve cero filas afectadas.
  if (!data || data.length === 0) {
    return { ok: false, error: "No se pudo actualizar. ¿Sigues siendo administrador?" };
  }

  revalidatePath("/admin/ordenes");
  revalidatePath("/admin");
  return { ok: true };
}
