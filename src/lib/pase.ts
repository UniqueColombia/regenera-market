import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Pases cortos y firmados que dicen cómo llegó alguien a un código de acceso.
 *
 * ## El problema que resuelven (auditoría del 2026-10-22)
 *
 * El código de seis dígitos sirve para dos cosas que hasta ese día eran
 * indistinguibles para el servidor:
 *
 * - **Segundo factor**: la persona ya escribió bien su contraseña desde un
 *   aparato nuevo, y el código confirma que además tiene el correo.
 * - **Entrar solo con código** («Olvidé mi contraseña · Entrar con código»): no
 *   demostró nada más que tener acceso al buzón.
 *
 * Las dos abrían la misma sesión completa. Y quien olvidó su contraseña no podía
 * ponerse otra, porque `/cuenta/clave` le pedía la actual.
 *
 * ## Cómo
 *
 * - `PASE_CLAVE` lo deja quien demostró la contraseña (`entrarConClave`, o el
 *   registro cuando la clave que escribió es la de la cuenta). Dura lo que tarda
 *   en llegar el código.
 * - Al canjear el código, una cuenta **con** contraseña que llega **sin** ese
 *   pase entró solo con el correo: se le da `PASE_RECUPERACION` y se la lleva a
 *   poner una contraseña nueva, que esta vez no exige la actual
 *   (`src/app/cuenta/actions.ts`).
 *
 * Firmados con `SESION_SECRETO`: el navegador los guarda pero no los puede
 * fabricar. Quien encuentre una sesión abierta en un computador ajeno no tiene
 * el pase y sigue necesitando la contraseña actual para cambiarla.
 */

export const PASE_CLAVE = "sgr_clave_ok";
export const PASE_RECUPERACION = "sgr_recuperacion";

/** Lo que tarda en llegar un código y en escribirlo, con holgura. */
const DURA_CLAVE = 20 * 60;
/** Para ponerse la contraseña nueva después de entrar con código. */
const DURA_RECUPERACION = 30 * 60;

type Tipo = typeof PASE_CLAVE | typeof PASE_RECUPERACION;

function secreto(): string | null {
  const valor = process.env.SESION_SECRETO;
  return valor && valor.length >= 16 ? valor : null;
}

function firma(cuerpo: string, clave: string): string {
  return createHmac("sha256", clave).update(cuerpo).digest("base64url");
}

/** El sujeto en minúsculas y en base64url: un correo lleva puntos, que son el separador. */
function codificar(sujeto: string): string {
  return Buffer.from(sujeto.trim().toLowerCase()).toString("base64url");
}

/** El valor de la cookie: `tipo.sujeto.vence.firma`. Exportada para las pruebas. */
export function sellarPase(tipo: Tipo, sujeto: string, vence: number, clave: string): string {
  const cuerpo = `${tipo}.${codificar(sujeto)}.${vence}`;
  return `${cuerpo}.${firma(cuerpo, clave)}`;
}

/** ¿Este valor es un pase vigente de este tipo para este sujeto? Exportada para las pruebas. */
export function paseValido(
  valor: string | undefined,
  tipo: Tipo,
  sujeto: string,
  clave: string,
  ahora = Math.floor(Date.now() / 1000),
): boolean {
  if (!valor) return false;
  const partes = valor.split(".");
  if (partes.length !== 4) return false;
  const [t, s, crudoVence, recibida] = partes;
  if (t !== tipo || s !== codificar(sujeto)) return false;
  const vence = Number(crudoVence);
  if (!Number.isSafeInteger(vence) || vence < ahora) return false;
  const esperada = Buffer.from(firma(`${t}.${s}.${crudoVence}`, clave));
  const dada = Buffer.from(recibida);
  return esperada.length === dada.length && timingSafeEqual(esperada, dada);
}

const opciones = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
});

/**
 * Deja un pase en una cookie. **Sin `SESION_SECRETO` no deja nada**: un pase sin
 * firma lo fabricaría cualquiera. En producción el secreto está
 * (`src/lib/configuracion.ts` lo exige); sin él, el código vale como antes y la
 * recuperación pide la contraseña actual.
 */
export async function darPase(tipo: Tipo, sujeto: string, valido = true): Promise<void> {
  const clave = secreto();
  if (!clave) return;
  const dura = tipo === PASE_CLAVE ? DURA_CLAVE : DURA_RECUPERACION;
  const vence = Math.floor(Date.now() / 1000) + dura;
  // `valido: false` deja un señuelo: la misma forma, firmado con una llave al
  // azar que nadie guarda. Lo usa el registro para que la cookie no diga desde
  // fuera si la contraseña escrita era la de la cuenta.
  const llave = valido ? clave : randomBytes(32).toString("hex");
  (await cookies()).set(tipo, sellarPase(tipo, sujeto, vence, llave), opciones(dura));
}

export async function tienePase(tipo: Tipo, sujeto: string): Promise<boolean> {
  const clave = secreto();
  if (!clave) return false;
  return paseValido((await cookies()).get(tipo)?.value, tipo, sujeto, clave);
}

export async function quitarPase(tipo: Tipo): Promise<void> {
  (await cookies()).set(tipo, "", opciones(0));
}

/**
 * Lo que se hace justo después de canjear un código, venga del formulario
 * (`verificarCodigo`) o del enlace del correo (`/auth/callback`).
 *
 * Devuelve `true` si fue una **recuperación**: la cuenta tiene contraseña y
 * quien canjeó el código no la demostró antes. En ese caso deja el pase de
 * recuperación y quien llama manda a la persona a ponerse una contraseña nueva.
 * El pase de la clave se gasta siempre: vale para un solo código.
 */
export async function cerrarPasoDelCodigo(usuario: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): Promise<boolean> {
  if (!secreto()) return false;
  const conClave = usuario.user_metadata?.tiene_clave === true;
  const demostroLaClave = usuario.email ? await tienePase(PASE_CLAVE, usuario.email) : false;
  await quitarPase(PASE_CLAVE);
  if (!conClave || demostroLaClave) return false;
  await darPase(PASE_RECUPERACION, usuario.id);
  return true;
}
