import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseConfig } from "@/lib/supabase/config";

/**
 * Refresco de la sesión en cada petición.
 *
 * **Se llama `proxy.ts` y no `middleware.ts`.** Next 16 deprecó esa convención
 * y la renombró; el archivo viejo todavía funciona pero avisa. Verificado en
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/middleware.md`,
 * que dice literalmente "deprecated ... renamed to proxy.js". Si encuentras un
 * tutorial de Supabase que crea `middleware.ts`, está escrito para Next 15.
 *
 * Sin esto el token de acceso caduca y no se renueva: el usuario se ve
 * deslogueado a mitad de una compra, sin haber hecho nada. Es también el único
 * sitio de la app que puede escribir cookies de sesión — un Server Component no
 * puede, y por eso `src/lib/supabase/server.ts` se traga esa excepción.
 *
 * Mientras no haya Supabase configurado no hace nada y deja pasar la petición.
 * Esa rama es la que mantiene viva la propiedad de `docs/DEPLOY.md`: `npm run
 * dev` con `.env.local` vacío levanta una app navegable. Sin ella, el sitio
 * entero dejaría de responder en cuanto alguien clonara el repo.
 */
export async function proxy(request: NextRequest) {
  const config = getSupabaseConfig();
  if (!config) return NextResponse.next();

  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        // Primero en la petición, para que lo que se renderice después vea ya
        // la sesión nueva; luego se rehace la respuesta y se copian encima.
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request: { headers: request.headers } });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // Estas cabeceras las manda la propia librería y NO son opcionales:
        // marcan la respuesta como no cacheable. Si un CDN guardara una
        // respuesta que trae cookies de sesión, le serviría la sesión de una
        // persona a otra. Es la fuga de datos más cara que cabe en este archivo.
        for (const [name, value] of Object.entries(headers)) {
          response.headers.set(name, value);
        }
      },
    },
  });

  // Entre crear el cliente y este getUser() no va NADA. Es lo que dispara el
  // refresco del token; cualquier lógica intercalada que retorne antes deja la
  // sesión sin renovar y el fallo aparece intermitente, horas después.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /*
     * Todo salvo lo que no tiene sesión que refrescar. Sin excluirlos se paga
     * una llamada a Supabase por cada icono, fuente y chunk de JavaScript.
     */
    "/((?!_next/static|_next/image|favicon.ico|img/|.*\.(?:svg|png|jpg|jpeg|webp|gif|ico|woff2?)$).*)",
  ],
};
