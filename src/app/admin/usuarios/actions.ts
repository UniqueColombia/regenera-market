"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getAlmacen } from "@/lib/almacenamiento";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { mensajeDeFallo, registrarFallo } from "@/lib/incidencias";

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
    // dentro. Recuperarlo exige a alguien con acceso al servidor: un `insert` en
    // `user_roles` desde allí en el modo MySQL (`docs/MODO-MYSQL.md`), o
    // `scripts/crear-admin.mts --supabase` en la vuelta atrás.
    if (userId === admin.id) {
      return {
        ok: false,
        error: "No puedes quitarte a ti mismo la administración. Pídeselo a otro administrador.",
      };
    }

    const { count, error: errorConteo } = await supabase
      .from("user_roles")
      .select("user_id", { count: "exact", head: true })
      .eq("role", "admin");
    // Si el conteo falla, `count` es null y la comprobación de abajo diría
    // «es el único administrador», que es falso. Se informa el error real; el
    // trigger `user_roles_ultimo_admin` sigue siendo la barrera de verdad.
    if (errorConteo) return { ok: false, error: mensajeDeFallo(registrarFallo("admin-usuarios", errorConteo)) };

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
    if (error) return { ok: false, error: mensajeDeFallo(registrarFallo("admin-usuarios", error)) };
  } else {
    const { data, error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", role)
      .select("user_id");
    if (error) {
      // El freno de verdad está en la base (`user_roles_ultimo_admin`, 0014):
      // el conteo de arriba lo pasan dos administradores que se quitan el rol
      // el uno al otro a la vez; el trigger, no.
      if (error.message.includes("ultimo-admin")) {
        return {
          ok: false,
          error: "Es el único administrador que queda. Nombra a otro antes de quitárselo.",
        };
      }
      return { ok: false, error: mensajeDeFallo(registrarFallo("admin-usuarios", error)) };
    }
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
  if (error) return { ok: false, error: mensajeDeFallo(registrarFallo("admin-usuarios", error)) };

  const { error: errorRol } = await supabase
    .from("user_roles")
    .upsert(
      { user_id: parsed.data.userId, role: "provider" },
      { onConflict: "user_id,role", ignoreDuplicates: true },
    );
  if (errorRol) return { ok: false, error: mensajeDeFallo(registrarFallo("admin-usuarios", errorRol)) };

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

  if (error) return { ok: false, error: mensajeDeFallo(registrarFallo("admin-usuarios", error)) };
  if (!data || data.length === 0) {
    return { ok: false, error: "Ese vínculo ya no existía." };
  }

  revalidatePath("/admin/usuarios");
  return { ok: true };
}

const EliminarSchema = z.object({ userId: z.uuid("Identificador de usuario inválido") });

/** Lo que dice la pantalla cuando la base no deja eliminar la cuenta. */
const MOTIVOS: Record<string, string> = {
  "es-uno-mismo": "Tu propia cuenta se elimina desde «Mi cuenta», con tu contraseña.",
  "es-admin": "Es administrador. Quítale primero la administración y después podrás eliminar la cuenta.",
  "firmo-revisiones":
    "Revisó postulaciones, evaluaciones o certificados, y su nombre queda como firma de esas decisiones. No se puede eliminar.",
  "pedidos-en-curso": "Tiene pedidos sin terminar (por pagar, pagados o en camino). Cuando se completen o se cancelen se podrá eliminar.",
  "solicitudes-abiertas": "Tiene una solicitud de cotización abierta. Cuando se responda o se cierre se podrá eliminar.",
  "ventas-en-curso": "Su empresa tiene pedidos sin terminar. Cuando se entreguen o se cancelen se podrá eliminar.",
};

/**
 * Eliminar la cuenta de otra persona desde el panel (2026-10-23). **No se puede
 * deshacer.**
 *
 * Son los pasos de `eliminarMiCuenta()` (`src/app/cuenta/actions.ts`) sin la
 * contraseña, que aquí no tiene sentido: la decide un administrador.
 *
 * 1. **`admin_preparar_baja_de_usuario()`**, en una transacción, con las mismas
 *    reglas que la baja propia: no con pedidos o cotizaciones abiertas, no a un
 *    administrador ni a uno mismo. Cierra la empresa de la que es la única
 *    persona y oculta sus reseñas. Si dice que no, no se tocó nada.
 * 2. **Borrar el usuario**, que se lleva en cascada el perfil, los roles, las
 *    sesiones y lo publicado en la Comunidad. Sus pedidos terminados quedan sin
 *    dueño y con sus datos congelados (`on delete set null`).
 * 3. Sus fotos (avatar y logos de las empresas que se borraron).
 *
 * No se le manda correo: casi siempre es limpiar una cuenta de prueba o
 * abandonada. Si alguien pide su baja por escrito, que la haga desde «Mi
 * cuenta», que sí le deja la constancia.
 */
export async function eliminarUsuario(datos: unknown): Promise<ResultadoRol> {
  await requireAdmin();
  const parsed = EliminarSchema.safeParse(datos);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const id = parsed.data.userId;

  const supabase = await createClient();
  const { data: preparada, error } = await supabase.rpc("admin_preparar_baja_de_usuario", { _user_id: id });
  if (error) {
    const motivo = Object.keys(MOTIVOS).find((m) => error.message.includes(m));
    if (motivo) return { ok: false, error: MOTIVOS[motivo] };
    return { ok: false, error: mensajeDeFallo(registrarFallo("admin-usuarios-borrar", error, { paso: "preparar" })) };
  }

  try {
    const { error: errorBorrado } = await createAdminClient().auth.admin.deleteUser(id);
    if (errorBorrado) throw new Error(errorBorrado.message);
  } catch (e) {
    // Lo del paso 1 ya se hizo y repetirlo es seguro: volver a pulsar
    // reintenta solo lo que falta.
    return { ok: false, error: mensajeDeFallo(registrarFallo("admin-usuarios-borrar", e, { paso: "borrar-usuario" })) };
  }

  const borradas = ((preparada as { empresas_borradas?: string[] } | null)?.empresas_borradas ?? []).filter(
    (p) => typeof p === "string",
  );
  const almacen = getAlmacen();
  await almacen.borrarCarpeta("avatares", id);
  for (const p of borradas) await almacen.borrarCarpeta("logos", p);

  revalidatePath("/", "layout");
  return { ok: true };
}
