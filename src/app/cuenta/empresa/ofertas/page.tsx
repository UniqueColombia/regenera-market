import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Pencil, Plus, Tags } from "lucide-react";
import { RetirarOferta } from "./retirar-oferta";
import { ListingMedia } from "@/components/listing-media";
import { requireUser } from "@/lib/auth";
import { money } from "@/lib/format";
import { getMiEmpresa, getOfertasDeEmpresa } from "@/lib/repo";
import { privada } from "@/lib/seo";
import { KIND_LABEL, categoriaLabel } from "@/lib/taxonomy";
import type { ReviewStatus } from "@/lib/types";

export const metadata: Metadata = {
  title: "Lo que vendes",
  ...privada(),
};

export const dynamic = "force-dynamic";

/**
 * Lo que vende tu empresa: productos, experiencias y servicios, en cualquier
 * estado.
 *
 * Es la mitad que faltaba del alta directa. Desde la 0006 una empresa entra
 * sola al marketplace, pero para publicar una oferta tenía que escribirle al
 * equipo, que la cargaba desde `/admin/ofertas`. Ahora la escribe ella y el
 * equipo la revisa: el cuello de botella pasa de ser «cargar» a ser «revisar»,
 * que es más corto y es lo que de verdad le toca al equipo.
 */
const ESTADO: Record<ReviewStatus, { texto: string; clase: string }> = {
  draft: { texto: "Borrador", clase: "bg-sand text-muted ring-hairline" },
  pending_review: {
    texto: "En revisión",
    clase: "bg-clay-100 text-clay-700 ring-clay-300/60",
  },
  approved: { texto: "Publicada", clase: "bg-brand-50 text-brand-700 ring-brand-200" },
  rejected: { texto: "Rechazada", clase: "bg-red-50 text-red-700 ring-red-200" },
  suspended: { texto: "Suspendida", clase: "bg-red-50 text-red-700 ring-red-200" },
};

export default async function OfertasDeEmpresaPage() {
  await requireUser("/cuenta/empresa/ofertas");
  const empresa = await getMiEmpresa();

  if (!empresa) {
    return (
      <div className="container-page max-w-2xl py-12">
        <h1 className="font-display text-3xl text-ink">Primero, tu empresa</h1>
        <p className="mt-3 text-muted">
          Para publicar productos, experiencias o servicios hace falta dar de
          alta la empresa que los vende. Es un formulario y quedas dentro el
          mismo día.
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

  const ofertas = await getOfertasDeEmpresa(empresa.id);

  return (
    <div className="container-page max-w-3xl py-12">
      <Link
        href="/cuenta/empresa"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-brand-700"
      >
        <ArrowLeft className="size-4" />
        {empresa.name}
      </Link>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.2em] text-brand-600">
            <Tags className="size-4" />
            Lo que vendes
          </p>
          <h1 className="mt-2 font-display text-3xl text-ink">Tus ofertas</h1>
        </div>
        <Link
          href="/cuenta/empresa/ofertas/nueva"
          className="inline-flex items-center gap-2 rounded-full bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
        >
          <Plus className="size-4" />
          Nueva oferta
        </Link>
      </div>

      <p className="mt-3 max-w-2xl text-sm text-muted">
        Publica productos, experiencias o servicios. Revisamos cada oferta antes
        de que salga en el catálogo —sobre todo lo que dices de su impacto— y
        casi siempre queda publicada en un día hábil.
      </p>

      {ofertas.length === 0 ? (
        <div className="mt-8 rounded-xl bg-white p-8 text-center ring-1 ring-hairline">
          <p className="font-display text-xl text-ink">Todavía no publicas nada</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Empieza por lo que más vendes. Con una buena foto, el precio y lo que
            aporta al ambiente, ya tienes una ficha que un hotel puede comprar.
          </p>
          <Link
            href="/cuenta/empresa/ofertas/nueva"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-brand-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-800"
          >
            <Plus className="size-4" />
            Publicar mi primera oferta
          </Link>
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {ofertas.map((o) => (
            <li
              key={o.id}
              className="flex gap-4 rounded-xl bg-white p-4 ring-1 ring-hairline transition hover:ring-brand-300"
            >
              <div className="relative size-20 shrink-0 overflow-hidden rounded-lg">
                <ListingMedia
                  title={o.title}
                  category={o.category}
                  images={o.images}
                  iconClassName="size-7"
                  sizes="80px"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${ESTADO[o.status].clase}`}
                  >
                    {ESTADO[o.status].texto}
                  </span>
                  <span className="text-xs text-muted">
                    {KIND_LABEL[o.kind]} · {categoriaLabel(o.category)}
                  </span>
                </div>
                <h2 className="mt-1 truncate font-display text-lg text-ink">{o.title}</h2>
                <p className="text-sm text-muted">
                  {money(o.priceCop)} / {o.unit}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <Link
                  href={`/cuenta/empresa/ofertas/${o.id}`}
                  className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-control transition hover:bg-sand"
                >
                  <Pencil className="size-3.5" />
                  Editar
                </Link>
                {o.status === "approved" && (
                  <>
                    <Link
                      href={`/oferta/${o.slug}`}
                      className="flex items-center gap-1 text-xs text-brand-700 underline underline-offset-4"
                    >
                      Ver
                      <ExternalLink className="size-3" />
                    </Link>
                    <RetirarOferta id={o.id} titulo={o.title} />
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
