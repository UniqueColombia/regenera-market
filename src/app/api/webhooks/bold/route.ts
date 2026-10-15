import { NextResponse, type NextRequest } from "next/server";
import { registrarPagoEnLinea } from "@/lib/confirmar-pago";
import { registrarFallo } from "@/lib/incidencias";
import { getGateway } from "@/lib/payments";

/**
 * El aviso de BOLD cuando un pago se aprueba, se rechaza o se anula.
 *
 * Se configura en el panel de BOLD (Integraciones → Webhook) con esta URL:
 * `https://<dominio>/api/webhooks/bold`. Está en la lista de lo pendiente con
 * Ivan en `docs/ESTADO.md`.
 *
 * El orden de la skill `nueva-integracion`, sin excepciones:
 *
 * 1. **Firma primero.** Se lee el cuerpo como texto —la firma es sobre los
 *    bytes exactos que llegaron, no sobre el JSON vuelto a armar— y si no vale,
 *    `401` sin tocar nada.
 * 2. Idempotencia, monto contra el total guardado y transición válida:
 *    `registrarPagoEnLinea()`.
 * 3. **`200` rápido.** BOLD espera la respuesta dos segundos y reintenta hasta
 *    cinco veces en un día; los correos salen después de responder.
 *
 * Sin pasarela configurada responde `404`: no hay nada que escuchar.
 */
export async function POST(request: NextRequest) {
  const pasarela = getGateway();
  if (pasarela.name !== "bold") return new NextResponse(null, { status: 404 });

  const cuerpo = await request.text();
  const aviso = pasarela.leerNotificacion(cuerpo, request.headers);
  if (!aviso) {
    console.warn("[webhook-bold] firma inválida o aviso ilegible: se descarta");
    return new NextResponse(null, { status: 401 });
  }

  if (aviso.evento === "otro") return NextResponse.json({ ok: true });

  try {
    const r = await registrarPagoEnLinea({
      pasarela: pasarela.name,
      referencia: aviso.referencia,
      transaccion: aviso.transaccion,
      estado: aviso.evento,
      montoCop: aviso.montoCop,
      metodo: aviso.metodo,
    });
    return NextResponse.json({ ok: true, resultado: r });
  } catch (e) {
    // Un fallo nuestro (la base no respondió): 500 para que BOLD reintente
    // más tarde. Repetirlo es seguro, porque registrar es idempotente.
    registrarFallo("webhook-bold", e, { evento: aviso.evento });
    return new NextResponse(null, { status: 500 });
  }
}
