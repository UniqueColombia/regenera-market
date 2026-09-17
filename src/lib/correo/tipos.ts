/**
 * Correo transaccional: la capacidad, no el proveedor.
 *
 * Mismo patrón que `src/lib/payments.ts` y por la misma razón (skill
 * `nueva-integracion`): el resto del código nunca sabe si detrás hay Gmail,
 * Resend o un relay del cliente. La interfaz habla de «mandar un mensaje», no
 * de SMTP — si algún día se cambia a una API HTTP, se agrega una
 * implementación y nadie más se entera.
 *
 * **Qué NO va aquí: los correos de acceso.** Esos los manda Supabase con sus
 * propias plantillas, configuradas en el panel y copiadas en
 * `plantillas-correo/`. Este módulo es para lo que manda la aplicación: el
 * respaldo de una postulación, y mañana el aviso de una orden.
 */

export interface Mensaje {
  /** Una sola dirección. Nada de listas: esto no es un boletín. */
  para: string;
  asunto: string;
  html: string;
  /**
   * Versión en texto plano.
   *
   * No es opcional por accidente: un correo solo-HTML puntúa peor en los
   * filtros de spam, y hay clientes (y relojes, y lectores de pantalla en modo
   * texto) que solo leen esto.
   */
  texto: string;
  /** A dónde contesta quien le dé a «Responder». */
  responderA?: string;
}

export interface ResultadoEnvio {
  ok: boolean;
  /** Cómo se mandó: "smtp", "consola". Para el registro, no para decidir. */
  via: string;
  /** Qué falló, cuando falló. Nunca el cuerpo del mensaje: lleva datos personales. */
  error?: string;
}

export interface EnviadorCorreo {
  readonly nombre: string;
  /**
   * Manda el mensaje.
   *
   * **No lanza nunca.** Devuelve `ok: false` y ya. Es deliberado: quien lo llama
   * acaba de guardar una postulación o una orden en la base, y que el correo de
   * cortesía falle no puede deshacer eso ni devolverle un error a la persona por
   * algo que ya salió bien. Es la regla de «falla de un servicio externo ≠ error
   * 500 de nuestra app» de la skill `nueva-integracion`.
   */
  enviar(mensaje: Mensaje): Promise<ResultadoEnvio>;
}
