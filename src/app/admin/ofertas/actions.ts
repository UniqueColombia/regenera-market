"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getAlmacen, revisarImagen } from "@/lib/almacenamiento";
import type { ResultadoImagenUI } from "@/components/selector-imagen";
import { avisarOfertaPublicada } from "@/lib/correo/notificaciones";
import { createClient } from "@/lib/supabase/server";
import { slugLibre, slugify } from "@/lib/slug";
import {
  CamposOferta,
  erroresDeOferta,
  escribirOferta,
  filaDeOferta,
  reglasDeOferta,
} from "@/lib/ofertas";
import { logisticaDisponible } from "@/lib/repo";

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
  const logistica = await logisticaDisponible();
  const reglas = reglasDeOferta(d, { logistica });
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
    ...filaDeOferta(d, { logistica }),
    provider_id: d.providerId,
    slug,
    status: d.status,
    featured: d.featured ?? false,
  };

  const escrita = await escribirOferta(
    supabase,
    editando
      ? { tipo: "editar", id: d.id!, version: logistica ? d.version : null, fila }
      : { tipo: "crear", clave: d.clave, fila },
  );

  if (!escrita.ok) {
    return {
      ok: false,
      errors: {
        form:
          escrita.motivo === "slug"
            ? "Ya hay otra oferta con esa dirección. Cambia el título o el slug."
            : escrita.motivo === "conflicto"
              ? escrita.mensaje
              : escrita.motivo === "denegado"
                ? // RLS no da error cuando niega: devuelve cero filas.
                  "No se pudo guardar. ¿Sigues teniendo permiso de administrador?"
                : escrita.mensaje,
      },
    };
  }

  // El catálogo, la ficha, el home y la página del proveedor pueden cambiar con
  // esto. `layout` revalida el árbol entero, que es lo correcto aquí: una oferta
  // aprobada aparece en sitios que esta acción no conoce.
  revalidatePath("/", "layout");

  return { ok: true, id: escrita.id, slug: escrita.slug };
}

const ESTADOS_OFERTA = ["draft", "pending_review", "approved", "rejected", "suspended"] as const;

const EstadoSchema = z.object({
  id: z.uuid("Identificador de oferta inválido"),
  status: z.enum(ESTADOS_OFERTA),
  /** El estado que la persona vio en la lista al pulsar el botón. */
  desde: z.enum(ESTADOS_OFERTA),
  /** La versión que vio (0014). Sin ella, solo se comprueba el estado. */
  version: z.number().int().optional(),
});

/**
 * Publicar o retirar sin abrir el formulario.
 *
 * Es la operación que más se repite —aprobar lo que mandó un proveedor, retirar
 * algo que se agotó— y obligarla a pasar por el formulario entero sería pedir
 * seis clics para cambiar una palabra.
 *
 * ## Lo que se aprueba es lo que se vio
 *
 * El `update` exige que la oferta siga en el estado y la versión que había en
 * pantalla. Sin eso:
 *
 * - si la empresa la editó mientras el equipo la revisaba, aprobar publicaba
 *   la versión nueva sin que nadie la hubiera mirado;
 * - si la empresa la retiró entretanto, aprobar la volvía a poner en el
 *   catálogo contra su voluntad;
 * - dos pestañas que aprobaban a la vez mandaban dos correos de «publicada».
 *
 * Con la condición, el segundo encuentra cero filas: si la oferta ya está como
 * se pedía, es una repetición y no se avisa otra vez; si cambió, se dice.
 */
export async function cambiarEstadoOferta(datos: unknown): Promise<
  { ok: true } | { ok: false; error: string }
> {
  await requireAdmin();

  const parsed = EstadoSchema.safeParse(datos);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const { id, status, desde, version } = parsed.data;

  const supabase = await createClient();

  let consulta = supabase
    .from("listings")
    .update({ status })
    .eq("id", id)
    .eq("status", desde);
  if (version !== undefined) consulta = consulta.eq("version", version);
  const { data, error } = await consulta.select("id");

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    const { data: actual } = await supabase
      .from("listings")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (!actual) {
      return { ok: false, error: "No se pudo actualizar. ¿Sigues siendo administrador?" };
    }
    // Ya estaba como se pedía: otra pestaña o un doble clic llegó antes. No es
    // un error, y no se avisa otra vez.
    if (actual.status === status) return { ok: true };
    revalidatePath("/admin/ofertas");
    return {
      ok: false,
      error: "La oferta cambió mientras la mirabas (la empresa la editó o la retiró). Recarga la lista para ver cómo quedó antes de decidir.",
    };
  }

  revalidatePath("/", "layout");

  // Solo quien de verdad la publicó avisa: la condición del `update` garantiza
  // que eso pasa una vez.
  if (status === "approved" && desde !== "approved") {
    await avisarOfertaPublicada(id);
  }

  return { ok: true };
}

/**
 * Sube una foto de una oferta a la carpeta del proveedor elegido en el
 * formulario. Es la versión del equipo de `subirImagenDeOferta()` de la empresa:
 * aquí el proveedor sí viene del formulario —el administrador puede publicar por
 * cualquiera—, y por eso se sube con el cliente de servicio tras `requireAdmin()`.
 */
export async function subirImagenDeOfertaAdmin(datos: FormData): Promise<ResultadoImagenUI> {
  await requireAdmin();

  const proveedor = z.uuid().safeParse(datos.get("providerId"));
  if (!proveedor.success) {
    return { ok: false, error: "Elige primero el proveedor de la oferta." };
  }

  const revisada = revisarImagen(datos.get("imagen"));
  if (!revisada.ok) return { ok: false, error: revisada.error };

  return getAlmacen().guardar(
    "logos",
    proveedor.data,
    revisada.archivo,
    revisada.tipo,
    `oferta-${crypto.randomUUID()}`,
    true,
  );
}
