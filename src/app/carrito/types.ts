import type { EnvioOferta, ImpactMetrics, ListingKind } from "@/lib/types";

export type { CartLine } from "@/lib/types";

/**
 * Forma en que el servidor le devuelve el carrito ya valorizado al cliente.
 * Es deliberadamente plana: solo lo que la vista necesita pintar.
 */
export interface PricedCartLineDTO {
  listingId: string;
  slug: string;
  title: string;
  category: string;
  kind: ListingKind;
  unit: string;
  images: string[];
  providerId: string;
  quoteOnly: boolean;
  qty: number;
  date?: string;
  unitPriceCop: number;
  wholesaleApplied: boolean;
  subtotalCop: number;
  /** Desde la 0014. El envío de esta línea, una vez por línea. */
  envioCop: number;
  /** Cómo llega, para decirlo en la cesta: «Envío gratis · de 2 a 5 días hábiles». */
  envio?: EnvioOferta;
}

export interface PricedCartDTO {
  lines: PricedCartLineDTO[];
  subtotalCop: number;
  envioTotalCop: number;
  totalCop: number;
  commissionTotalCop: number;
  impact: ImpactMetrics;
  providerCount: number;
  /**
   * ¿Hay productos físicos y la 0014 está aplicada? Entonces el formulario
   * pide a dónde mandarlos. Sin la 0014 no se pide: la `crear_orden()` vieja
   * no sabría qué hacer con el destino.
   */
  pideDestino: boolean;
  /**
   * Líneas que el catálogo ya no puede valorizar, para que el cliente las
   * descarte. Llevan la **identidad completa** y no solo el identificador: una
   * experiencia en dos fechas son dos líneas distintas, y quitar por id a secas
   * no empareja con ninguna de las dos.
   */
  dropped: Array<{ listingId: string; date?: string }>;
}
