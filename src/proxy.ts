import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseConfig } from "@/lib/supabase/config";
import {
  COOKIE_ACTIVIDAD,
  INACTIVIDAD_SEGUNDOS,
  type Actividad,
  leerActividad,
  sellarActividad,
  tocaRefrescar,
} from "@/lib/inactividad";

/**
 * Refresco de la sesión en cada petición, y su caducidad por inactividad.
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
 * Y es donde se cierra la sesión que lleva demasiado sin usarse. El porqué, el
 * plazo y el formato de la cookie están en `src/lib/inactividad.ts`; aquí solo
 * está la decisión: **sin ventana de actividad válida, la sesión se cierra**.
 *
 * Mientras no haya Supabase configurado no hace nada y deja pasar la petición.
 * Esa rama es la que mantiene viva la propiedad de `docs/DEPLOY.md`: `npm run
 * dev` con `.env.local` vacío levanta una app navegable. Sin ella, el sitio
 * entero dejaría de responder en cuanto alguien clonara el repo.
 */

/**
 * ¿Trae esta petición cookies de sesión de Supabase?
 *
 * Se mira el nombre y no se pregunta a la API: esto corre antes de nada y en
 * cada petición, y la pregunta es "¿hay algo que caducar?", no "¿quién es?".
 *
 * **`code-verifier` se excluye a propósito.** Es la cookie del intercambio PKCE,
 * que existe *mientras todavía no hay sesión*. Contarla haría que alguien a
 * mitad de un enlace de correo pareciera tener una sesión caducada, y se le
 * echaría justo antes de dársela.
 */
function cookiesDeSesion(request: NextRequest): string[] {
  return request.cookies
    .getAll()
    .filter(
      (c) =>
        c.name.startsWith("sb-") &&
        c.name.includes("auth-token") &&
        !c.name.includes("code-verifier"),
    )
    .map((c) => c.name);
}

export async function proxy(request: NextRequest) {
  const config = getSupabaseConfig();
  if (!config) return NextResponse.next();

  const sesion = cookiesDeSesion(request);

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

  // La caducidad se mira ANTES de refrescar el token. Al revés, la petición que
  // llega a los dos días renovaría el token justo antes de que lo tiráramos.
  let actividad: Actividad | null = null;
  if (sesion.length > 0) {
    actividad = await leerActividad(request.cookies.get(COOKIE_ACTIVIDAD)?.value);
    if (!actividad) return cerrarPorInactividad(request, config);
  }

  // Entre crear el cliente y este getUser() no va NADA que pueda retornar antes.
  // Es lo que dispara el refresco del token; cualquier lógica intercalada que
  // corte deja la sesión sin renovar y el fallo aparece intermitente, horas
  // después. La comprobación de arriba sí puede estar delante porque cuando
  // corta, corta para cerrar la sesión, no para seguir con ella.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (actividad) {
    // **La ventana tiene que ser de esta sesión.** Sin esto, toda cookie de
    // actividad válida valdría para cualquier sesión, y quien robara las cookies
    // de alguien solo tendría que registrar una cuenta desechable y pegarle la
    // suya —firmada por nosotros y recién hecha— para revivirla, y de paso
    // saltarse el tope de los 30 días. La cabecera de `src/lib/inactividad.ts`
    // lo cuenta entero.
    //
    // Si `getUser()` no devuelve usuario no se compara nada: no hay sesión que
    // proteger, y cerrar aquí solo serviría para dar una vuelta de más.
    if (user && user.id !== actividad.sujeto) {
      return cerrarPorInactividad(request, config);
    }

    // Se reescribe con holgura, no en cada petición: una respuesta con
    // `Set-Cookie` no la cachea ningún CDN. Ver REFRESCO_ACTIVIDAD_SEGUNDOS.
    if (tocaRefrescar(actividad)) {
      response.cookies.set(
        COOKIE_ACTIVIDAD,
        await sellarActividad(actividad.sujeto, actividad.inicio),
        opcionesActividad(request),
      );
    }
  }

  return response;
}

function opcionesActividad(request: NextRequest) {
  return {
    path: "/",
    maxAge: INACTIVIDAD_SEGUNDOS,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: request.nextUrl.protocol === "https:",
  };
}

