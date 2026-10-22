import { NextResponse, type NextRequest } from "next/server";
import { getMysql } from "./conexion";
import { leerSesion } from "./cuentas";
import { COOKIE_SESION } from "./postgrest/auth";

/**
 * El `proxy.ts` del modo MySQL. Con Supabase, el proxy refresca el token y
 * cierra la sesión que se pasó de inactiva; aquí no hay token que refrescar, y
 * la inactividad y la edad las decide la tabla `sesiones` (`leerSesion()`, con
 * los plazos de `src/lib/inactividad.ts`). Queda lo segundo: **una cookie de una
 * sesión muerta se borra**, y quien navegaba va a `/entrar?caducada=1`, igual que
 * hoy (`cerrarPorInactividad` en `src/proxy.ts`).
 */
export async function proxyMysql(
  request: NextRequest,
  /** Las cabeceras de la petición con el nonce de la CSP (`src/lib/csp.ts`). */
  cabeceras: (h: Headers) => Headers = (h) => h,
): Promise<NextResponse> {
  const siga = () => NextResponse.next({ request: { headers: cabeceras(request.headers) } });
  const token = request.cookies.get(COOKIE_SESION)?.value;
  if (!token) return siga();
  if (await leerSesion(getMysql(), token)) return siga();

  // Fuera también de la petición: una acción que siga su camino no puede ver
  // la sesión que se acaba de dar por muerta.
  request.cookies.delete(COOKIE_SESION);
  const ruta = request.nextUrl.pathname;
  const navegando =
    request.method === "GET" &&
    (request.headers.get("accept") ?? "").includes("text/html") &&
    ruta !== "/entrar" &&
    !ruta.startsWith("/api/") &&
    !ruta.startsWith("/auth/");
  const destino = new URL("/entrar", process.env.NEXT_PUBLIC_SITE_URL ?? request.url);
  destino.searchParams.set("caducada", "1");
  if (ruta !== "/") destino.searchParams.set("volver", ruta);
  const salida = navegando ? NextResponse.redirect(destino) : siga();
  salida.cookies.set(COOKIE_SESION, "", { path: "/", maxAge: 0 });
  salida.headers.set("cache-control", "no-store");
  return salida;
}
