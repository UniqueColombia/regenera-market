import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { pesosDesdeTexto } from "./format";
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
 *
 * **Los campos que el formulario puede no pintar aceptan `null`** (`.nullish()`,
 * no `.optional()`). El formulario solo pinta los campos del tipo elegido y el
 * slug al editar; para un campo que no está en la página `FormData.get()`
 * devuelve `null`, y `.optional()` solo admite `undefined`. Pasó el 2026-10-08:
 * crear un producto fallaba con «Falta corregir: Dirección web, Duración, Mínimo
 * de personas…», todos campos que la persona ni veía.
 */

/** Texto que llega vacío del formulario: se guarda como null, no como "". */
const textoOpcional = z
  .string()
  .trim()
  .nullish()
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
  .nullish()
  .transform((v) => (v ? Number(v) : null))
  .refine((v) => v === null || Number.isFinite(v), "Escribe un número");

/**
 * Un monto en pesos, opcional. No pasa por `Number()`: «20.000» es veinte mil,
 * no veinte (ver `pesosDesdeTexto()`). Lo ambiguo se rechaza en vez de
 * adivinarlo.
 */
const pesosOpcional = z
  .string()
  .nullish()
  .transform((v) => pesosDesdeTexto(v))
  .refine((v) => v === null || Number.isFinite(v), "Escribe solo números, por ejemplo 20000 o 20.000");

/** Una lista escrita a razón de una por línea. Es lo que un `text[]` espera. */
const lineas = z
  .string()
  .nullish()
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
  slug: z.string().trim().nullish(),
  summary: z.string().trim().max(300, "El resumen se pasa de 300 caracteres").optional(),
  description: z.string().trim().max(5000, "La descripción es demasiado larga").optional(),
  category: z.enum(IDS_CATEGORIA, "Elige una categoría"),
  subcategory: z.string().trim().optional(),
  verticals: z
    .array(z.enum(["hoteles", "hostales", "restaurantes", "transporte", "agencias"]))
    .optional(),
  images: lineas,
  priceCop: pesosOpcional.refine((v) => v !== null, "Escribe el precio").transform((v) => v as number),
  wholesalePriceCop: pesosOpcional,
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
  // Cómo se despacha un producto físico (0014). Las reglas que lo exigen van
  // en `reglasDeOferta()`, porque dependen del tipo y de que la 0014 exista.
  despacho: z
    .union([z.enum(["vendedor", "transportadora"]), z.literal("")])
    .nullish()
    .transform((v) => (v ? v : null)),
  transportadora: textoOpcional,
  envioCop: pesosOpcional,
  entregaDiasMin: numeroOpcional,
  entregaDiasMax: numeroOpcional,
  // Envío por zona y por unidad, peso y medidas (0017). Opcionales todos: un
  // producto que solo declara la tarifa nacional cobra lo mismo que antes.
  envioLocalCop: pesosOpcional,
  envioAdicionalCop: pesosOpcional,
  pesoKg: numeroOpcional,
  largoCm: numeroOpcional,
  anchoCm: numeroOpcional,
  altoCm: numeroOpcional,
  /**
   * La versión sobre la que se editó (0014). Al guardar, la fila tiene que
   * seguir en esa versión; si otro la cambió entretanto, no se pisa.
   */
  version: numeroOpcional,
  /**
   * La llave de una oferta nueva: el `id` que tendrá, generado por el
   * navegador una vez por formulario. Mandar el formulario dos veces —doble
   * clic, reintento tras un corte— encuentra la oferta ya creada en vez de
   * crear «titulo-2».
   */
  clave: z.union([z.uuid(), z.literal("")]).nullish(),
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
/**
 * Qué migraciones de envío están aplicadas: la 0014 (despacho, tarifa, días) y
 * la 0017 (tarifa local, por unidad, peso y medidas). Lo deciden
 * `logisticaDisponible()` y `enviosPorZonaDisponible()` de `repo.ts`.
 */
