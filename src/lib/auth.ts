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
 *
 * Inerte hasta el Bloque 2 de `docs/BETA.md`: `/entrar` todavía no existe.
 */

/** El usuario de la sesión, o null. No redirige — para cuando "sin sesión" es un caso válido. */
export async function getUser(): Promise<User | null> {
  const supabase = await createClient();
  // getUser() y no getSession(): el segundo se cree la cookie sin preguntar,
  // y una cookie la escribe cualquiera. Este valida el token contra Supabase.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

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
export async function getRoles(userId: string): Promise<Role[]> {
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
}

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
