"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { enviarCorreo } from "@/lib/correo";
import { correoOfertaEnRevision, correoOfertasImportadas } from "@/lib/correo/plantillas";
import { mensajeDeFallo, registrarFallo } from "@/lib/incidencias";
import {
  CamposOfertaEmpresa,
  erroresDeOferta,
  escribirOferta,
  filaDeOferta,
  reglasDeOferta,
} from "@/lib/ofertas";
import { hoyEnBogota } from "@/lib/envios";
import { escribirFechas, revisarPlan, type ResultadoGuardarFechas } from "@/lib/fechas";
import {
  enviosPorZonaDisponible,
  getFechasDeOferta,
  getMiEmpresa,
  getOfertaDeEmpresa,
  logisticaDisponible,
} from "@/lib/repo";
import { slugLibre } from "@/lib/slug";
import { createClient } from "@/lib/supabase/server";
import type { ResultadoGuardarOferta } from "@/components/formulario-oferta";
import type { ResultadoImagenUI } from "@/components/selector-imagen";
import { getAlmacen, revisarImagen } from "@/lib/almacenamiento";
import { dentroDelRitmo } from "@/lib/ritmo";

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

const OfertaEmpresaSchema = CamposOfertaEmpresa.extend({
  enviar: z.enum(["borrador", "revision"]).default("revision"),
});

/**
 * Guarda una oferta de la empresa, nueva o editada.
 *
 * `opciones.avisar` es para la carga desde Excel: cada fila se guarda por esta
 * misma acción —con las mismas validaciones y la misma llave contra
 * duplicados—, pero el correo de «está en revisión» sale **uno solo** al final
 * (`avisarOfertasImportadas()`) y no uno por fila. Quien lo apaga solo deja de
 * recibir su propio aviso.
 */
