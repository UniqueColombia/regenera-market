import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * La baja «de un clic» de los correos a prospectos (RFC 8058).
 *
 * Es a donde apunta la cabecera `List-Unsubscribe` de `correoDeCampana()`:
 * cuando alguien pulsa «Anular suscripción» en Gmail, Gmail hace un `POST`
 * aquí, sin abrir el navegador de nadie. Por eso es un `POST` y no un `GET`:
 * los antivirus del correo corporativo abren todos los enlaces que encuentran,
 * y una baja por `GET` daría de baja a medio mundo sin que nadie lo pidiera.
 * La persona que hace clic en el enlace del pie llega a `/baja`, que pide
 * confirmar con un botón.
 *
 * Responde 200 aunque el token no exista: un 4xx no le dice nada útil a
 * Gmail, y a un tercero le confirmaría qué tokens son válidos.
 */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t") ?? "";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    const db = await createClient();
    const { error } = await db.rpc("baja_de_prospecto", { _token: token });
    if (error) console.error(`[baja] ${error.code}: ${error.message}`);
  }
  return new NextResponse(null, { status: 200 });
}
