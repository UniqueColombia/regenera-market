"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Ocultar o volver a mostrar una reseña.
 *
 * El equipo modera, no edita: una reseña ofensiva o que no habla del producto
 * se oculta, y su autor la sigue viendo en su pedido con el aviso. El texto no
 * se toca nunca — corregirle las palabras a un comprador sería poner en su
 * boca algo que no dijo.
 *
 * Con el cliente de sesión: la política `reviews_admin` (0014) es la que
 * autoriza. Idempotente: ocultar lo que ya está oculto deja todo igual y no es
 * un error.
 */

const ModerarSchema = z.object({
  id: z.uuid("Identificador de reseña inválido"),
  oculta: z.boolean(),
  slug: z.string().max(200).optional(),
});

export async function moderarResena(
  datos: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const parsed = ModerarSchema.safeParse(datos);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reviews")
    .update({ oculta: parsed.data.oculta })
    .eq("id", parsed.data.id)
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "No se pudo actualizar. ¿Sigues siendo administrador?" };
  }

  revalidatePath("/admin/resenas");
  if (parsed.data.slug) revalidatePath(`/oferta/${parsed.data.slug}`);
  return { ok: true };
}
