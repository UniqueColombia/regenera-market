import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EstadoOrden } from "./estado-orden";
import { Paginacion } from "@/components/paginacion";
import { listarOrdenes, resumenDeOrdenes, vencerPedidosSinPago } from "@/lib/orders";
import { leerPagina, urlDePagina } from "@/lib/paginacion";
import type { OrderStatus } from "@/lib/types";
import { ETIQUETA_ENVIO } from "@/lib/envios";
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
export default async function OrdenesPage(props: PageProps<"/admin/ordenes">) {
  const sp = await props.searchParams;
  const estadoPedido = Array.isArray(sp.estado) ? sp.estado[0] : sp.estado;
  const estado = ESTADOS.includes(estadoPedido as OrderStatus) ? (estadoPedido as OrderStatus) : undefined;
  const pedida = leerPagina(sp.pagina);

  // Los pedidos sin pagar de más de 72 horas se cancelan y devuelven lo que
  // reservaban. Lo hace `pg_cron` cada hora; esto es la red por si el proyecto
  // no lo tiene activo. Idempotente: si ya vencieron, no hace nada.
  await vencerPedidosSinPago();
  const [resultado, resumen] = await Promise.all([listarOrdenes(estado, pedida), resumenDeOrdenes()]);
  if (pedida > resultado.paginas) redirect(urlDePagina("/admin/ordenes", sp, resultado.paginas));
  const { filas: ordenes, pagina, paginas } = resultado;

  // De la base y sobre todas las órdenes, no sobre la página visible.
  const porCobrar = resumen.pending_payment;
  const cobrado = resumen.paid.totalCop + resumen.in_progress.totalCop + resumen.fulfilled.totalCop;
  const todas = ESTADOS.reduce((s, e) => s + resumen[e].cantidad, 0);

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
            {porCobrar.cantidad}
          </dd>
        </div>
        <div className="rounded-xl bg-white p-4 ring-1 ring-hairline">
          <dt className="text-xs font-medium text-muted">Por cobrar</dt>
          <dd className="mt-1 font-display text-2xl tabular-nums text-ink">
            {money(porCobrar.totalCop)}
          </dd>
        </div>
        <div className="rounded-xl bg-white p-4 ring-1 ring-hairline">
          <dt className="text-xs font-medium text-muted">Cobrado</dt>
          <dd className="mt-1 font-display text-2xl tabular-nums text-brand-700">
            {money(cobrado)}
          </dd>
        </div>
      </dl>

      {/* Filtro por estado: con las órdenes paginadas, sin él una orden por
          cobrar podía quedar en la página 4. Enlaces, no un formulario: cada
          estado es una URL. */}
      <nav aria-label="Filtrar por estado" className="mt-6 flex flex-wrap gap-2">
        {[undefined, ...ESTADOS].map((e) => {
          const activo = e === estado;
          const n = e ? resumen[e].cantidad : todas;
          return (
            <Link
              key={e ?? "todas"}
              href={e ? `/admin/ordenes?estado=${e}` : "/admin/ordenes"}
              aria-current={activo ? "page" : undefined}
              className={`rounded-full px-3 py-1.5 text-sm ring-1 transition ${
                activo ? "bg-brand-700 text-white ring-brand-700" : "bg-white text-ink ring-hairline hover:bg-sand"
              }`}
            >
              {e ? ETIQUETA_ESTADO[e] : "Todas"} <span className="tabular-nums opacity-70">{n}</span>
            </Link>
          );
        })}
      </nav>

      {ordenes.length === 0 ? (
        <p className="mt-10 rounded-xl bg-white p-10 text-center text-muted ring-1 ring-hairline">
          {estado ? "No hay órdenes en este estado." : "Todavía no hay ninguna orden."}
        </p>
      ) : (
        <ul className="mt-6 grid items-start gap-3 xl:grid-cols-2">
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
                        {i.envioEstado && ` · ${ETIQUETA_ENVIO[i.envioEstado].toLowerCase()}`}
                        {i.guia && ` (${i.transportadora ?? "guía"} ${i.guia})`}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {money(i.unitPriceCop * i.qty)}
                      </span>
                    </li>
                  ))}
                </ul>

                {(o.envioTotalCop > 0 || o.destino) && (
                  <p className="mt-2 text-sm text-muted">
                    Envío {o.envioTotalCop === 0 ? "gratis" : money(o.envioTotalCop)}
                    {o.destino &&
                      ` · a ${o.destino.direccion}, ${o.destino.ciudad}, ${o.destino.departamento}`}
                  </p>
                )}

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

      <Paginacion ruta="/admin/ordenes" params={sp} pagina={pagina} paginas={paginas} />
    </div>
  );
}

const ESTADOS: OrderStatus[] = ["pending_payment", "paid", "in_progress", "fulfilled", "cancelled", "refunded"];
