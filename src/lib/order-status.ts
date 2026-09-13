import type { OrderStatus } from "./types";

/**
 * Cómo se mueve una orden, y cómo se llama cada estado en pantalla.
 *
 * Está en `src/lib/` y no junto a la acción del panel por una restricción real:
 * **un archivo `"use server"` solo puede exportar funciones asíncronas.** Una
 * constante exportada desde ahí rompe la compilación. Y como estas dos tablas
 * las necesitan tanto la Server Action (para validar) como el componente de
 * cliente (para pintar los botones), tienen que vivir en un módulo neutral.
 *
 * Que la tabla de transiciones sea la misma en los dos lados no es comodidad: si
 * el cliente ofreciera un salto que el servidor rechaza, el botón existiría solo
 * para dar un error.
 */

/**
 * A dónde puede ir una orden desde donde está.
 *
 * No es burocracia: el estado de una orden es lo que va a cuadrar el dinero.
 * Permitir cualquier salto deja marcar como «entregada» algo que nunca se pagó,
 * y el descuadre aparece semanas después sin rastro de quién lo hizo.
 *
 * `refunded` solo sale de una orden cobrada: no se devuelve lo que no se cobró.
 */
export const TRANSICIONES: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ["paid", "cancelled"],
  paid: ["in_progress", "fulfilled", "refunded"],
  in_progress: ["fulfilled", "refunded"],
  fulfilled: ["refunded"],
  cancelled: ["pending_payment"],
  refunded: [],
};

export const ETIQUETA_ESTADO: Record<OrderStatus, string> = {
  pending_payment: "Esperando pago",
  paid: "Pagada",
  in_progress: "En preparación",
  fulfilled: "Entregada",
  cancelled: "Cancelada",
  refunded: "Devuelta",
};

export const COLOR_ESTADO: Record<OrderStatus, string> = {
  pending_payment: "bg-clay-100 text-clay-700 ring-clay-300/60",
  paid: "bg-brand-50 text-brand-700 ring-brand-200",
  in_progress: "bg-brand-50 text-brand-700 ring-brand-200",
  fulfilled: "bg-sand text-muted ring-hairline",
  cancelled: "bg-red-50 text-red-700 ring-red-200",
  refunded: "bg-red-50 text-red-700 ring-red-200",
};
