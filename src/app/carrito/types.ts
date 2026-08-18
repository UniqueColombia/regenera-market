import type { ImpactMetrics, ListingKind } from "@/lib/types";

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
}

export interface PricedCartDTO {
  lines: PricedCartLineDTO[];
  subtotalCop: number;
  totalCop: number;
  commissionTotalCop: number;
  impact: ImpactMetrics;
  providerCount: number;
  droppedIds: string[];
}
