"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Acceso por código de seis dígitos.
 *
 * Se eligió código y no enlace mágico: el usuario puede pedirlo en el móvil y
 * escribirlo en el computador, el enlace no se rompe al pasar por un cliente de
 * correo corporativo que lo reescribe, y es el flujo que la gente ya reconoce de
 * su banco. Decisión de `docs/BETA.md`, Bloque 2.
 *
 * El correo se manda con el enviador de Supabase mientras no haya SMTP propio.
 * **Ese enviador está limitado a unos pocos correos por hora y su propia
 * documentación lo declara solo para pruebas**: con más de un puñado de
 * registros, el segundo usuario no recibe nada. El SMTP de Workspace es lo que
 * lo resuelve — ver `docs/ESTADO.md`.
 */

const CorreoSchema = z.object({
  email: z.email("Revisa el correo"),
  name: z.string().trim().min(3, "Escribe tu nombre completo").optional(),
});

/**
 * Cuántos dígitos se aceptan.
 *
 * **La longitud real no la decide este archivo, la decide el panel de
 * Supabase** — Authentication → Sign In / Providers → Email → *Email OTP
 * Length*, configurable entre 6 y 10. Aquí se acepta el rango entero a
 * propósito: clavar el número que hoy está puesto en el panel convierte
 * cualquier cambio de ese ajuste en un bloqueo total del acceso, con un mensaje
 * que además miente («son seis dígitos» mientras el correo trae ocho). Pasó.
 *
 * El texto de la pantalla sí dice «seis», porque ayuda y porque el panel está
 * en 6; si alguien lo cambia, la frase queda desactualizada pero nadie se queda
 * fuera. Una pista puede envejecer mal; una puerta no.
 */
const MIN_DIGITOS = 6;
const MAX_DIGITOS = 10;

const CodigoSchema = z.object({
  email: z.email("Revisa el correo"),
  // Se limpian espacios porque al pegar desde el correo suelen venir agrupados.
  token: z
    .string()
    .trim()
    .transform((s) => s.replace(/\s+/g, ""))
    .pipe(
      z
        .string()
        .regex(/^\d+$/, "El código son solo números")
        .min(MIN_DIGITOS, "Falta código: cópialo completo del correo")
        .max(MAX_DIGITOS, "Sobran dígitos: cópialo tal cual viene en el correo"),
    ),
});

export type Resultado =
  | { ok: true }
  | { ok: false; errors: Record<string, string> };

function errores(e: z.ZodError): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const issue of e.issues) {
    const campo = issue.path[0];
    if (typeof campo === "string" && !salida[campo]) salida[campo] = issue.message;
  }
  return salida;
}

/**
 * Manda el código.
 *
 * `shouldCreateUser` distingue registro de acceso, y es la única diferencia
 * entre las dos pantallas: en `/entrar` vale `false` para que escribir un correo
 * que no existe no cree una cuenta silenciosamente.
 *
 * `full_name` viaja en `options.data`, que Supabase guarda en
 * `raw_user_meta_data`. De ahí lo recoge el trigger `handle_new_user` de
 * `0002_auth.sql` para crear la fila de `profiles`.
 */
export async function pedirCodigo(
  datos: unknown,
  registro: boolean,
): Promise<Resultado> {
  const parsed = CorreoSchema.safeParse(datos);
  if (!parsed.success) return { ok: false, errors: errores(parsed.error) };
  if (registro && !parsed.data.name) {
    return { ok: false, errors: { name: "Escribe tu nombre completo" } };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      shouldCreateUser: registro,
      data: registro ? { full_name: parsed.data.name } : undefined,
    },
  });

  if (error) {
    // No se distingue "ese correo no existe" de otros fallos a propósito: decir
    // cuáles correos están registrados convierte el formulario en un detector de
    // cuentas para cualquiera que pruebe direcciones.
    return {
      ok: false,
      errors: {
        form: registro
          ? "No pudimos enviar el código. Revisa el correo e inténtalo de nuevo."
          : "No pudimos enviar el código. Si aún no tienes cuenta, regístrate.",
      },
    };
  }

  return { ok: true };
}

/** Canjea el código por sesión. Las cookies las escribe el cliente de servidor. */
export async function verificarCodigo(datos: unknown): Promise<Resultado> {
  const parsed = CodigoSchema.safeParse(datos);
  if (!parsed.success) return { ok: false, errors: errores(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.token,
    type: "email",
  });

  if (error) {
    return {
      ok: false,
      errors: { token: "El código no es válido o ya venció. Pide uno nuevo." },
    };
  }

  return { ok: true };
}
