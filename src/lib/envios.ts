import type { EnvioEstado, EnvioOferta, OrderStatus } from "./types";

/**
 * Lo que comparten la ficha, la cesta, el pedido y el panel del vendedor sobre
 * cómo llega un producto. Módulo neutral —sin `"use server"` ni acceso a datos—
 * para que lo puedan importar también los componentes de cliente.
 *
 * ## Quién despacha
 *
 * Lo decide quien vende, al publicar el producto (decisión del 2026-10-09): o lo
 * lleva él mismo, o lo manda por una transportadora que él elige. Seregenera no
 * despacha nada; cobra el envío que el vendedor declaró y se lo pasa entero
 * (sin comisión), y le da al comprador la guía para seguirlo.
 *
 * Aveonline es la primera de la lista porque es con la que hay conversación
 * para un convenio. Si ese convenio trae API de cotización y de guías, entra
 * detrás de una interfaz —skill `nueva-integracion`— y reemplaza la tarifa fija
 * por una cotización según el destino; nada de aquí cambia de forma.
 */

/** Sugerencias para el campo «transportadora». El vendedor puede escribir otra. */
export const TRANSPORTADORAS = [
  "Aveonline",
  "Servientrega",
  "Coordinadora",
  "Interrapidísimo",
  "Envía",
  "TCC",
  "Deprisa",
  "4-72",
] as const;

export const ETIQUETA_DESPACHO = {
  vendedor: "Lo lleva el vendedor",
  transportadora: "Por transportadora",
} as const;

export const ETIQUETA_ENVIO: Record<EnvioEstado, string> = {
  pendiente: "Por despachar",
  despachado: "En camino",
  entregado: "Entregado",
};

export const COLOR_ENVIO: Record<EnvioEstado, string> = {
  pendiente: "bg-clay-100 text-clay-700 ring-clay-300/60",
  despachado: "bg-brand-50 text-brand-700 ring-brand-200",
  entregado: "bg-sand text-muted ring-hairline",
};

/** «entre 2 y 5 días hábiles», «en 3 días hábiles». `undefined` si no lo declaró. */
export function plazoDeEntrega(min?: number, max?: number): string | undefined {
  if (max === undefined) return undefined;
  const dias = (n: number) => (n === 1 ? "día hábil" : "días hábiles");
  if (min === undefined || min === max) return `en ${max} ${dias(max)}`;
  return `entre ${min} y ${max} ${dias(max)}`;
}

/** Lo que cuesta el envío, en palabras: «Envío gratis» o el monto. */
export function textoCostoEnvio(envio: EnvioOferta | undefined, money: (n: number) => string): string {
  if (envio?.costoCop === undefined) return "Envío a coordinar con el vendedor";
  return envio.costoCop === 0 ? "Envío gratis" : `Envío ${money(envio.costoCop)}`;
}

/**
 * Lo que se cobra por enviar una línea de la cesta, en palabras. A diferencia de
 * `textoCostoEnvio()`, que dice la tarifa declarada, esta dice el monto ya
 * calculado para esas unidades y ese destino (`envioDeLinea()`).
 */
export function textoEnvioDeLinea(
  envio: EnvioOferta | undefined,
  envioCop: number,
  money: (n: number) => string,
): string {
  if (envio?.costoCop === undefined && envio?.costoLocalCop === undefined) {
    return "Envío a coordinar con el vendedor";
  }
  return envioCop === 0 ? "Envío gratis" : `Envío ${money(envioCop)}`;
}

/**
 * ¿Son el mismo departamento? Sin tildes, sin mayúsculas y sin espacios de los
 * bordes, como `sin_tildes(trim(…))` en `envio_de_linea()` de la 0017.
 */
export function mismoDepartamento(a: string | undefined, b: string | undefined): boolean {
  const limpio = (s: string) =>
    s.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  if (!a?.trim() || !b?.trim()) return false;
  return limpio(a) === limpio(b);
}

/**
 * Lo que cuesta enviar una línea, desde la 0017.
 *
 * **Gemela de `envio_de_linea()` en la migración 0017**, que es la que cobra.
 * Esta pinta la cesta antes de cobrar; si divergen, lo que la persona ve no es
 * lo que se le cobra (`checkout()` lo deja en el registro). La compara
 * `supabase/pruebas/gemelos.test.ts`.
 *
 * - La base es la tarifa local si el destino es el departamento de donde sale
 *   el producto y la hay; si no, la nacional (`costoCop`).
 * - Cada unidad después de la primera suma `adicionalCop`.
 * - Sin tarifa declarada, cero: «a coordinar con el vendedor», como antes.
 *
 * Sin destino todavía (la cesta antes de elegir departamento) se cobra la
 * nacional: es la cifra que nunca sube al elegirlo.
 */
export function envioDeLinea(
  envio: EnvioOferta | undefined,
  origen: string | undefined,
  qty: number,
  destino?: string,
): number {
  const base =
    envio?.costoLocalCop !== undefined && mismoDepartamento(origen, destino)
      ? envio.costoLocalCop
      : envio?.costoCop;
  if (base === undefined) return 0;
  return base + (envio?.adicionalCop ?? 0) * Math.max(qty - 1, 0);
}

/**
 * Las condiciones del envío que no caben en «Envío $X», para la ficha:
 * «$6.000 dentro de Magdalena», «+$2.000 por cada unidad adicional».
 */
export function condicionesDeEnvio(
  envio: EnvioOferta | undefined,
  origen: string | undefined,
  money: (n: number) => string,
): string[] {
  if (envio?.costoCop === undefined) return [];
  const condiciones: string[] = [];
  if (envio.costoLocalCop !== undefined && origen) {
    condiciones.push(
      envio.costoLocalCop === 0
        ? `Gratis dentro de ${origen}; ${envio.costoCop === 0 ? "gratis" : money(envio.costoCop)} al resto del país`
        : `${money(envio.costoLocalCop)} dentro de ${origen}; ${envio.costoCop === 0 ? "gratis" : money(envio.costoCop)} al resto del país`,
    );
  }
  if (envio.adicionalCop) {
    condiciones.push(`${money(envio.adicionalCop)} más por cada unidad adicional`);
  }
  return condiciones;
}

/**
 * ¿Puede quien compró reseñar este ítem ya?
 *
 * **Gemela de `puede_resenar()` en la migración 0014.** La base es la que
 * decide; esta solo evita enseñar un formulario que la base va a rechazar. Si
 * cambia una, cambia la otra.
 *
 * - Un producto físico, cuando está entregado.
 * - Lo demás (experiencia, servicio, ítem anterior a la 0014), cuando el pedido
 *   está cumplido o, si tiene fecha, cuando la fecha ya pasó.
 */
export function puedeResenar(
  estadoOrden: OrderStatus,
  envioEstado: EnvioEstado | undefined,
  fecha: string | undefined,
  hoy: string,
): boolean {
  if (!["paid", "in_progress", "fulfilled"].includes(estadoOrden)) return false;
  if (envioEstado === "entregado") return true;
  if (envioEstado !== undefined) return false;
  return estadoOrden === "fulfilled" || (fecha !== undefined && fecha <= hoy);
}

/** Hoy en Colombia, como AAAA-MM-DD. La base compara contra la misma zona. */
export function hoyEnBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}
