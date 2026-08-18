"use server";

import { z } from "zod";
import { DEPARTMENTS } from "@/lib/taxonomy";

/**
 * Postulación de proveedor.
 *
 * PROVISIONAL: hoy solo valida y deja la solicitud en memoria del servidor.
 * Cuando exista Supabase, esta acción crea la fila en `providers` con estado
 * `pending_review`, el `provider_members` del usuario que postula y una
 * evaluación en borrador para que continúe el cuestionario.
 */

const applications: ProviderApplication[] = [];

export interface ProviderApplication {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  department: string;
  city: string;
  website?: string;
  description: string;
  createdAt: string;
}

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

  applications.push({
    id: crypto.randomUUID(),
    ...parsed.data,
    website: parsed.data.website || undefined,
    createdAt: new Date().toISOString(),
  });

  return { ok: true };
}

export async function listApplications(): Promise<ProviderApplication[]> {
  return [...applications].reverse();
}
