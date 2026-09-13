import type { Metadata } from "next";
import Link from "next/link";
import { EstadoOrden } from "./estado-orden";
import { listOrders } from "@/lib/orders";
import { money } from "@/lib/format";
import { COLOR_ESTADO, ETIQUETA_ESTADO } from "@/lib/order-status";
import { mostrarTelefono } from "@/lib/telefono";

export const metadata: Metadata = { title: "Órdenes" };

export const dynamic = "force-dynamic";

/**
 * Las órdenes, para confirmar pagos y seguir su curso.
 *
 * Hasta hoy esto no podía existir: las órdenes vivían en un `Map` en memoria del
 * servidor y desaparecían en cada redespliegue. Ahora están en `orders` y
 * `order_items` — ver `src/lib/orders.ts`.
 *
 * **La comisión se muestra por orden, sumada de sus ítems, y nunca se recalcula
 * aquí.** Cada `order_items.commission_cop` se congeló al comprar; si esta
 * pantalla multiplicara el total por la tasa de hoy, mostraría una cifra que no
 * coincide con lo que se le va a descontar a cada proveedor. Es la invariante 2
 * de `dominio-regenera`.
 */
export default async function OrdenesPage() {
  const ordenes = await listOrders();

  const porCobrar = ordenes.filter((o) => o.status === "pending_payment");
  const cobrado = ordenes
    .filter((o) => o.status === "paid" || o.status === "in_progress" || o.status === "fulfilled")
    .reduce((suma, o) => suma + o.totalCop, 0);

  return (
    <div>
      <header className="mt-8">
        <h1 className="font-display text-3xl text-ink sm:text-4xl">Órdenes</h1>
        <p className="mt-2 max-w-2xl text-muted">
          El cobro es manual: el comprador transfiere y aquí se confirma. Cuando
          entre la pasarela, esa confirmación la hará el webhook — y tendrá que
          validar la firma antes de tocar nada.
        </p>
      </header>

      <dl className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-white p-4 ring-1 ring-hairline">
          <dt className="text-xs font-medium text-muted">Esperando pago</dt>
          <dd className="mt-1 font-display text-2xl tabular-nums text-clay-600">
            {porCobrar.length}
          </dd>
        </div>
        <div className="rounded-xl bg-white p-4 ring-1 ring-hairline">
          <dt className="text-xs font-medium text-muted">Por cobrar</dt>
          <dd className="mt-1 font-display text-2xl tabular-nums text-ink">
            {money(porCobrar.reduce((s, o) => s + o.totalCop, 0))}
          </dd>
        </div>
        <div className="rounded-xl bg-white p-4 ring-1 ring-hairline">
          <dt className="text-xs font-medium text-muted">Cobrado</dt>
          <dd className="mt-1 font-display text-2xl tabular-nums text-brand-700">
            {money(cobrado)}
          </dd>
        </div>
      </dl>

      {ordenes.length === 0 ? (
        <p className="mt-10 rounded-xl bg-white p-10 text-center text-muted ring-1 ring-hairline">
          Todavía no hay ninguna orden.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {ordenes.map((o) => {
            const comision = o.items.reduce((s, i) => s + i.commissionCop, 0);

            return (
              <li key={o.id} className="rounded-xl bg-white p-5 ring-1 ring-hairline">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/orden/${o.reference}`}
                        className="font-display text-lg text-ink transition-colors hover:text-brand-700"
                      >
                        {o.reference}
                      </Link>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${COLOR_ESTADO[o.status]}`}
                      >
                        {ETIQUETA_ESTADO[o.status]}
                      </span>
                    </p>
                    <p className="mt-0.5 text-sm text-muted">
                      {o.buyerName}
                      {o.buyerCompany && ` · ${o.buyerCompany}`} · {o.buyerEmail}
                      {o.buyerPhone && ` · ${mostrarTelefono(o.buyerPhone) || o.buyerPhone}`}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {o.createdAt.slice(0, 10)} · {o.items.length}{" "}
                      {o.items.length === 1 ? "línea" : "líneas"} · comisión{" "}
                      {money(comision)}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                    <p className="font-display text-xl tabular-nums text-ink">
                      {money(o.totalCop)}
                    </p>
                    <EstadoOrden
                      orderId={o.id}
                      estado={o.status}
                      referencia={o.reference}
                      totalCop={o.totalCop}
                    />
                  </div>
                </div>

                <ul className="mt-3 space-y-1 border-t border-hairline pt-3 text-sm text-muted">
                  {o.items.map((i, n) => (
                    <li key={`${o.id}-${n}`} className="flex justify-between gap-4">
                      <span className="min-w-0 truncate">
                        {i.qty} × {i.titleSnapshot}
                        {i.date && ` · ${i.date}`}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {money(i.unitPriceCop * i.qty)}
                      </span>
                    </li>
                  ))}
                </ul>

                {o.notes && (
                  <p className="mt-3 rounded-lg bg-sand p-3 text-sm text-muted">
                    Nota del comprador: {o.notes}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
