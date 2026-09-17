import { COMISION_BASE, comisionPara } from "./niveles";
import type { CartLine, ImpactMetrics, Listing, Tier } from "./types";

/**
 * Comisión de la plataforma.
 *
 * Se calcula sobre el precio efectivo de cada ítem y se guarda por ítem, no
 * sobre el total: una orden puede repartirse entre varios proveedores y cada
 * uno tiene que poder auditar exactamente lo que se le descontó.
 *
 * **Ya no es una constante: depende del nivel del proveedor.** 12 % es la tasa
 * de entrada (Semilla), 10 % en Raíz y 8 % en Bosque — la tabla vive en
 * `src/lib/niveles.ts`. Esta constante se queda como la tasa **base**, que es la
 * que se aplica cuando no se sabe de qué nivel es el proveedor.
 *
 * Ante la duda, la tasa alta. Cobrar de menos por un nivel mal leído es plata
 * que se pierde sin que ningún error lo diga; cobrar de más lo reclama el
 * proveedor el mismo día.
 */
export const COMMISSION_RATE = COMISION_BASE;

export interface PricedLine {
  line: CartLine;
  listing: Listing;
  unitPriceCop: number;
  /** true si la cantidad alcanzó el mínimo mayorista */
  wholesaleApplied: boolean;
  subtotalCop: number;
  /**
   * La tasa que se aplicó, no solo el monto.
   *
   * Se guarda porque la tasa cambia con el nivel del proveedor y el nivel sube
   * con el tiempo: sin esto, una orden de hace seis meses sería imposible de
   * auditar — se sabría cuánto se descontó y no si estuvo bien descontado. Es lo
   * que la invariante 2 de `dominio-regenera` anticipaba.
   */
  commissionRate: number;
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

/**
 * Valoriza una línea del carrito.
 *
 * `tierProveedor` es opcional y su ausencia no es un error: significa «no pude
 * averiguar el nivel», y entonces se cobra la tasa base. Quien llama desde el
 * carrito lo resuelve con `getProviderTiers()`.
 */
export function priceLine(
  line: CartLine,
  listing: Listing,
  tierProveedor?: Tier,
): PricedLine {
  const unitPriceCop = unitPriceFor(listing, line.qty);
  const subtotalCop = unitPriceCop * line.qty;
  const commissionRate = comisionPara(tierProveedor);

  return {
    line,
    listing,
    unitPriceCop,
    wholesaleApplied: unitPriceCop !== listing.priceCop,
    subtotalCop,
    commissionRate,
    // Al peso, nunca `toFixed(2)`: todo el dinero del proyecto es entero en COP
    // (invariante 5). Con tasas como 0,085 esto importa más que con 0,12.
    commissionCop: Math.round(subtotalCop * commissionRate),
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
