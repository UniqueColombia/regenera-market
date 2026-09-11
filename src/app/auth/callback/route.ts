import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

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

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = searchParams.get("next") ?? "/";
  const destino = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const tokenHash = searchParams.get("token_hash");
  const tipo = searchParams.get("type");
  const code = searchParams.get("code");

  if (!tokenHash && !code) {
    return NextResponse.redirect(`${origin}/entrar?error=sin-codigo`);
  }

  const supabase = await createClient();

  const { error } = tokenHash
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
    return NextResponse.redirect(`${origin}/entrar?error=codigo-invalido`);
  }

  return NextResponse.redirect(`${origin}${destino}`);
}