/**
 * Cierra la sesión que se pasó de plazo y manda a entrar otra vez.
 *
 * Cuatro cosas, en este orden, y el orden es el que importa:
 *
 * 1. **Revocar en Supabase**, no solo borrar cookies. `scope: "local"` revoca el
 *    token de refresco de *esta* sesión y deja en paz el teléfono y el resto de
 *    aparatos de la persona. Sin esto, un token copiado antes del corte seguiría
 *    sirviendo: se habría cerrado la puerta dejando la llave puesta.
 *
 *    Para eso hace falta un cliente propio, con una **copia congelada** de las
 *    cookies que traía la petición. El de arriba lee `request.cookies` en vivo, y
 *    el paso 2 las borra de ahí: se quedaría sin sesión que revocar justo antes
 *    de revocarla.
 * 2. **Borrar las cookies de la petición.** No es cosmética: cuando no se
 *    redirige —una acción de servidor, un POST— la petición sigue su camino y la
 *    acción va a pedir la sesión. Si la cookie sigue en la cabecera, `getUser()`
 *    valida el token de acceso, al que le pueden quedar hasta sesenta minutos de
 *    vida, y **esa petición se ejecuta con la sesión que acabamos de cerrar**.
 *    Borrarla solo en la respuesta cierra la puerta a partir de la siguiente.
 * 3. **Borrarlas también de la respuesta**, para que el navegador no las vuelva
 *    a mandar.
 * 4. **Redirigir a `/entrar`** solo si esto era alguien navegando. Una acción de
 *    servidor o una llamada a `/api` se deja pasar sin sesión: la acción
 *    responderá su propio «tu sesión se cerró», que es un mensaje mucho mejor
 *    que un formulario que de pronto devuelve HTML.
 */
function cerrarPorInactividad(
  request: NextRequest,
  config: { url: string; anonKey: string },
): Promise<NextResponse> {
  // Se vuelven a leer aquí y no se reciben de fuera: entre la comprobación y
  // esta llamada puede haber corrido un refresco de token, que reescribe las
  // cookies y podría cambiar en cuántos trozos vienen.
  const nombres = cookiesDeSesion(request);
  const copia = request.cookies.getAll();
  const paraRevocar = createServerClient(config.url, config.anonKey, {
    cookies: { getAll: () => copia, setAll: () => undefined },
  });

  for (const nombre of nombres) request.cookies.delete(nombre);
  request.cookies.delete(COOKIE_ACTIVIDAD);

  const ruta = request.nextUrl.pathname;
  const navegando =
    request.method === "GET" &&
    (request.headers.get("accept") ?? "").includes("text/html") &&
    ruta !== "/entrar" &&
    !ruta.startsWith("/api/") &&
    !ruta.startsWith("/auth/");

  const destino = new URL("/entrar", request.url);
  destino.searchParams.set("caducada", "1");
  // Volver a donde estaba. `/` no se anota: es el destino por defecto. `ruta`
  // sale de `nextUrl.pathname`, así que siempre empieza por `/` — y de todas
  // formas quien lo recibe lo vuelve a comprobar antes de navegar, para que un
  // `//otro-dominio` no se convierta en un redirector abierto.
  if (ruta !== "/") destino.searchParams.set("volver", ruta);

  const salida = navegando
    ? NextResponse.redirect(destino)
    : NextResponse.next({ request: { headers: request.headers } });

  // `maxAge: 0` y no `delete()`: las cookies de Supabase se escribieron con
  // `path: "/"`, y un borrado sin ruta no siempre alcanza a la misma cookie.
  for (const nombre of nombres) {
    salida.cookies.set(nombre, "", { path: "/", maxAge: 0 });
  }
  salida.cookies.set(COOKIE_ACTIVIDAD, "", { path: "/", maxAge: 0 });
  salida.headers.set("cache-control", "no-store");

  // Se espera a la revocación —no se deja suelta— porque en una función sin
  // servidor el proceso puede congelarse en cuanto se devuelve la respuesta, y
  // una promesa a medias ahí no termina nunca. Si falla, da igual: las cookies
  // ya se fueron.
  return paraRevocar.auth
    .signOut({ scope: "local" })
    .catch(() => undefined)
    .then(() => salida);
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