export interface OpcionesEnvio {
  logistica: boolean;
  zonas?: boolean;
}

export function reglasDeOferta(
  d: Campos,
  opciones: OpcionesEnvio = { logistica: false },
): Record<string, string> {
  const errores: Record<string, string> = {};

  // Un producto físico dice cómo llega: quién lo lleva, cuánto cuesta y en
  // cuántos días. Solo con la 0014; sin ella el formulario no lo pregunta.
  if (opciones.logistica && d.kind === "product" && !d.quoteOnly) {
    if (!d.despacho) errores.despacho = "Elige quién lleva el producto";
    if (d.despacho === "transportadora" && !d.transportadora) {
      errores.transportadora = "Escribe con qué transportadora lo mandas";
    }
    if (d.envioCop === null) {
      errores.envioCop = "Escribe cuánto cuesta el envío (0 si es gratis)";
    } else if (d.envioCop < 0 || !Number.isInteger(d.envioCop)) {
      errores.envioCop = "El envío va en pesos enteros, sin puntos";
    }
    if (d.entregaDiasMax === null) {
      errores.entregaDiasMax = "Di en cuántos días hábiles llega, como máximo";
    } else if (d.entregaDiasMax < 1 || d.entregaDiasMax > 90) {
      errores.entregaDiasMax = "Entre 1 y 90 días hábiles";
    }
    if (
      d.entregaDiasMin !== null &&
      d.entregaDiasMax !== null &&
      d.entregaDiasMin > d.entregaDiasMax
    ) {
      errores.entregaDiasMin = "El mínimo no puede ser mayor que el máximo";
    }

    // La 0017: la tarifa local se cobra cuando el destino es el departamento
    // de donde sale el producto, así que sin ese departamento no aplicaría
    // nunca. Se dice aquí en vez de guardarla para que no sirva de nada.
    if (opciones.zonas) {
      for (const campo of ["envioLocalCop", "envioAdicionalCop"] as const) {
        const v = d[campo];
        if (v !== null && (v < 0 || !Number.isInteger(v))) {
          errores[campo] = "En pesos enteros, sin puntos";
        }
      }
      if (d.envioLocalCop !== null && !d.department) {
        errores.department =
          "Di de qué departamento sale el producto: ahí se cobra el envío local";
      }
      if (d.pesoKg !== null && (d.pesoKg <= 0 || d.pesoKg > 10_000)) {
        errores.pesoKg = "El peso va en kilos, entre 0,01 y 10.000";
      }
      for (const campo of ["largoCm", "anchoCm", "altoCm"] as const) {
        const v = d[campo];
        if (v !== null && (v < 1 || v > 1000 || !Number.isInteger(v))) {
          errores[campo] = "En centímetros enteros, entre 1 y 1.000";
        }
      }
    }
  }

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
export function filaDeOferta(
  d: Campos,
  opciones: OpcionesEnvio = { logistica: false },
) {
  const esExperiencia = d.kind === "experience";
  const esServicio = d.kind === "service";
  const esProducto = d.kind === "product";
  const entero = (v: number | null) => (v === null ? null : Math.round(v));

  // Las columnas de la 0014 solo se escriben si existen: mandarlas sin la
  // migración haría fallar el guardado entero con «column does not exist».
  const envio = opciones.logistica
    ? {
        despacho: esProducto ? d.despacho : null,
        transportadora: esProducto && d.despacho === "transportadora" ? d.transportadora : null,
        envio_cop: esProducto ? entero(d.envioCop) : null,
        entrega_dias_min: esProducto ? entero(d.entregaDiasMin) : null,
        entrega_dias_max: esProducto ? entero(d.entregaDiasMax) : null,
      }
    : {};
  // Lo mismo con las de la 0017.
  const zonas =
    opciones.logistica && opciones.zonas
      ? {
          envio_local_cop: esProducto ? entero(d.envioLocalCop) : null,
          envio_adicional_cop: esProducto ? entero(d.envioAdicionalCop) : null,
          peso_kg: esProducto && d.pesoKg !== null ? Math.round(d.pesoKg * 100) / 100 : null,
          largo_cm: esProducto ? entero(d.largoCm) : null,
          ancho_cm: esProducto ? entero(d.anchoCm) : null,
          alto_cm: esProducto ? entero(d.altoCm) : null,
        }
      : {};

  return {
    ...envio,
    ...zonas,
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

/**
 * Escribe la fila de una oferta, nueva o editada, sin duplicar ni pisar.
 *
 * La comparten las dos acciones (panel y empresa), porque las dos tienen los
 * mismos dos problemas:
 *
 * - **Crear dos veces.** Un doble clic o un reintento tras un corte mandaban el
 *   formulario otra vez, y `slugLibre()` le daba al segundo «titulo-2»: dos
 *   ofertas iguales. Ahora el `id` lo pone el navegador (`clave`); el segundo
 *   `insert` choca con la clave primaria y se devuelve la oferta del primero.
 * - **Pisar lo que otro guardó.** El formulario manda la fila entera, stock
 *   incluido. Con la 0014 el `update` exige la versión sobre la que se editó:
 *   si entretanto la cambió otra persona —o una compra descontó stock—, no se
 *   escribe nada y se dice por qué.
 *
 * Sin la 0014 no hay versión y edita como antes: la última escritura gana.
 */
export async function escribirOferta(
  db: SupabaseClient,
  op:
    | { tipo: "crear"; clave?: string | null; fila: Record<string, unknown> }
    | { tipo: "editar"; id: string; version: number | null; fila: Record<string, unknown> },
): Promise<
  | { ok: true; id: string; slug: string; repetida: boolean }
  | { ok: false; motivo: "conflicto" | "denegado" | "slug" | "error"; mensaje: string }
> {
  if (op.tipo === "crear") {
    const fila = op.clave ? { ...op.fila, id: op.clave } : op.fila;
    const { data, error } = await db.from("listings").insert(fila).select("id, slug");
    if (error) {
      if (op.clave && error.code === "23505" && error.message.includes("listings_pkey")) {
        // La misma oferta, mandada otra vez. Si la puede leer quien llama, es suya.
        const { data: previa } = await db
          .from("listings")
          .select("id, slug")
          .eq("id", op.clave)
          .maybeSingle();
        if (previa) return { ok: true, id: previa.id, slug: previa.slug, repetida: true };
      }
      if (error.message.includes("listings_slug_key")) {
        return { ok: false, motivo: "slug", mensaje: error.message };
      }
      return { ok: false, motivo: "error", mensaje: error.message };
    }
    if (!data || data.length === 0) {
      return { ok: false, motivo: "denegado", mensaje: "sin filas" };
    }
    return { ok: true, id: data[0].id, slug: data[0].slug, repetida: false };
  }

  let consulta = db.from("listings").update(op.fila).eq("id", op.id);
  if (op.version !== null) consulta = consulta.eq("version", op.version);
  const { data, error } = await consulta.select("id, slug");
  if (error) {
    if (error.message.includes("listings_slug_key")) {
      return { ok: false, motivo: "slug", mensaje: error.message };
    }
    return { ok: false, motivo: "error", mensaje: error.message };
  }
  if (!data || data.length === 0) {
    // Cero filas: o no tiene permiso (RLS niega en silencio) o la versión ya no
    // es la que editó. Se distingue leyendo la fila.
    if (op.version !== null) {
      const { data: actual } = await db
        .from("listings")
        .select("version")
        .eq("id", op.id)
        .maybeSingle();
      if (actual && actual.version !== op.version) {
        return {
          ok: false,
          motivo: "conflicto",
          mensaje: "Alguien cambió esta oferta mientras la editabas (o se vendió una unidad). Recarga la página para ver la versión nueva y vuelve a hacer tus cambios.",
        };
      }
    }
    return { ok: false, motivo: "denegado", mensaje: "sin filas" };
  }
  return { ok: true, id: data[0].id, slug: data[0].slug, repetida: false };
}
