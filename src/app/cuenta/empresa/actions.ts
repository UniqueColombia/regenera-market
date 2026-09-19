"use server";

import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAlmacen, revisarImagen } from "@/lib/almacenamiento";
import { getMiEmpresa } from "@/lib/repo";
import type { ResultadoImagenUI } from "@/components/selector-imagen";

/**
 * Lo que puede hacer con su empresa quien la gestiona.
 *
 * Hoy solo el logo. Es poco a propósito: el resto de la ficha —descripción,
 * ubicación, datos de contacto— se creó con la postulación y todavía se corrige
 * desde administración. Cuando haya formulario para eso, va aquí y sigue estas
 * mismas reglas.
 *
 * ## Quién es «quien la gestiona»
 *
 * `provider_members`, nunca el rol `provider`. El rol dice que alguien vende;
 * la tabla dice **de qué empresa**. Se resuelve con `getMiEmpresa()`, que
 * consulta con el cliente de sesión y por tanto pasa por RLS: si alguien no
 * gestiona ninguna, no recibe ninguna y no hay nada que comprobar a mano.
 *
 * ## Tres barreras para la misma cosa, y ninguna sobra
 *
 * 1. Aquí: `getMiEmpresa()` decide de qué empresa estamos hablando. El id no
 *    viene nunca del formulario — si viniera, habría que comprobarlo, y esa es
 *    la comprobación que un día se olvida.
 * 2. En Storage: la carpeta es el id de la empresa y la política la compara con
 *    `manages_provider()` (migración 0008, sección 4).
 * 3. En `providers`: `providers_member_update` exige lo mismo, y el trigger
 *    `providers_proteger_derivados` impide que por esta vía se cuele un cambio
 *    de nivel, de puntaje o de estado — que es lo que de verdad valdría la pena
 *    robar, porque el nivel baja la comisión.
 */

export async function guardarLogo(datos: FormData): Promise<ResultadoImagenUI> {
  const empresa = await miEmpresa();
  if (!empresa.ok) return empresa;

  const revisada = revisarImagen(datos.get("imagen"));
  if (!revisada.ok) return { ok: false, error: revisada.error };

  const guardada = await getAlmacen().guardar(
    "logos",
    empresa.id,
    revisada.archivo,
    revisada.tipo,
  );
  if (!guardada.ok) return guardada;

  const escrito = await escribirLogo(empresa.id, empresa.slug, guardada.url);
  return escrito.ok ? { ok: true, url: guardada.url } : escrito;
}

/** Quitar el logo y volver al monograma. No borra el archivo — ver `quitarFoto()`. */
export async function quitarLogo(): Promise<ResultadoImagenUI> {
  const empresa = await miEmpresa();
  if (!empresa.ok) return empresa;

  const escrito = await escribirLogo(empresa.id, empresa.slug, null);
  return escrito.ok ? { ok: true, url: "" } : escrito;
}

async function miEmpresa(): Promise<
  { ok: true; id: string; slug: string } | { ok: false; error: string }
> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Tu sesión se cerró. Entra otra vez." };

  const empresa = await getMiEmpresa();
  if (!empresa) {
    return {
      ok: false,
      error: "Tu cuenta todavía no gestiona ninguna empresa.",
    };
  }
  return { ok: true, id: empresa.id, slug: empresa.slug };
}

async function escribirLogo(
  providerId: string,
  slug: string,
  url: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = await createClient();
  // `.select()`: RLS no lanza al negar, devuelve cero filas. Sin comprobarlo,
  // una política mal puesta se vería como un guardado correcto que no guarda.
  const { data, error } = await db
    .from("providers")
    .update({ logo_url: url })
    .eq("id", providerId)
    .select("id");

  if (error || !data || data.length === 0) {
    if (error) console.error(`[empresa] logo: ${error.message}`);
    return { ok: false, error: "No pudimos guardar el logo. Inténtalo otra vez." };
  }

  // El logo sale en cuatro sitios. La ficha pública y la lista de proveedores
  // son las que ve un comprador; si alguna se quedara con el anterior, la
  // persona que acaba de subirlo concluiría que no se guardó.
  revalidatePath("/cuenta/empresa");
  revalidatePath(`/proveedor/${slug}`);
  revalidatePath("/proveedores");
  revalidatePath("/comunidad");
  return { ok: true };
}
