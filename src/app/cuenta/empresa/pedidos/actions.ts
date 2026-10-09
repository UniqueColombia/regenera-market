"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { avisarCambioDeOrden, avisarDespacho } from "@/lib/correo/notificaciones";
import { mensajeDeFallo, registrarFallo } from "@/lib/incidencias";
import { confirmarEntrega, despacharItem, type MotivoEnvio } from "@/lib/orders";
import { getMiEmpresa } from "@/lib/repo";

/**
 * Lo que la empresa hace con lo que vendió: despacharlo y, si lo lleva ella,
 * marcarlo entregado.
 *
 * Quién puede despachar qué lo decide la base (`despachar_item()` exige que
 * quien llama gestione la empresa del ítem), no esta acción. Y cuántas veces
 * pasa, también: la función toma candado sobre la orden y solo avanza un ítem
 * que estaba por despachar, así que dos personas de la misma empresa que
 * pulsan a la vez —o un doble clic— despachan una sola vez y mandan **un**
 * correo.
 */

export type ResultadoDespacho = { ok: true; aviso?: string } | { ok: false; error: string };

function explicar(motivo: MotivoEnvio): string {
  switch (motivo) {
    case "sin-sesion":
      return "Tu sesión se cerró. Entra otra vez.";
    case "item-ajeno":
      return "Ese pedido no es de tu empresa.";
    case "sin-envio":
      return "Esto no se despacha: es una experiencia o un servicio.";
    case "orden-no-despachable":
      return "El pedido ya no está pagado (se canceló o se devolvió). No lo despaches.";
    case "falta-guia":
      return "Escribe el número de guía: es lo que el comprador usa para seguir su envío.";
    default:
      return "No se pudo guardar. Recarga la página.";
  }
}

const DespachoSchema = z.object({
  itemId: z.uuid(),
  transportadora: z.string().trim().max(60).optional(),
  guia: z.string().trim().max(80).optional(),
});

export async function despachar(datos: unknown): Promise<ResultadoDespacho> {
  const parsed = DespachoSchema.safeParse(datos);
  if (!parsed.success) return { ok: false, error: "Revisa la transportadora y la guía." };
  if (!(await getMiEmpresa())) {
    return { ok: false, error: "Tu cuenta todavía no gestiona ninguna empresa." };
  }

  try {
    const d = parsed.data;
    const r = await despacharItem(d.itemId, d.transportadora || undefined, d.guia || undefined);
    if (!r.ok) return { ok: false, error: explicar(r.motivo) };

    revalidatePath("/cuenta/empresa/pedidos");
    // Solo si se despachó con esta llamada. Repetir o corregir la guía no avisa.
    if (r.cambiado) await avisarDespacho(d.itemId);
    return { ok: true, aviso: r.cambiado ? undefined : "Ya estaba despachado: guardamos la guía." };
  } catch (e) {
    const codigo = registrarFallo("empresa-despachar", e);
    return { ok: false, error: mensajeDeFallo(codigo) };
  }
}

const EntregaSchema = z.object({ itemId: z.uuid() });

/** Para lo que la empresa entrega en mano: lo marca entregado ella misma. */
export async function marcarEntregado(datos: unknown): Promise<ResultadoDespacho> {
  const parsed = EntregaSchema.safeParse(datos);
  if (!parsed.success) return { ok: false, error: "No pudimos leer el pedido. Recarga la página." };
  if (!(await getMiEmpresa())) {
    return { ok: false, error: "Tu cuenta todavía no gestiona ninguna empresa." };
  }

  try {
    const r = await confirmarEntrega(parsed.data.itemId);
    if (!r.ok) return { ok: false, error: explicar(r.motivo) };

    revalidatePath("/cuenta/empresa/pedidos");
    // Si con esto se entregó todo el pedido, la base lo cerró: se le cuenta al
    // comprador, una vez (solo quien lo cerró recibe `ordenCompletada`).
    if (r.ordenCompletada) await avisarCambioDeOrden(r.ordenId, "fulfilled");
    return { ok: true };
  } catch (e) {
    const codigo = registrarFallo("empresa-entregar", e);
    return { ok: false, error: mensajeDeFallo(codigo) };
  }
}
