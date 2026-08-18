import type { Order } from "./types";

/**
 * Almacén de órdenes en memoria.
 *
 * PROVISIONAL: vive en el proceso del servidor y se pierde al reiniciar. Existe
 * para que el flujo de compra se pueda recorrer completo sin base de datos.
 * Se reemplaza por las tablas `orders` y `order_items`
 * (supabase/migrations/0001_init.sql) en cuanto exista el proyecto de Supabase.
 */
const orders = new Map<string, Order>();

export async function saveOrder(order: Order): Promise<void> {
  orders.set(order.reference, order);
}

export async function getOrderByReference(
  reference: string,
): Promise<Order | undefined> {
  return orders.get(reference);
}

export async function listOrders(): Promise<Order[]> {
  return [...orders.values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}
