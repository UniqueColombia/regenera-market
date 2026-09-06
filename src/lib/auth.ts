import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";
import type { Role } from "./types";

/**
 * Comprobaciones de sesión y rol, en un solo sitio.
 *
 * **Esto es defensa en profundidad, no la defensa.** La barrera real son las
 * políticas RLS de `supabase/migrations/0001_init.sql`: aunque alguien llegara a
 * una página de administración saltándose esto, la base no le devolvería una
 * sola fila que no le toque. Estos helpers existen para que vea un redirect
 * limpio en vez de una pantalla vacía.
 *
 * Están aquí y no repetidos a mano en cada página porque una comprobación
 * copiada en once sitios es una comprobación que falta en el doceavo.
 */

/** El usuario de la sesión, o null. No redirige — para cuando "sin sesión" es un caso válido. */
export const getUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  // getUser() y no getSession(): el segundo se cree la cookie sin preguntar,
  // y una cookie la escribe cualquiera. Este valida el token contra Supabase.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export interface Sesion {
  id: string;
  nombre: string;
  email: string;
  esAdmin: boolean;
  esProveedor: boolean;
}

/**
 * Lo que el encabezado necesita saber de quien está mirando.
 *
 * Lo llama `src/app/layout.tsx`, o sea que corre en cada página: de ahí el
 * `cache()`, que lo deja en una sola consulta por render aunque también lo pida
 * otra parte del árbol.
 *
 * El nombre sale de `raw_user_meta_data` y no de `profiles` para no pagar una
 * segunda consulta en cada página. **Consecuencia:** si mañana existe una
 * pantalla donde el usuario edite su nombre, tendrá que escribirlo en los dos
 * sitios o el encabezado seguirá con el viejo.
 */
export const getSesion = cache(async (): Promise<Sesion | null> => {
  const user = await getUser();
  if (!user) return null;

  const roles = await getRoles(user.id);
  const meta = user.user_metadata as { full_name?: string } | null;
  const email = user.email ?? "";

  return {
    id: user.id,
    nombre: meta?.full_name?.trim() || email.split("@")[0] || "Tu cuenta",
    email,
    esAdmin: roles.includes("admin"),
    esProveedor: roles.includes("provider"),
  };
});

/** Exige sesión. Si no la hay, manda a entrar y vuelve a donde estaba. */
export async function requireUser(destino?: string): Promise<User> {
  const user = await getUser();
  if (!user) {
    const volver = destino ? `?volver=${encodeURIComponent(destino)}` : "";
    redirect(`/entrar${volver}`);
  }
  return user;
}

/**
 * Los roles del usuario.
 *
 * Se leen de `user_roles` y nunca de `profiles`: el usuario puede actualizar su
 * propio perfil, así que un rol guardado ahí sería un rol que él mismo se
 * asigna. Es la invariante 12 de la skill `dominio-regenera`, y la razón por la
 * que la tabla existe separada.
 */
export const getRoles = cache(async (userId: string): Promise<Role[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  // Ante un error se devuelve vacío, no se lanza: en una comprobación de
  // permisos, "no pude leer los roles" tiene que resolverse como "no tiene
  // ninguno". Al revés sería abrir la puerta cuando la base falla.
  if (error || !data) return [];
  return data.map((fila) => fila.role as Role);
});

export async function hasRole(userId: string, role: Role): Promise<boolean> {
  return (await getRoles(userId)).includes(role);
}

/** Exige rol de administrador. */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (!(await hasRole(user.id, "admin"))) redirect("/");
  return user;
}

/** Exige rol de proveedor. */
export async function requireProvider(): Promise<User> {
  const user = await requireUser();
  if (!(await hasRole(user.id, "provider"))) redirect("/");
  return user;
}
