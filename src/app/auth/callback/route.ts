import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Canjea el código del correo por una sesión.
 *
 * El flujo normal de Seregenera es el de seis dígitos, que se verifica sin pasar
 * por aquí. Esta ruta cubre el otro camino: la plantilla de correo de Supabase
 * incluye también un enlace, y quien lo pulse desde el móvil tiene que acabar
 * dentro y no en una página rota.
 *
 * La URL de destino se comprueba antes de redirigir. `next` viene de la barra de
 * direcciones, así que sin la comprobación esto sería un redirector abierto:
 * un correo de suplantación podría llevar a `…/auth/callback?next=https://otro`
 * y el usuario vería que salió de un dominio en el que confía.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const destino = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/entrar?error=sin-codigo`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/entrar?error=codigo-invalido`);
  }

  return NextResponse.redirect(`${origin}${destino}`);
}
