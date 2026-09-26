import { cookies } from "next/headers";
import { AVISOS, COOKIE_AVISO, type AvisoId } from "./avisos-tipos";

export { AVISOS, COOKIE_AVISO, type AvisoId };

/**
 * Deja un aviso para la próxima pantalla: «entraste», «saliste».
 *
 * ## Por qué una cookie y no un parámetro en la URL
 *
 * Porque quien entra o sale termina en una pantalla que no elige esta acción:
 * `cerrarSesion()` redirige a la portada, y entrar termina en el `volver` que
 * traía la persona, que puede ser cualquier página. Pegarle `?aviso=entrada` a
 * una URL ajena ensucia el enlace que la persona va a copiar, y queda en el
 * historial: al volver atrás, el aviso sale otra vez.
 *
 * Una cookie de un minuto la lee `AvisoAlVolver` en la pantalla siguiente y la
 * borra en el acto. **No es `httpOnly` a propósito**: la tiene que poder borrar
 * el navegador, y no lleva nada que valga la pena robar — dice «entrada» o
 * «salida», nada más.
 *
 * Solo desde una Server Action o un Route Handler: un Server Component no puede
 * escribir cookies.
 */
export async function avisarAlVolver(id: AvisoId): Promise<void> {
  (await cookies()).set(COOKIE_AVISO, id, {
    path: "/",
    maxAge: 60,
    sameSite: "lax",
    httpOnly: false,
  });
}
