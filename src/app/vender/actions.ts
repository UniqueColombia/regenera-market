"use server";

import { z } from "zod";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DEPARTMENTS } from "@/lib/taxonomy";

/**
 * Postulación de proveedor.
 *
 * Antes esto guardaba la solicitud en un array del proceso de Node y devolvía
 * `ok`. Funcionaba de cara al usuario y **perdía la postulación en cada
 * redespliegue**: una empresa se tomaba el trabajo de escribir su descripción,
 * veía el mensaje de «recibido» y nadie la leía jamás. Ahora va a
 * `provider_applications` (migración 0004).
 *
 * El formulario **no exige sesión** a propósito: a una cooperativa que llega
 * desde un enlace no se le pide crear una cuenta antes de saber si le interesa.
 * Si resulta que la tiene abierta, se guarda su `user_id`, y eso importa más de
 * lo que parece: al aprobar la postulación, esa persona es la que queda como
 * dueña de la empresa en `provider_members`. Sin `user_id`, la empresa aprobada
 * nace sin nadie que pueda gestionarla.
 *
 * La escritura va con el cliente de sesión: la política
 * `provider_applications_insert` es la que autoriza, y lo único que exige es que
 * nadie postule en nombre de otra persona.
 */

const ApplicationSchema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre de tu empresa"),
  contactName: z.string().trim().min(3, "Escribe tu nombre completo"),
  email: z.email("Revisa el correo"),
  phone: z.string().trim().min(7, "Escribe un teléfono de contacto"),
  department: z.enum(DEPARTMENTS, "Elige un departamento"),
  city: z.string().trim().min(2, "Escribe la ciudad o municipio"),
  website: z.union([z.url("Revisa la dirección web"), z.literal("")]).optional(),
  description: z
    .string()
    .trim()
    .min(80, "Cuéntanos un poco más: al menos 80 caracteres")
    .max(1500),
});

export type ApplicationResult =
  | { ok: true }
  | { ok: false; errors: Record<string, string> };

export async function submitApplication(
  form: unknown,
): Promise<ApplicationResult> {
  const parsed = ApplicationSchema.safeParse(form);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      errors[key] ??= issue.message;
    }
    return { ok: false, errors };
  }

  const usuario = await getUser();
  const supabase = await createClient();

  const { error } = await supabase.from("provider_applications").insert({
    user_id: usuario?.id ?? null,
    name: parsed.data.name,
    contact_name: parsed.data.contactName,
    email: parsed.data.email,
    phone: parsed.data.phone,
    department: parsed.data.department,
    city: parsed.data.city,
    website: parsed.data.website || null,
    description: parsed.data.description,
    status: "pending_review",
  });

  if (error) {
    return {
      ok: false,
      errors: {
        form:
          "No pudimos registrar tu postulación. Inténtalo de nuevo en un minuto.",
      },
    };
  }

  return { ok: true };
}
