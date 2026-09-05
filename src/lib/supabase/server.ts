import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { requireSupabaseConfig } from "./config";

/**
 * Cliente de Supabase para Server Components, Route Handlers y Server Actions.
 *
 * Clave anon más las cookies de sesión, así que **también queda sujeto a RLS**,
 * pero actuando como el usuario que hizo la petición. Es el que se usa en el 99 %
 * de los casos.
 *
 * Se crea uno nuevo por render y nunca se comparte entre peticiones: el cliente
 * lleva la sesión de alguien dentro, y reutilizarlo serviría los datos de un
 * usuario a otro.
 *
 * `cookies()` es asíncrono desde Next 15, de ahí que la función lo sea.
 */
export async function createClient() {
  const { url, anonKey } = requireSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Un Server Component no puede escribir cookies, y aquí eso no es un
          // error: el refresco del token lo hace `src/proxy.ts`, que sí puede.
          // Tragarse la excepción solo es correcto MIENTRAS el proxy exista —
          // si se borrara, el síntoma serían sesiones que expiran solas a mitad
          // de una compra, y nadie lo relacionaría con este catch.
        }
      },
    },
  });
}
