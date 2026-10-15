import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { CONTACTO } from "./legal";
import type { Order } from "./types";

/**
 * Capa de pagos.
 *
 * La aplicación nunca habla directo con una pasarela (invariante 8): pide un
 * intento de pago a este módulo y recibe qué mostrar. Ninguna página sabe si
 * detrás está BOLD, otra pasarela o nada.
 *
 * ## Las tres formas de pagar
 *
 * - **En línea** (tarjeta, PSE, Nequi…), con la pasarela que esté configurada.
 *   Desde el 2026-10-14 es BOLD, y **se enciende sola** cuando estén
 *   `BOLD_LLAVE_IDENTIDAD` y `BOLD_LLAVE_SECRETA` en el entorno (pendiente con
 *   Ivan: las da el panel de BOLD al abrir la cuenta de comercio).
 * - **Llave Bre-B**: el pago inmediato entre bancos del Banco de la República.
 *   Quien compra elige «pagar con llave» en la app de su banco y escribe la
 *   nuestra; llega al instante y a cualquier banco.
 * - **Transferencia** a la cuenta de la sociedad.
 *
 * Las dos últimas las confirma una persona del equipo desde `/admin/ordenes`.
 * Sus datos salen del entorno (`PAGO_*`) y no del código: el repositorio es
 * público, y una cuenta bancaria publicada en GitHub es la materia prima de una
 * página de pago falsa. Sin ellos, el pedido dice a quién escribir para
 * recibirlos.
 *
 * `process.env` se lee solo aquí (skill `nueva-integracion`).
 */

/** Un botón de pago de una pasarela: la librería que lo pinta y sus atributos. */
export interface BotonDePago {
  script: string;
  atributos: Record<string, string>;
}

export interface DatoDePago {
  etiqueta: string;
  valor: string;
  /** Lo que se copia al portapapeles, si difiere de lo que se lee. */
  copiar?: string;
}

export interface PaymentIntent {
  /** "bold" si se puede pagar en línea; "manual" si no. */
  provider: string;
  reference: string;
  /** Pagar en línea. Ausente sin pasarela configurada, o por debajo de su mínimo. */
  enLinea?: BotonDePago;
  /** Transferir o pagar con llave. Siempre presente. */
  manual: { datos: DatoDePago[]; pasos: string[] };
}

/** Cómo va un pago según la pasarela. */
export type EstadoDePago = "aprobado" | "pendiente" | "rechazado" | "anulado" | "sin-intento" | "desconocido";

export interface ConsultaDePago {
  estado: EstadoDePago;
  transaccion?: string;
  montoCop?: number;
  metodo?: string;
}

/** Una notificación de la pasarela (webhook), ya con la firma comprobada. */
export interface NotificacionDePago {
  evento: "aprobado" | "rechazado" | "anulado" | "otro";
  referencia: string;
  transaccion: string;
  montoCop: number;
  metodo?: string;
}

export interface PaymentGateway {
  readonly name: string;
  createIntent(order: Order): Promise<PaymentIntent>;
  /** Le pregunta a la pasarela por el pago de una orden. */
  consultar(referencia: string): Promise<ConsultaDePago>;
  /**
   * Lee una notificación. **Devuelve `null` si la firma no es válida**: un
   * webhook sin verificar es un botón de «marcar como pagado» abierto a
   * internet (invariante 9).
   */
  leerNotificacion(cuerpo: string, cabeceras: Headers): NotificacionDePago | null;
}

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

