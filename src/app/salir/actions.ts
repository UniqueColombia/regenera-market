"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { cerrarVentanaDeActividad } from "@/lib/sesion";
import { avisarAlVolver } from "@/lib/avisos";

/**
 * Cierra la sesión.
 *
 * Es una Server Action y no un enlace a `/salir` a propósito: un GET que cierra
 * sesión lo puede disparar cualquier imagen o prefetch de un tercero, y el
 * usuario se encuentra fuera sin haber tocado nada.
 *
 * `revalidatePath("/", "layout")` tira el caché de todo lo renderizado con la
 * sesión anterior. Sin eso, el encabezado seguiría mostrando el nombre de quien
 * acaba de salir.
 */
export async function cerrarSesion() {
  const supabase = await createClient();
  // `scope: "local"` cierra **esta** sesión, no todas. Por defecto `signOut()`
  // revoca los tokens de la persona en todos sus dispositivos, y eso convierte
  // «salir» en el computador del hotel en «me echó del teléfono». Quien quiera
  // lo otro tiene la pantalla de dispositivos de confianza en `/cuenta`.
  await supabase.auth.signOut({ scope: "local" });
  await cerrarVentanaDeActividad();
  // La portada no dice nada de que acabas de salir: sin esto, el único indicio
  // es que el nombre desapareció del encabezado, y eso se confunde con un fallo.
  await avisarAlVolver("salida");
  revalidatePath("/", "layout");
  redirect("/");
}
