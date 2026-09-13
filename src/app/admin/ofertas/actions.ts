"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { slugLibre, slugify } from "@/lib/slug";
import { CATEGORIES, DEPARTMENTS } from "@/lib/taxonomy";

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
 * ## Las validaciones espejan los `check` de la tabla
 *
 * No por duplicar trabajo, sino porque la base rechaza con un mensaje como
 * `new row violates check constraint "wholesale_needs_qty"`, que no le dice nada
 * a quien está llenando un formulario. Zod da el error en el campo correcto; el
 * `check` sigue estando detrás para todo lo que no pase por aquí.
 */

/** Texto que llega vacío del formulario: se guarda como null, no como "". */
const textoOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null));

/**
 * Un número que puede venir vacío.
 *
 * `z.coerce.number()` convierte "" en 0, que aquí sería mentir: un stock sin
 * llenar no es «cero unidades disponibles», es «no llevamos stock de esto».
 */
const numeroOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? Number(v) : null))
  .refine((v) => v === null || Number.isFinite(v), "Escribe un número");

/** Una lista escrita a razón de una por línea. Es lo que un `text[]` espera. */
const lineas = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  );

const OfertaSchema = z
  .object({
    id: z.union([z.uuid(), z.literal("")]).optional(),
    providerId: z.uuid("Elige el proveedor"),
    kind: z.enum(["product", "experience", "service"]),
    title: z.string().trim().min(4, "Escribe un título"),
    slug: z.string().trim().optional(),
    summary: z.string().trim().max(300, "El resumen se pasa de 300 caracteres").optional(),
    description: z.string().trim().optional(),
    category: z.enum(CATEGORIES, "Elige una categoría"),
    verticals: z.array(z.enum(["hoteles", "hostales", "restaurantes", "transporte", "agencias"])).optional(),
    images: lineas,
    priceCop: z.coerce.number().int("El precio va en pesos enteros").min(0, "El precio no puede ser negativo"),
    wholesalePriceCop: numeroOpcional,
    wholesaleMinQty: numeroOpcional,
    unit: z.string().trim().min(1, "Escribe la unidad").default("unidad"),
    quoteOnly: z.boolean().optional(),
    stock: numeroOpcional,
    co2KgSaved: numeroOpcional,
    waterLitersSaved: numeroOpcional,
    wasteKgReduced: numeroOpcional,
    certifications: z.array(z.string()).optional(),
    department: z.union([z.enum(DEPARTMENTS), z.literal("")]).optional(),
    city: textoOpcional,
    status: z.enum(["draft", "pending_review", "approved", "rejected", "suspended"]),
    featured: z.boolean().optional(),
    durationHours: numeroOpcional,
    minPeople: numeroOpcional,
    maxPeople: numeroOpcional,
    meetingPoint: textoOpcional,
    includes: lineas,
    deliveryTime: textoOpcional,
    scope: lineas,
  })
  // Espeja el `check wholesale_needs_qty` de `0001_init.sql`: un precio
  // mayorista sin cantidad mínima es un precio que nunca se aplica, porque
  // `unitPriceFor()` lo compara contra `wholesaleMinQty` (invariante 4).
  .refine((d) => d.wholesalePriceCop === null || d.wholesaleMinQty !== null, {
    path: ["wholesaleMinQty"],
    message: "Si pones precio mayorista, di desde cuántas unidades aplica",
  })
  .refine(
    (d) => d.kind !== "experience" || (d.minPeople === null && d.maxPeople === null) || (d.minPeople ?? 0) <= (d.maxPeople ?? Infinity),
    { path: ["maxPeople"], message: "El máximo de personas no puede ser menor que el mínimo" },
  );

export type ResultadoOferta =
  | { ok: true; id: string; slug: string }
  | { ok: false; errors: Record<string, string> };

export async function guardarOferta(datos: unknown): Promise<ResultadoOferta> {
  await requireAdmin();

  const parsed = OfertaSchema.safeParse(datos);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const campo = issue.path[0];
      if (typeof campo === "string" && !errors[campo]) errors[campo] = issue.message;
    }
    return { ok: false, errors };
  }

  const d = parsed.data;
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

  // Los campos de un tipo se limpian al guardar otro. Si no, una experiencia
  // convertida en producto conserva su punto de encuentro y la ficha pública
  // enseña un dato que ya no significa nada.
  const esExperiencia = d.kind === "experience";
  const esServicio = d.kind === "service";

  const fila = {
    provider_id: d.providerId,
    slug,
    kind: d.kind,
    title: d.title,
    summary: d.summary ?? "",
    description: d.description ?? "",
    category: d.category,
    verticals: d.verticals ?? [],
    images: d.images,
    price_cop: Math.round(d.priceCop),
    wholesale_price_cop: d.wholesalePriceCop === null ? null : Math.round(d.wholesalePriceCop),
    wholesale_min_qty: d.wholesaleMinQty === null ? null : Math.round(d.wholesaleMinQty),
    unit: d.unit,
    quote_only: d.quoteOnly ?? false,
    stock: d.stock === null ? null : Math.round(d.stock),
    co2_kg_saved: d.co2KgSaved,
    water_liters_saved: d.waterLitersSaved,
    waste_kg_reduced: d.wasteKgReduced,
    certifications: d.certifications ?? [],
    department: d.department || null,
    city: d.city,
    status: d.status,
    featured: d.featured ?? false,
    duration_hours: esExperiencia ? d.durationHours : null,
    min_people: esExperiencia ? d.minPeople : null,
    max_people: esExperiencia ? d.maxPeople : null,
    meeting_point: esExperiencia ? d.meetingPoint : null,
    includes: esExperiencia ? d.includes : [],
    delivery_time: esServicio ? d.deliveryTime : null,
    scope: esServicio ? d.scope : [],
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
