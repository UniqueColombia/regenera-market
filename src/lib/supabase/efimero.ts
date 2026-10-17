import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { modoMysql } from "../modo";
import { requireSupabaseConfig } from "./config";
import { clienteMysqlDeToken, clienteMysqlEfimero } from "./mysql";

/** El tipo del cliente de Supabase, inferido de una llamada concreta (no del genérico). */
type Cliente = ReturnType<typeof clienteSupabase>;

/**
 * Clientes de Supabase **que no escriben cookies**.
 *
 * Existen por el segundo factor. El acceso de Seregenera tiene que comprobar la
 * contraseña *antes* de decidir si abre la sesión: si el aparato no es conocido,
 * hay que pedir el código de seis dígitos y no dejar entrar todavía.
 *
 * El cliente normal (`server.ts`) no sirve para eso: en cuanto
 * `signInWithPassword` responde bien, guarda la sesión en las cookies y la
 * persona ya está dentro. El segundo factor quedaría de adorno — un atacante con
 * la contraseña correcta cerraría la pestaña del código y navegaría con sesión
 * válida.
 *
 * Estos dos clientes usan la **clave anon**, o sea que siguen sujetos a RLS.
 * No se saltan nada: lo único que no hacen es persistir.
 */

/**
 * Para comprobar credenciales sin abrir sesión.
 *
 * `persistSession: false` es lo importante, y `autoRefreshToken: false` evita
 * que deje un temporizador colgando en el proceso del servidor.
 */
export function createEphemeralClient(): Cliente {
  // Modo MySQL: el mismo contrato (la sesión, si se abre, vive solo en este objeto).
  if (modoMysql()) return clienteMysqlEfimero() as unknown as Cliente;
  return clienteSupabase();
}

function clienteSupabase(cabeceras?: Record<string, string>) {
  const { url, anonKey } = requireSupabaseConfig();
  return createSupabaseClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    ...(cabeceras ? { global: { headers: cabeceras } } : {}),
  });
}

/**
 * Actúa como un usuario concreto a partir de su token, sin cookies de por medio.
 *
 * Se usa en el hueco entre «la contraseña es correcta» y «te dejo entrar»: ahí
 * hace falta consultar `trusted_devices`, que está protegida por
 * `user_id = auth.uid()`. Con el cliente anónimo la consulta devolvería cero
 * filas y **todos los aparatos parecerían nuevos**, así que el código se pediría
 * siempre.
 *
 * Mandar el token por cabecera y no llamar a `setSession()` es deliberado:
 * `setSession` en el cliente de servidor terminaría escribiendo la cookie, que
 * es justo lo que aquí no debe pasar todavía.
 */
export function createTokenClient(accessToken: string): Cliente {
  if (modoMysql()) return clienteMysqlDeToken(accessToken) as unknown as Cliente;
  return clienteSupabase({ Authorization: `Bearer ${accessToken}` });
}
