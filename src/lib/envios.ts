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
