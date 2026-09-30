"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ReviewStatus } from "@/lib/types";

/**
 * Moderar el muro de la Comunidad.
 *
 * **Van con el cliente de sesión, nunca con la clave de servicio**, por lo mismo
 * que `admin/proveedores/actions.ts`: así el permiso lo concede la política
 * `community_posts_admin` y no este archivo. `requireAdmin()` está delante para
 * que quien no debe estar vea un redirect limpio, no un error de permisos.
 *
 * Y hay una segunda razón aquí, más concreta: el trigger
 * `community_proteger_derivados` deja pasar `status` y `featured` **solo si
 * `is_admin()`**, que se evalúa contra `auth.uid()`. Con la clave de servicio no
 * hay `auth.uid()`, así que el trigger revertiría el cambio en silencio y el
 * panel diría que funcionó.
 */

/**
 * A qué estados puede mover un administrador una publicación.
 *
 * Solo dos. Un muro no tiene borrador ni revisión previa —se publica al
 * instante, ver la cabecera de la migración 0007—, así que las únicas decisiones
 * reales son «está visible» y «no lo está».
 */
const DESTINOS = ["approved", "suspended"] as const;

const ModerarSchema = z.object({
  postId: z.uuid("Identificador de publicación inválido"),
  estado: z.enum(DESTINOS),
});

const DestacarSchema = z.object({
  postId: z.uuid("Identificador de publicación inválido"),
  destacada: z.boolean(),
});

export type ResultadoModeracion = { ok: true } | { ok: false; error: string };

export async function moderarPublicacion(
  datos: unknown,
): Promise<ResultadoModeracion> {
  await requireAdmin();

  const parsed = ModerarSchema.safeParse(datos);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  return escribir(parsed.data.postId, {
    status: parsed.data.estado satisfies ReviewStatus,
  });
}

/**
 * Destacar o dejar de destacar.
 *
 * **Destacar otorga 80 puntos de experiencia** a la empresa que firma, vía el
 * trigger `community_posts_experiencia`. O sea que es dinero: los puntos bajan
 * la comisión. Quitar el destacado **no** los devuelve —los puntos no bajan
 * nunca, es una decisión del modelo— y `experience_events` impide que volver a
 * destacar la misma publicación los sume otra vez.
 */
export async function destacarPublicacion(
  datos: unknown,
): Promise<ResultadoModeracion> {
  await requireAdmin();

  const parsed = DestacarSchema.safeParse(datos);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  return escribir(parsed.data.postId, { featured: parsed.data.destacada });
}

/**
 * Eliminar una publicación para siempre.
 *
 * Distinto de ocultar: ocultar es reversible y el autor la sigue viendo;
 * eliminar la borra y arrastra sus reacciones. No deja registro. **Los puntos de
 * experiencia que dio no se devuelven** (no bajan nunca, es una decisión del
 * modelo). Con el cliente de sesión, como el resto: lo autoriza
 * `community_posts_admin`.
 */
export async function eliminarPublicacionAdmin(
  datos: unknown,
): Promise<ResultadoModeracion> {
  await requireAdmin();

  const parsed = z.object({ postId: z.uuid("Identificador de publicación inválido") }).safeParse(datos);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("community_posts")
    .delete()
    .eq("id", parsed.data.postId)
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "No se pudo eliminar. ¿Sigues teniendo permiso de administrador?" };
  }

  revalidatePath("/admin/comunidad");
  revalidatePath("/comunidad");
  revalidatePath("/");
  return { ok: true };
}

async function escribir(
  postId: string,
  campos: Record<string, unknown>,
): Promise<ResultadoModeracion> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("community_posts")
    .update(campos)
    .eq("id", postId)
    .select("id");

  if (error) return { ok: false, error: error.message };
  // RLS no devuelve error cuando niega: devuelve cero filas. Sin esto, un
  // intento denegado se vería como un éxito silencioso.
  if (!data || data.length === 0) {
    return {
      ok: false,
      error: "No se pudo actualizar. ¿Sigues teniendo permiso de administrador?",
    };
  }

  revalidatePath("/admin/comunidad");
  revalidatePath("/comunidad");
  revalidatePath("/");
  return { ok: true };
}
