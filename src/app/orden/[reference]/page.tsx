import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, Info, MapPin, PartyPopper } from "lucide-react";
import { ConfirmarRecibido, FormularioResena } from "./acciones-item";
import { ImpactChips } from "@/components/impact-chips";
import { getSesion } from "@/lib/auth";
import {
  COLOR_ENVIO,
  ETIQUETA_ENVIO,
  hoyEnBogota,
  plazoDeEntrega,
  puedeResenar,
} from "@/lib/envios";
import { longDate, money, shortDate } from "@/lib/format";
import { getOrderByReference } from "@/lib/orders";
import { COLOR_ESTADO, ETIQUETA_ESTADO } from "@/lib/order-status";
import { getGateway } from "@/lib/payments";
import {
  getListingsByIds,
  getMisResenas,
  getProviderById,
  logisticaDisponible,
} from "@/lib/repo";

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

  // Lo de la 0014: envío por ítem, entrega y reseñas. Sin ella, todo esto sale
  // vacío y la página queda como antes.
  const logistica = await logisticaDisponible();
  const esComprador = order.buyerId === sesion.id;
  const idsItems = order.items.map((i) => i.id).filter((id): id is string => Boolean(id));
  const [misResenas, ofertas] = await Promise.all([
    esComprador ? getMisResenas(idsItems) : Promise.resolve(new Map()),
    getListingsByIds(order.items.map((i) => i.listingId)),
  ]);
  const slugDe = new Map(ofertas.map((l) => [l.id, l.slug]));
  const hoy = hoyEnBogota();

  const comprado = order.items.map((i) => `${i.qty} × ${i.titleSnapshot}`).join(", ");

  return (
    <div className="container-page py-12">
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

        {/* Dos columnas en pantalla ancha: lo que se pidió y el total a la
            izquierda; cómo pagar, el impacto y los siguientes pasos a la
            derecha. */}
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-x-12">
          <div>
        <h2 className="font-display text-xl text-ink">Lo que pediste</h2>
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

                {/* Cómo va el envío: el estado, la guía cuando ya salió, o
                    cuándo debería llegar mientras se prepara. */}
                {item.envioEstado && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <span
                      className={`rounded-full px-2 py-0.5 font-medium ring-1 ${COLOR_ENVIO[item.envioEstado]}`}
                    >
                      {ETIQUETA_ENVIO[item.envioEstado]}
                    </span>
                    {item.guia ? (
                      <span className="text-muted">
                        {item.transportadora ?? "Guía"}:{" "}
                        <strong className="font-mono text-ink">{item.guia}</strong>
                      </span>
                    ) : (
                      item.envioEstado === "pendiente" &&
                      plazoDeEntrega(item.entregaDiasMin, item.entregaDiasMax) && (
                        <span className="text-muted">
                          Llega {plazoDeEntrega(item.entregaDiasMin, item.entregaDiasMax)} después
                          de confirmado el pago
                        </span>
                      )
                    )}
                  </div>
                )}

                {esComprador &&
                  item.id &&
                  item.envioEstado &&
                  item.envioEstado !== "entregado" &&
                  ["paid", "in_progress"].includes(order.status) && (
                    <ConfirmarRecibido itemId={item.id} reference={order.reference} />
                  )}

                {esComprador &&
                  logistica &&
                  item.id &&
                  slugDe.has(item.listingId) &&
                  puedeResenar(order.status, item.envioEstado, item.date, hoy) && (
                    <FormularioResena
                      itemId={item.id}
                      reference={order.reference}
                      slug={slugDe.get(item.listingId)}
                      previa={misResenas.get(item.id)}
                    />
                  )}
              </div>
              <p className="shrink-0 font-display text-lg text-ink">
                {money(item.unitPriceCop * item.qty)}
              </p>
            </li>
          ))}
        </ul>

        <dl className="mt-4 space-y-1 border-t-2 border-ink/10 pt-4">
          {order.envioTotalCop > 0 || order.destino ? (
            <>
              <div className="flex justify-between text-sm text-muted">
                <dt>Productos</dt>
                <dd className="tabular-nums">{money(order.subtotalCop)}</dd>
              </div>
              <div className="flex justify-between text-sm text-muted">
                <dt>Envío</dt>
                <dd className="tabular-nums">
                  {order.envioTotalCop === 0 ? "Gratis" : money(order.envioTotalCop)}
                </dd>
              </div>
            </>
          ) : null}
          <div className="flex justify-between">
            <dt className="font-display text-lg">Total</dt>
            <dd className="font-display text-2xl text-ink">{money(order.totalCop)}</dd>
          </div>
        </dl>

        {order.destino && (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-sand p-4 text-sm text-ink">
            <MapPin className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
            <span>
              Lo enviamos a <strong>{order.destino.direccion}</strong>,{" "}
              {order.destino.ciudad}, {order.destino.departamento}
              {order.destino.indicaciones && (
                <span className="block text-muted">{order.destino.indicaciones}</span>
              )}
            </span>
          </p>
        )}

          </div>
          <div className="space-y-6">
        {/* Las instrucciones solo mientras falta pagar: a quien ya pagó,
            pedirle que transfiera otra vez es sembrarle la duda de si le
            llegó. */}
        {order.status === "pending_payment" && (
          <div className="rounded-xl bg-clay-100 p-5">
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
            {logistica && (
              <p className="mt-3 text-xs text-clay-700">
                Si no recibimos el pago en 3 días, el pedido se cancela solo y lo
                que reservaste vuelve al catálogo.
              </p>
            )}
          </div>
        )}

        {(order.impact.co2KgSaved ||
          order.impact.waterLitersSaved ||
          order.impact.wasteKgReduced) && (
          <div className="rounded-xl bg-brand-50 p-5">
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

        <p className="text-sm text-muted">
          Te escribimos a{" "}
          <strong className="break-all text-ink">{order.buyerEmail}</strong> en
          cuanto confirmemos el pago.
        </p>

        <div className="flex flex-wrap gap-3">
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
      </div>
    </div>
  );
}
