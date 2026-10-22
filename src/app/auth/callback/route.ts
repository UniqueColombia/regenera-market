import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { abrirVentanaDeActividad } from "@/lib/sesion";
import { avisarAlVolver } from "@/lib/avisos";
import { cerrarPasoDelCodigo } from "@/lib/pase";

/**
 * Canjea por sesión lo que traiga el enlace del correo.
 *
 * El flujo normal de Seregenera es el código de seis dígitos, que se verifica en
 * `/entrar` sin pasar por aquí. Esta ruta cubre el otro camino: el enlace que la
 * plantilla de correo incluye para quien lo abre en el mismo aparato.
 *
 * **Son dos formas distintas y hay que aceptar las dos.**
 *
 * - `token_hash` + `type` — lo que manda la plantilla de correo, que apunta a
 *   `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email`. Se
 *   verifica con `verifyOtp`, que es el mismo canje del código de seis dígitos
 *   con el hash en lugar del número.
 * - `code` — el intercambio PKCE. Lo usan OAuth y cualquier flujo que pase
 *   `emailRedirectTo`.
 *
 * **No se usa `{{ .ConfirmationURL }}` en la plantilla, y esa es la razón de que
 * esto exista.** Esa variable apunta al endpoint `/auth/v1/verify` de Supabase,
 * que verifica allá y devuelve al *Site URL* con el token en el fragmento `#`.
 * Un fragmento no viaja al servidor: el usuario aterrizaba en la portada sin
 * sesión y sin ningún error visible. Si alguien vuelve a poner
 * `{{ .ConfirmationURL }}` en el correo, esta ruta deja de recibir visitas y el
 * enlace vuelve a no hacer nada.
 *
 * La URL de destino se comprueba antes de redirigir. `next` viene de la barra de
 * direcciones, así que sin la comprobación esto sería un redirector abierto: un
 * correo de suplantación podría llevar a `…/auth/callback?next=https://otro` y el
 * usuario vería que salió de un dominio en el que confía.
 */

/**
 * `type` llega de la barra de direcciones y termina en una llamada a Supabase,
 * así que se contrasta contra esta lista en vez de pasarlo tal cual. El tipo
 * `EmailOtpType` de la librería no sirve de filtro: incluye `(string & {})`, o
 * sea que acepta cualquier cadena.
 */
const TIPOS: readonly EmailOtpType[] = [
  "email",
  "magiclink",
  "signup",
  "invite",
  "recovery",
  "email_change",
];

/**
 * El dominio público, para las redirecciones de abajo.
 *
 * **No `request.nextUrl.origin`.** En Hostinger la app escucha en
 * `0.0.0.0:3000` detrás de su proxy y ese es el origen que ve la petición: el
 * enlace del correo verificaba bien y mandaba a la persona a
 * `https://0.0.0.0:3000/…`, una dirección que no abre nada (comprobado con curl
 * el 2026-10-17). En Vercel no se notaba porque su proxy entrega el Host
 * público. Sin `NEXT_PUBLIC_SITE_URL` (un preview) se usa el de la petición.
 */
function origenPublico(request: NextRequest): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin).replace(/\/$/, "");
}

/**
 * Abrir el enlace **no** abre la sesión: lleva a `/entrar/enlace`, que muestra un
 * botón «Entrar» que hace POST aquí (desde el 2026-10-22).
 *
 * Como los enlaces mágicos de Slack o de Notion, por dos razones:
 *
 * - El escáner de enlaces de un correo corporativo o de un antivirus abre cada
 *   enlace por GET. Con el canje en el GET, gastaba el enlace —la persona
 *   llegaba a «enlace vencido»— o se quedaba él con la sesión.
 * - Un enlace de **otra** persona, mandado a propósito, metía a quien lo abría en
 *   la cuenta ajena sin que se diera cuenta (login CSRF). El POST exige que el
 *   formulario venga de este mismo sitio.
 */
export async function GET(request: NextRequest) {
  const origin = origenPublico(request);
  const { searchParams } = request.nextUrl;
  if (!searchParams.get("token_hash") && !searchParams.get("code")) {
    return NextResponse.redirect(`${origin}/entrar?error=sin-codigo`, 303);
  }
  return NextResponse.redirect(`${origin}/entrar/enlace?${searchParams.toString()}`, 303);
}

export async function POST(request: NextRequest) {
  const origin = origenPublico(request);

  // Solo un formulario de este sitio. Las acciones de servidor traen esta
  // comprobación de Next; una ruta propia la tiene que hacer ella.
  const origen = request.headers.get("origin");
  if (!origen || origen.replace(/\/$/, "") !== origin) {
    return NextResponse.redirect(`${origin}/entrar?error=codigo-invalido`, 303);
  }

  const form = await request.formData();
  const leer = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" && v ? v : null;
  };
  const next = leer("next") ?? "/";
  const destino = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const tokenHash = leer("token_hash");
  const tipo = leer("type");
  const code = leer("code");

  if (!tokenHash && !code) {
    return NextResponse.redirect(`${origin}/entrar?error=sin-codigo`, 303);
  }

  const supabase = await createClient();

  const { data, error } = tokenHash
    ? await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        // Sin `type` no se puede verificar. `email` es el de los enlaces de
        // acceso y registro, que es todo lo que manda hoy la plantilla.
        type: TIPOS.includes(tipo as EmailOtpType)
          ? (tipo as EmailOtpType)
          : "email",
      })
    : await supabase.auth.exchangeCodeForSession(code!);

  if (error) {
    return NextResponse.redirect(`${origin}/entrar?error=codigo-invalido`, 303);
  }

  // Aquí acaba de nacer una sesión, así que arranca su reloj de inactividad. Es
  // el único sitio fuera de `src/app/entrar/actions.ts` que abre una: sin esta
  // línea, `src/proxy.ts` ve cookies de sesión sin ventana de actividad en la
  // petición siguiente —la del redirect de abajo— y devuelve a `/entrar`. O
  // sea: el enlace del correo dejaría de funcionar, en el acto y para todos.
  //
  // El id va dentro de la cookie y el proxy lo contrasta con la sesión, así que
  // si el canje no devolviera usuario —no debería, pero el tipo lo admite— no se
  // escribe nada y el corte hace su trabajo.
  const usuario = data.user ?? data.session?.user;
  if (!usuario) {
    return NextResponse.redirect(`${origin}/entrar?error=codigo-invalido`, 303);
  }
  await abrirVentanaDeActividad(usuario.id);
  await avisarAlVolver("entrada");

  // El enlace es un código como el del formulario: si la cuenta tiene contraseña
  // y no se demostró antes, es una recuperación (`src/lib/pase.ts`).
  if (await cerrarPasoDelCodigo(usuario)) {
    return NextResponse.redirect(`${origin}/cuenta/clave?volver=${encodeURIComponent(destino)}`, 303);
  }

  // 303 y no 307: después de un POST, el navegador pide el destino por GET.
  return NextResponse.redirect(`${origin}${destino}`, 303);
}
