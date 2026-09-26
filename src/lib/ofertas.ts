import { z } from "zod";
import { DEPARTMENTS, IDS_CATEGORIA, categoriaPorId } from "./taxonomy";

/**
 * Lo que tiene una oferta, validado igual venga de donde venga.
 *
 * Lo usan dos acciones: la del panel de administración
 * (`src/app/admin/ofertas/actions.ts`) y la de la empresa
 * (`src/app/cuenta/empresa/ofertas/actions.ts`). Vive aquí, en un archivo
 * normal, porque un `"use server"` solo puede exportar funciones asíncronas
 * (skill `componentizacion`) y el esquema no lo es.
 *
 * **Es solo el objeto, sin refinamientos.** En Zod 4 un esquema con `.refine()`
 * ya no se puede `.extend()`, y cada acción le añade sus campos propios: el
 * administrador elige proveedor y estado, la empresa no. Las reglas que cruzan
 * campos van en `reglasDeOferta()`, que se aplica después de validar.
 *
 * Las validaciones espejan los `check` de la tabla por lo mismo que antes: la
 * base rechaza con `violates check constraint "wholesale_needs_qty"`, que no le
 * dice nada a quien llena el formulario.
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

export const CamposOferta = z.object({
  id: z.union([z.uuid(), z.literal("")]).optional(),
  kind: z.enum(["product", "experience", "service"]),
  title: z.string().trim().min(4, "Escribe un título").max(140, "El título es demasiado largo"),
  slug: z.string().trim().optional(),
  summary: z.string().trim().max(300, "El resumen se pasa de 300 caracteres").optional(),
  description: z.string().trim().max(5000, "La descripción es demasiado larga").optional(),
  category: z.enum(IDS_CATEGORIA, "Elige una categoría"),
  subcategory: z.string().trim().optional(),
  verticals: z
    .array(z.enum(["hoteles", "hostales", "restaurantes", "transporte", "agencias"]))
    .optional(),
  images: lineas,
  priceCop: z.coerce
    .number("Escribe el precio")
    .int("El precio va en pesos enteros")
    .min(0, "El precio no puede ser negativo"),
  wholesalePriceCop: numeroOpcional,
  wholesaleMinQty: numeroOpcional,
  unit: z.string().trim().min(1, "Escribe la unidad").max(40).default("unidad"),
  quoteOnly: z.boolean().optional(),
  stock: numeroOpcional,
  co2KgSaved: numeroOpcional,
  waterLitersSaved: numeroOpcional,
  wasteKgReduced: numeroOpcional,
  aporteAmbiental: z.string().trim().max(1000, "Cuéntalo en menos de 1.000 caracteres").optional(),
  consecuenciaAmbiental: z
    .string()
    .trim()
    .max(1000, "Cuéntalo en menos de 1.000 caracteres")
    .optional(),
  huellaCo2Kg: numeroOpcional,
  certifications: z.array(z.string()).optional(),
  department: z.union([z.enum(DEPARTMENTS), z.literal("")]).optional(),
  city: textoOpcional,
  durationHours: numeroOpcional,
  minPeople: numeroOpcional,
  maxPeople: numeroOpcional,
  meetingPoint: textoOpcional,
  includes: lineas,
  deliveryTime: textoOpcional,
  scope: lineas,
});

export type Campos = z.infer<typeof CamposOferta>;

/**
 * Las reglas que miran dos campos a la vez, sobre datos ya validados.
 *
 * Van después de `safeParse` y no como `.refine()` por dos razones de Zod 4:
 * un esquema refinado ya no se puede `.extend()` —y cada acción le añade sus
 * campos—, y un `.refine()` corre aunque el campo haya fallado antes, con el
 * valor inválido dentro (skill `componentizacion`). Aquí todo lo que llega ya
 * pasó la validación de su campo.
 *
 * Devuelve `{}` si no hay nada que objetar.
 */
export function reglasDeOferta(d: Campos): Record<string, string> {
  const errores: Record<string, string> = {};

  // Espeja el `check wholesale_needs_qty` de `0001_init.sql`: un precio
  // mayorista sin cantidad mínima nunca se aplica (invariante 4).
  if (d.wholesalePriceCop !== null && d.wholesaleMinQty === null) {
    errores.wholesaleMinQty = "Si pones precio mayorista, di desde cuántas unidades aplica";
  }
  if (
    d.kind === "experience" &&
    d.minPeople !== null &&
    d.maxPeople !== null &&
    d.minPeople > d.maxPeople
  ) {
    errores.maxPeople = "El máximo de personas no puede ser menor que el mínimo";
  }
  if (
    d.subcategory &&
    !categoriaPorId(d.category)?.subcategorias.some((s) => s.id === d.subcategory)
  ) {
    errores.subcategory = "Esa subcategoría no es de esta categoría";
  }
  if (d.huellaCo2Kg !== null && d.huellaCo2Kg < 0) {
    errores.huellaCo2Kg = "La huella no puede ser negativa";
  }
  return errores;
}

/** Los errores de Zod como `{ campo: mensaje }`, el primero de cada campo. */
export function erroresDeOferta(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const campo = issue.path[0];
    if (typeof campo === "string" && !errors[campo]) errors[campo] = issue.message;
  }
  return errors;
}

/**
 * La fila de `listings` que sale de los campos validados.
 *
 * Los campos de un tipo se limpian al guardar otro. Si no, una experiencia
 * convertida en producto conserva su punto de encuentro y la ficha pública
 * enseña un dato que ya no significa nada.
 */
export function filaDeOferta(d: Campos) {
  const esExperiencia = d.kind === "experience";
  const esServicio = d.kind === "service";
  const entero = (v: number | null) => (v === null ? null : Math.round(v));

  return {
    kind: d.kind,
    title: d.title,
    summary: d.summary ?? "",
    description: d.description ?? "",
    category: d.category,
    subcategory: d.subcategory || null,
    verticals: d.verticals ?? [],
    images: d.images,
    // Dinero entero en COP (invariante 5): al peso, nunca con decimales.
    price_cop: Math.round(d.priceCop),
    wholesale_price_cop: entero(d.wholesalePriceCop),
    wholesale_min_qty: entero(d.wholesaleMinQty),
    unit: d.unit,
    quote_only: d.quoteOnly ?? false,
    stock: entero(d.stock),
    co2_kg_saved: d.co2KgSaved,
    water_liters_saved: d.waterLitersSaved,
    waste_kg_reduced: d.wasteKgReduced,
    aporte_ambiental: d.aporteAmbiental || null,
    consecuencia_ambiental: d.consecuenciaAmbiental || null,
    huella_co2_kg: d.huellaCo2Kg,
    certifications: d.certifications ?? [],
    department: d.department || null,
    city: d.city,
    duration_hours: esExperiencia ? d.durationHours : null,
    min_people: esExperiencia ? d.minPeople : null,
    max_people: esExperiencia ? d.maxPeople : null,
    meeting_point: esExperiencia ? d.meetingPoint : null,
    includes: esExperiencia ? d.includes : [],
    delivery_time: esServicio ? d.deliveryTime : null,
    scope: esServicio ? d.scope : [],
  };
}
