import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseConfig } from "./config";

/**
 * Cliente de Supabase para Componentes de Cliente.
 *
 * Usa la clave anon y **queda sujeto a RLS**: ve exactamente lo que las
 * políticas de `supabase/migrations/0001_init.sql` le permiten a quien tenga la
 * sesión de este navegador. Que la clave anon sea pública no es un descuido —
 * la seguridad la dan las políticas, no el secreto de la clave.
 *
 * `createBrowserClient` devuelve la misma instancia en llamadas sucesivas, así
 * que invocarlo en cada render no abre conexiones de más.
 */
export function createClient() {
  const { url, anonKey } = requireSupabaseConfig();
  return createBrowserClient(url, anonKey);
}
