"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Loader2, ShoppingBasket, Trash2 } from "lucide-react";
import { checkout, priceCart } from "./actions";
import type { PricedCartDTO } from "./types";
import {
  clearCart,
  removeLine,
  updateQty,
  useCartHydrated,
  useCartLines,
} from "@/components/cart";
import { ImpactChips } from "@/components/impact-chips";
import { ListingMedia } from "@/components/listing-media";
import { money, shortDate } from "@/lib/format";
import { KIND_LABEL } from "@/lib/taxonomy";

export default function CarritoPage() {
  const lines = useCartLines();
  const hydrated = useCartHydrated();

  // Identidad del carrito actual. Sirve para saber si el resultado que tenemos
  // corresponde a lo que hay en la cesta ahora o a una versión anterior.
  const cartKey = useMemo(() => JSON.stringify(lines), [lines]);
  const [result, setResult] = useState<{
    key: string;
    data: PricedCartDTO;
  } | null>(null);

  useEffect(() => {
    if (!hydrated || lines.length === 0) return;
    let cancelled = false;
    priceCart(lines).then((data) => {
      if (cancelled) return;
      setResult({ key: cartKey, data });
      // Una oferta retirada del catálogo se cae sola de la cesta.
      for (const id of data.droppedIds) removeLine(id);
    });
    return () => {
      cancelled = true;
    };
  }, [cartKey, lines, hydrated]);

  // Mientras se revaloriza se siguen mostrando los datos anteriores. Vaciar la
  // pantalla en cada cambio de cantidad desmontaría el campo que se está
  // editando y se perderían las teclas siguientes.
  const priced = result?.data ?? null;
  const stale = result === null || result.key !== cartKey;
  const firstLoad = !hydrated || (lines.length > 0 && result === null);

  if (firstLoad) {
    return (
      <div className="container-page grid min-h-[50vh] place-items-center">
        <Loader2 className="size-6 animate-spin text-brand-600" />
        <span className="sr-only">Cargando tu cesta</span>
      </div>
    );
  }

  if (lines.length === 0 || !priced || priced.lines.length === 0) {
    return (
      <div className="container-page py-20 text-center">
        <ShoppingBasket className="mx-auto size-10 text-muted" />
        <h1 className="mt-4 font-display text-3xl text-ink">
          Tu cesta está vacía
        </h1>
        <p className="mx-auto mt-2 max-w-md text-muted">
          Explora el catálogo y arma un pedido con proveedores de distintos
          rincones del país. Puedes combinarlos en una sola compra.
        </p>
        <Link
          href="/catalogo"
          className="mt-6 inline-block rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-800"
        >
          Ir al catálogo
        </Link>
      </div>
    );
  }

  const purchasable = priced.lines.filter((l) => !l.quoteOnly);
  const quotable = priced.lines.filter((l) => l.quoteOnly);

  return (
    <div className="container-page py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-4xl text-ink">Tu cesta</h1>
        <button
          type="button"
          onClick={clearCart}
          className="text-sm text-muted underline hover:text-brand-700"
        >
          Vaciar
        </button>
      </div>

      {priced.providerCount > 1 && (
        <p className="mt-3 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-800 ring-1 ring-brand-100">
          Tu pedido reúne {priced.providerCount} proveedores. Pagas una sola vez
          y nosotros repartimos: cada uno despacha su parte y coordinamos las
          entregas contigo.
        </p>
      )}

      <div
        aria-busy={stale}
        className={`mt-8 grid gap-8 transition-opacity lg:grid-cols-[1.6fr_1fr] ${
          stale ? "opacity-60" : ""
        }`}
      >
        <div>
          <ul className="space-y-4">
            {purchasable.map((l) => (
              <li
                key={`${l.listingId}-${l.date ?? ""}`}
                className="flex gap-4 rounded-xl bg-white p-4 ring-1 ring-hairline"
              >
                <div className="size-24 shrink-0 overflow-hidden rounded-lg">
                  <ListingMedia
                    title={l.title}
                    category={l.category}
                    images={l.images}
                    iconClassName="size-7"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-xs uppercase tracking-wide text-muted">
                    {KIND_LABEL[l.kind]}
                  </p>
                  <h2 className="font-display text-lg leading-snug text-ink">
                    <Link
                      href={`/oferta/${l.slug}`}
                      className="hover:text-brand-700"
                    >
                      {l.title}
                    </Link>
                  </h2>
                  {l.date && (
                    <p className="mt-0.5 text-sm text-brand-700 first-letter:uppercase">
                      {shortDate(l.date)}
                    </p>
                  )}
                  {l.wholesaleApplied && (
                    <p className="mt-1 inline-block rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-700">
                      Precio mayorista aplicado
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <QtyInput
                      qty={l.qty}
                      listingId={l.listingId}
                      date={l.date}
                    />
                    <span className="text-sm text-muted">
                      {money(l.unitPriceCop)} / {l.unit}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeLine(l.listingId, l.date)}
                      className="ml-auto flex items-center gap-1 text-sm text-muted hover:text-red-700"
                    >
                      <Trash2 className="size-4" />
                      Quitar
                    </button>
                  </div>
                </div>

                <p className="shrink-0 font-display text-lg text-ink">
                  {money(l.subtotalCop)}
                </p>
              </li>
            ))}
          </ul>

          {quotable.length > 0 && (
            <section className="mt-8">
              <h2 className="font-display text-xl text-ink">
                Requieren cotización
              </h2>
              <p className="mt-1 text-sm text-muted">
                Estas ofertas no se pagan en línea. Te enviamos una propuesta con
                alcance y precio en menos de 48 horas hábiles.
              </p>
              <ul className="mt-4 space-y-3">
                {quotable.map((l) => (
                  <li
                    key={l.listingId}
                    className="flex items-center justify-between gap-4 rounded-xl bg-clay-100 p-4"
                  >
                    <div>
                      <h3 className="font-medium text-ink">{l.title}</h3>
                      <p className="text-sm text-muted">
                        Desde {money(l.unitPriceCop)} / {l.unit}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(l.listingId, l.date)}
                      className="text-sm text-muted hover:text-red-700"
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <CheckoutPanel priced={priced} />
        </aside>
      </div>
    </div>
  );
}

/**
 * Campo de cantidad.
 *
 * Escribe en estado local y solo confirma al carrito medio segundo después de
 * la última tecla. Si se escribiera directo al carrito, cada pulsación
 * dispararía la revalorización en el servidor y el input se repintaría a mitad
 * de "60", perdiendo el cero.
 */
function QtyInput({
  qty,
  listingId,
  date,
}: {
  qty: number;
  listingId: string;
  date?: string;
}) {
  const [text, setText] = useState(String(qty));
  const [syncedFrom, setSyncedFrom] = useState(qty);

  // La cantidad cambió por fuera (otra pestaña, o una línea que se fusionó):
  // se ajusta el estado local durante el render, sin efecto de por medio.
  if (qty !== syncedFrom) {
    setSyncedFrom(qty);
    setText(String(qty));
  }

  useEffect(() => {
    const parsed = Number(text);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed === qty) return;
    const timer = setTimeout(() => updateQty(listingId, parsed, date), 500);
    return () => clearTimeout(timer);
  }, [text, qty, listingId, date]);

  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      Cantidad
      <input
        type="number"
        min={1}
        inputMode="numeric"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          // Al salir del campo se normaliza: un valor vacío o inválido vuelve
          // a la cantidad vigente en vez de quedar en un estado imposible.
          const parsed = Number(text);
          if (!Number.isInteger(parsed) || parsed < 1) setText(String(qty));
        }}
        className="w-20 rounded-lg border border-hairline px-2 py-1 text-sm tabular-nums"
      />
    </label>
  );
}

function CheckoutPanel({ priced }: { priced: PricedCartDTO }) {
  const lines = useCartLines();
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    startTransition(async () => {
      const result = await checkout(lines, data);
      if (result.ok) {
        clearCart();
        router.push(`/orden/${result.reference}`);
      } else {
        setErrors(result.errors);
      }
    });
  }

  const hasPurchasable = priced.lines.some((l) => !l.quoteOnly);
  const hasImpact =
    !!priced.impact.co2KgSaved ||
    !!priced.impact.waterLitersSaved ||
    !!priced.impact.wasteKgReduced;

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl bg-white p-6 ring-1 ring-hairline"
    >
      <h2 className="font-display text-xl text-ink">Finalizar</h2>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">Subtotal</dt>
          <dd className="tabular-nums">{money(priced.subtotalCop)}</dd>
        </div>
        <div className="flex justify-between border-t border-hairline pt-2 font-semibold">
          <dt>Total a pagar</dt>
          <dd className="font-display text-lg tabular-nums">
            {money(priced.totalCop)}
          </dd>
        </div>
      </dl>

      {hasImpact && (
        <div className="mt-4 rounded-lg bg-brand-50 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-brand-700">
            Impacto de esta compra
          </p>
          <ImpactChips impact={priced.impact} className="mt-2" />
        </div>
      )}

      <fieldset className="mt-6 space-y-3" disabled={pending}>
        <legend className="sr-only">Datos de contacto</legend>
        <TextField
          name="name"
          label="Nombre completo"
          error={errors.name}
          required
        />
        <TextField
          name="email"
          label="Correo"
          type="email"
          error={errors.email}
          required
        />
        <TextField name="phone" label="Teléfono" error={errors.phone} required />
        <TextField name="company" label="Empresa (opcional)" />
        <div>
          <label
            htmlFor="notes"
            className="mb-1 block text-xs font-medium text-muted"
          >
            Notas para el proveedor (opcional)
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            className="w-full rounded-lg border border-hairline px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </div>
      </fieldset>

      {errors.form && <p className="mt-3 text-sm text-red-700">{errors.form}</p>}

      <button
        type="submit"
        disabled={pending || !hasPurchasable}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:bg-muted"
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        Confirmar pedido
      </button>

      <p className="mt-3 text-xs text-muted">
        El pago aún se coordina por transferencia: al confirmar te mostramos las
        instrucciones y la referencia de tu orden.
      </p>
    </form>
  );
}

function TextField({
  name,
  label,
  type = "text",
  error,
  required,
}: {
  name: string;
  label: string;
  type?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-xs font-medium text-muted">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        aria-invalid={error ? true : undefined}
        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-brand-500 ${
          error ? "border-red-500" : "border-hairline"
        }`}
      />
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
