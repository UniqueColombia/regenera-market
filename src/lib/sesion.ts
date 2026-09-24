import { cookies } from "next/headers";
import {
  COOKIE_ACTIVIDAD,
  INACTIVIDAD_SEGUNDOS,
  actividadNueva,
  sellarActividad,
} from "./inactividad";

/**
 * Abrir y cerrar la ventana de inactividad, desde el servidor.
 *
 * Está separado de `src/lib/inactividad.ts` porque aquel lo importa
 * `src/proxy.ts`, que Next puede ejecutar en el entorno de borde: ahí no existe
 * `next/headers`, y un solo `import` de este archivo desde allá tumbaría el
 * sitio entero. El de al lado es lógica pura y se puede importar desde donde
 * sea; este necesita una petición viva.
 *
 * ## Dónde se llama, y por qué es una lista corta a propósito
 *
 * `abrirVentanaDeActividad()` va **en cada sitio que abre una sesión**, y son
 * cuatro: las tres formas de entrar de `src/app/entrar/actions.ts` (registrarse,
 * entrar con clave desde un aparato conocido, y canjear el código) más el enlace
 * del correo en `src/app/auth/callback/route.ts`.
 *
 * Si algún día aparece una quinta y se olvida, **el fallo es ruidoso, no
 * silencioso**: el proxy ve cookies de sesión sin ventana de actividad, lo trata
 * como sesión caducada y devuelve a `/entrar`. O sea que quien pruebe ese camino
 * nuevo una sola vez lo descubre en el acto. Es el motivo por el que la ausencia
 * de la cookie se interpreta como «caducada» y no como «acaba de entrar»: lo
 * segundo sería más cómodo y convertiría la medida en decorativa — se saltaría
 * borrando la cookie.
 */

function opciones(maxAge: number) {
  return {
    path: "/",
    maxAge,
    httpOnly: true,
    sameSite: "lax" as const,
    // Sin `Secure` sobre http://localhost el navegador la descarta en silencio,
    // y el síntoma sería no poder entrar en desarrollo. Mismo criterio que
    // `sgr_visitante` en /api/medicion.
    secure: process.env.NODE_ENV === "production",
  };
}

/**
 * Arranca el reloj. Se llama justo después de que exista sesión.
 *
 * **`userId` no es opcional y no se puede adivinar desde aquí.** Es lo que ata
 * la ventana a *esta* sesión: sin él, la cookie serviría para cualquiera, y
 * quien robara las cookies de otro podría revivirlas prestándoles la suya. El
 * porqué largo está en la cabecera de `src/lib/inactividad.ts`.
 */
export async function abrirVentanaDeActividad(userId: string): Promise<void> {
  const { sujeto, inicio, ultima } = actividadNueva(userId);
  const almacen = await cookies();
  almacen.set(
    COOKIE_ACTIVIDAD,
    await sellarActividad(sujeto, inicio, ultima),
    opciones(INACTIVIDAD_SEGUNDOS),
  );
}

/**
 * Apaga el reloj al salir.
 *
 * No es imprescindible —sin cookies de sesión el proxy ni la mira— pero dejarla
 * puesta en un equipo compartido es dejar un rastro de cuándo estuvo alguien.
 */
export async function cerrarVentanaDeActividad(): Promise<void> {
  const almacen = await cookies();
  almacen.delete(COOKIE_ACTIVIDAD);
}
