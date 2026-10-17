import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { modoMysql } from "../modo";
import { requireSupabaseConfig } from "./config";
import { clienteMysqlDeSesion } from "./mysql";

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
 *
 * En el modo MySQL (`src/lib/modo.ts`) devuelve el cliente equivalente sobre
 * MariaDB (`./mysql.ts`), con la sesión de la cookie `sgr_sesion` y las mismas
 * reglas.
 */
export async function createClient(): Promise<ClienteServidor> {
  if (modoMysql()) return (await clienteMysqlDeSesion()) as unknown as ClienteServidor;
  const { url, anonKey } = requireSupabaseConfig();
  return clienteSupabase(url, anonKey, await cookies());
}

/** El cliente de Supabase. Aparte para que su tipo (con el que se tipa el del modo MySQL) salga inferido. */
function clienteSupabase(url: string, anonKey: string, cookieStore: Awaited<ReturnType<typeof cookies>>) {
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

type ClienteServidor = ReturnType<typeof clienteSupabase>;