function sitio(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Transferencia y llave: lo que se le muestra a quien paga sin pasarela. */
function pagoManual(order: Order): PaymentIntent["manual"] {
  const banco = process.env.PAGO_BANCO?.trim();
  const tipo = process.env.PAGO_TIPO_CUENTA?.trim();
  const numero = process.env.PAGO_NUMERO_CUENTA?.trim();
  const titular = process.env.PAGO_TITULAR?.trim() || CONTACTO.razonSocial;
  const nit = process.env.PAGO_NIT?.trim();
  const llave = process.env.PAGO_LLAVE_BREB?.trim();
  const correo = process.env.PAGO_CORREO_COMPROBANTES?.trim() || CONTACTO.correo;

  const datos: DatoDePago[] = [
    { etiqueta: "Valor", valor: COP.format(order.totalCop), copiar: String(order.totalCop) },
    { etiqueta: "Referencia", valor: order.reference },
  ];
  if (llave) datos.push({ etiqueta: "Llave Bre-B", valor: llave });
  if (numero) {
    datos.push({ etiqueta: "Cuenta", valor: [banco, tipo, numero].filter(Boolean).join(" · "), copiar: numero });
    datos.push({ etiqueta: "Titular", valor: nit ? `${titular} · NIT ${nit}` : titular });
  }

  const pasos: string[] = [];
  if (llave) {
    pasos.push(
      "En la app de tu banco elige «pagar con llave» (Bre-B), escribe la llave de arriba y el valor exacto. Llega al instante, desde cualquier banco.",
    );
  }
  if (numero) pasos.push(llave ? "O transfiere a la cuenta de arriba." : "Transfiere el valor exacto a la cuenta de arriba.");
  if (!llave && !numero) {
    pasos.push(`Escríbenos a ${correo} y te mandamos los datos para transferir.`);
  }
  pasos.push(`Pon la referencia ${order.reference} en la descripción del pago.`);
  pasos.push(`Mándanos el comprobante a ${correo}: confirmamos tu pedido el mismo día hábil.`);
  return { datos, pasos };
}

/** Sin pasarela: transferencia o llave, confirmadas por el equipo. */
class ManualGateway implements PaymentGateway {
  readonly name = "manual";

  async createIntent(order: Order): Promise<PaymentIntent> {
    return { provider: this.name, reference: order.reference, manual: pagoManual(order) };
  }

  async consultar(): Promise<ConsultaDePago> {
    return { estado: "desconocido" };
  }

  leerNotificacion(): NotificacionDePago | null {
    return null;
  }
}

/**
 * BOLD (bold.co), con su botón de pagos.
 *
 * Verificado contra su documentación el 2026-10-14
 * (developers.bold.co → Botón de pagos, Consulta de transacciones, Webhook):
 *
 * - **Firma de integridad**: SHA-256 en hexadecimal de
 *   `{referencia}{monto}{divisa}{llave secreta}`, sin separadores. Se calcula
 *   aquí, en el servidor: la llave secreta nunca viaja al navegador. Sin firma
 *   correcta BOLD rechaza el cobro, así que nadie puede cambiar el monto del
 *   botón en el navegador y pagar menos.
 * - **Consulta**: `GET https://payments.api.bold.co/v2/payment-voucher/{referencia}`
 *   con `Authorization: x-api-key {llave de identidad}`.
 * - **Webhook**: cabecera `x-bold-signature` = HMAC-SHA256 en hexadecimal,
 *   con la llave secreta, **del cuerpo codificado en Base64** (no del JSON
 *   crudo). En modo de pruebas la llave es la cadena vacía.
 * - El monto mínimo es de 1.000 COP; por debajo, solo pago manual.
 */
const BOLD_SCRIPT = "https://checkout.bold.co/library/boldPaymentButton.js";
const BOLD_MINIMO_COP = 1000;

class BoldGateway implements PaymentGateway {
  readonly name = "bold";

  constructor(
    private readonly llaveIdentidad: string,
    private readonly llaveSecreta: string,
    private readonly pruebas: boolean,
  ) {}

  async createIntent(order: Order): Promise<PaymentIntent> {
    const manual = pagoManual(order);
    if (order.totalCop < BOLD_MINIMO_COP) return { provider: "manual", reference: order.reference, manual };

    const firma = createHash("sha256")
      .update(`${order.reference}${order.totalCop}COP${this.llaveSecreta}`, "utf8")
      .digest("hex");

    return {
      provider: this.name,
      reference: order.reference,
      manual,
      enLinea: {
        script: BOLD_SCRIPT,
        atributos: {
          "data-bold-button": "dark-L",
          "data-api-key": this.llaveIdentidad,
          "data-order-id": order.reference,
          "data-currency": "COP",
          "data-amount": String(order.totalCop),
          "data-integrity-signature": firma,
          "data-description": `Pedido ${order.reference} en Seregenera`,
          // De vuelta al pedido, que pregunta a BOLD cómo quedó (ver
          // `confirmarDesdeLaPasarela`). Lo que BOLD pega en la URL no se cree.
          "data-redirection-url": `${sitio()}/orden/${order.reference}`,
          "data-origin-url": `${sitio()}/orden/${order.reference}`,
          // En un recuadro sobre el sitio, en vez de llevarse a la persona a
          // otra página: termina de pagar sin perder su pedido de vista.
          "data-render-mode": "embedded",
          "data-customer-data": JSON.stringify({ email: order.buyerEmail, fullName: order.buyerName }),
        },
      },
    };
  }

  async consultar(referencia: string): Promise<ConsultaDePago> {
    try {
      const r = await fetch(`https://payments.api.bold.co/v2/payment-voucher/${encodeURIComponent(referencia)}`, {
        headers: { Authorization: `x-api-key ${this.llaveIdentidad}` },
        signal: AbortSignal.timeout(6000),
        cache: "no-store",
      });
      if (!r.ok) {
        console.error(`[bold] consulta ${referencia}: HTTP ${r.status}`);
        return { estado: "desconocido" };
      }
      // No se registra el cuerpo: trae el correo de quien pagó.
      const d = (await r.json()) as {
        payment_status?: string;
        transaction_id?: string;
        total?: number;
        payment_method?: string;
      };
      const estado: Record<string, EstadoDePago> = {
        APPROVED: "aprobado",
        PROCESSING: "pendiente",
        PENDING: "pendiente",
        REJECTED: "rechazado",
        FAILED: "rechazado",
        VOIDED: "anulado",
        NO_TRANSACTION_FOUND: "sin-intento",
      };
      return {
        estado: estado[d.payment_status ?? ""] ?? "desconocido",
        transaccion: d.transaction_id,
        montoCop: typeof d.total === "number" ? Math.round(d.total) : undefined,
        metodo: d.payment_method,
      };
    } catch (e) {
      console.error(`[bold] consulta ${referencia}: ${e instanceof Error ? e.message : String(e)}`);
      return { estado: "desconocido" };
    }
  }

  leerNotificacion(cuerpo: string, cabeceras: Headers): NotificacionDePago | null {
    const recibida = cabeceras.get("x-bold-signature") ?? "";
    const clave = this.pruebas ? "" : this.llaveSecreta;
    const esperada = createHmac("sha256", clave)
      .update(Buffer.from(cuerpo, "utf8").toString("base64"))
      .digest("hex");
    const a = Buffer.from(recibida, "utf8");
    const b = Buffer.from(esperada, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    try {
      const n = JSON.parse(cuerpo) as {
        type?: string;
        subject?: string;
        data?: {
          payment_id?: string;
          payment_method?: string;
          amount?: { total?: number };
          metadata?: { reference?: string };
        };
      };
      const evento =
        n.type === "SALE_APPROVED"
          ? "aprobado"
          : n.type === "SALE_REJECTED"
            ? "rechazado"
            : n.type === "VOID_APPROVED"
              ? "anulado"
              : "otro";
      const referencia = n.data?.metadata?.reference;
      const transaccion = n.data?.payment_id ?? n.subject;
      if (!referencia || !transaccion) return null;
      return {
        evento,
        referencia,
        transaccion,
        montoCop: Math.round(n.data?.amount?.total ?? 0),
        metodo: n.data?.payment_method,
      };
    } catch {
      return null;
    }
  }
}

/**
 * La pasarela activa: BOLD si están sus dos llaves, si no, la manual.
 *
 * `BOLD_MODO_PRUEBAS=1` solo cambia cómo se verifica el webhook (con la llave
 * vacía, como manda BOLD en pruebas). **Nunca en Production**: con la llave
 * vacía, cualquiera puede firmar una notificación. Por eso se ignora si
 * `VERCEL_ENV` dice `production`.
 */
export function getGateway(): PaymentGateway {
  const identidad = process.env.BOLD_LLAVE_IDENTIDAD?.trim();
  const secreta = process.env.BOLD_LLAVE_SECRETA?.trim();
  if (identidad && secreta) {
    const pruebas = process.env.BOLD_MODO_PRUEBAS === "1" && process.env.VERCEL_ENV !== "production";
    return new BoldGateway(identidad, secreta, pruebas);
  }
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
