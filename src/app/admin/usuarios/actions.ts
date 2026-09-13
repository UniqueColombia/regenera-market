"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Roles y vínculos con empresas, desde la interfaz.
 *
 * Hasta hoy esto se hacía con un `insert` en el SQL Editor. Que exista esta
 * pantalla no cambia quién puede hacerlo —lo decide la política
 * `user_roles_admin_write`, igual que antes—, cambia que no haya que escribir
 * SQL para operar la plataforma, que es el criterio de salida del Bloque 3.
 *
 * Con el cliente de sesión, nunca con la clave de servicio. `scripts/crear-admin.mts`
 * sí la usa, y tiene que hacerlo: **el primer administrador no se puede crear
 * desde aquí**, porque la política exige ya ser uno. Ese arranque en frío es la
 * única excepción legítima.
 */

/**
 * Los roles que se pueden dar y quitar.
 *
 * `buyer` no está: lo pone el trigger `handle_new_user` a todo el mundo al
 * registrarse y no significa un permiso, significa «tiene cuenta». Quitarlo no
 * cerraría ninguna puerta y dejaría una fila menos por ninguna razón.
 */
const ROLES = ["admin", "provider"] as const;

const RolSchema = z.object({
  userId: z.uuid("Identificador de usuario inválido"),
  role: z.enum(ROLES),
  conceder: z.boolean(),
});

export type ResultadoRol = { ok: true } | { ok: false; error: string };

export async function cambiarRol(datos: unknown): Promise<ResultadoRol> {
  const admin = await requireAdmin();

  const parsed = RolSchema.safeParse(datos);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const { userId, role, conceder } = parsed.data;
  const supabase = await createClient();

  if (!conceder && role === "admin") {
    // Dos frenos que la base no puede poner por sí sola, y que existen por el
    // mismo motivo: un panel que se puede cerrar desde dentro se cierra desde
    // dentro. Recuperarlo exige volver a `scripts/crear-admin.mts` con la clave
    // de servicio, o sea a alguien con acceso al servidor.
    if (userId === admin.id) {
      return {
        ok: false,
        error: "No puedes quitarte a ti mismo la administración. Pídeselo a otro administrador.",
      };
    }

    const { count } = await supabase
      .from("user_roles")
      .select("user_id", { count: "exact", head: true })
      .eq("role", "admin");

    if ((count ?? 0) <= 1) {
      return {
        ok: false,
        error: "Es el único administrador que queda. Nombra a otro antes de quitárselo.",
      };
    }
  }

  if (conceder) {
    const { error } = await supabase
      .from("user_roles")
      .upsert({ user_id: userId, role }, { onConflict: "user_id,role", ignoreDuplicates: true });
    if (error) return { ok: false, error: error.message };
  } else {
    const { data, error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", role)
      .select("user_id");
    if (error) return { ok: false, error: error.message };
    // RLS no da error cuando niega: devuelve cero filas.
    if (!data || data.length === 0) {
      return { ok: false, error: "No se pudo quitar el rol. ¿Sigues siendo administrador?" };
    }
  }

  revalidatePath("/admin/usuarios");
  return { ok: true };
}

const VinculoSchema = z.object({
  userId: z.uuid("Identificador de usuario inválido"),
  providerId: z.uuid("Elige una empresa"),
});

/**
 * Enlaza una persona con una empresa y le da el rol de proveedor.
 *
 * **Esto es lo que arregla el cabo suelto más silencioso del proyecto**: los
 * proveedores sembrados por `scripts/seed.mts` no tienen ninguna fila en
 * `provider_members`, así que no hay ninguna persona que pueda gestionarlos.
 * Nada falla ni avisa; simplemente `manages_provider()` devuelve falso para
 * todo el mundo y el proveedor no puede editar su propia ficha.
 *
 * `is_owner` queda en `true` porque hoy se enlaza a una persona por empresa. El
 * día que haya equipos, el segundo en entrar va con `false` y esta acción
 * necesitará decidirlo.
 */
export async function enlazarProveedor(datos: unknown): Promise<ResultadoRol> {
  await requireAdmin();

  const parsed = VinculoSchema.safeParse(datos);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("provider_members")
    .upsert(
      { provider_id: parsed.data.providerId, user_id: parsed.data.userId, is_owner: true },
      { onConflict: "provider_id,user_id", ignoreDuplicates: true },
    );
  if (error) return { ok: false, error: error.message };

  const { error: errorRol } = await supabase
    .from("user_roles")
    .upsert(
      { user_id: parsed.data.userId, role: "provider" },
      { onConflict: "user_id,role", ignoreDuplicates: true },
    );
  if (errorRol) return { ok: false, error: errorRol.message };

  revalidatePath("/admin/usuarios");
  return { ok: true };
}

/** Deshace el vínculo. No quita el rol: puede gestionar otra empresa. */
export async function desenlazarProveedor(datos: unknown): Promise<ResultadoRol> {
  await requireAdmin();

  const parsed = VinculoSchema.safeParse(datos);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("provider_members")
    .delete()
    .eq("provider_id", parsed.data.providerId)
    .eq("user_id", parsed.data.userId)
    .select("user_id");

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "Ese vínculo ya no existía." };
  }

  revalidatePath("/admin/usuarios");
  return { ok: true };
}
