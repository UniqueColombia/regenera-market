"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createEphemeralClient } from "@/lib/supabase/efimero";
import { validarClave } from "@/lib/password";
import { asegurarIdDispositivo, describirDispositivo, recordarDispositivo } from "@/lib/dispositivos";

/**
 * Lo que una persona puede hacer con su propia cuenta.
 *
 * Hoy: ponerse contraseña, cambiarla, y retirar la confianza de un dispositivo.
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
    await efimero.auth.signOut();
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
  const supabaseSesion = await createClient();
  await recordarDispositivo(
    supabaseSesion,
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
