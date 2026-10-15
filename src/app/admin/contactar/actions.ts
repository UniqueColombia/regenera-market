"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { enviarCorreo, getEnviadorCorreo } from "@/lib/correo";
import { correoDeCampana } from "@/lib/correo/plantillas";
import { mensajeDeFallo, registrarFallo } from "@/lib/incidencias";
import { CONTACTO } from "@/lib/legal";
import { POR_LOTE, TOPE_DIARIO, limpiarCorreo, rellenar } from "@/lib/prospectos";
import { getIdsDeProspectos } from "@/lib/repo";
import { createClient } from "@/lib/supabase/server";

/**
 * «Contactar proveedores»: lo que el equipo hace con los prospectos.
 *
 * Todo con el cliente de sesión, no con la clave de servicio: las políticas
 * `prospectos_admin`, `campanas_admin` y `envios_de_campana_admin` (0018) son
 * las que autorizan, y `requireAdmin()` es la puerta de cortesía (ver
 * «Trampas vigentes» en `docs/ESTADO.md`).
 */

const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const ProspectoSchema = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre de la empresa").max(200),
  nit: texto(30),
  correo: z
    .string()
    .nullish()
    .transform((v) => limpiarCorreo(v ?? undefined) ?? null),
  telefono: texto(40),
  sitioWeb: texto(300),
  instagram: texto(300),
  ciudad: texto(80),
  departamento: texto(80),
  categoria: texto(200),
  encaje: z.enum(["alto", "medio", "bajo", "descartar"]).nullish(),
  fuente: texto(300),
  notas: texto(2000),
});

type ProspectoValido = z.infer<typeof ProspectoSchema>;

function fila(p: ProspectoValido) {
  return {
    nombre: p.nombre,
    nit: p.nit?.replace(/[^\d-]/g, "") || null,
    correo: p.correo,
    telefono: p.telefono,
    sitio_web: p.sitioWeb,
    instagram: p.instagram,
    ciudad: p.ciudad,
    departamento: p.departamento,
    categoria: p.categoria,
    encaje: p.encaje ?? null,
    fuente: p.fuente,
    notas: p.notas,
  };
}

/**
 * Agrega prospectos de una planilla. Los que ya existen —mismo NIT o mismo
 * correo— se saltan y no se pisan: lo que el equipo ya anotó a mano (estado,
 * notas) vale más que una planilla vieja.
 *
 * Llega por tandas de hasta 300 filas desde la pantalla, que lee el Excel en el
 * navegador: el límite de cuerpo de una Server Action no deja mandar el
 * archivo entero, ni hace falta.
 */
export async function importarProspectos(
  filas: unknown,
): Promise<{ ok: true; nuevos: number; repetidos: number; invalidos: number } | { ok: false; error: string }> {
  await requireAdmin();
  const lista = z.array(z.unknown()).max(300).safeParse(filas);
  if (!lista.success) return { ok: false, error: "Llegaron demasiadas filas de una vez." };

  const validas: ProspectoValido[] = [];
  let invalidos = 0;
  for (const f of lista.data) {
    const r = ProspectoSchema.safeParse(f);
    if (r.success) validas.push(r.data);
    else invalidos++;
  }
  if (validas.length === 0) return { ok: true, nuevos: 0, repetidos: 0, invalidos };

  try {
    const db = await createClient();
    const filasNuevas = validas.map(fila);
    const nits = filasNuevas.map((f) => f.nit).filter((n): n is string => Boolean(n));
    const correos = filasNuevas.map((f) => f.correo).filter((c): c is string => Boolean(c));

    const [porNit, porCorreo] = await Promise.all([
      nits.length ? db.from("prospectos").select("nit").in("nit", nits) : Promise.resolve({ data: [] }),
      correos.length ? db.from("prospectos").select("correo").in("correo", correos) : Promise.resolve({ data: [] }),
    ]);
    const nitsExistentes = new Set(((porNit.data ?? []) as { nit: string }[]).map((r) => r.nit));
    const correosExistentes = new Set(((porCorreo.data ?? []) as { correo: string }[]).map((r) => r.correo));

    const aInsertar = filasNuevas.filter(
      (f) => !(f.nit && nitsExistentes.has(f.nit)) && !(f.correo && correosExistentes.has(f.correo)),
    );
    let nuevos = 0;
    if (aInsertar.length > 0) {
      const { data, error } = await db.from("prospectos").insert(aInsertar).select("id");
      if (!error) nuevos = data?.length ?? 0;
      else if (error.code === "23505") {
        // Una repetida que no vimos (con mayúsculas distintas, o dos pestañas a
        // la vez): se reintenta de a una y se salta la que choque.
        for (const f of aInsertar) {
          const r = await db.from("prospectos").insert(f).select("id");
          if (!r.error && r.data?.length) nuevos++;
        }
      } else throw new Error(error.message);
    }

    revalidatePath("/admin/contactar");
    return { ok: true, nuevos, repetidos: validas.length - nuevos, invalidos };
  } catch (e) {
    return { ok: false, error: mensajeDeFallo(registrarFallo("prospectos-importar", e, { filas: validas.length })) };
  }
}

