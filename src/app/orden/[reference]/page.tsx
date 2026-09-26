import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, Info, PartyPopper } from "lucide-react";
import { ImpactChips } from "@/components/impact-chips";
import { getSesion } from "@/lib/auth";
import { longDate, money, shortDate } from "@/lib/format";
import { getOrderByReference } from "@/lib/orders";
import { COLOR_ESTADO, ETIQUETA_ESTADO } from "@/lib/order-status";
import { getGateway } from "@/lib/payments";
import { getProviderById } from "@/lib/repo";

export const metadata: Metadata = {
  title: "Tu orden",
  robots: { index: false },
};

/**
 * Un pedido: qué se compró, cuánto es y cómo se paga.
 *
 * **Exige sesión desde que comprar la exige.** La orden se lee con el cliente
 * de sesión (`getOrderByReference()`), así que sin cuenta no hay nada que
 * enseñar: se manda a entrar y se vuelve aquí. Con cuenta pero sin derecho a
 * esta orden, RLS no devuelve nada y sale un 404 — que no confirma que la
 * referencia exista.
 *
 * `?nuevo=1` lo pone la cesta al confirmar. Es lo que cambia el encabezado de
 * «Tu pedido» a «¡Listo!», con lo que se compró y la animación de
 * confirmación: quien vuelve a abrir el pedido desde su cuenta días después no
 * necesita que se le celebre otra vez.
 */
export default async function OrdenPage(props: PageProps<"/orden/[reference]">) {
  const { reference } = await props.params;
  const sesion = await getSesion();
  if (!sesion) {
    redirect(`/entrar?volver=${encodeURIComponent(`/orden/${reference}`)}`);
  }

  const order = await getOrderByReference(reference);
  if (!order) notFound();

  const sp = await props.searchParams;
  const nuevo = (Array.isArray(sp.nuevo) ? sp.nuevo[0] : sp.nuevo) === "1";

  const intent = await getGateway().createIntent(order);
  const providers = await Promise.all(
    order.items.map((i) => getProviderById(i.providerId)),
  );

  const comprado = order.items.map((i) => `${i.qty} × ${i.titleSnapshot}`).join(", ");

  return (
    <div className="container-page max-w-3xl py-12">
      <div className="rounded-2xl bg-white p-6 ring-1 ring-hairline sm:p-8">
        {nuevo ? (
          <div className="animate-aviso rounded-xl bg-brand-50 p-5 ring-1 ring-brand-200 motion-reduce:animate-none">
            <PartyPopper
              className="size-10 animate-latido text-brand-600 motion-reduce:animate-none"
              aria-hidden
            />
            <h1 className="mt-3 font-display text-3xl text-brand-900">
              ¡Listo! Tu pedido quedó registrado
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-brand-800">
              Compraste {comprado}. Te mandamos el resumen a{" "}
              <strong className="break-all">{order.buyerEmail}</strong>.
            </p>
          </div>
        ) : (
          <>
            <CheckCircle2 className="size-10 text-brand-600" />
            <h1 className="mt-4 font-display text-3xl text-ink">Tu pedido</h1>
          </>
        )}

        <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted">
          <span>
            Referencia{" "}
            <strong className="font-mono text-ink">{order.reference}</strong> ·{" "}
            {longDate(order.createdAt)}
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${COLOR_ESTADO[order.status]}`}
          >
            {ETIQUETA_ESTADO[order.status]}
          </span>
        </p>
        {order.buyerCompany && (
          <p className="mt-1 text-sm text-muted">
            A nombre de <strong className="text-ink">{order.buyerCompany}</strong>
            {order.buyerTaxId ? ` · ${order.buyerTaxId}` : ""}
          </p>
        )}

        {/* Las instrucciones solo mientras falta pagar: a quien ya pagó,
            pedirle que transfiera otra vez es sembrarle la duda de si le
            llegó. */}
        {order.status === "pending_payment" && (
          <div className="mt-6 rounded-xl bg-clay-100 p-5">
            <h2 className="flex items-center gap-2 font-display text-lg text-ink">
              <Info className="size-4 text-clay-700" />
              Cómo completar el pago
            </h2>
            <ol className="mt-3 space-y-2 text-sm text-ink">
              {intent.instructions?.map((step, i) => (
                <li key={i} className="flex gap-2">
                  <span className="font-semibold text-clay-700">{i + 1}.</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        )}

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
          Te escribimos a{" "}
          <strong className="break-all text-ink">{order.buyerEmail}</strong> en
          cuanto confirmemos el pago.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/catalogo"
            className="inline-block rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-800"
          >
            Seguir explorando
          </Link>
          <Link
            href="/cuenta#pedidos"
            className="inline-block rounded-full px-6 py-3 text-sm font-semibold text-brand-700 ring-1 ring-control transition hover:bg-sand"
          >
            Ver todos mis pedidos
          </Link>
        </div>
      </div>
    </div>
  );
}
