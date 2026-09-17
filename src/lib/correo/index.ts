import { EnviadorConsola } from "./consola";
import { EnviadorSmtp, leerConfigSmtp } from "./smtp";
import type { EnviadorCorreo, Mensaje, ResultadoEnvio } from "./tipos";

export type { EnviadorCorreo, Mensaje, ResultadoEnvio } from "./tipos";

/**
 * **Solo se importa desde el servidor.** Arrastra `nodemailer`, que usa módulos
 * de Node (`net`, `tls`, `dns`). Un `"use client"` que lo importe rompe la
 * compilación con un error que habla de `fs` y no de esto.
 *
 * El único selector. Un solo lugar decide qué enviador se usa, y degrada solo si
 * falta la credencial — nunca lanza al importarse, que tumbaría el build en un
 * entorno donde el correo no aplica (skill `nueva-integracion`).
 */
export function getEnviadorCorreo(): EnviadorCorreo {
  const config = leerConfigSmtp();
  if (config) return new EnviadorSmtp(config);
  return new EnviadorConsola();
}

/**
 * Manda un correo sin que quien llama tenga que pensar en el enviador.
 *
 * **Con tiempo máximo.** Un `sendMail` contra un servidor que no responde se
 * queda colgado, y con él la petición de la persona que acaba de darle a
 * «Enviar postulación»: vería la rueda girando hasta que Vercel corte la función
 * a los cinco minutos. Diez segundos es de sobra para un SMTP sano y poco para
 * que se note.
 *
 * Al agotarse el plazo se devuelve `ok: false` y **el envío sigue su curso en
 * segundo plano**: no se puede cancelar una conexión SMTP a medias sin dejar el
 * transporte sucio. O sea que el correo puede acabar llegando aunque aquí
 * digamos que no. Es el lado correcto en el que equivocarse — mejor un correo
 * duplicado que una postulación que parece perdida.
 */
export async function enviarCorreo(mensaje: Mensaje): Promise<ResultadoEnvio> {
  const enviador = getEnviadorCorreo();

  const plazo = new Promise<ResultadoEnvio>((resolve) =>
    setTimeout(
      () => resolve({ ok: false, via: enviador.nombre, error: "tiempo-agotado" }),
      10_000,
    ),
  );

  return Promise.race([enviador.enviar(mensaje), plazo]);
}
