"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAlmacen, revisarImagen } from "@/lib/almacenamiento";
import type { ResultadoImagenUI } from "@/components/selector-imagen";
import { createEphemeralClient } from "@/lib/supabase/efimero";
import { validarClave } from "@/lib/password";
import { asegurarIdDispositivo, describirDispositivo, recordarDispositivo } from "@/lib/dispositivos";

/**
 * Lo que una persona puede hacer con su propia cuenta.
 *
 * Hoy: ponerse contraseña, cambiarla, retirar la confianza de un dispositivo y
 * poner o quitar su foto de perfil.
 */

const ClaveSchema = z
  .object({
    actual: z.string().optional(),
    password: z.string().min(1, "Escribe una contraseña"),
    password2: z.string().min(1, "Repite la contraseña"),
  })
  .refine((d) => d.password === d.password2, {
    path: ["password2"],
    message: "Las dos contraseñas no coinciden",
  });

export type ResultadoClave =
  | { ok: true }
  | { ok: false; errors: Record<string, string> };

/**
 * Define o cambia la contraseña de quien tiene la sesión abierta.
 *
 * **Si la cuenta ya tenía contraseña, se exige la actual.** No es burocracia:
 * sin eso, alguien que encuentre una sesión abierta en un computador prestado se
 * queda con la cuenta para siempre cambiando la clave, y el dueño pierde hasta
 * la posibilidad de recuperarla. Quien llega aquí porque *no* tiene contraseña
 * —las cuentas viejas por código y las que crea un administrador— no tiene nada
 * que demostrar más allá de la sesión que acaba de abrir con el código.
 *
 * `tiene_clave` en los metadatos es lo que después permite saber si hay
 * contraseña: Supabase no lo dice por ninguna otra vía. Ver `entrar/actions.ts`.
 */
export async function definirClave(datos: unknown): Promise<ResultadoClave> {
  const user = await requireUser("/cuenta/clave");

  const parsed = ClaveSchema.safeParse(datos);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const campo = issue.path[0];
      if (typeof campo === "string" && !errors[campo]) errors[campo] = issue.message;
    }
    return { ok: false, errors };
  }

  const yaTenia = user.user_metadata?.tiene_clave === true;

  if (yaTenia) {
    if (!parsed.data.actual) {
      return { ok: false, errors: { actual: "Escribe tu contraseña actual" } };
    }
    // Se comprueba con el cliente efímero: el normal escribiría cookies y
    // sustituiría la sesión en curso por una nueva sin necesidad.
    const efimero = createEphemeralClient();
    const { error } = await efimero.auth.signInWithPassword({
      email: user.email ?? "",
      password: parsed.data.actual,
    });
    if (error) {
      return { ok: false, errors: { actual: "Esa no es tu contraseña actual" } };
    }
    // `scope: "local"`, otra vez: sin él, comprobar la contraseña actual cerraría
    // la sesión de la persona en todos sus dispositivos —incluida esta, a mitad
    // de cambiar la clave— por haber escrito bien su propia contraseña.
    await efimero.auth.signOut({ scope: "local" });
  }

  const problema = validarClave(parsed.data.password, [
    user.email,
    typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : undefined,
  ]);
  if (problema) return { ok: false, errors: { password: problema } };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
    data: { ...user.user_metadata, tiene_clave: true },
  });

  if (error) {
    return {
      ok: false,
      errors: {
        form: error.message.toLowerCase().includes("password")
          ? "Esa contraseña no cumple el mínimo configurado en el panel. Prueba con una más larga."
          : "No pudimos guardar la contraseña. Inténtalo de nuevo.",
      },
    };
  }

  // El aparato desde el que alguien acaba de ponerse contraseña es, por
  // definición, uno en el que ya confía: llegó hasta aquí pasando el código.
  await recordarDispositivo(
    supabase,
    user.id,
    await asegurarIdDispositivo(),
    await describirDispositivo(),
  );

  revalidatePath("/cuenta");
  return { ok: true };
}

