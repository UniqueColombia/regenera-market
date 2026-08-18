"use server";

import { z } from "zod";
import { generateReference, getGateway } from "@/lib/payments";
import { saveOrder } from "@/lib/orders";
import { priceLine, totalsFor } from "@/lib/pricing";
import { getListingsByIds } from "@/lib/repo";
import type { Order, OrderItem } from "@/lib/types";
import type { CartLine, PricedCartDTO } from "./types";

/**
 * Resuelve el carrito contra el catálogo del servidor.
 *
 * El cliente solo manda identificadores y cantidades; los precios se calculan
 * aquí. Así un carrito guardado hace un mes no puede comprar al precio de hace
 * un mes.
 */
export async function priceCart(lines: CartLine[]): Promise<PricedCartDTO> {
  const listings = await getListingsByIds(lines.map((l) => l.listingId));
  const byId = new Map(listings.map((l) => [l.id, l]));

  const priced = lines
    .map((line) => {
      const listing = byId.get(line.listingId);
      // Una oferta retirada del catálogo simplemente desaparece del carrito.
      return listing ? priceLine(line, listing) : null;
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  const totals = totalsFor(priced);

  return {
    lines: priced.map((l) => ({
      listingId: l.listing.id,
      slug: l.listing.slug,
      title: l.listing.title,
      category: l.listing.category,
      kind: l.listing.kind,
      unit: l.listing.unit,
      images: l.listing.images,
      providerId: l.listing.providerId,
      quoteOnly: l.listing.quoteOnly,
      qty: l.line.qty,
      date: l.line.date,
      unitPriceCop: l.unitPriceCop,
      wholesaleApplied: l.wholesaleApplied,
      subtotalCop: l.subtotalCop,
    })),
    subtotalCop: totals.subtotalCop,
    totalCop: totals.totalCop,
    commissionTotalCop: totals.commissionTotalCop,
    impact: totals.impact,
    providerCount: totals.providerCount,
    /** Identificadores que ya no existen, para que el cliente los descarte */
    droppedIds: lines
      .map((l) => l.listingId)
      .filter((id) => !byId.has(id)),
  };
}

const CheckoutSchema = z.object({
  name: z.string().trim().min(3, "Escribe tu nombre completo"),
  email: z.email("Revisa el correo"),
  phone: z
    .string()
    .trim()
    .min(7, "Escribe un teléfono de contacto"),
  company: z.string().trim().optional(),
  notes: z.string().trim().max(1000).optional(),
});

export type CheckoutResult =
  | { ok: true; reference: string }
  | { ok: false; errors: Record<string, string> };

/**
 * Cierra la compra: arma la orden, la guarda y pide el intento de pago.
 *
 * Todavía no descuenta cupo de experiencias ni inventario — eso necesita una
 * transacción de base de datos para evitar sobreventa, y llega con Supabase.
 */
export async function checkout(
  lines: CartLine[],
  form: unknown,
): Promise<CheckoutResult> {
  const parsed = CheckoutSchema.safeParse(form);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      errors[key] ??= issue.message;
    }
    return { ok: false, errors };
  }

  const listings = await getListingsByIds(lines.map((l) => l.listingId));
  const byId = new Map(listings.map((l) => [l.id, l]));

  const priced = lines
    .map((line) => {
      const listing = byId.get(line.listingId);
      return listing ? priceLine(line, listing) : null;
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  const totals = totalsFor(priced);

  if (totals.purchasable.length === 0) {
    return {
      ok: false,
      errors: { form: "No hay nada comprable en la cesta." },
    };
  }

  const items: OrderItem[] = totals.purchasable.map((l) => ({
    listingId: l.listing.id,
    providerId: l.listing.providerId,
    titleSnapshot: l.listing.title,
    unitPriceCop: l.unitPriceCop,
    qty: l.line.qty,
    date: l.line.date,
    commissionCop: l.commissionCop,
  }));

  const order: Order = {
    id: crypto.randomUUID(),
    reference: generateReference(),
    buyerName: parsed.data.name,
    buyerEmail: parsed.data.email,
    buyerPhone: parsed.data.phone,
    buyerCompany: parsed.data.company || undefined,
    items,
    subtotalCop: totals.subtotalCop,
    commissionTotalCop: totals.commissionTotalCop,
    totalCop: totals.totalCop,
    status: "pending_payment",
    impact: totals.impact,
    notes: parsed.data.notes || undefined,
    createdAt: new Date().toISOString(),
  };

  await saveOrder(order);
  await getGateway().createIntent(order);

  return { ok: true, reference: order.reference };
}
