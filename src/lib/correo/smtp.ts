import nodemailer, { type Transporter } from "nodemailer";
import type { EnviadorCorreo, Mensaje, ResultadoEnvio } from "./tipos";

/**
 * Envío por SMTP.
 *
 * Reusa las mismas credenciales que ya tiene configuradas Supabase para los
 * correos de acceso (Authentication → SMTP Settings). No hace falta abrir cuenta
 * en ningún servicio nuevo: si el acceso funciona, esto funciona.
 *
 * **El remitente tiene que ser la cuenta que autentica.** Gmail reescribe o
 * rechaza un `From` que no sea suyo ni un alias verificado; el síntoma es un
 * correo que sale «de» otra dirección, o un rechazo con un código que no dice
 * eso. Está anotado igual en `docs/ESTADO.md`.
 *
 * **Techo de envío.** Una cuenta de Gmail personal manda ~500 al día; una de
 * Google Workspace, ~2.000. Ese techo es la razón por la que este módulo existe
 * detrás de una interfaz: el día que se pase, se escribe otra implementación
 * contra una API de correo y se cambia una línea en `index.ts`.
 */

/**
 * El transporte se guarda entre peticiones a propósito.
 *
 * Nodemailer con `pool: true` mantiene abiertas unas pocas conexiones y las
 * reusa. Crear uno por correo significa un saludo TLS completo cada vez —
 * medio segundo largo contra Gmail— y, peor, Gmail empieza a cortar conexiones
 * cuando ve muchas seguidas desde el mismo sitio.
 *
 * En Vercel, cada instancia de función tiene el suyo y se cierra sola cuando la
 * instancia se recicla. No hay estado compartido entre usuarios aquí: es una
 * conexión, no una sesión.
 */
let transporte: Transporter | null = null;

interface ConfigSmtp {
  host: string;
  port: number;
  user: string;
  pass: string;
  remitente: string;
}

/**
 * Lee la configuración, o `null` si está incompleta.
 *
 * `process.env` se lee **solo aquí**. Ningún otro archivo del proyecto toca una
 * variable de correo: si una página necesita saber si hay envío configurado,
 * pregunta por `getEnviadorCorreo().nombre`.
 */
export function leerConfigSmtp(): ConfigSmtp | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) return null;

  return {
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    user,
    pass,
    // Sin `SMTP_REMITENTE`, el remitente es la propia cuenta. Es lo correcto:
    // ver arriba por qué inventarse otro `From` no funciona.
    remitente: process.env.SMTP_REMITENTE || `Seregenera <${user}>`,
  };
}

export class EnviadorSmtp implements EnviadorCorreo {
  readonly nombre = "smtp";

  constructor(private readonly config: ConfigSmtp) {}

  private transporte(): Transporter {
    if (transporte) return transporte;
    transporte = nodemailer.createTransport({
      host: this.config.host,
      port: this.config.port,
      // 465 es TLS desde el saludo; 587 arranca en claro y sube con STARTTLS.
      // Nodemailer hace STARTTLS solo cuando `secure` es false, así que atar
      // esto al puerto evita la combinación que falla sin decir por qué.
      secure: this.config.port === 465,
      auth: { user: this.config.user, pass: this.config.pass },
      pool: true,
      maxConnections: 2,
    });
    return transporte;
  }

  async enviar(mensaje: Mensaje): Promise<ResultadoEnvio> {
    try {
      await this.transporte().sendMail({
        from: this.config.remitente,
        to: mensaje.para,
        replyTo: mensaje.responderA,
        subject: mensaje.asunto,
        text: mensaje.texto,
        html: mensaje.html,
      });
      return { ok: true, via: this.nombre };
    } catch (e) {
      // Se registra el motivo y **nunca el mensaje**: lleva el nombre, el correo
      // y el teléfono de una persona, y los registros de Vercel los lee más
      // gente y viven más tiempo que la postulación.
      const error = e instanceof Error ? e.message : String(e);
      console.error(`[correo] envío fallido a ${enmascarar(mensaje.para)}: ${error}`);
      return { ok: false, via: this.nombre, error };
    }
  }
}

/** `alguien@dominio.com` → `al***@dominio.com`. Para poder buscar en el registro sin publicar la dirección. */
function enmascarar(correo: string): string {
  const [usuario, dominio] = correo.split("@");
  if (!dominio) return "***";
  return `${usuario.slice(0, 2)}***@${dominio}`;
}
