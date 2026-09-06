"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