/** Agregar o corregir un prospecto a mano. */
export async function guardarProspecto(
  datos: unknown,
): Promise<{ ok: true } | { ok: false; errors: Record<string, string> }> {
  await requireAdmin();
  const id = z.uuid().optional().safeParse((datos as { id?: unknown } | null)?.id || undefined);
  const r = ProspectoSchema.safeParse(datos);
  if (!r.success || !id.success) {
    const errors: Record<string, string> = {};
    for (const i of r.error?.issues ?? []) errors[String(i.path[0])] ??= i.message;
    return { ok: false, errors: Object.keys(errors).length ? errors : { form: "Revisa los datos." } };
  }
  const db = await createClient();
  const consulta = id.data
    ? db.from("prospectos").update(fila(r.data)).eq("id", id.data).select("id")
    : db.from("prospectos").insert(fila(r.data)).select("id");
  const { data, error } = await consulta;
  if (error?.code === "23505") {
    return { ok: false, errors: { form: "Ya hay un prospecto con ese NIT o ese correo." } };
  }
  if (error || !data?.length) {
    const codigo = registrarFallo("prospecto-guardar", error ?? "sin filas", { editando: Boolean(id.data) });
    return { ok: false, errors: { form: mensajeDeFallo(codigo) } };
  }
  revalidatePath("/admin/contactar");
  return { ok: true };
}

const Ids = z.array(z.uuid()).min(1).max(2000);

export async function cambiarEstadoProspectos(
  ids: string[],
  estado: string,
  soloSiEsta?: string,
): Promise<{ ok: true; cambiados: number } | { ok: false; error: string }> {
  await requireAdmin();
  const lista = Ids.safeParse(ids);
  const nuevo = z.enum(["nuevo", "invitado", "interesado", "descartado"]).safeParse(estado);
  if (!lista.success || !nuevo.success) return { ok: false, error: "Selección inválida." };
  const db = await createClient();
  let consulta = db.from("prospectos").update({ estado: nuevo.data }).in("id", lista.data);
  // Para «lo invité por WhatsApp»: solo pasa a invitado el que estaba sin
  // contactar, sin pisar un «interesado» que alguien ya anotó.
  if (soloSiEsta) consulta = consulta.eq("estado", soloSiEsta);
  const { data, error } = await consulta.select("id");
  if (error) return { ok: false, error: mensajeDeFallo(registrarFallo("prospectos-estado", error)) };
  revalidatePath("/admin/contactar");
  return { ok: true, cambiados: data?.length ?? 0 };
}

export async function eliminarProspectos(
  ids: string[],
): Promise<{ ok: true; eliminados: number } | { ok: false; error: string }> {
  await requireAdmin();
  const lista = Ids.safeParse(ids);
  if (!lista.success) return { ok: false, error: "Selección inválida." };
  const db = await createClient();
  // Los que pidieron la baja no se borran: borrar la fila es olvidar que
  // pidieron no recibir más, y la siguiente planilla los volvería a traer.
  const { data, error } = await db
    .from("prospectos")
    .delete()
    .in("id", lista.data)
    .is("baja_at", null)
    .select("id");
  if (error) return { ok: false, error: mensajeDeFallo(registrarFallo("prospectos-borrar", error)) };
  revalidatePath("/admin/contactar");
  return { ok: true, eliminados: data?.length ?? 0 };
}

const Filtros = z.object({
  estado: z.enum(["nuevo", "invitado", "interesado", "descartado", "baja"]).optional(),
  encaje: z.enum(["alto", "medio", "bajo", "descartar"]).optional(),
  contacto: z.enum(["correo", "telefono", "ninguno"]).optional(),
  q: z.string().max(100).optional(),
});

/** Todos los que cumplen el filtro, para «mandar a todos» sin ir página por página. */
export async function idsDelFiltro(filtros: unknown): Promise<string[]> {
  await requireAdmin();
  const f = Filtros.safeParse(filtros);
  return f.success ? getIdsDeProspectos(f.data) : [];
}

const LoteSchema = z.object({
  /** Lo genera la pantalla una vez por envío: reintentar no duplica (invariante 24). */
  campanaId: z.uuid(),
  tipo: z.enum(["invitacion", "noticia"]),
  asunto: z.string().trim().min(3, "Escribe el asunto").max(160),
  cuerpo: z.string().trim().min(10, "Escribe el mensaje").max(8000),
  ids: z.array(z.uuid()).min(1).max(POR_LOTE),
});

export type ResultadoLote =
  | { ok: true; enviados: number; omitidos: number; fallidos: number; tope: boolean }
  | { ok: false; error: string };