export async function guardarOfertaDeEmpresa(
  datos: unknown,
  opciones: { avisar?: boolean } = {},
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
  const logistica = await logisticaDisponible();
  const zonas = logistica && (await enviosPorZonaDisponible());
  const reglas = reglasDeOferta(d, { logistica, zonas });
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
  let estadoPrevio: string | undefined;
  if (d.id) {
    const previa = await getOfertaDeEmpresa(empresa.id, d.id);
    if (!previa) return { ok: false, errors: { form: "Esa oferta no es de tu empresa." } };
    estadoPrevio = previa.status;
  }

  const status = d.enviar === "borrador" ? "draft" : "pending_review";

  try {
    const fila = { ...filaDeOferta(d, { logistica, zonas }), status };

    const escrita = await escribirOferta(
      supabase,
      d.id
        ? { tipo: "editar", id: d.id, version: logistica ? d.version : null, fila }
        : {
            tipo: "crear",
            clave: d.clave,
            fila: {
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
            },
          },
    );

    if (!escrita.ok) {
      if (escrita.mensaje.includes("categoria-avanzada")) {
        return {
          ok: false,
          errors: { category: "Consultoría e implementación exige el sello verificado por Seregenera." },
        };
      }
      if (escrita.motivo === "slug") {
        return { ok: false, errors: { title: "Ya hay otra oferta con ese título. Cámbialo un poco." } };
      }
      if (escrita.motivo === "conflicto") {
        return { ok: false, errors: { form: escrita.mensaje } };
      }
      const codigo = registrarFallo("oferta-empresa", escrita.mensaje, {
        editando: Boolean(d.id),
        kind: d.kind,
      });
      return { ok: false, errors: { form: mensajeDeFallo(codigo) } };
    }
    const data = [{ id: escrita.id, slug: escrita.slug }];

    revalidatePath("/cuenta/empresa/ofertas");
    revalidatePath(`/proveedor/${empresa.slug}`);
    // Una oferta publicada que se edita vuelve a revisión y sale del catálogo:
    // el catálogo tiene que enterarse ya, no en la próxima revalidación.
    revalidatePath("/catalogo");

    // Solo si **entró** a revisión con este guardado: un borrador no le promete
    // nada a nadie, y una oferta que ya estaba en revisión y se vuelve a
    // guardar —o el mismo envío repetido— no es una novedad. Antes se mandaba
    // en cada guardado. Va fuera del camino crítico, como el correo del
    // pedido: la oferta ya está guardada y un SMTP caído no puede hacer que la
    // persona la reenvíe.
    if (
      opciones.avisar !== false &&
      status === "pending_review" &&
      !escrita.repetida &&
      estadoPrevio !== "pending_review"
    ) {
      try {
        const usuario = await getUser();
        if (usuario?.email) {
          const meta = usuario.user_metadata as { full_name?: string } | undefined;
          const envio = await enviarCorreo(
            correoOfertaEnRevision({
              nombre: meta?.full_name || usuario.email.split("@")[0],
              correo: usuario.email,
              titulo: d.title,
            }),
          );
          if (!envio.ok) console.error(`[oferta-correo] no enviado (${envio.via}): ${envio.error}`);
        }
      } catch (e) {
        registrarFallo("oferta-correo", e);
      }
    }

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

/**
 * Las fechas y los cupos de una experiencia de la empresa (`src/lib/fechas.ts`).
 *
 * **No la devuelve a revisión**: escribe en `listing_availability`, no en
 * `listings`, y lo que el equipo aprobó fue el contenido de la oferta, no su
 * calendario. La empresa sale de la sesión, como en `guardarOfertaDeEmpresa()`,
 * y la política `availability_write` lo vuelve a exigir en la base.
 */
export async function guardarFechasDeEmpresa(
  listingId: string,
  plan: unknown,
): Promise<ResultadoGuardarFechas> {
  const empresa = await getMiEmpresa();
  if (!empresa) return { ok: false, errores: ["Tu cuenta todavía no gestiona ninguna empresa."] };
  const oferta = typeof listingId === "string" ? await getOfertaDeEmpresa(empresa.id, listingId) : undefined;
  if (!oferta) return { ok: false, errores: ["Esa oferta no es de tu empresa."] };
  if (oferta.kind !== "experience") {
    return { ok: false, errores: ["Solo las experiencias tienen fechas. Guarda primero el tipo."] };
  }
  if (!dentroDelRitmo(`fechas:${empresa.id}`, 60, 3600)) {
    return { ok: false, errores: ["Guardaste muchas veces seguidas. Espera un rato y vuelve a intentarlo."] };
  }

  const hoy = hoyEnBogota();
  const revisado = revisarPlan(plan, hoy);
  if (!revisado.ok) return revisado;

  try {
    const r = await escribirFechas(await createClient(), oferta.id, revisado.plan, hoy);
    revalidatePath(`/oferta/${oferta.slug}`);
    revalidatePath(`/cuenta/empresa/ofertas/${oferta.id}`);
    return { ...r, fechas: await getFechasDeOferta(oferta.id) };
  } catch (e) {
    const codigo = registrarFallo("fechas-empresa", e);
    return { ok: false, errores: [mensajeDeFallo(codigo)] };
  }
}

/**
 * Sube una foto de una oferta y devuelve su URL para que el formulario la ponga
 * en la lista de imágenes.
 *
 * Se sube **al elegirla**, antes de guardar la oferta: una oferta nueva todavía
 * no tiene id, y esperar al guardado obligaría a mandar todas las fotos junto
 * con el resto del formulario (y a superar el límite de cuerpo de una Server
 * Action). Lo que queda guardado en `listings.images` es solo la lista de URL,
 * como siempre. Si la persona sube una foto y no guarda la oferta, el archivo
 * queda huérfano en Storage: pesa kilobytes y no lo sirve nadie.
 *
 * La carpeta es el id de **su** empresa (nunca viene del formulario) y cada foto
 * tiene nombre propio, así que no se pisan entre sí. La política de Storage
 * `logos_escritura` vuelve a comprobar que la carpeta es de su empresa.
 */
export async function subirImagenDeOferta(datos: FormData): Promise<ResultadoImagenUI> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Tu sesión se cerró. Entra otra vez." };

  const empresa = await getMiEmpresa();
  if (!empresa) return { ok: false, error: "Tu cuenta todavía no gestiona ninguna empresa." };

  // Cada llamada deja un archivo nuevo que nada borra hasta que se borra la
  // empresa. En el modo MySQL el disco es el mismo de la base: sin tope, una
  // sesión de empresa en bucle llena la cuota de la cuenta y tumba el sitio.
  if (!dentroDelRitmo(`subir-oferta:${empresa.id}`, 60, 3600)) {
    return { ok: false, error: "Subiste muchas fotos seguidas. Espera un rato y vuelve a intentarlo." };
  }

  const revisada = revisarImagen(datos.get("imagen"));
  if (!revisada.ok) return { ok: false, error: revisada.error };

  return getAlmacen().guardar(
    "logos",
    empresa.id,
    revisada.archivo,
    revisada.tipo,
    `oferta-${crypto.randomUUID()}`,
  );
}

/**
 * El aviso único de una carga desde Excel: «recibimos tus N ofertas».
 *
 * Lo llama la pantalla de carga al terminar, con los títulos de lo que quedó
 * en revisión. Solo le escribe a quien llama (a su propio correo) y con freno,
 * así que repetirlo no le sirve a nadie para mandar correos a otros.
 */
export async function avisarOfertasImportadas(titulos: string[]): Promise<void> {
  const usuario = await getUser();
  if (!usuario?.email) return;
  const limpios = titulos
    .filter((t) => typeof t === "string")
    .map((t) => t.trim().slice(0, 140))
    .filter(Boolean)
    .slice(0, 300);
  if (limpios.length === 0) return;
  if (!dentroDelRitmo(`importar-aviso:${usuario.id}`, 5, 3600)) return;
  try {
    const meta = usuario.user_metadata as { full_name?: string } | undefined;
    const envio = await enviarCorreo(
      correoOfertasImportadas({
        nombre: meta?.full_name || usuario.email.split("@")[0],
        correo: usuario.email,
        titulos: limpios,
      }),
    );
    if (!envio.ok) console.error(`[importar-correo] no enviado (${envio.via}): ${envio.error}`);
  } catch (e) {
    registrarFallo("importar-correo", e);
  }
}
