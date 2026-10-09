import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, MapPin, Phone, Truck } from "lucide-react";
import { AccionesDespacho } from "./acciones-despacho";
import { requireUser } from "@/lib/auth";
import { COLOR_ENVIO, ETIQUETA_DESPACHO, ETIQUETA_ENVIO, plazoDeEntrega } from "@/lib/envios";
import { longDate, money, shortDate } from "@/lib/format";
import { getPedidosDeEmpresa, type ItemDeEmpresa } from "@/lib/orders";
import { getMiEmpresa, logisticaDisponible } from "@/lib/repo";
import { privada } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Pedidos de tu empresa",
  ...privada(),
};

export const dynamic = "force-dynamic";

/**
 * Lo que la empresa vendió y tiene que hacer llegar.
 *
 * Despacha quien vende (decisión del 2026-10-09): o lo lleva él, o lo manda
 * por la transportadora que eligió al publicar. Esta pantalla es donde lo
 * cuenta: carga la guía, y el comprador la ve en su pedido y le llega por
 * correo. Lo que la empresa entrega en mano lo marca entregado ella misma;
 * lo que va por transportadora lo confirma el comprador al recibirlo.
 *
 * Solo pedidos pagados en adelante (`getPedidosDeEmpresa()`): uno sin pagar
 * puede vencer o cancelarse, y prepararlo sería trabajar para nada.
 */
export default async function PedidosDeEmpresaPage() {
  await requireUser("/cuenta/empresa/pedidos");
  const empresa = await getMiEmpresa();

  if (!empresa) {
    return (
      <div className="container-page max-w-2xl py-12">
        <h1 className="font-display text-3xl text-ink">Primero, tu empresa</h1>
        <p className="mt-3 text-muted">
          Los pedidos llegan a la empresa que vende. Da de alta la tuya y publica
          lo que ofreces.
        </p>
        <Link
          href="/vender#postular"
          className="mt-6 inline-block rounded-full bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Dar de alta mi empresa
        </Link>
      </div>
    );
  }

  const logistica = await logisticaDisponible();
  const items = await getPedidosDeEmpresa(empresa.id);

  const porDespachar = items.filter(
    (i) => i.envioEstado === "pendiente" && i.orderStatus !== "fulfilled",
  );
  const enCamino = items.filter((i) => i.envioEstado === "despachado");
  const entregados = items.filter((i) => i.envioEstado === "entregado").slice(0, 30);
  const sinEnvio = items.filter((i) => !i.envioEstado).slice(0, 30);

  return (
    <div className="container-page py-12">
      <Link
        href="/cuenta/empresa"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-brand-700"
      >
        <ArrowLeft className="size-4" />
        {empresa.name}
      </Link>

      <p className="mt-3 flex items-center gap-2 text-sm font-medium uppercase tracking-[0.2em] text-brand-600">
        <Truck className="size-4" />
        Lo que vendiste
      </p>
      <h1 className="mt-2 font-display text-3xl text-ink">Pedidos</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted">
        Aparecen cuando el pago está confirmado. Despacha, carga la guía y el
        comprador la recibe por correo. Lo que entregas en mano, márcalo
        entregado tú.
      </p>

      {!logistica ? (
        <p className="mt-8 rounded-xl bg-sand p-6 text-sm text-muted">
          El seguimiento de envíos se activa en cuanto el equipo termine de
          prepararlo. Mientras tanto, te avisamos por correo de cada pedido pagado.
        </p>
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-xl bg-white p-8 text-center ring-1 ring-hairline">
          <p className="font-display text-xl text-ink">Todavía no hay pedidos pagados</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Cuando alguien compre y confirmemos el pago, lo verás aquí con la
            dirección de entrega.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-10">
          <Seccion titulo="Por despachar" vacio="Nada pendiente. Buen trabajo." items={porDespachar} />
          <Seccion titulo="En camino" vacio="Nada en camino ahora mismo." items={enCamino} />
          {entregados.length > 0 && (
            <Seccion titulo="Entregados" vacio="" items={entregados} />
          )}
          {sinEnvio.length > 0 && (
            <Seccion titulo="Experiencias y servicios" vacio="" items={sinEnvio} />
          )}
        </div>
      )}
    </div>
  );
}

function Seccion({
  titulo,
  vacio,
  items,
}: {
  titulo: string;
  vacio: string;
  items: ItemDeEmpresa[];
}) {
  return (
    <section>
      <h2 className="font-display text-xl text-ink">
        {titulo} <span className="text-base text-muted">({items.length})</span>
      </h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{vacio}</p>
      ) : (
        <ul className="mt-3 grid gap-3 lg:grid-cols-2">
          {items.map((i) => (
            <Tarjeta key={i.id ?? `${i.orderId}-${i.titleSnapshot}`} item={i} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Tarjeta({ item }: { item: ItemDeEmpresa }) {
  const plazo = plazoDeEntrega(item.entregaDiasMin, item.entregaDiasMax);
  return (
    <li className="rounded-xl bg-white p-4 ring-1 ring-hairline">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-sm text-ink">{item.reference}</span>
        {item.envioEstado && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${COLOR_ENVIO[item.envioEstado]}`}
          >
            {ETIQUETA_ENVIO[item.envioEstado]}
          </span>
        )}
      </div>
      <p className="mt-2 font-medium text-ink">
        {item.qty} × {item.titleSnapshot}
      </p>
      <p className="text-xs text-muted">
        Pedido del {longDate(item.createdAt)}
        {item.date && <> · para el {shortDate(item.date)}</>}
        {item.envioCop !== undefined && item.envioEstado && (
          <> · envío cobrado {item.envioCop === 0 ? "gratis" : money(item.envioCop)}</>
        )}
      </p>

      <div className="mt-3 space-y-1 text-sm text-ink">
        <p>{item.buyerName}</p>
        {item.buyerPhone && (
          <p className="flex items-center gap-1.5 text-muted">
            <Phone className="size-3.5" aria-hidden />
            <a href={`tel:${item.buyerPhone}`} className="hover:text-brand-700">
              {item.buyerPhone}
            </a>
          </p>
        )}
        {item.destino && (
          <p className="flex items-start gap-1.5 text-muted">
            <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              {item.destino.direccion}, {item.destino.ciudad}, {item.destino.departamento}
              {item.destino.indicaciones && <span className="block">{item.destino.indicaciones}</span>}
            </span>
          </p>
        )}
      </div>

      {item.envioEstado && (
        <p className="mt-2 text-xs text-muted">
          {item.despacho ? ETIQUETA_DESPACHO[item.despacho] : "Sin modo de despacho declarado"}
          {item.transportadora && ` · ${item.transportadora}`}
          {item.guia && (
            <>
              {" · guía "}
              <strong className="font-mono text-ink">{item.guia}</strong>
            </>
          )}
          {item.envioEstado === "pendiente" && plazo && ` · prometiste que llega ${plazo}`}
        </p>
      )}

      {item.id && item.envioEstado && item.envioEstado !== "entregado" && (
        <AccionesDespacho
          itemId={item.id}
          estado={item.envioEstado}
          despacho={item.despacho}
          transportadora={item.transportadora}
        />
      )}
    </li>
  );
}
