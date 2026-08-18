import type { CartLine, ImpactMetrics, Listing } from "./types";

/**
 * Comisión de la plataforma.
 *
 * Se calcula sobre el precio efectivo de cada ítem y se guarda por ítem, no
 * sobre el total: una orden puede repartirse entre varios proveedores y cada
 * uno tiene que poder auditar exactamente lo que se le descontó.
 *
 * 12% es el punto de partida; cuando existan datos de conversión conviene
 * diferenciarla por tipo de oferta (las experiencias soportan más comisión que
 * los productos físicos, que ya cargan con logística).
 */
export const COMMISSION_RATE = 0.12;

export interface PricedLine {
  line: CartLine;
  listing: Listing;
  unitPriceCop: number;
  /** true si la cantidad alcanzó el mínimo mayorista */
  wholesaleApplied: boolean;
  subtotalCop: number;
  commissionCop: number;
  impact: ImpactMetrics;
}

/** Precio unitario efectivo según la cantidad pedida. */
export function unitPriceFor(listing: Listing, qty: number): number {
  if (
    listing.wholesalePriceCop !== undefined &&
    listing.wholesaleMinQty !== undefined &&
    qty >= listing.wholesaleMinQty
  ) {
    return listing.wholesalePriceCop;
  }
  return listing.priceCop;
}

export function priceLine(line: CartLine, listing: Listing): PricedLine {
  const unitPriceCop = unitPriceFor(listing, line.qty);
  const subtotalCop = unitPriceCop * line.qty;

  return {
    line,
    listing,
    unitPriceCop,
    wholesaleApplied: unitPriceCop !== listing.priceCop,
    subtotalCop,
    commissionCop: Math.round(subtotalCop * COMMISSION_RATE),
    impact: {
      co2KgSaved: mul(listing.impact.co2KgSaved, line.qty),
      waterLitersSaved: mul(listing.impact.waterLitersSaved, line.qty),
      wasteKgReduced: mul(listing.impact.wasteKgReduced, line.qty),
    },
  };
}

function mul(v: number | undefined, qty: number): number | undefined {
  return v === undefined ? undefined : Math.round(v * qty * 100) / 100;
}

export interface CartTotals {
  lines: PricedLine[];
  /** Ítems que se compran directo */
  purchasable: PricedLine[];
  /** Ítems que solo se pueden cotizar */
  quotable: PricedLine[];
  subtotalCop: number;
  commissionTotalCop: number;
  totalCop: number;
  impact: ImpactMetrics;
  /** Proveedores distintos involucrados, para explicar el reparto */
  providerCount: number;
}

export function totalsFor(lines: PricedLine[]): CartTotals {
  const purchasable = lines.filter((l) => !l.listing.quoteOnly);
  const quotable = lines.filter((l) => l.listing.quoteOnly);

  const subtotalCop = purchasable.reduce((s, l) => s + l.subtotalCop, 0);
  const commissionTotalCop = purchasable.reduce(
    (s, l) => s + l.commissionCop,
    0,
  );

  const impact: ImpactMetrics = {};
  for (const l of purchasable) {
    if (l.impact.co2KgSaved)
      impact.co2KgSaved = (impact.co2KgSaved ?? 0) + l.impact.co2KgSaved;
    if (l.impact.waterLitersSaved)
      impact.waterLitersSaved =
        (impact.waterLitersSaved ?? 0) + l.impact.waterLitersSaved;
    if (l.impact.wasteKgReduced)
      impact.wasteKgReduced =
        (impact.wasteKgReduced ?? 0) + l.impact.wasteKgReduced;
  }

  return {
    lines,
    purchasable,
    quotable,
    subtotalCop,
    commissionTotalCop,
    // El comprador paga el precio de lista: la comisión sale de lo que recibe el
    // proveedor, no se suma encima. Por eso el total es el subtotal.
    totalCop: subtotalCop,
    impact,
    providerCount: new Set(lines.map((l) => l.listing.providerId)).size,
  };
}