/**
 * Manda un lote de hasta `POR_LOTE` correos de una campaña.
 *
 * La pantalla lo llama una vez por lote, y así cada llamada termina holgada
 * dentro del tiempo de una función y se puede ir mostrando el avance.
 *
 * Tres frenos, y por qué:
 *
 * - **Un mismo correo no le llega dos veces a la misma empresa.** Cada envío
 *   se anota en `envios_de_campana` *antes* de mandarlo, con clave (campaña,
 *   prospecto). Si la pantalla se recarga y reintenta, lo ya enviado se salta.
 * - **Quien pidió la baja, o no tiene correo, o está descartado, no recibe
 *   nada**, y queda anotado como omitido.
 * - **Tope diario** (`TOPE_DIARIO`): Gmail corta una cuenta que manda de golpe
 *   cientos de correos a desconocidos, y con ella dejarían de salir los de
 *   acceso y los de los pedidos, que salen por el mismo remitente.
 */
export async function enviarLote(datos: unknown): Promise<ResultadoLote> {
  await requireAdmin();
  const parsed = LoteSchema.safeParse(datos);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa el mensaje." };
  const d = parsed.data;

  if (getEnviadorCorreo().nombre === "consola") {
    return {
      ok: false,
      error:
        "El correo de la aplicación no está configurado (faltan las SMTP_* en Vercel), así que no saldría ninguno. Mientras tanto, invita por WhatsApp.",
    };
  }

  try {
    const db = await createClient();
    const { data: hoy } = await db.rpc("envios_de_hoy");
    let enviadosHoy = (hoy as number | null) ?? 0;
    if (enviadosHoy >= TOPE_DIARIO) return { ok: true, enviados: 0, omitidos: 0, fallidos: 0, tope: true };

    const { error: errorCampana } = await db
      .from("campanas")
      .upsert({ id: d.campanaId, tipo: d.tipo, asunto: d.asunto, cuerpo: d.cuerpo }, { onConflict: "id", ignoreDuplicates: true });
    if (errorCampana) throw new Error(`campaña: ${errorCampana.message}`);

    const { data: prospectos, error } = await db
      .from("prospectos")
      .select("id, nombre, correo, ciudad, token, estado, baja_at")
      .in("id", d.ids);
    if (error) throw new Error(`prospectos: ${error.message}`);

    let enviados = 0;
    let omitidos = 0;
    let fallidos = 0;
    let tope = false;

    for (const p of (prospectos ?? []) as {
      id: string;
      nombre: string;
      correo: string | null;
      ciudad: string | null;
      token: string;
      estado: string;
      baja_at: string | null;
    }[]) {
      const motivoOmitir = !p.correo
        ? "sin correo"
        : p.baja_at
          ? "pidió la baja"
          : p.estado === "descartado"
            ? "descartado"
            : null;

      // Se anota antes de mandar. Si ya estaba anotado, solo se reintenta lo
      // que no llegó a salir.
      const { data: anotado } = await db
        .from("envios_de_campana")
        .upsert(
          { campana_id: d.campanaId, prospecto_id: p.id, estado: motivoOmitir ? "omitido" : "pendiente", error: motivoOmitir },
          { onConflict: "campana_id,prospecto_id", ignoreDuplicates: true },
        )
        .select("estado");
      if (!anotado?.length) {
        const { data: previo } = await db
          .from("envios_de_campana")
          .select("estado")
          .eq("campana_id", d.campanaId)
          .eq("prospecto_id", p.id)
          .maybeSingle();
        if (previo?.estado === "enviado" || previo?.estado === "omitido") {
          omitidos++;
          continue;
        }
      }
      if (motivoOmitir) {
        omitidos++;
        continue;
      }
      if (enviadosHoy >= TOPE_DIARIO) {
        tope = true;
        break;
      }

      const destino = { nombre: p.nombre, ciudad: p.ciudad ?? undefined };
      const envio = await enviarCorreo(
        correoDeCampana({
          tipo: d.tipo,
          para: p.correo!,
          empresa: p.nombre,
          asunto: rellenar(d.asunto, destino),
          cuerpo: rellenar(d.cuerpo, destino),
          token: p.token,
          responderA: CONTACTO.correo,
        }),
      );

      await db
        .from("envios_de_campana")
        .update({
          estado: envio.ok ? "enviado" : "fallido",
          error: envio.ok ? null : (envio.error ?? "error").slice(0, 300),
          enviado_at: new Date().toISOString(),
        })
        .eq("campana_id", d.campanaId)
        .eq("prospecto_id", p.id);

      if (envio.ok) {
        enviados++;
        enviadosHoy++;
        await db.from("prospectos").update({ ultimo_envio_at: new Date().toISOString() }).eq("id", p.id);
        if (d.tipo === "invitacion") {
          await db.from("prospectos").update({ estado: "invitado" }).eq("id", p.id).eq("estado", "nuevo");
        }
      } else {
        fallidos++;
      }
    }

    revalidatePath("/admin/contactar");
    return { ok: true, enviados, omitidos, fallidos, tope };
  } catch (e) {
    return { ok: false, error: mensajeDeFallo(registrarFallo("campana-lote", e, { ids: d.ids.length })) };
  }
}
