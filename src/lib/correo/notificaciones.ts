import { createAdminClient } from "@/lib/supabase/admin";
import { registrarFallo } from "@/lib/incidencias";
import { enviarCorreo } from "./index";
import {
  correoEstadoPedido,
  correoOfertaPublicada,
  correoPedidoDespachado,
  correoPedidoPagadoProveedor,
  type EstadoAvisable,
} from "./plantillas";
import type { Mensaje } from "./tipos";

/**
 * Los avisos que se mandan cuando algo cambia en la base: una oferta aprobada, un
 * pedido que cambia de estado.
 *
 * **Ninguna función de aquí lanza.** Quien las llama acaba de guardar el cambio
 * (aprobar una oferta, confirmar un pago) y un correo que falla no puede
 * deshacerlo ni devolverle un error a quien hizo la acción. Un fallo queda en los
 * registros con `registrarFallo()` y ya. Se llaman **después** de guardar.
 *
 * **Usa el cliente de servicio, y es a propósito**: el correo de una persona vive
 * en `auth.users`, que ninguna política RLS deja leer. Solo lee —nunca escribe— y
 * solo desde acciones que ya pasaron por `requireAdmin()` o, en el caso del
 * despacho, por `despachar_item()`, que comprobó en la base que quien despacha
 * gestiona la empresa del ítem.
 */

interface Destinatario {
  correo: string;
  nombre: string;
}

/** Las personas que gestionan una empresa, con su correo y su nombre. */
async function destinatariosDeEmpresa(providerId: string): Promise<Destinatario[]> {
  const db = createAdminClient();
  const { data: miembros, error } = await db
    .from("provider_members")
    .select("user_id")
    .eq("provider_id", providerId);
  if (error) throw error;

  const salida: Destinatario[] = [];
  for (const m of miembros ?? []) {
    const { data } = await db.auth.admin.getUserById(m.user_id);
    const correo = data.user?.email;
    if (!correo) continue;
    const meta = data.user?.user_metadata as { full_name?: string } | undefined;
    salida.push({ correo, nombre: meta?.full_name || correo.split("@")[0] });
  }
  return salida;
}

async function mandar(contexto: string, mensajes: Mensaje[]): Promise<void> {
  for (const m of mensajes) {
    const envio = await enviarCorreo(m);
    if (!envio.ok) console.error(`[${contexto}] correo no enviado (${envio.via}): ${envio.error}`);
  }
}

/** Una oferta pasó a `approved`: se le avisa a quien gestiona la empresa. */
export async function avisarOfertaPublicada(listingId: string): Promise<void> {
  try {
    const db = createAdminClient();
    const { data: oferta } = await db
      .from("listings")
      .select("title, slug, provider_id")
      .eq("id", listingId)
      .maybeSingle();
    if (!oferta) return;

    const personas = await destinatariosDeEmpresa(oferta.provider_id);
    await mandar(
      "oferta-publicada",
      personas.map((p) =>
        correoOfertaPublicada({
          nombre: p.nombre,
          correo: p.correo,
          titulo: oferta.title,
          slug: oferta.slug,
        }),
      ),
    );
  } catch (e) {
    registrarFallo("oferta-publicada-correo", e);
  }
}

/**
 * Una orden cambió de estado: se le cuenta al comprador y, si es el pago, a cada
 * empresa con productos en ella.
 */
export async function avisarCambioDeOrden(
  orderId: string,
  estado: EstadoAvisable,
): Promise<void> {
  try {
    const db = createAdminClient();
    const { data: orden } = await db
      .from("orders")
      .select("reference, buyer_name, buyer_email")
      .eq("id", orderId)
      .maybeSingle();
    if (!orden) return;

    await mandar("orden-estado", [
      correoEstadoPedido({
        nombre: orden.buyer_name,
        correo: orden.buyer_email,
        referencia: orden.reference,
        estado,
      }),
    ]);

    if (estado !== "paid") return;

    const { data: items } = await db
      .from("order_items")
      .select("provider_id, title_snapshot, qty")
      .eq("order_id", orderId);

    const porEmpresa = new Map<string, { titulo: string; qty: number }[]>();
    for (const i of items ?? []) {
      const lista = porEmpresa.get(i.provider_id) ?? [];
      lista.push({ titulo: i.title_snapshot, qty: i.qty });
      porEmpresa.set(i.provider_id, lista);
    }

    for (const [providerId, lineas] of porEmpresa) {
      const { data: empresa } = await db
        .from("providers")
        .select("name")
        .eq("id", providerId)
        .maybeSingle();
      const personas = await destinatariosDeEmpresa(providerId);
      await mandar(
        "orden-proveedor",
        personas.map((p) =>
          correoPedidoPagadoProveedor({
            nombre: p.nombre,
            correo: p.correo,
            empresa: empresa?.name ?? "tu empresa",
            referencia: orden.reference,
            lineas,
          }),
        ),
      );
    }
  } catch (e) {
    registrarFallo("orden-estado-correo", e, { estado });
  }
}

/**
 * Un ítem salió: se le cuenta al comprador con la guía. Se llama solo cuando
 * `despachar_item()` devolvió `cambiado: true`, así que un despacho repetido o
 * una guía corregida no lo vuelven a mandar.
 */
export async function avisarDespacho(itemId: string): Promise<void> {
  try {
    const db = createAdminClient();
    const { data: item } = await db
      .from("order_items")
      .select("title_snapshot, transportadora, guia, orders(reference, buyer_name, buyer_email)")
      .eq("id", itemId)
      .maybeSingle();
    const orden = item?.orders as unknown as
      | { reference: string; buyer_name: string; buyer_email: string }
      | null
      | undefined;
    if (!item || !orden) return;

    await mandar("orden-despacho", [
      correoPedidoDespachado({
        nombre: orden.buyer_name,
        correo: orden.buyer_email,
        referencia: orden.reference,
        titulo: item.title_snapshot,
        transportadora: item.transportadora ?? undefined,
        guia: item.guia ?? undefined,
      }),
    ]);
  } catch (e) {
    registrarFallo("orden-despacho-correo", e);
  }
}
