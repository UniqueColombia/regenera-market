import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileSpreadsheet, Plus, SquarePen } from "lucide-react";
import { DestacarOferta } from "./destacar-oferta";
import { EstadoOferta } from "./estado-oferta";
import { Paginacion } from "@/components/paginacion";
import { leerPagina, urlDePagina } from "@/lib/paginacion";
import { getOfertasParaAdmin } from "@/lib/repo";
import { money } from "@/lib/format";
import { KIND_LABEL, categoriaLabel } from "@/lib/taxonomy";
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
 * El catálogo desde dentro: todas las ofertas, en cualquier estado, por
 * páginas y con filtro por estado (desde el 2026-10-12).
 *
 * **Esta es la pantalla que hacía falta para que el proyecto fuera operable.**
 * Sin ella, cambiar un precio significaba editar `src/data/`, abrir un PR y
 * esperar un despliegue; ahora es un `UPDATE` y el catálogo cambia solo.
 *
 * Se avisa cuando una oferta está publicada pero su proveedor no está aprobado:
 * la política `listings_public_read` exige las dos cosas, así que en el sitio no
 * se ve — y desde esta lista parecería que sí.
 */
export default async function OfertasPage(props: PageProps<"/admin/ofertas">) {
  const sp = await props.searchParams;
  const pedido = Array.isArray(sp.estado) ? sp.estado[0] : sp.estado;
  // `hasOwn` y no `in`: `"toString" in ETIQUETA` es verdadero.
  const estado = pedido && Object.hasOwn(ETIQUETA, pedido) ? (pedido as ReviewStatus) : undefined;
  const pedida = leerPagina(sp.pagina);

  const resultado = await getOfertasParaAdmin(estado, pedida);
  if (pedida > resultado.paginas) redirect(urlDePagina("/admin/ofertas", sp, resultado.paginas));
  const { filas: ofertas, pagina, paginas, porEstado } = resultado;

  // De la base, sobre todas las ofertas: no sobre la página que se ve.
  const todas = Object.values(porEstado).reduce((s, n) => s + n, 0);
  const publicadas = porEstado.approved;

  return (
    <div>
      <header className="mt-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-ink sm:text-4xl">Ofertas</h1>
          <p className="mt-2 max-w-2xl text-muted">
            {todas} en total, {publicadas} en el catálogo. Lo que
            cambies aquí se ve en el sitio sin desplegar nada.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            href="/admin/ofertas/importar"
            className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-brand-700 ring-1 ring-control transition hover:bg-sand"
          >
            <FileSpreadsheet className="size-4" />
            Cargar desde Excel
          </Link>
          <Link
            href="/admin/ofertas/nueva"
            className="flex items-center gap-2 rounded-full bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
          >
            <Plus className="size-4" />
            Nueva oferta
          </Link>
        </div>
      </header>

      <nav aria-label="Filtrar por estado" className="mt-6 flex flex-wrap gap-2">
        {([undefined, ...(Object.keys(ETIQUETA) as ReviewStatus[])] as (ReviewStatus | undefined)[]).map((e) => {
          const activo = e === estado;
          return (
            <Link
              key={e ?? "todas"}
              href={e ? `/admin/ofertas?estado=${e}` : "/admin/ofertas"}
              aria-current={activo ? "page" : undefined}
              className={`rounded-full px-3 py-1.5 text-sm ring-1 transition ${
                activo ? "bg-brand-700 text-white ring-brand-700" : "bg-white text-ink ring-hairline hover:bg-sand"
              }`}
            >
              {e ? ETIQUETA[e] : "Todas"}{" "}
              <span className="tabular-nums opacity-70">{e ? porEstado[e] : todas}</span>
            </Link>
          );
        })}
      </nav>

      {ofertas.length === 0 ? (
        <p className="mt-10 rounded-xl bg-white p-10 text-center text-muted ring-1 ring-hairline">
          {estado ? "No hay ofertas en este estado." : "No hay ninguna oferta todavía."}
        </p>
      ) : (
        <ul className="mt-6 grid gap-2 xl:grid-cols-2">
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
                  {KIND_LABEL[o.kind]} · {o.providerName} · {categoriaLabel(o.category)}
                  {o.quoteOnly ? " · solo cotización" : ` · ${money(o.priceCop)} / ${o.unit}`}
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <EstadoOferta id={o.id} estado={o.status} titulo={o.title} version={o.version} />
                {/* Solo donde tiene efecto: destacar un borrador no lo saca en la
                    portada. Si ya está destacada sí se ofrece, para poder
                    quitárselo aunque se haya retirado. */}
                {(o.status === "approved" || o.featured) && (
                  <DestacarOferta id={o.id} destacada={o.featured} titulo={o.title} />
                )}
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

      <Paginacion ruta="/admin/ofertas" params={sp} pagina={pagina} paginas={paginas} />
    </div>
  );
}
