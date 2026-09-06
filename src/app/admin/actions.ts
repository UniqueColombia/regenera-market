"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ReviewStatus } from "@/lib/types";

/**
 * Decisiones del administrador sobre un proveedor.
 *
 * **Van con el cliente de sesión, nunca con la clave de servicio.** Podrían
 * hacerse con `admin.ts` y funcionaría igual, pero entonces el permiso lo estaría
 * concediendo este archivo en vez de la base: cualquier fallo en `requireAdmin`
 * se convertiría en escritura libre. Con el cliente de sesión, la política
 * `providers_admin_all` es la que decide, y quien no sea admin no escribe una
 * fila aunque llegue hasta aquí.
 *
 * `requireAdmin()` sigue estando por delante para que el que no debe estar vea un
 * redirect limpio y no un error de permisos.
 */

/**
 * Estados a los que un admin puede mover un proveedor desde el panel.
 *
 * `draft` no está: es el estado en el que el proveedor prepara su ficha, y
 * devolverlo ahí desde administración le borraría el rastro de que fue revisado.
 * Para pedirle cambios está `rejected`, que sí es una decisión.
 */
const DESTINOS = ["approved", "rejected", "suspended", "pending_review"] as const;

const DecisionSchema = z.object({
  providerId: z.uuid("Identificador de proveedor inválido"),
  estado: z.enum(DESTINOS),
});

export type ResultadoDecision =
  | { ok: true }
  | { ok: false; error: string };

export async function decidirProveedor(
  datos: unknown,
): Promise<ResultadoDecision> {
  await requireAdmin();

  const parsed = DecisionSchema.safeParse(datos);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("providers")
    // Solo el estado. El puntaje y el nivel los escribe el trigger
    // `sustainability_approved` al aprobar una evaluación, y ninguna ruta de la
    // aplicación debe poder tocarlos — invariante 13 de `dominio-regenera`.
    .update({ status: parsed.data.estado satisfies ReviewStatus })
    .eq("id", parsed.data.providerId)
    .select("id");

  if (error) return { ok: false, error: error.message };
  // RLS no devuelve error cuando niega: devuelve cero filas afectadas. Sin esta
  // comprobación, un intento denegado se vería como un éxito silencioso.
  if (!data || data.length === 0) {
    return {
      ok: false,
      error: "No se pudo actualizar. ¿Sigues teniendo permiso de administrador?",
    };
  }

  // El catálogo y la lista pública dependen del estado del proveedor: aprobar a
  // uno hace aparecer sus ofertas, suspenderlo las esconde.
  revalidatePath("/", "layout");
  return { ok: true };
}
