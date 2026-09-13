import { createHash, randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Dispositivos de confianza: qué convierte el código de seis dígitos en un
 * segundo factor en vez de en un peaje diario.
 *
 * **El problema que resuelve.** Con contraseña sola, quien la robe entra. Con
 * código en cada acceso, la gente se harta y acaba dejando la sesión abierta en
 * un computador compartido, que es peor. El acuerdo razonable, y el que usan los
 * bancos: contraseña siempre, código **solo cuando el aparato no se reconoce**.
 *
 * **Cómo se reconoce un aparato.** La primera vez que alguien pasa el código, el
 * servidor genera un identificador aleatorio, lo guarda en una cookie `httpOnly`
 * de un año y guarda su **hash** en `trusted_devices` junto al usuario. En los
 * accesos siguientes, si la cookie trae un identificador cuyo hash está
 * asociado a ese usuario, no se pide código.
 *
 * **Por qué el hash y no el valor.** Si alguien se lleva un volcado de la tabla,
 * con hashes no obtiene cookies utilizables. Es el mismo motivo por el que una
 * tabla de sesiones no guarda los tokens en claro.
 *
 * **Lo que esto NO es.** No es huella del navegador: no se mide resolución, ni
 * fuentes, ni canvas. Es una cookie propia, que la persona puede borrar; si la
 * borra, se le pide el código otra vez y no pasa nada. Un identificador que la
 * persona no puede quitarse de encima sería rastreo, no seguridad.
 */

/**
 * `__Host-` no se usa a propósito: exige `path=/` y `secure`, y en `localhost`
 * con `http` el navegador descartaría la cookie en silencio. El desarrollo se
 * volvería «el código se pide siempre» sin ninguna pista de por qué.
 */
export const COOKIE_DISPOSITIVO = "sgr_dispositivo";

/** Un año. Se renueva en cada acceso desde un aparato ya conocido. */
const VIDA_COOKIE = 60 * 60 * 24 * 365;

export function hashDispositivo(id: string): string {
  return createHash("sha256").update(id).digest("hex");
}

/** Lee el identificador del aparato, si este navegador ya tiene uno. */
export async function leerIdDispositivo(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_DISPOSITIVO)?.value ?? null;
}

/**
 * Devuelve el identificador de este aparato, creándolo si hace falta.
 *
 * **Solo se puede llamar desde una Server Action o un Route Handler**: son los
 * únicos sitios donde Next deja escribir cookies. Desde un Server Component, la
 * escritura lanza y aquí se traga, devolviendo el identificador igualmente — el
 * efecto es que no se recuerda el aparato, no que la página reviente.
 */
export async function asegurarIdDispositivo(): Promise<string> {
  const store = await cookies();
  const actual = store.get(COOKIE_DISPOSITIVO)?.value;
  if (actual) return actual;

  const nuevo = randomUUID();
  try {
    store.set(COOKIE_DISPOSITIVO, nuevo, {
      httpOnly: true,
      // El JavaScript de la página no tiene ninguna razón para leer esto, y no
      // poder leerlo es lo que lo protege de un XSS.
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: VIDA_COOKIE,
      path: "/",
    });
  } catch {
    // Server Component: no se puede escribir. Ver arriba.
  }
  return nuevo;
}

/**
 * Nombre legible del aparato, para la pantalla de la cuenta.
 *
 * Del User-Agent se extraen dos cosas —navegador y sistema— y se tira el resto.
 * Guardar la cadena completa sería guardar una huella digital de la persona para
 * enseñarle una etiqueta que cabe en tres palabras.
 */
export async function describirDispositivo(): Promise<string> {
  const h = await headers();
  const ua = h.get("user-agent") ?? "";

  const navegador =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : /Firefox\//.test(ua) ? "Firefox"
    : "Navegador";

  const sistema =
    /Windows/.test(ua) ? "Windows"
    : /Android/.test(ua) ? "Android"
    : /iPhone|iPad|iPod/.test(ua) ? "iPhone o iPad"
    : /Mac OS X|Macintosh/.test(ua) ? "Mac"
    : /Linux/.test(ua) ? "Linux"
    : "un equipo";

  return `${navegador} en ${sistema}`;
}

/**
 * ¿Este aparato ya pasó el código para este usuario?
 *
 * El cliente que se pasa tiene que **actuar como el usuario** —el de
 * `createTokenClient()` durante el acceso, o el de sesión ya abierta—, porque
 * `trusted_devices` está protegida por `user_id = auth.uid()`. Con el cliente
 * anónimo la consulta devuelve cero filas sin error y todos los aparatos
 * parecerían nuevos.
 *
 * Ante cualquier error se responde `false`. En una comprobación de seguridad,
 * «no pude saberlo» tiene que resolverse como «pide el código»: al revés sería
 * saltarse el segundo factor cuando la base falla.
 */
export async function esDispositivoConocido(
  supabase: SupabaseClient,
  userId: string,
  idDispositivo: string | null,
): Promise<boolean> {
  if (!idDispositivo) return false;

  const { data, error } = await supabase
    .from("trusted_devices")
    .select("id")
    .eq("user_id", userId)
    .eq("device_hash", hashDispositivo(idDispositivo))
    .maybeSingle();

  if (error) return false;
  return Boolean(data);
}

/**
 * Marca este aparato como conocido. Se llama **después** de verificar el código,
 * nunca antes: el registro es la consecuencia de haber pasado el segundo factor.
 *
 * `upsert` sobre la clave única `(user_id, device_hash)` para que volver a
 * entrar actualice `last_seen_at` en vez de duplicar filas.
 */
export async function recordarDispositivo(
  supabase: SupabaseClient,
  userId: string,
  idDispositivo: string,
  etiqueta: string,
): Promise<void> {
  await supabase.from("trusted_devices").upsert(
    {
      user_id: userId,
      device_hash: hashDispositivo(idDispositivo),
      label: etiqueta,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "user_id,device_hash" },
  );
}
