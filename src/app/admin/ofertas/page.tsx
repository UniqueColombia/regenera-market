import type { Metadata } from "next";
import Link from "next/link";
import { Plus, SquarePen } from "lucide-react";
import { EstadoOferta } from "./estado-oferta";
import { getListingsForAdmin } from "@/lib/repo";
import { money } from "@/lib/format";
import { KIND_LABEL } from "@/lib/taxonomy";
import type { ReviewStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Ofertas" };

export const dynamic = "force-dynamic";

const ETIQUETA: Record<ReviewStatus, string> = {
  draft: "Borrador",
  pending_review: "Esperando revisión",
  approved: "Publicada",
  rejected: "Rechazada",
  suspended: "Suspendida",
};

const COLOR: Record<ReviewStatus, string> = {
  draft: "bg-sand text-muted ring-hairline",
  pending_review: "bg-clay-100 text-clay-700 ring-clay-300/60",
  approved: "bg-brand-50 text-brand-700 ring-brand-200",
  rejected: "bg-red-50 text-red-700 ring-red-200",
  suspended: "bg-clay-100 text-clay-700 ring-clay-300/60",
};

/**
 * El catálogo desde dentro: todas las ofertas, en cualquier estado.
 *
 * **Esta es la pantalla que hacía falta para que el proyecto fuera operable.**
 * Sin ella, cambiar un precio significaba editar `src/data/`, abrir un PR y
 * esperar un despliegue; ahora es un `UPDATE` y el catálogo cambia solo.
 *
 * Se avisa cuando una oferta está publicada pero su proveedor no está aprobado:
 * la política `listings_public_read` exige las dos cosas, así que en el sitio no
 * se ve — y desde esta lista parecería que sí.
 */
export default async function OfertasPage() {
  const ofertas = await getListingsForAdmin();

  const publicadas = ofertas.filter((o) => o.status === "approved").length;

  return (
    <div>
      <header className="mt-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-ink sm:text-4xl">Ofertas</h1>
          <p className="mt-2 max-w-2xl text-muted">
            {ofertas.length} en total, {publicadas} en el catálogo. Lo que
            cambies aquí se ve en el sitio sin desplegar nada.
          </p>
        </div>

        <Link
          href="/admin/ofertas/nueva"
          className="flex shrink-0 items-center gap-2 rounded-full bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
        >
          <Plus className="size-4" />
          Nueva oferta
        </Link>
      </header>

      {ofertas.length === 0 ? (
        <p className="mt-10 rounded-xl bg-white p-10 text-center text-muted ring-1 ring-hairline">
          No hay ninguna oferta todavía.
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {ofertas.map((o) => (
            <li
              key={o.id}
              className="flex flex-col gap-3 rounded-xl bg-white p-4 ring-1 ring-hairline sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/admin/ofertas/${o.id}`}
                    className="font-medium text-ink transition-colors hover:text-brand-700"
                  >
                    {o.title}
                  </Link>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${COLOR[o.status]}`}
                  >
                    {ETIQUETA[o.status]}
                  </span>
                  {o.featured && (
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 ring-1 ring-brand-200">
                      destacada
                    </span>
                  )}
                  {o.status === "approved" && o.providerStatus !== "approved" && (
                    <span className="rounded-full bg-clay-100 px-2 py-0.5 text-xs font-medium text-clay-700 ring-1 ring-clay-300/60">
                      su proveedor no está aprobado: no se ve
                    </span>
                  )}
                </div>

                <p className="mt-0.5 text-sm text-muted">
                  {KIND_LABEL[o.kind]} · {o.providerName} · {o.category}
                  {o.quoteOnly ? " · solo cotización" : ` · ${money(o.priceCop)} / ${o.unit}`}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <EstadoOferta id={o.id} estado={o.status} titulo={o.title} />
                <Link
                  href={`/admin/ofertas/${o.id}`}
                  aria-label={`Editar ${o.title}`}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-muted ring-1 ring-control transition hover:bg-sand hover:text-brand-700"
                >
                  <SquarePen className="size-3.5" />
                  Editar
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
