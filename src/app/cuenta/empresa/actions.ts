"use server";

import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAlmacen, revisarImagen } from "@/lib/almacenamiento";
import { getMiEmpresa } from "@/lib/repo";
import { mensajeDeFallo, registrarFallo } from "@/lib/incidencias";
import type { ResultadoImagenUI } from "@/components/selector-imagen";
import { GIROS_POR_NIVEL, IDS_GIRO, type GiroId } from "@/lib/taxonomy";

/**
 * Lo que puede hacer con su empresa quien la gestiona.
 *
 * Hoy las dos imágenes de su ficha: el logo y la portada. El resto
 * —descripción, ubicación, datos de contacto— se creó con la postulación y
 * todavía se corrige desde administración. Cuando haya formulario para eso, va
 * aquí y sigue estas mismas reglas.
 *
 * **Las dos van al mismo bucket, `logos`, en la carpeta de la empresa.** Lo que
 * la política de Storage comprueba es la primera carpeta de la ruta, así que
 * dos archivos distintos ahí dentro no necesitan bucket ni política nueva — ver
 * la migración 0009.
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
  return guardarImagenDeEmpresa(datos, "logo_url", "imagen");
}

/** Quitar el logo y volver al monograma. No borra el archivo — ver `quitarFoto()`. */
export async function quitarLogo(): Promise<ResultadoImagenUI> {
  return borrarImagenDeEmpresa("logo_url");
}

/**
 * La portada de la ficha pública: la foto grande que se ve al abrirla.
 *
 * Si no hay ninguna, la ficha usa la foto de una de sus ofertas — o sea que
 * quitarla no deja un hueco, cambia a un respaldo que siempre existe.
 */
export async function guardarPortada(datos: FormData): Promise<ResultadoImagenUI> {
  return guardarImagenDeEmpresa(datos, "cover_url", "portada");
}

export async function quitarPortada(): Promise<ResultadoImagenUI> {
  return borrarImagenDeEmpresa("cover_url");
}

/**
 * Las dos son la misma operación con dos parámetros, y por eso comparten
 * cuerpo: duplicarlo sería duplicar también las tres comprobaciones de quién es
 * quién, que es lo que nunca conviene tener escrito dos veces.
 */
async function guardarImagenDeEmpresa(
  datos: FormData,
  columna: "logo_url" | "cover_url",
  pieza: "imagen" | "portada",
): Promise<ResultadoImagenUI> {
  const empresa = await miEmpresa();
  if (!empresa.ok) return empresa;

  const revisada = revisarImagen(datos.get("imagen"));
  if (!revisada.ok) return { ok: false, error: revisada.error };

  const guardada = await getAlmacen().guardar(
    "logos",
    empresa.id,
    revisada.archivo,
    revisada.tipo,
    pieza,
  );
  if (!guardada.ok) return guardada;

  const escrito = await escribirImagen(
    empresa.id,
    empresa.slug,
    columna,
    guardada.url,
  );
  return escrito.ok ? { ok: true, url: guardada.url } : escrito;
}

async function borrarImagenDeEmpresa(
  columna: "logo_url" | "cover_url",
): Promise<ResultadoImagenUI> {
  const empresa = await miEmpresa();
  if (!empresa.ok) return empresa;

  const escrito = await escribirImagen(empresa.id, empresa.slug, columna, null);
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

async function escribirImagen(
  providerId: string,
  slug: string,
  columna: "logo_url" | "cover_url",
  url: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = await createClient();
  // `.select()`: RLS no lanza al negar, devuelve cero filas. Sin comprobarlo,
  // una política mal puesta se vería como un guardado correcto que no guarda.
  const { data, error } = await db
    .from("providers")
    .update({ [columna]: url })
    .eq("id", providerId)
    .select("id");

  if (error || !data || data.length === 0) {
    const codigo = registrarFallo("empresa-imagen", error ?? "sin filas", {
      columna,
      quitando: url === null,
    });
    return { ok: false, error: mensajeDeFallo(codigo) };
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

/**
 * El giro de la empresa: qué es y qué ofrece (`GIROS` de `src/lib/taxonomy.ts`).
 *
 * El tope por nivel se comprueba aquí para poder decirlo en español, y lo
 * impone de verdad el trigger `providers_limitar_giros` de la 0012: la clave
 * anon es pública, y un `update` directo contra PostgREST no pasaría por este
 * archivo. Si la base lo rechaza igual —porque el nivel cambió entre que se
 * pintó la pantalla y se guardó—, el mensaje es el mismo.
 */
export async function guardarGiros(
  giros: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const empresa = await getMiEmpresa();
  if (!empresa) return { ok: false, error: "Tu cuenta todavía no gestiona ninguna empresa." };

  const validos = [...new Set(giros)].filter((g): g is GiroId =>
    (IDS_GIRO as readonly string[]).includes(g),
  );
  const tope = GIROS_POR_NIVEL[empresa.tier];
  if (validos.length > tope) {
    return {
      ok: false,
      error: `Con tu nivel puedes declarar hasta ${tope}. Sube de nivel para ofrecer más a la vez.`,
    };
  }
  if (validos.includes("consultoria") && !empresa.evaluacionVerificada) {
    return {
      ok: false,
      error: "La consultoría exige el sello verificado por Seregenera.",
    };
  }

  const db = await createClient();
  const { data, error } = await db
    .from("providers")
    .update({ giros: validos })
    .eq("id", empresa.id)
    .select("id");

  if (error?.message.includes("giros-limite")) {
    return { ok: false, error: `Con tu nivel puedes declarar hasta ${tope}.` };
  }
  if (error?.message.includes("giros-verificacion")) {
    return { ok: false, error: "La consultoría exige el sello verificado por Seregenera." };
  }
  if (error || !data || data.length === 0) {
    const codigo = registrarFallo("empresa-giros", error ?? "sin filas", { cuantos: validos.length });
    return { ok: false, error: mensajeDeFallo(codigo) };
  }

  revalidatePath("/cuenta/empresa");
  revalidatePath(`/proveedor/${empresa.slug}`);
  revalidatePath("/proveedores");
  return { ok: true };
}
