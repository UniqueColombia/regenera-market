"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { mensajeDeFallo, registrarFallo } from "@/lib/incidencias";
import { CamposOferta, erroresDeOferta, filaDeOferta, reglasDeOferta } from "@/lib/ofertas";
import { getMiEmpresa, getOfertaDeEmpresa } from "@/lib/repo";
import { slugLibre } from "@/lib/slug";
import { createClient } from "@/lib/supabase/server";
import type { ResultadoGuardarOferta } from "@/components/formulario-oferta";

/**
 * Lo que una empresa puede hacer con sus propias ofertas.
 *
 * ## Quién decide qué
 *
 * La empresa escribe el contenido: qué vende, a qué precio, qué aporta y qué
 * cuesta al ambiente. **El equipo decide si se publica.** Una oferta nace en
 * borrador o en revisión, nunca aprobada, y editar una ya publicada la devuelve
 * a revisión — lo revisado fue un texto y unas cifras concretas, y si cambian
 * ya no es lo revisado.
 *
 * Las tres barreras de siempre, como en `../actions.ts`:
 *
 * 1. Aquí: `getMiEmpresa()` decide de qué empresa es la oferta. El
 *    `provider_id` **no viene del formulario** nunca.
 * 2. RLS: `listings_provider_write` exige `manages_provider()`.
 * 3. El trigger `listings_proteger_proveedor` (0012): pisa el estado, el
 *    destacado y la empresa si alguien los manda igual, y rechaza la
 *    consultoría sin el sello.
 *
 * El estado que se pide aquí (`draft` o `pending_review`) es lo que el
 * trigger ya permite; se escribe para que la pantalla diga la verdad sin
 * depender de lo que la base corrija por detrás.
 */

const OfertaEmpresaSchema = CamposOferta.extend({
  aporteAmbiental: z
    .string()
    .trim()
    .min(20, "Cuéntanos qué aporta al ambiente, aunque sea en una frase")
    .max(1000, "Cuéntalo en menos de 1.000 caracteres"),
  consecuenciaAmbiental: z
    .string()
    .trim()
    .min(20, "Cuéntanos también qué cuesta: de dónde viene, cómo llega, qué deja")
    .max(1000, "Cuéntalo en menos de 1.000 caracteres"),
  enviar: z.enum(["borrador", "revision"]).default("revision"),
});

export async function guardarOfertaDeEmpresa(
  datos: unknown,
): Promise<ResultadoGuardarOferta> {
  const user = await getUser();
  if (!user) return { ok: false, errors: { form: "Tu sesión se cerró. Entra otra vez." } };

  const empresa = await getMiEmpresa();
  if (!empresa) {
    return { ok: false, errors: { form: "Tu cuenta todavía no gestiona ninguna empresa." } };
  }

  const parsed = OfertaEmpresaSchema.safeParse(datos);
  if (!parsed.success) return { ok: false, errors: erroresDeOferta(parsed.error) };

  const d = parsed.data;
  const reglas = reglasDeOferta(d);
  if (Object.keys(reglas).length > 0) return { ok: false, errors: reglas };

  // Se comprueba aquí para dar el error en el campo; el trigger lo rechazaría
  // igual con `categoria-avanzada`, pero como un fallo del formulario entero.
  if (d.category === "consultoria" && !empresa.evaluacionVerificada) {
    return {
      ok: false,
      errors: {
        category:
          "Consultoría e implementación exige el sello verificado por Seregenera. Mira cómo obtenerlo en Verificación.",
      },
    };
  }

  const supabase = await createClient();

  // Editar: la oferta tiene que ser de esta empresa. Sin esta comprobación RLS
  // la negaría igual, pero con cero filas y sin decir por qué.
  if (d.id) {
    const previa = await getOfertaDeEmpresa(empresa.id, d.id);
    if (!previa) return { ok: false, errors: { form: "Esa oferta no es de tu empresa." } };
  }

  const status = d.enviar === "borrador" ? "draft" : "pending_review";

  try {
    const fila = { ...filaDeOferta(d), status };

    const consulta = d.id
      ? supabase.from("listings").update(fila).eq("id", d.id).select("id, slug")
      : supabase
          .from("listings")
          .insert({
            ...fila,
            provider_id: empresa.id,
            // El slug solo se calcula al crear. Al editar se respeta el que
            // tiene: cambiarlo rompe los enlaces que ya circulan.
            slug: await slugLibre(d.title, async (candidato) => {
              const { data } = await supabase
                .from("listings")
                .select("id")
                .eq("slug", candidato)
                .maybeSingle();
              return Boolean(data);
            }),
          })
          .select("id, slug");

    const { data, error } = await consulta;

    if (error) {
      if (error.message.includes("categoria-avanzada")) {
        return {
          ok: false,
          errors: { category: "Consultoría e implementación exige el sello verificado por Seregenera." },
        };
      }
      if (error.message.includes("listings_slug_key")) {
        return { ok: false, errors: { title: "Ya hay otra oferta con ese título. Cámbialo un poco." } };
      }
      const codigo = registrarFallo("oferta-empresa", error, { editando: Boolean(d.id), kind: d.kind });
      return { ok: false, errors: { form: mensajeDeFallo(codigo) } };
    }

    if (!data || data.length === 0) {
      const codigo = registrarFallo("oferta-empresa", "sin filas", { editando: Boolean(d.id) });
      return { ok: false, errors: { form: mensajeDeFallo(codigo) } };
    }

    revalidatePath("/cuenta/empresa/ofertas");
    revalidatePath(`/proveedor/${empresa.slug}`);
    // Una oferta publicada que se edita vuelve a revisión y sale del catálogo:
    // el catálogo tiene que enterarse ya, no en la próxima revalidación.
    revalidatePath("/catalogo");

    return { ok: true, id: data[0].id, slug: data[0].slug };
  } catch (e) {
    const codigo = registrarFallo("oferta-empresa", e, { editando: Boolean(d.id) });
    return { ok: false, errors: { form: mensajeDeFallo(codigo) } };
  }
}

/**
 * Retirar una oferta: vuelve a borrador y sale del catálogo.
 *
 * Es lo único del estado que una empresa decide sola, porque es reversible y no
 * promete nada a nadie. Volver a publicarla pasa otra vez por revisión.
 */
export async function retirarOferta(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const empresa = await getMiEmpresa();
  if (!empresa) return { ok: false, error: "Tu cuenta todavía no gestiona ninguna empresa." };
  if (!(await getOfertaDeEmpresa(empresa.id, id))) {
    return { ok: false, error: "Esa oferta no es de tu empresa." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .update({ status: "draft" })
    .eq("id", id)
    .select("id");

  if (error || !data || data.length === 0) {
    const codigo = registrarFallo("oferta-retirar", error ?? "sin filas");
    return { ok: false, error: mensajeDeFallo(codigo) };
  }

  revalidatePath("/cuenta/empresa/ofertas");
  revalidatePath(`/proveedor/${empresa.slug}`);
  revalidatePath("/catalogo");
  return { ok: true };
}
