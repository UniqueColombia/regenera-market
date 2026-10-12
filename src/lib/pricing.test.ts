/**
 * Las reglas de dinero del lado de TypeScript. El lado de SQL, y que los dos
 * den lo mismo, lo prueban `supabase/pruebas/compras.test.ts` y
 * `supabase/pruebas/gemelos.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { priceLine, totalsFor, unitPriceFor } from "./pricing";
import type { Listing } from "./types";

function oferta(o: Partial<Listing> = {}): Listing {
  return {
    id: "o1",
    slug: "o1",
    providerId: "p1",
    kind: "product",
    title: "Jabón",
    summary: "",
    description: "",
    category: "hogar",
    verticals: [],
    images: [],
    priceCop: 20_000,
    unit: "unidad",
    quoteOnly: false,
    impact: {},
    certifications: [],
    status: "approved",
    featured: false,
    createdAt: "2026-10-12",
    ...o,
  } as Listing;
}

describe("unitPriceFor", () => {
  it("el mayorista es un umbral, no un descuento", () => {
    const l = oferta({ priceCop: 10_000, wholesalePriceCop: 8_000, wholesaleMinQty: 10 });
    expect(unitPriceFor(l, 9)).toBe(10_000);
    expect(unitPriceFor(l, 10)).toBe(8_000);
  });

  it("sin cantidad mínima no hay mayorista", () => {
    expect(unitPriceFor(oferta({ wholesalePriceCop: 1 }), 1_000)).toBe(20_000);
  });
});

describe("priceLine", () => {
  it("comisión por ítem según el nivel; sin nivel, la más alta", () => {
    const l = oferta({ priceCop: 100_000 });
    expect(priceLine({ listingId: "o1", qty: 1 }, l).commissionCop).toBe(12_000);
    expect(priceLine({ listingId: "o1", qty: 1 }, l, "unverified").commissionCop).toBe(12_000);
    expect(priceLine({ listingId: "o1", qty: 1 }, l, "raiz").commissionCop).toBe(10_000);
    expect(priceLine({ listingId: "o1", qty: 1 }, l, "bosque").commissionCop).toBe(8_000);
  });

  it("el envío va una vez por línea y solo en productos", () => {
    const envio = { costoCop: 8_000 } as Listing["envio"];
    expect(priceLine({ listingId: "o1", qty: 5 }, oferta({ envio })).envioCop).toBe(8_000);
    expect(priceLine({ listingId: "o1", qty: 5 }, oferta({ kind: "service", envio })).envioCop).toBe(0);
  });

  it("todo el dinero es entero", () => {
    for (const precio of [1, 3, 7, 33, 999, 12_345]) {
      for (const tier of ["semilla", "raiz", "bosque"] as const) {
        const p = priceLine({ listingId: "o1", qty: 3 }, oferta({ priceCop: precio }), tier);
        expect(Number.isInteger(p.commissionCop)).toBe(true);
      }
    }
  });
});

describe("totalsFor", () => {
  it("total = subtotal + envío; la comisión no se le suma al comprador", () => {
    const envio = { costoCop: 8_000 } as Listing["envio"];
    const t = totalsFor([priceLine({ listingId: "o1", qty: 3 }, oferta({ envio }))]);
    expect(t).toMatchObject({ subtotalCop: 60_000, envioTotalCop: 8_000, totalCop: 68_000, commissionTotalCop: 7_200 });
  });

  it("lo que es solo cotización no suma", () => {
    const t = totalsFor([
      priceLine({ listingId: "a", qty: 1 }, oferta({ id: "a", priceCop: 5_000 })),
      priceLine({ listingId: "b", qty: 1 }, oferta({ id: "b", priceCop: 999_999, quoteOnly: true })),
    ]);
    expect(t.totalCop).toBe(5_000);
    expect(t.quotable).toHaveLength(1);
  });
});
