"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { registrarFallo, mensajeDeFallo } from "@/lib/incidencias";
import { calificarItem, confirmarEntrega, type MotivoEnvio } from "@/lib/orders";

/**
 * Lo que hace quien compró desde su pedido: decir que le llegó y reseñar.
 *
 * Las dos son idempotentes en la base (`confirmar_entrega()` y `calificar()`
 * de la 0014): pulsar dos veces «ya me llegó» o mandar la reseña dos veces no
 * cambia nada la segunda vez. Aquí solo se valida la forma y se traduce el
 * motivo a algo que se pueda leer.
 */

export type ResultadoItem = { ok: true } | { ok: false; error: string };

function explicar(motivo: MotivoEnvio): string {
  switch (motivo) {
    case "sin-sesion":
      return "Tu sesión se cerró. Entra otra vez.";
    case "item-ajeno":
      return "Ese producto no es de un pedido tuyo.";
    case "sin-envio":
      return "Esto no se despacha: no hay entrega que confirmar.";
    case "orden-no-despachable":
      return "El pedido todavía no está pagado, o ya se cerró.";
    case "todavia-no":
      return "Podrás reseñarlo cuando lo recibas.";
    case "oferta-retirada":
      return "Esa oferta ya no está en el catálogo, así que no se puede reseñar.";
    case "calificacion-invalida":
      return "Elige de 1 a 5 estrellas.";
    case "falta-guia":
      return "Falta la guía.";
  }
}

const ConfirmarSchema = z.object({
  itemId: z.uuid(),
  reference: z.string().regex(/^SR-[0-9A-Z-]{4,20}$/),
});

export async function confirmarRecibido(datos: unknown): Promise<ResultadoItem> {
  const parsed = ConfirmarSchema.safeParse(datos);
  if (!parsed.success) return { ok: false, error: "No pudimos leer el pedido. Recarga la página." };
  if (!(await getUser())) return { ok: false, error: explicar("sin-sesion") };

  try {
    const r = await confirmarEntrega(parsed.data.itemId);
    if (!r.ok) return { ok: false, error: explicar(r.motivo) };
    // Sin correo: quien acaba de confirmarlo es quien lo recibiría. Los
    // puntos del proveedor por la venta los da la base al cerrarse el pedido.
    revalidatePath(`/orden/${parsed.data.reference}`);
    revalidatePath("/cuenta");
    return { ok: true };
  } catch (e) {
    const codigo = registrarFallo("orden-recibido", e);
    return { ok: false, error: mensajeDeFallo(codigo) };
  }
}

const ResenaSchema = z.object({
  itemId: z.uuid(),
  reference: z.string().regex(/^SR-[0-9A-Z-]{4,20}$/),
  slug: z.string().max(200).optional(),
  rating: z.coerce.number().int().min(1, "Elige de 1 a 5 estrellas").max(5),
  comentario: z.string().trim().max(2000, "Cuéntalo en menos de 2.000 caracteres").default(""),
});

export async function guardarResena(datos: unknown): Promise<ResultadoItem> {
  const parsed = ResenaSchema.safeParse(datos);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa la reseña." };
  }
  if (!(await getUser())) return { ok: false, error: explicar("sin-sesion") };

  try {
    const d = parsed.data;
    const r = await calificarItem(d.itemId, d.rating, d.comentario);
    if (!r.ok) return { ok: false, error: explicar(r.motivo) };
    revalidatePath(`/orden/${d.reference}`);
    if (d.slug) revalidatePath(`/oferta/${d.slug}`);
    return { ok: true };
  } catch (e) {
    const codigo = registrarFallo("orden-resena", e);
    return { ok: false, error: mensajeDeFallo(codigo) };
  }
}
