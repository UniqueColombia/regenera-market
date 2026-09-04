import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Info } from "lucide-react";
import { ImpactChips } from "@/components/impact-chips";
import { longDate, money, shortDate } from "@/lib/format";
import { getOrderByReference } from "@/lib/orders";
import { getGateway } from "@/lib/payments";
import { getProviderById } from "@/lib/repo";

export const metadata: Metadata = {
  title: "Tu orden",
  robots: { index: false },
};

export default async function OrdenPage(props: PageProps<"/orden/[reference]">) {
  const { reference } = await props.params;
  const order = await getOrderByReference(reference);
  if (!order) notFound();

  const intent = await getGateway().createIntent(order);
  const providers = await Promise.all(
    order.items.map((i) => getProviderById(i.providerId)),
  );

  return (
    <div className="container-page max-w-3xl py-12">
      <div className="rounded-2xl bg-white p-6 ring-1 ring-hairline sm:p-8">
        <CheckCircle2 className="size-10 text-brand-600" />
        <h1 className="mt-4 font-display text-3xl text-ink">
          Recibimos tu pedido
        </h1>
        <p className="mt-2 text-muted">
          Referencia{" "}
          <strong className="font-mono text-ink">{order.reference}</strong> ·{" "}
          {longDate(order.createdAt.slice(0, 10))}
        </p>

        <div className="mt-6 rounded-xl bg-clay-100 p-5">
          <h2 className="flex items-center gap-2 font-display text-lg text-ink">
            <Info className="size-4 text-clay-600" />
            Cómo completar el pago
          </h2>
          <ol className="mt-3 space-y-2 text-sm text-ink">
            {intent.instructions?.map((step, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-semibold text-clay-600">{i + 1}.</span>
                {step}
              </li>
            ))}
          </ol>
        </div>

        <h2 className="mt-8 font-display text-xl text-ink">Lo que pediste</h2>
        <ul className="mt-4 divide-y divide-hairline">
          {order.items.map((item, i) => (
            <li key={i} className="flex justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="font-medium text-ink">{item.titleSnapshot}</p>
                <p className="text-sm text-muted">
                  {item.qty} × {money(item.unitPriceCop)}
                  {item.date && (
                    <span className="first-letter:uppercase">
                      {" "}
                      · {shortDate(item.date)}
                    </span>
                  )}
                </p>
                {providers[i] && (
                  <p className="text-sm text-muted">
                    Proveedor:{" "}
                    <Link
                      href={`/proveedor/${providers[i]!.slug}`}
                      className="underline hover:text-brand-700"
                    >
                      {providers[i]!.name}
                    </Link>
                  </p>
                )}
              </div>
              <p className="shrink-0 font-display text-lg text-ink">
                {money(item.unitPriceCop * item.qty)}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex justify-between border-t-2 border-ink/10 pt-4">
          <span className="font-display text-lg">Total</span>
          <span className="font-display text-2xl text-ink">
            {money(order.totalCop)}
          </span>
        </div>

        {(order.impact.co2KgSaved ||
          order.impact.waterLitersSaved ||
          order.impact.wasteKgReduced) && (
          <div className="mt-8 rounded-xl bg-brand-50 p-5">
            <h2 className="font-display text-lg text-brand-800">
              El impacto de esta compra
            </h2>
            <p className="mt-1 text-sm text-brand-700">
              Cifras declaradas por el proveedor y revisadas por nuestro equipo.
              Puedes usarlas en tu reporte de sostenibilidad.
            </p>
            <ImpactChips impact={order.impact} className="mt-3" />
          </div>
        )}

        <p className="mt-8 text-sm text-muted">
          Te escribimos a <strong className="break-all text-ink">{order.buyerEmail}</strong>{" "}
          en cuanto confirmemos el pago.
        </p>

        <Link
          href="/catalogo"
          className="mt-6 inline-block rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-800"
        >
          Seguir explorando
        </Link>
      </div>
    </div>
  );
}
