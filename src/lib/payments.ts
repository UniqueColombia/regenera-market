import type { Order } from "./types";

/**
 * Capa de pagos.
 *
 * La aplicación nunca habla directo con una pasarela: pide un intento de pago a
 * este módulo y recibe una instrucción de qué hacer. Hoy solo existe el modo
 * manual (transferencia o PSE por fuera de la plataforma), suficiente para
 * operar las primeras órdenes mientras se abre la cuenta de comercio.
 *
 * Cuando existan credenciales de Wompi, se implementa `WompiGateway` con la
 * misma interfaz y se cambia una línea en `getGateway()`. Ninguna página cambia.
 */

export interface PaymentIntent {
  /** "manual" mientras no haya pasarela; luego "wompi" */
  provider: string;
  /** A dónde mandar al comprador. Vacío en modo manual. */
  redirectUrl?: string;
  /** Instrucciones a mostrar en pantalla cuando no hay redirección */
  instructions?: string[];
  reference: string;
}

export interface PaymentGateway {
  readonly name: string;
  createIntent(order: Order): Promise<PaymentIntent>;
}

/**
 * Modo manual: se registra la orden y se le dice al comprador cómo pagar.
 * La confirmación la hace un humano desde el panel de administración.
 */
class ManualGateway implements PaymentGateway {
  readonly name = "manual";

  async createIntent(order: Order): Promise<PaymentIntent> {
    return {
      provider: this.name,
      reference: order.reference,
      instructions: [
        `Transfiere ${new Intl.NumberFormat("es-CO", {
          style: "currency",
          currency: "COP",
          maximumFractionDigits: 0,
        }).format(order.totalCop)} a la cuenta de ahorros Bancolombia de Dimension Natural SAS.`,
        `Usa la referencia ${order.reference} en la descripción de la transferencia.`,
        "Envíanos el comprobante a dimensionnaturalsas@gmail.com y confirmamos tu orden el mismo día hábil.",
      ],
    };
  }
}

/**
 * Devuelve la pasarela activa.
 *
 * En cuanto se configure `WOMPI_PUBLIC_KEY` y `WOMPI_PRIVATE_KEY`, aquí se
 * retorna la implementación de Wompi. Se deja explícito para que quede claro
 * qué falta y dónde va.
 */
export function getGateway(): PaymentGateway {
  return new ManualGateway();
}

/** Referencia legible y única por orden: SR-260817-4F2A */
export function generateReference(): string {
  const now = new Date();
  const stamp = [
    String(now.getFullYear()).slice(2),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SR-${stamp}-${rand}`;
}
