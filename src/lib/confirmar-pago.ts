import { after } from "next/server";
import { avisarCambioDeOrden } from "./correo/notificaciones";
import { getGateway } from "./payments";
import { createAdminClient } from "./supabase/admin";

/**
 * Confirmar un pago en línea: la orden pasa a «pagada».
 *
 * Por aquí entran los dos caminos por los que una pasarela dice que se pagó, y
 * por eso es un solo sitio:
 *
 * - el **webhook** (`/api/webhooks/bold`), con la firma ya comprobada;
 * - la **vuelta del comprador** al pedido, que pregunta a la pasarela
 *   (`confirmarDesdeLaPasarela`). Es el respaldo si el webhook no llega o no
 *   está configurado; lo que la pasarela pega en la URL al volver no se cree.
 *
 * Con la clave de servicio: no hay sesión detrás de un webhook, y «confirmar
 * pagos» es uno de los tres usos legítimos de esa clave (skill
 * `supabase-schema`). Las reglas de la skill `nueva-integracion` para un
 * webhook, en orden:
 *
 * 1. Firma verificada — la verifica quien llama, antes de llegar aquí.
 * 2. **Idempotente**: la orden solo pasa a pagada si sigue esperando pago
 *    (`.eq("status", "pending_payment")`, invariante 25), y cada transacción se
 *    anota una vez (`pagos`, clave única de la 0019). La misma noticia tres
 *    veces confirma una y avisa una.
 * 3. **El monto se compara con el total guardado.** Si no cuadra no se confirma:
 *    se anota como `monto-distinto` y queda en el registro para el equipo.
 * 4. Transición válida: una orden cancelada no vuelve a pagada por un aviso
 *    tardío (lo impide también el trigger `orders_transicion`).
 * 5. Los correos van **después** de responder (`after`): BOLD corta a los dos
 *    segundos y reintenta, y un SMTP lento no puede convertir un pago
 *    confirmado en un aviso repetido.
 */
export type ResultadoConfirmacion =
  | "confirmada"
  | "ya-estaba"
  | "monto-distinto"
  | "no-aprobado"
  | "orden-no-encontrada"
  | "orden-no-pendiente";

export async function registrarPagoEnLinea(p: {
  pasarela: string;
  referencia: string;
  transaccion: string;
  estado: "aprobado" | "rechazado" | "anulado";
  montoCop: number;
  metodo?: string;
}): Promise<ResultadoConfirmacion> {
  const db = createAdminClient();
  const { data: orden, error } = await db
    .from("orders")
    .select("id, status, total_cop")
    .eq("reference", p.referencia)
    .maybeSingle();
  if (error) throw new Error(`pago ${p.referencia}: ${error.message}`);
  if (!orden) {
    console.error(`[pago] ${p.pasarela} avisó de ${p.referencia}, que no es ninguna orden`);
    return "orden-no-encontrada";
  }

  const cuadra = p.montoCop === orden.total_cop;
  const estado = p.estado === "aprobado" && !cuadra ? "monto-distinto" : p.estado;

  // Se anota antes de mover la orden. Sin la 0019 la tabla no existe y se
  // sigue igual: la orden se confirma, que es lo que importa.
  const { error: errorPago } = await db.from("pagos").upsert(
    {
      order_id: orden.id,
      pasarela: p.pasarela,
      transaccion: p.transaccion.slice(0, 100),
      estado,
      monto_cop: Math.max(0, Math.round(p.montoCop)),
      metodo: p.metodo?.slice(0, 40) ?? null,
    },
    { onConflict: "pasarela,transaccion,estado", ignoreDuplicates: true },
  );
  if (errorPago) console.error(`[pago] no se anotó ${p.referencia}: ${errorPago.code} ${errorPago.message}`);

  if (estado === "monto-distinto") {
    console.error(
      `[pago] ${p.pasarela} aprobó ${p.referencia} por ${p.montoCop} y la orden es de ${orden.total_cop}: no se confirma`,
    );
    return "monto-distinto";
  }
  if (estado !== "aprobado") return "no-aprobado";

  const { data: movida, error: errorOrden } = await db
    .from("orders")
    .update({ status: "paid" })
    .eq("id", orden.id)
    .eq("status", "pending_payment")
    .select("id");
  if (errorOrden) throw new Error(`pago ${p.referencia}: ${errorOrden.message}`);

  if (movida && movida.length > 0) {
    after(() => avisarCambioDeOrden(orden.id, "paid"));
    console.info(`[pago] ${p.referencia} pagada por ${p.pasarela} (${p.transaccion})`);
    return "confirmada";
  }
  if (orden.status === "pending_payment") return "ya-estaba"; // la movió otro entretanto
  if (orden.status === "cancelled") {
    // Pagó dentro del plazo de la pasarela pero después de que el pedido
    // venciera (72 horas). Hay que reabrirlo a mano o devolver el dinero.
    console.error(`[pago] ${p.referencia} se pagó con la orden cancelada: reabrir o devolver`);
    return "orden-no-pendiente";
  }
  return "ya-estaba";
}

/**
 * Al volver de la pasarela: se le pregunta cómo quedó el pago y, si está
 * aprobado, se confirma. Solo para una orden que sigue esperando pago.
 */
export async function confirmarDesdeLaPasarela(referencia: string): Promise<"pagada" | "pendiente" | "sin-pago"> {
  const pasarela = getGateway();
  if (pasarela.name === "manual") return "sin-pago";
  const c = await pasarela.consultar(referencia);
  if (c.estado === "aprobado" && c.transaccion && c.montoCop !== undefined) {
    const r = await registrarPagoEnLinea({
      pasarela: pasarela.name,
      referencia,
      transaccion: c.transaccion,
      estado: "aprobado",
      montoCop: c.montoCop,
      metodo: c.metodo,
    });
    return r === "confirmada" || r === "ya-estaba" ? "pagada" : "sin-pago";
  }
  return c.estado === "pendiente" ? "pendiente" : "sin-pago";
}
