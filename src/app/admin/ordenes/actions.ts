"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { avisarCambioDeOrden } from "@/lib/correo/notificaciones";
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
  // Ya está como se pedía: es un doble clic, o la misma decisión desde otra
  // pestaña. No es un error y no se avisa otra vez.
  if (desde === parsed.data.estado) return { ok: true };
  if (!TRANSICIONES[desde].includes(parsed.data.estado)) {
    return {
      ok: false,
      error: `Una orden ${ETIQUETA_ESTADO[desde].toLowerCase()} no puede pasar a ${ETIQUETA_ESTADO[parsed.data.estado].toLowerCase()}.`,
    };
  }

  // **`eq("status", desde)`: se cambia solo si sigue como se leyó.** Sin esto,
  // dos administradores que confirman el pago y cancelan la misma orden a la
  // vez pasaban los dos la comprobación de arriba, ganaba el último en
  // escribir y al comprador le llegaban los dos correos. Con la condición, el
  // segundo encuentra cero filas. La base lo vuelve a comprobar con el
  // trigger `orders_transicion` (0014), que ve la fila ya bloqueada.
  const { data, error } = await supabase
    .from("orders")
    .update({ status: parsed.data.estado })
    .eq("id", parsed.data.orderId)
    .eq("status", desde)
    .select("id");

  if (error) {
    // Reabrir una orden cancelada vuelve a reservar su stock y su cupo
    // (`orders_liberar_reservas`); si ya se vendieron a otro, no se puede.
    if (error.message.includes("sin-stock")) {
      return { ok: false, error: `No se puede reabrir: ya no quedan unidades de «${error.hint ?? "un producto"}».` };
    }
    if (error.message.includes("sin-cupo")) {
      return { ok: false, error: `No se puede reabrir: ya no queda cupo para «${error.hint ?? "una experiencia"}» en esa fecha.` };
    }
    if (error.message.includes("transicion-invalida")) {
      return { ok: false, error: "La orden cambió mientras la mirabas. Recarga para ver cómo quedó." };
    }
    return { ok: false, error: error.message };
  }
  if (!data || data.length === 0) {
    // O RLS lo negó (cero filas, sin error), o la orden ya no estaba como se
    // leyó: otro la movió entretanto.
    const { data: ahora } = await supabase
      .from("orders")
      .select("status")
      .eq("id", parsed.data.orderId)
      .maybeSingle();
    if (ahora?.status === parsed.data.estado) return { ok: true };
    if (ahora) {
      return {
        ok: false,
        error: `Otra persona la pasó a «${ETIQUETA_ESTADO[ahora.status as OrderStatus].toLowerCase()}» mientras la mirabas. Recarga la lista.`,
      };
    }
    return { ok: false, error: "No se pudo actualizar. ¿Sigues siendo administrador?" };
  }

  revalidatePath("/admin/ordenes");
  revalidatePath("/admin");

  // Después de guardar y sin poder fallar: el estado ya cambió, y un SMTP caído
  // no puede hacer que parezca que no. «Esperando pago» no se avisa: es volver
  // atrás una cancelación, una corrección del equipo y no una novedad.
  if (parsed.data.estado !== "pending_payment") {
    await avisarCambioDeOrden(parsed.data.orderId, parsed.data.estado);
  }

  return { ok: true };
}
