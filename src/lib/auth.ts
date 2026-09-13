import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "./supabase/config";
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

/**
 * El usuario de la sesión, o null. No redirige — para cuando "sin sesión" es un
 * caso válido.
 *
 * **Sin Supabase configurado devuelve null en vez de lanzar, y la distinción
 * importa.** "No hay sesión" es un estado legítimo del sitio; "no hay catálogo"
 * no lo es. Por eso la sesión degrada a anónimo y `src/lib/repo.ts` sí revienta.
 *
 * Lo descubrió el CI, no el razonamiento: `/_not-found` se prerenderiza en el
 * build, y al hacerlo renderiza el layout, que pide la sesión. Sin esta rama, un
 * clon sin credenciales no compila — y compilar sin credenciales es una
 * propiedad que el job `verificar` protege a propósito.
 */
export const getUser = cache(async (): Promise<User | null> => {
  if (!isSupabaseConfigured()) return null;
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

/**
 * ¿Esta cuenta todavía no tiene contraseña?
 *
 * Supabase no lo dice por ninguna vía: `user.identities` trae el proveedor
 * `email` tanto si hay contraseña como si la cuenta nació de un enlace mágico.
 * Así que la marca la ponemos nosotros en `user_metadata` al establecerla —
 * ver `src/app/entrar/actions.ts`.
 *
 * Las que no la tienen son de dos clases: las que se registraron cuando el
 * acceso era solo por código, y las que crea un administrador con
 * `scripts/crear-admin.mts`.
 */
export function necesitaClave(user: User): boolean {
  return user.user_metadata?.tiene_clave !== true;
}

/**
 * Exige sesión. Si no la hay, manda a entrar y vuelve a donde estaba.
 *
 * **Y si la hay pero la cuenta no tiene contraseña, manda a ponérsela.** Es lo
 * que hace que «ahora hay contraseñas» le ocurra de verdad a las cuentas
 * anteriores, en vez de quedar como una invitación que nadie acepta. Se hace
 * aquí y no en `src/proxy.ts` porque el proxy corre en cada petición del sitio
 * —incluidas las páginas públicas, donde no viene a cuento— y porque un
 * redirect mal puesto ahí deja el sitio entero en un bucle.
 *
 * El corte del bucle es `destino`: la propia pantalla de la contraseña llama a
 * `requireUser("/cuenta/clave")`, y ese caso no se redirige a sí mismo.
 */
export async function requireUser(destino?: string): Promise<User> {
  const user = await getUser();
  if (!user) {
    const volver = destino ? `?volver=${encodeURIComponent(destino)}` : "";
    redirect(`/entrar${volver}`);
  }

  if (necesitaClave(user) && destino !== "/cuenta/clave") {
    const volver = destino ? `?volver=${encodeURIComponent(destino)}` : "";
    redirect(`/cuenta/clave${volver}`);
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
export async function requireAdmin(destino = "/admin"): Promise<User> {
  const user = await requireUser(destino);
  if (!(await hasRole(user.id, "admin"))) redirect("/");
  return user;
}

/** Exige rol de proveedor. */
export async function requireProvider(): Promise<User> {
  const user = await requireUser();
  if (!(await hasRole(user.id, "provider"))) redirect("/");
  return user;
}
