"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { cerrarVentanaDeActividad } from "@/lib/sesion";

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
  revalidatePath("/", "layout");
  redirect("/");
}
