"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { avisarCambioDeOrden } from "@/lib/correo/notificaciones";
import { createClient } from "@/lib/supabase/server";
import { ETIQUETA_ESTADO, ORDENES_BORRABLES, TRANSICIONES } from "@/lib/order-status";
import type { OrderStatus } from "@/lib/types";
import { mensajeDeFallo, registrarFallo } from "@/lib/incidencias";

/**
 * Mover una orden de estado. Hoy eso es, sobre todo, **confirmar un pago a
 * mano**.
 *
 * Lo que se paga con llave Bre-B o por transferencia no lo ve ninguna
 * pasarela: alguien mira la cuenta y confirma. Este botón es ese «alguien».
 * Lo que se paga en línea lo confirma el webhook de BOLD (`/api/webhooks/bold`)
 * **validando la firma antes de tocar nada** (invariante 9): un webhook sin
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

  if (errorLectura) return { ok: false, error: mensajeDeFallo(registrarFallo("admin-ordenes", errorLectura)) };
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
    return { ok: false, error: mensajeDeFallo(registrarFallo("admin-ordenes", error)) };
  }
  if (!data || data.length === 0) {
    // O RLS lo negó (cero filas, sin error), o la orden ya no estaba como se
    // leyó: otro la movió entretanto.
    const { data: ahora, error: errorAhora } = await supabase
      .from("orders")
      .select("status")
      .eq("id", parsed.data.orderId)
      .maybeSingle();
    // Una relectura fallida no es «ya no eres administrador»: se dice lo que pasó.
    if (errorAhora) return { ok: false, error: mensajeDeFallo(registrarFallo("admin-ordenes", errorAhora)) };
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

const EliminarSchema = z.object({ orderId: z.uuid("Identificador de orden inválido") });

/**
 * Eliminar una orden que nunca se cobró (`ORDENES_BORRABLES`). **No se puede
 * deshacer.** Pedido de Jesús, 2026-10-23: limpiar pruebas y pedidos que no
 * siguieron.
 *
 * Una «esperando pago» se **cancela primero** y después se borra: la
 * cancelación es la que devuelve el stock y el cupo que reservaba
 * (`orders_liberar_reservas`, invariante 10). Borrarla directo los dejaba
 * descontados para siempre. Al comprador no se le avisa: es una limpieza del
 * equipo, no una decisión sobre su compra.
 *
 * Se van con ella sus líneas (`order_items`, en cascada). Con un pago
 * registrado no se borra, aunque esté cancelada: el pago es la prueba de que
 * entró plata, y la base tampoco lo permite.
 */
export async function eliminarOrden(datos: unknown): Promise<ResultadoOrden> {
  await requireAdmin();
  const parsed = EliminarSchema.safeParse(datos);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const id = parsed.data.orderId;
  const supabase = await createClient();

  const { data: actual, error: errorLectura } = await supabase.from("orders").select("status").eq("id", id).maybeSingle();
  if (errorLectura) return { ok: false, error: mensajeDeFallo(registrarFallo("admin-ordenes-borrar", errorLectura)) };
  if (!actual) return { ok: true }; // Ya no está: otra pestaña la borró.
  const estado = actual.status as OrderStatus;
  if (!ORDENES_BORRABLES.includes(estado)) {
    return {
      ok: false,
      error: `Una orden ${ETIQUETA_ESTADO[estado].toLowerCase()} no se elimina: es registro de un cobro. Si no siguió, cancélala o devuélvela.`,
    };
  }

  const { data: pago, error: errorPago } = await supabase.from("pagos").select("id").eq("order_id", id).limit(1);
  if (errorPago) return { ok: false, error: mensajeDeFallo(registrarFallo("admin-ordenes-borrar", errorPago)) };
  if (pago && pago.length > 0) {
    return { ok: false, error: "Tiene un pago registrado: no se elimina, para no perder el rastro de ese dinero." };
  }

  if (estado === "pending_payment") {
    const { error } = await supabase
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("status", "pending_payment");
    if (error) return { ok: false, error: mensajeDeFallo(registrarFallo("admin-ordenes-borrar", error, { paso: "cancelar" })) };
  }

  // Solo si quedó cancelada: si alguien confirmó el pago entretanto, cero filas.
  const { data, error } = await supabase.from("orders").delete().eq("id", id).eq("status", "cancelled").select("id");
  if (error) return { ok: false, error: mensajeDeFallo(registrarFallo("admin-ordenes-borrar", error, { paso: "borrar" })) };
  if (!data || data.length === 0) {
    return { ok: false, error: "La orden cambió mientras la mirabas (¿se confirmó el pago?). Recarga la lista." };
  }

  revalidatePath("/admin/ordenes");
  revalidatePath("/admin");
  return { ok: true };
}
