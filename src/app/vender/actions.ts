"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { enviarCorreo } from "@/lib/correo";
import { correoPostulacionRecibida } from "@/lib/correo/plantillas";
import { IDS_TIPO_ORGANIZACION, NOMBRES_PAIS, paisPorNombre } from "@/lib/paises";
import { VERTICALS } from "@/lib/taxonomy";

/**
 * Postulación de proveedor.
 *
 * ## Qué cambió, y por qué importa
 *
 * Antes esto insertaba en `provider_applications` con `status = 'pending_review'`
 * y un administrador aprobaba a mano. Ahora llama a `postular_proveedor()`
 * (migración 0006), que **da de alta la empresa en el acto** si quien postula
 * tiene sesión: crea la ficha, la enlaza como dueño y le da el rol.
 *
 * La razón no es técnica. Ninguna plataforma viva hace esperar cinco días para
 * dejarte publicar, y el portero era el propio equipo — que se volvía el cuello
 * de botella de su propio crecimiento. El control pasa de ser **una puerta** a
 * ser **una palanca**: cualquiera entra, y un administrador puede suspender, que
 * es reversible y no bloquea a nadie mientras tanto.
 *
 * ## Por qué la lógica está en Postgres y no aquí
 *
 * Dar de alta son cuatro escrituras que tienen que pasar juntas o ninguna:
 * postulación, `providers`, `provider_members` y `user_roles`. Hechas desde aquí
 * serían cuatro llamadas sin transacción, y un fallo en la tercera dejaría una
 * empresa sin dueño — que es exactamente la trampa que `docs/BETA.md` tenía
 * anotada: sin `provider_members`, `manages_provider()` devuelve falso y el
 * proveedor no puede tocar nada de lo suyo, sin que el síntoma apunte a la
 * causa.
 *
 * ## El formulario sigue sin exigir sesión
 *
 * A una cooperativa que llega desde un enlace no se le pide crear una cuenta
 * antes de saber si le interesa. Lo que ocurre sin sesión es que la postulación
 * queda guardada y **no** se crea la empresa: no hay a quién dársela. El correo
 * de respaldo le dice exactamente eso y le da el enlace para registrarse.
 */

const CATEGORIAS = VERTICALS.map((v) => v.id) as [string, ...string[]];

/**
 * Cuánto tiene que tardar como mínimo un humano en llenar esto, en milisegundos.
 *
 * Un robot manda el formulario en cuanto lo parsea. Una persona tarda al menos
 * un minuto en escribir 120 caracteres sobre su negocio; tres segundos es un
 * umbral que ningún humano cruza por abajo y que no molesta a nadie.
 *
 * **No es una defensa seria y no pretende serlo.** El campo se puede leer y el
 * retraso se puede simular. Frena el robot genérico que rellena formularios de
 * contacto, que es el 99 % de lo que le llega a un formulario público. Lo que de
 * verdad importa —que nadie lea postulaciones ajenas— lo impide RLS.
 */
const MINIMO_MS = 3000;

const PostulacionSchema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre de tu empresa").max(160),
  contactName: z.string().trim().min(3, "Escribe tu nombre completo").max(120),
  email: z.email("Revisa el correo"),
  phone: z.string().trim().min(7, "Escribe un teléfono de contacto").max(40),
  country: z.enum(NOMBRES_PAIS, "Elige tu país"),
  department: z
    .string()
    .trim()
    .min(2, "Escribe tu departamento, provincia o región")
    .max(80),
  city: z.string().trim().min(2, "Escribe la ciudad o municipio").max(80),
  orgType: z.enum(IDS_TIPO_ORGANIZACION, "Elige qué tipo de organización eres"),
  taxId: z
    .string()
    .trim()
    .min(4, "Escribe tu identificación tributaria")
    .max(40),

  /**
   * Dirección web. **Se limita a http y https a propósito.**
   *
   * `z.url()` solo comprueba que la cadena se pueda parsear como URL, y
   * `javascript:alert(1)` se parsea perfectamente. Ese valor terminaba en el
   * `href` de un enlace en `/admin/postulaciones` y en la ficha pública del
   * proveedor: un XSS almacenado que se dispara cuando un administrador hace
   * clic en el sitio web de quien postuló. React escapa el **texto**, no el
   * protocolo de un `href`.
   */
  website: z
    .union([
      z
        .url("Revisa la dirección web")
        .refine(
          (u) => /^https?:$/.test(new URL(u).protocol),
          "La dirección tiene que empezar por http:// o https://",
        ),
      z.literal(""),
    ])
    .optional(),

  categories: z.array(z.enum(CATEGORIAS)).max(5).optional(),
  description: z
    .string()
    .trim()
    .min(120, "Cuéntanos un poco más: al menos 120 caracteres")
    .max(2000),

  /** Ley 1581 de 2012. Sin esto no se puede guardar el dato de una persona. */
  consent: z.literal("on", "Tienes que autorizar el tratamiento de tus datos"),

  /**
   * Campo trampa. Está oculto por CSS y ninguna persona lo ve, así que si llega
   * con algo escrito es un robot rellenando todo lo que encuentra.
   */
  sitioWeb2: z.string().max(0).optional(),
  /** Marca de tiempo de cuándo se pintó el formulario. */
  abiertoEn: z.string().optional(),
});

