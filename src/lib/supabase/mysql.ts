import { cache } from "react";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMysql } from "../mysql/conexion";
import { leerSesion } from "../mysql/cuentas";
import { COOKIE_SESION, OPCIONES_DE_COOKIE } from "../mysql/postgrest/auth";
import { clienteDeServicio, clienteDeSesion, clienteDeToken, clienteEfimero } from "../mysql/postgrest/cliente";

/**
 * Los clientes de Supabase, en el modo MySQL (`src/lib/modo.ts`). Los devuelven
 * `createClient()`, `createAdminClient()`, `createEphemeralClient()` y
 * `createTokenClient()` cuando el modo está encendido, con el tipo de
 * `SupabaseClient`: el resto de la app los usa sin saber qué hay detrás.
 */

/**
 * Una lectura de la sesión por petición, aunque la pidan veinte consultas (cada
 * función de `src/lib/repo.ts` crea su cliente). `cache()` es por petición: no
 * mezcla a dos personas.
 */
const sesionDe = cache(async (token: string | undefined) => leerSesion(getMysql(), token));

/** La cookie es `Secure` cuando el sitio va por https (también en localhost, que el navegador trata como seguro). */
const segura = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://");

export async function clienteMysqlDeSesion(): Promise<SupabaseClient> {
  const almacen = await cookies();
  return clienteDeSesion(
    {
      leer: () => almacen.get(COOKIE_SESION)?.value,
      escribir: (token) => {
        if (token) almacen.set(COOKIE_SESION, token, { ...OPCIONES_DE_COOKIE, secure: segura() });
        else almacen.set(COOKIE_SESION, "", { path: "/", maxAge: 0 });
      },
    },
    sesionDe,
  ) as unknown as SupabaseClient;
}

export function clienteMysqlDeServicio(): SupabaseClient {
  return clienteDeServicio() as unknown as SupabaseClient;
}

export function clienteMysqlEfimero(): SupabaseClient {
  return clienteEfimero() as unknown as SupabaseClient;
}

export function clienteMysqlDeToken(token: string): SupabaseClient {
  return clienteDeToken(token) as unknown as SupabaseClient;
}
