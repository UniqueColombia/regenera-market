"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { slugLibre } from "@/lib/slug";

/**
 * Decisiones sobre una postulación de `/vender`.
 *
 * Con el cliente de sesión, nunca con la clave de servicio: quien concede el
 * permiso es RLS a través de `is_admin()`. `requireAdmin()` está por delante
 * solo para que quien no deba estar vea un redirect limpio.
 *
 * ## Aprobar no es cambiar un estado
 *
 * Es la trampa que `docs/BETA.md` dejó anotada y que hoy tienen los trece
 * proveedores sembrados: aprobar tiene que crear **tres** cosas, no una.
 *
 * 1. La fila de `providers`, con `status = 'approved'`.
 * 2. La fila de `provider_members` que enlaza a la persona que postuló con la
 *    empresa. Sin ella `manages_provider()` devuelve falso y el proveedor
 *    aprobado no puede tocar nada de lo suyo — **el panel de proveedor nace
 *    muerto y el síntoma no apunta a la causa**.
 * 3. El rol `provider` de esa persona, que es lo que le cambia la navegación.
 *
 * Los pasos 2 y 3 solo se pueden dar si la postulación trae `user_id`, o sea si
 * quien la mandó tenía sesión. Cuando no lo trae, la empresa queda creada y sin
 * dueño, y la pantalla lo dice en vez de fingir que quedó todo listo: hay que
 * pedirle a esa persona que se registre y enlazarla después.
 *
 * ## Lo que no se toca al aprobar
 *
 * Ni `sustainability_score` ni `tier`. Los escribe el trigger
 * `sync_provider_score()` cuando se aprueba una evaluación. Aprobar a un
 * proveedor le permite vender; no le da un sello.
 */

const DecisionSchema = z.object({
  id: z.uuid("Identificador de postulación inválido"),
  decision: z.enum(["approved", "rejected"]),
  notas: z.string().trim().max(1000).optional(),
});

export type ResultadoPostulacion =
  | { ok: true; aviso?: string }
  | { ok: false; error: string };

export async function decidirPostulacion(
  datos: unknown,
): Promise<ResultadoPostulacion> {
  const admin = await requireAdmin();

  const parsed = DecisionSchema.safeParse(datos);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();

  const { data: postulacion, error: errorLectura } = await supabase
    .from("provider_applications")
    .select("*")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (errorLectura) return { ok: false, error: errorLectura.message };
  // RLS no da error cuando niega: devuelve cero filas. Sin esta comprobación,
  // un intento denegado se vería como «esa postulación no existe».
  if (!postulacion) {
    return {
      ok: false,
      error: "No encontramos la postulación. ¿Sigues teniendo permiso de administrador?",
    };
  }

  if (parsed.data.decision === "rejected") {
    const { data, error } = await supabase
      .from("provider_applications")
      .update({
        status: "rejected",
        reviewer_notes: parsed.data.notas || null,
        reviewed_by: admin.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", parsed.data.id)
      .select("id");

    if (error) return { ok: false, error: error.message };
    if (!data || data.length === 0) {
      return { ok: false, error: "No se pudo guardar la decisión." };
    }

    revalidatePath("/admin/postulaciones");
    return { ok: true };
  }

  // Aprobar. Si ya se aprobó antes, no se crea una segunda empresa: la columna
  // `provider_id` de la postulación es lo que lo impide.
  if (postulacion.provider_id) {
    return { ok: false, error: "Esta postulación ya tenía una empresa creada." };
  }

  const slug = await slugLibre(postulacion.name, async (candidato) => {
    const { data } = await supabase
      .from("providers")
      .select("id")
      .eq("slug", candidato)
      .maybeSingle();
    return Boolean(data);
  });

  const { data: proveedor, error: errorProveedor } = await supabase
    .from("providers")
    .insert({
      slug,
      name: postulacion.name,
      // El titular corto de la ficha sale de la primera frase de lo que
      // escribieron. Es un punto de partida editable, no una decisión: dejarlo
      // vacío haría que la tarjeta del catálogo saliera coja el primer día.
      tagline: postulacion.description.split(/[.!?]\s/)[0].slice(0, 140),
      description: postulacion.description,
      department: postulacion.department,
      city: postulacion.city,
      email: postulacion.email,
      phone: postulacion.phone,
      website: postulacion.website,
      status: "approved",
    })
    .select("id, slug")
    .single();

  if (errorProveedor) return { ok: false, error: errorProveedor.message };

  let aviso: string | undefined;

  if (postulacion.user_id) {
    const { error: errorMiembro } = await supabase.from("provider_members").insert({
      provider_id: proveedor.id,
      user_id: postulacion.user_id,
      is_owner: true,
    });
    if (errorMiembro) {
      aviso = `La empresa quedó creada, pero no pude enlazar a la persona: ${errorMiembro.message}`;
    }

    const { error: errorRol } = await supabase
      .from("user_roles")
      .upsert(
        { user_id: postulacion.user_id, role: "provider" },
        { onConflict: "user_id,role", ignoreDuplicates: true },
      );
    if (errorRol) {
      aviso = `La empresa quedó creada, pero no pude darle el rol de proveedor: ${errorRol.message}`;
    }
  } else {
    aviso =
      "La empresa quedó creada sin dueño: quien postuló no tenía cuenta. " +
      "Pídele que se registre con " +
      postulacion.email +
      " y enlázalo desde Usuarios.";
  }

  const { error: errorCierre } = await supabase
    .from("provider_applications")
    .update({
      status: "approved",
      provider_id: proveedor.id,
      reviewer_notes: parsed.data.notas || null,
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.id);

  if (errorCierre) return { ok: false, error: errorCierre.message };

  // El proveedor aprobado aparece en la lista pública y en las cifras del home.
  revalidatePath("/", "layout");
  return { ok: true, aviso };
}