export type ResultadoPostulacion =
  | {
      ok: true;
      /** ¿Quedó la empresa activa, o hace falta que se registre? */
      activada: boolean;
      /** Slug de la ficha pública, si quedó activada. */
      slug?: string;
      /** ¿Salió el correo de respaldo? Solo para lo que se muestra en pantalla. */
      correoEnviado: boolean;
    }
  | { ok: false; errors: Record<string, string> };

export async function submitApplication(
  form: unknown,
): Promise<ResultadoPostulacion> {
  const parsed = PostulacionSchema.safeParse(form);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      errors[key] ??= issue.message;
    }
    // El campo trampa no tiene etiqueta en pantalla, así que su mensaje no se
    // vería en ninguna parte. Se traduce a un error de formulario genérico.
    if (errors.sitioWeb2) {
      return { ok: false, errors: { form: "No pudimos procesar el formulario." } };
    }
    return { ok: false, errors };
  }

  const d = parsed.data;

  // Trampa de tiempo. Se responde con el mismo mensaje genérico que el honeypot:
  // decirle a un robot cuál de los dos lo atrapó es enseñarle a esquivarlo.
  const abierto = Number(d.abiertoEn);
  if (Number.isFinite(abierto) && Date.now() - abierto < MINIMO_MS) {
    return {
      ok: false,
      errors: { form: "Tómate un momento más para revisar lo que escribiste." },
    };
  }

  const usuario = await getUser();
  const supabase = await createClient();

  // Todo el alta ocurre dentro de esta función de Postgres, en una transacción.
  // Ver la cabecera de este archivo y la sección 7 de la migración 0006.
  const { data, error } = await supabase.rpc("postular_proveedor", {
    _name: d.name,
    _contact_name: d.contactName,
    _email: d.email,
    _phone: d.phone,
    _country: d.country,
    _department: d.department,
    _city: d.city,
    _description: d.description,
    _org_type: d.orgType,
    // Cómo se llama el documento en su país (NIT, RUC, RFC, CUIT…), no el país:
    // un número suelto no se puede validar ni usar para facturar, y guardar
    // 'Perú' en la columna del tipo de documento no dice nada de él.
    _tax_id_kind: paisPorNombre(d.country).documento,
    _tax_id: d.taxId,
    _website: d.website || null,
    _categories: d.categories ?? [],
  });

  if (error) {
    if (error.message.includes("limite-postulaciones")) {
      return {
        ok: false,
        errors: {
          form: "Ya recibimos varias postulaciones con este correo hoy. Escríbenos si necesitas corregir algo.",
        },
      };
    }
    // No se devuelve `error.message`: puede traer nombres de columnas y de
    // políticas, que es información gratis para quien esté probando el
    // formulario desde fuera.
    console.error(`[postular] ${error.message}`);
    return {
      ok: false,
      errors: {
        form: "No pudimos registrar tu postulación. Inténtalo de nuevo en un minuto.",
      },
    };
  }

  const resultado = (data ?? {}) as {
    activado?: boolean;
    provider_slug?: string;
  };
  const activada = Boolean(resultado.activado);

  // El correo va después de que la postulación esté guardada, y su fallo no
  // deshace nada: la empresa ya existe. Regla de `nueva-integracion`.
  const envio = await enviarCorreo(
    correoPostulacionRecibida({
      empresa: d.name,
      contacto: d.contactName,
      correo: d.email,
      activada,
      slug: resultado.provider_slug,
    }),
  );

  if (!envio.ok) {
    console.error(`[postular] respaldo no enviado (${envio.via}): ${envio.error}`);
  }

  // Se registra quién postuló solo para poder rastrear un abuso en los registros
  // del servidor. No se guarda en la base: una IP es un dato personal y la
  // postulación no la necesita para nada.
  if (!usuario) {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (ip) console.info(`[postular] anónima desde ${ip.slice(0, 7)}…`);
  }

  return {
    ok: true,
    activada,
    slug: resultado.provider_slug,
    correoEnviado: envio.ok,
  };
}
