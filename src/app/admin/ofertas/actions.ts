"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { slugLibre, slugify } from "@/lib/slug";
import { CamposOferta, erroresDeOferta, filaDeOferta, reglasDeOferta } from "@/lib/ofertas";

/**
 * Crear y editar ofertas: el CRUD que convierte esto en algo operable.
 *
 * Sin esta pantalla, **cambiar un precio exigía editar `src/data/`, abrir un PR
 * y desplegar**, o correr `scripts/seed.mts` a mano contra la base. Era la
 * queja original del proyecto y la razón de que el catálogo se mudara a
 * Postgres.
 *
 * Con el cliente de sesión: la política `listings_admin` es la que autoriza.
 *
 * ## Lo que este formulario no puede tocar, y por qué
 *
 * **`sustainability_score` y `tier` no están y no pueden estar.** Viven en
 * `providers` y los escribe el trigger `sync_provider_score()` cuando se aprueba
 * una evaluación. Un campo editable ahí vaciaría de significado el sello y
 * borraría la auditoría del puntaje — invariante 13 de `dominio-regenera`.
 *
 * ## Las validaciones son las mismas que las de la empresa
 *
 * Desde el 2026-09-26 las empresas publican sus propias ofertas
 * (`/cuenta/empresa/ofertas`), y los dos formularios comparten esquema y
 * mapeo a la fila en `src/lib/ofertas.ts`. Lo que distingue a este es lo que
 * solo decide el equipo: el proveedor, el estado y el destacado.
 */

/**
 * Lo que el administrador decide y la empresa no: de quién es la oferta, en qué
 * estado queda y si se destaca. El resto de campos es el mismo para los dos
 * formularios y vive en `src/lib/ofertas.ts`.
 */
const OfertaAdminSchema = CamposOferta.extend({
  providerId: z.uuid("Elige el proveedor"),
  status: z.enum(["draft", "pending_review", "approved", "rejected", "suspended"]),
  featured: z.boolean().optional(),
});

export type ResultadoOferta =
  | { ok: true; id: string; slug: string }
  | { ok: false; errors: Record<string, string> };

export async function guardarOferta(datos: unknown): Promise<ResultadoOferta> {
  await requireAdmin();

  const parsed = OfertaAdminSchema.safeParse(datos);
  if (!parsed.success) return { ok: false, errors: erroresDeOferta(parsed.error) };

  const d = parsed.data;
  const reglas = reglasDeOferta(d);
  if (Object.keys(reglas).length > 0) return { ok: false, errors: reglas };

  const supabase = await createClient();
  const editando = Boolean(d.id);

  // El slug se calcula solo a partir del título cuando no se escribió uno. Al
  // editar se respeta el que ya tiene: cambiarlo rompe cualquier enlace que
  // alguien haya guardado o mandado por WhatsApp.
  const slug = d.slug?.trim()
    ? slugify(d.slug)
    : await slugLibre(d.title, async (candidato) => {
        const { data } = await supabase
          .from("listings")
          .select("id")
          .eq("slug", candidato)
          .maybeSingle();
        return Boolean(data) && data?.id !== d.id;
      });

  const fila = {
    ...filaDeOferta(d),
    provider_id: d.providerId,
    slug,
    status: d.status,
    featured: d.featured ?? false,
  };

  const consulta = editando
    ? supabase.from("listings").update(fila).eq("id", d.id!).select("id, slug")
    : supabase.from("listings").insert(fila).select("id, slug");

  const { data, error } = await consulta;

  if (error) {
    return {
      ok: false,
      errors: {
        form: error.message.includes("listings_slug_key")
          ? "Ya hay otra oferta con esa dirección. Cambia el título o el slug."
          : error.message,
      },
    };
  }

  // RLS no da error cuando niega: devuelve cero filas. Sin esto, un intento
  // denegado se vería como un guardado correcto.
  if (!data || data.length === 0) {
    return {
      ok: false,
      errors: { form: "No se pudo guardar. ¿Sigues teniendo permiso de administrador?" },
    };
  }

  // El catálogo, la ficha, el home y la página del proveedor pueden cambiar con
  // esto. `layout` revalida el árbol entero, que es lo correcto aquí: una oferta
  // aprobada aparece en sitios que esta acción no conoce.
  revalidatePath("/", "layout");

  return { ok: true, id: data[0].id, slug: data[0].slug };
}

const EstadoSchema = z.object({
  id: z.uuid("Identificador de oferta inválido"),
  status: z.enum(["draft", "pending_review", "approved", "rejected", "suspended"]),
});

/**
 * Publicar o retirar sin abrir el formulario.
 *
 * Es la operación que más se repite —aprobar lo que mandó un proveedor, retirar
 * algo que se agotó— y obligarla a pasar por el formulario entero sería pedir
 * seis clics para cambiar una palabra.
 */
export async function cambiarEstadoOferta(datos: unknown): Promise<
  { ok: true } | { ok: false; error: string }
> {
  await requireAdmin();

  const parsed = EstadoSchema.safeParse(datos);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id)
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "No se pudo actualizar. ¿Sigues siendo administrador?" };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