/**
 * Retira la confianza de un dispositivo: la próxima vez que alguien entre desde
 * ahí, se le pedirá el código.
 *
 * Va con el cliente de sesión, así que la política `trusted_devices_own` es la
 * que autoriza. Pasar el id de un aparato ajeno no borra nada — RLS no devuelve
 * error al negar, devuelve cero filas, y por eso se comprueba el resultado.
 */
export async function olvidarDispositivo(id: string): Promise<ResultadoClave> {
  const user = await requireUser("/cuenta");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trusted_devices")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");

  if (error) return { ok: false, errors: { form: error.message } };
  if (!data || data.length === 0) {
    return { ok: false, errors: { form: "Ese dispositivo ya no estaba en tu lista." } };
  }

  revalidatePath("/cuenta");
  return { ok: true };
}

/**
 * La foto de perfil.
 *
 * Tres comprobaciones, en este orden y ninguna de adorno:
 *
 * 1. **Quién es.** Sin sesión no hay carpeta donde escribir.
 * 2. **Qué mandó.** `revisarImagen()` mira tipo y peso. El navegador ya recortó
 *    y comprimió, pero eso es comodidad, no una barrera: el `FormData` se puede
 *    mandar a mano.
 * 3. **Dónde va.** `getAlmacen()` decide el almacén y la ruta empieza por el id
 *    del usuario — que es lo que comparan las políticas de `storage.objects`
 *    con `auth.uid()`. O sea que la base lo vuelve a comprobar todo.
 *
 * Se revalidan las tres rutas donde la foto se ve: la cuenta, el muro de la
 * Comunidad y la portada, que también pinta publicaciones. Si aparece una
 * cuarta, va aquí.
 */
export async function guardarFoto(datos: FormData): Promise<ResultadoImagenUI> {
  const user = await getUser();
  if (!user) {
    return { ok: false, error: "Tu sesión se cerró. Entra otra vez." };
  }

  const revisada = revisarImagen(datos.get("imagen"));
  if (!revisada.ok) return { ok: false, error: revisada.error };

  const guardada = await getAlmacen().guardar(
    "avatares",
    user.id,
    revisada.archivo,
    revisada.tipo,
  );
  if (!guardada.ok) return guardada;

  const resultado = await escribirAvatar(user.id, guardada.url);
  return resultado.ok ? { ok: true, url: guardada.url } : resultado;
}

/**
 * Quitar la foto y volver al monograma de iniciales.
 *
 * **Solo borra la columna, no el archivo.** Storage cobra por lo que ocupa y
 * esto son kilobytes, así que el archivo huérfano no es el problema: el
 * problema sería que borrarlo fallara a mitad y la columna quedara apuntando a
 * una URL muerta, que se ve como una imagen rota. La próxima foto que suba esa
 * persona sobrescribe el archivo, porque la ruta es siempre la misma.
 */
export async function quitarFoto(): Promise<ResultadoImagenUI> {
  const user = await getUser();
  if (!user) {
    return { ok: false, error: "Tu sesión se cerró. Entra otra vez." };
  }
  const resultado = await escribirAvatar(user.id, null);
  return resultado.ok ? { ok: true, url: "" } : resultado;
}

async function escribirAvatar(
  userId: string,
  url: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  // `.select()` y no confiar en que no haya error: RLS no lanza al negar,
  // devuelve cero filas. Sin esto, una política mal puesta se vería como un
  // guardado correcto que no guarda nada.
  const { data, error } = await supabase
    .from("profiles")
    .update({ avatar_url: url })
    .eq("id", userId)
    .select("id");

  if (error || !data || data.length === 0) {
    if (error) console.error(`[cuenta] foto: ${error.message}`);
    return { ok: false, error: "No pudimos guardar tu foto. Inténtalo otra vez." };
  }

  revalidatePath("/cuenta");
  revalidatePath("/comunidad");
  revalidatePath("/");
  return { ok: true };
}
