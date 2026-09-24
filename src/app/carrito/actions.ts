"use server";

import { z } from "zod";
import { generateReference, getGateway } from "@/lib/payments";
import { saveOrder } from "@/lib/orders";
import { priceLine, totalsFor } from "@/lib/pricing";
import { getListingsByIds, getProviderTiers } from "@/lib/repo";
import type { Order, OrderItem } from "@/lib/types";
import { dentroDelRitmo, origenDeLaPeticion } from "@/lib/ritmo";
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

  // La comisión depende del nivel del proveedor (src/lib/niveles.ts), así que
  // hace falta saber de qué nivel es cada uno antes de valorizar. Un proveedor
  // que no aparezca en el mapa paga la tasa base, que es la más alta.
  const niveles = await getProviderTiers(listings.map((l) => l.providerId));

  const priced = lines
    .map((line) => {
      const listing = byId.get(line.listingId);
      // Una oferta retirada del catálogo simplemente desaparece del carrito.
      return listing
        ? priceLine(line, listing, niveles.get(listing.providerId))
        : null;
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
    dropped: lines
      .filter((l) => !byId.has(l.listingId))
      .map((l) => ({ listingId: l.listingId, date: l.date })),
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

  // Comprar no exige cuenta a propósito —un hotel pide una cotización sin
  // registrarse— y eso deja el formulario abierto a cualquiera con un bucle.
  // Cinco órdenes en diez minutos desde la misma IP es más de lo que hace nadie
  // comprando de verdad, y mucho menos de lo que hace un guion. Lo que se
  // protege no es el dinero (no se cobra aquí) sino la tabla de órdenes: cada
  // envío deja una fila que alguien tiene que mirar en `/admin/ordenes`.
  if (!dentroDelRitmo(`checkout:${await origenDeLaPeticion()}`, 5, 600)) {
    return {
      ok: false,
      errors: {
        form: "Recibimos varios pedidos seguidos desde aquí. Espera unos minutos y vuelve a intentarlo.",
      },
    };
  }

  const listings = await getListingsByIds(lines.map((l) => l.listingId));
  const byId = new Map(listings.map((l) => [l.id, l]));

  const niveles = await getProviderTiers(listings.map((l) => l.providerId));

  const priced = lines
    .map((line) => {
      const listing = byId.get(line.listingId);
      return listing
        ? priceLine(line, listing, niveles.get(listing.providerId))
        : null;
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
    commissionRate: l.commissionRate,
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
