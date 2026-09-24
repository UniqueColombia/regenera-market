import { createHash, randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  COOKIE_CONSENTIMIENTO,
  COOKIE_VISITANTE,
  VIDA_CONSENTIMIENTO,
  leerConsentimiento,
} from "@/lib/consentimiento";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { dentroDelRitmo } from "@/lib/ritmo";

/**
 * Una página vista, si quien la vio dio permiso.
 *
 * La llama `<MedicionUso>` con `navigator.sendBeacon` en cada cambio de ruta.
 * **El permiso se vuelve a leer aquí**, aunque el layout ya no mande el
 * componente a quien dijo que no: el navegador es de quien lo usa, y cualquiera
 * puede disparar esta petición a mano. La barrera que vale es esta.
 *
 * Responde siempre `204` y nunca un error: el navegador no espera nada, y un
 * fallo de medición no puede convertirse en un fallo que alguien vea. Lo que
 * falle en la base se apunta en el registro como `[medicion]`.
 *
 * Qué se guarda y qué no está en la cabecera de la migración 0010.
 */

export const dynamic = "force-dynamic";

/**
 * Lo que no se mide aunque haya permiso.
 *
 * Las páginas privadas: el panel, la cuenta, una orden. Una orden lleva su
 * referencia en la ruta, y medir quién mira su cuenta no le dice nada al panel
 * que valga lo que cuesta guardarlo. `/carrito` sí se mide, porque es el paso
 * que separa una visita de una compra.
 */
const NO_SE_MIDE = ["/admin", "/cuenta", "/orden", "/auth", "/api", "/salir"];

/** Robots, vistas previas de enlaces y navegadores sin cabeza: no son visitas. */
const ROBOT =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|headless|lighthouse/i;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function aparato(ua: string): "movil" | "tableta" | "escritorio" {
  if (/ipad|tablet/i.test(ua)) return "tableta";
  if (/mobi|android|iphone/i.test(ua)) return "movil";
  return "escritorio";
}

/** Solo la ruta: sin query ni fragmento, que es donde van las búsquedas. */
function limpiarRuta(valor: unknown): string | null {
  if (typeof valor !== "string" || !valor.startsWith("/")) return null;
  const ruta = valor.split(/[?#]/)[0].slice(0, 200);
  const mide = !NO_SE_MIDE.some((p) => ruta === p || ruta.startsWith(`${p}/`));
  return mide ? ruta : null;
}

/** El dominio de origen, o `null` si llegó directo o desde el propio sitio. */
function dominioDeOrigen(valor: unknown, propio: string): string | null {
  if (typeof valor !== "string" || valor === "") return null;
  try {
    const host = new URL(valor).hostname.toLowerCase().replace(/^www\./, "");
    return host && host !== propio.replace(/^www\./, "") ? host.slice(0, 100) : null;
  } catch {
    return null;
  }
}

function sinContenido(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  const consentimiento = leerConsentimiento(
    request.cookies.get(COOKIE_CONSENTIMIENTO)?.value,
  );
  if (!consentimiento?.medicion) {
    // Sin permiso tampoco se deja el identificador: si quedó de antes de
    // retirarlo, se va ahora.
    const respuesta = sinContenido();
    if (request.cookies.has(COOKIE_VISITANTE)) respuesta.cookies.delete(COOKIE_VISITANTE);
    return respuesta;
  }

  const ua = request.headers.get("user-agent") ?? "";
  if (!isSupabaseConfigured() || ROBOT.test(ua)) return sinContenido();

  // Con permiso dado, esto escribe una fila en `page_views` por llamada, y la
  // llamada la puede repetir cualquiera: es un `POST` sin sesión. Sesenta
  // páginas vistas en diez minutos es más de lo que navega nadie, y el tope
  // evita que una pestaña en bucle —o alguien probando— infle las cifras del
  // panel, que es lo que las volvería inútiles.
  //
  // Se cuenta por IP y no por la cookie del visitante a propósito: la cookie la
  // pone esta misma ruta, así que quien no la mande tendría barra libre.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "local";
  if (!dentroDelRitmo(`medicion:${ip}`, 60, 600)) return sinContenido();

  // `sendBeacon` manda texto plano; se lee como texto y con tope, para que un
  // cuerpo enorme no llegue a `JSON.parse`.
  const texto = await request.text();
  if (texto.length > 2000) return sinContenido();
  let datos: { ruta?: unknown; origen?: unknown };
  try {
    datos = JSON.parse(texto) as typeof datos;
  } catch {
    return sinContenido();
  }

  const ruta = limpiarRuta(datos.ruta);
  if (!ruta) return sinContenido();

  const respuesta = sinContenido();

  let id = request.cookies.get(COOKIE_VISITANTE)?.value;
  if (!id || !UUID.test(id)) {
    id = randomUUID();
    respuesta.cookies.set(COOKIE_VISITANTE, id, {
      path: "/",
      maxAge: VIDA_CONSENTIMIENTO,
      sameSite: "lax",
      httpOnly: true,
      // Sin `Secure` sobre http://localhost: el navegador la descartaría en
      // silencio y cada página contaría como un visitante nuevo.
      secure: request.nextUrl.protocol === "https:",
    });
  }

  try {
    const db = await createClient();
    const { error } = await db.rpc("registrar_visita", {
      _path: ruta,
      _referrer_host: dominioDeOrigen(datos.origen, request.nextUrl.hostname),
      _visitor: createHash("sha256").update(id).digest("hex"),
      _device: aparato(ua),
      // Lo pone Vercel a partir de la IP. La IP no pasa de aquí.
      _country: request.headers.get("x-vercel-ip-country"),
    });
    if (error) console.error("[medicion]", error.message);
  } catch (e) {
    console.error("[medicion]", e instanceof Error ? e.message : String(e));
  }

  return respuesta;
}

/**
 * Retirar el permiso: borra el identificador.
 *
 * La cookie es `httpOnly`, así que el navegador no la puede borrar solo. El
 * aviso de cookies llama aquí cuando alguien elige «Solo las necesarias».
 */
export async function DELETE() {
  const respuesta = sinContenido();
  respuesta.cookies.delete(COOKIE_VISITANTE);
  return respuesta;
}
