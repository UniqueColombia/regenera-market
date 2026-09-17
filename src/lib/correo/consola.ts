import type { EnviadorCorreo, Mensaje, ResultadoEnvio } from "./tipos";

/**
 * El enviador de respaldo: escribe en la consola del servidor y devuelve `ok`.
 *
 * **Es lo que mantiene viva la propiedad de `docs/DEPLOY.md`**: `npm run dev`
 * con `.env.local` vacío levanta una aplicación navegable, y ahora también una
 * en la que se puede mandar el formulario de `/vender` de punta a punta. Sin
 * esto, quien clone el repositorio vería fallar la postulación por no tener
 * credenciales de un servicio que no le hacen falta para trabajar.
 *
 * Que devuelva `ok: true` es deliberado y conviene entender por qué: quien llama
 * usa el resultado para decidir **qué decirle a la persona en pantalla**, no
 * para decidir si guardó la postulación. En desarrollo, «te mandamos un correo»
 * es la respuesta correcta — el correo está ahí, en la terminal.
 *
 * En producción esto no debería aparecer nunca. Si aparece, es que faltan las
 * variables de SMTP, y el mensaje de abajo lo dice con esas palabras para que no
 * haya que adivinarlo leyendo código.
 */
export class EnviadorConsola implements EnviadorCorreo {
  readonly nombre = "consola";

  async enviar(mensaje: Mensaje): Promise<ResultadoEnvio> {
    console.info(
      [
        "",
        "─".repeat(72),
        "[correo] SIN SMTP CONFIGURADO — el mensaje no salió a ninguna parte.",
        "         Llena SMTP_HOST, SMTP_USER y SMTP_PASSWORD en .env.local.",
        "─".repeat(72),
        `Para:   ${mensaje.para}`,
        `Asunto: ${mensaje.asunto}`,
        "",
        mensaje.texto,
        "─".repeat(72),
        "",
      ].join("\n"),
    );
    return { ok: true, via: this.nombre };
  }
}
