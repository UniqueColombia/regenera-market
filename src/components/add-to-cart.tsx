"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Minus, Plus, ShoppingBasket } from "lucide-react";
import { addLine } from "./cart";
import { money, shortDate } from "@/lib/format";
import type { Listing } from "@/lib/types";

/**
 * Bloque de compra de la ficha.
 *
 * Aplica el precio mayorista en cuanto la cantidad alcanza el mínimo, y lo
 * muestra: el comprador B2B tiene que ver que le conviene subir el pedido, no
 * enterarse en el checkout.
 */
export function AddToCart({ listing }: { listing: Listing }) {
  const router = useRouter();
  const [qty, setQty] = useState(listing.experience?.minPeople ?? 1);
  const [date, setDate] = useState(
    listing.experience?.availability[0]?.date ?? "",
  );
  const [added, setAdded] = useState(false);

  const isExperience = listing.kind === "experience";
  const slot = listing.experience?.availability.find((a) => a.date === date);

  const wholesaleApplies =
    listing.wholesalePriceCop !== undefined &&
    listing.wholesaleMinQty !== undefined &&
    qty >= listing.wholesaleMinQty;

  const unitPrice = wholesaleApplies
    ? listing.wholesalePriceCop!
    : listing.priceCop;

  const maxQty = isExperience
    ? Math.min(listing.experience!.maxPeople, slot?.slotsLeft ?? 0)
    : (listing.stock ?? 999);

  const minQty = isExperience ? listing.experience!.minPeople : 1;
  const canAdd = qty >= minQty && qty <= maxQty && (!isExperience || !!slot);

  function handleAdd() {
    addLine({ listingId: listing.id, qty, date: isExperience ? date : undefined });
    setAdded(true);
    setTimeout(() => setAdded(false), 2200);
  }

  return (
    <div className="rounded-xl bg-white p-6 ring-1 ring-hairline">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="font-display text-3xl text-ink">{money(unitPrice)}</p>
          <p className="text-sm text-muted">por {listing.unit}</p>
        </div>
        {wholesaleApplies && (
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-200">
            Precio mayorista aplicado
          </span>
        )}
      </div>

      {listing.wholesalePriceCop && listing.wholesaleMinQty && !wholesaleApplies && (
        <p className="mt-3 rounded-lg bg-sand px-3 py-2 text-sm text-muted">
          Desde {listing.wholesaleMinQty} {listing.unit}
          {listing.wholesaleMinQty > 1 ? "s" : ""}, el precio baja a{" "}
          <strong className="text-brand-700">
            {money(listing.wholesalePriceCop)}
          </strong>
          .
        </p>
      )}

      {isExperience && (
        <fieldset className="mt-5">
          <legend className="mb-2 text-sm font-medium text-ink">
            Elige la fecha
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {listing.experience!.availability.map((a) => {
              const selected = a.date === date;
              const soldOut = a.slotsLeft === 0;
              return (
                <button
                  key={a.date}
                  type="button"
                  disabled={soldOut}
                  onClick={() => {
                    setDate(a.date);
                    setQty(Math.min(qty, a.slotsLeft));
                  }}
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    selected
                      ? "border-brand-600 bg-brand-50 text-brand-800"
                      : "border-hairline hover:border-brand-400"
                  }`}
                >
                  <span className="block font-medium first-letter:uppercase">
                    {shortDate(a.date)}
                  </span>
                  <span className="block text-xs text-muted">
                    {soldOut ? "Sin cupo" : `${a.slotsLeft} cupos`}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="mt-5 flex items-center gap-3">
        <span className="text-sm font-medium text-ink">
          {isExperience ? "Personas" : "Cantidad"}
        </span>
        <div className="flex items-center rounded-lg border border-hairline">
          <button
            type="button"
            onClick={() => setQty((q) => Math.max(minQty, q - 1))}
            disabled={qty <= minQty}
            className="p-2 disabled:opacity-30"
            aria-label="Disminuir"
          >
            <Minus className="size-4" />
          </button>
          <span className="w-12 text-center text-sm font-semibold tabular-nums">
            {qty}
          </span>
          <button
            type="button"
            onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
            disabled={qty >= maxQty}
            className="p-2 disabled:opacity-30"
            aria-label="Aumentar"
          >
            <Plus className="size-4" />
          </button>
        </div>
        <span className="ml-auto text-right">
          <span className="block text-xs text-muted">Total</span>
          <span className="font-display text-xl text-ink">
            {money(unitPrice * qty)}
          </span>
        </span>
      </div>

      {isExperience && (
        <p className="mt-2 text-xs text-muted">
          Mínimo {listing.experience!.minPeople} personas para que la salida se
          confirme.
        </p>
      )}

      <button
        type="button"
        onClick={handleAdd}
        disabled={!canAdd}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:bg-muted"
      >
        {added ? (
          <>
            <Check className="size-4" />
            Agregado a la cesta
          </>
        ) : (
          <>
            <ShoppingBasket className="size-4" />
            Agregar a la cesta
          </>
        )}
      </button>

      <button
        type="button"
        onClick={() => {
          handleAdd();
          router.push("/carrito");
        }}
        disabled={!canAdd}
        className="mt-2 w-full rounded-full px-6 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 disabled:opacity-40"
      >
        Comprar ahora
      </button>
    </div>
  );
}

/** Variante para ofertas que solo se venden por cotización. */
export function RequestQuote({ listing }: { listing: Listing }) {
  const router = useRouter();

  return (
    <div className="rounded-xl bg-white p-6 ring-1 ring-hairline">
      <p className="text-sm text-muted">Desde</p>
      <p className="font-display text-3xl text-ink">
        {money(listing.priceCop)}
      </p>
      <p className="mt-1 text-sm text-muted">por {listing.unit}</p>

      <p className="mt-4 rounded-lg bg-sand px-3 py-2 text-sm text-muted">
        El alcance y el precio dependen del tamaño de tu operación, por eso esta
        oferta se cotiza caso a caso.
      </p>

      <button
        type="button"
        onClick={() => {
          addLine({ listingId: listing.id, qty: 1 });
          router.push("/carrito");
        }}
        className="mt-5 w-full rounded-full bg-clay-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-clay-600"
      >
        Solicitar cotización
      </button>
    </div>
  );
}
