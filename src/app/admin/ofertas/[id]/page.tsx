import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { guardarFechas, guardarOferta, subirImagenDeOfertaAdmin } from "../actions";
import { FechasDeExperiencia } from "@/components/fechas-de-experiencia";
import { FormularioOferta } from "@/components/formulario-oferta";
import {
  enviosPorZonaDisponible,
  getFechasDeOferta,
  getListingByIdForAdmin,
  getProvidersForReview,
  logisticaDisponible,
} from "@/lib/repo";

export const metadata: Metadata = { title: "Editar oferta" };

export const dynamic = "force-dynamic";

export default async function EditarOfertaPage(
  props: PageProps<"/admin/ofertas/[id]">,
) {
  const { id } = await props.params;

  const [oferta, proveedores] = await Promise.all([
    getListingByIdForAdmin(id),
    getProvidersForReview(),
  ]);

  // `notFound()` y no un mensaje propio: si RLS negó la lectura, la respuesta
  // honesta desde aquí es la misma que si la oferta no existiera.
  if (!oferta) notFound();

  return (
    <div>
      <Link
        href="/admin/ofertas"
        className="mt-8 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-brand-700"
      >
        <ArrowLeft className="size-4" />
        Ofertas
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl text-ink sm:text-4xl">{oferta.title}</h1>
        {oferta.status === "approved" && (
          <Link
            href={`/oferta/${oferta.slug}`}
            className="flex items-center gap-1.5 text-sm text-brand-700 underline underline-offset-4"
          >
            Ver en el sitio
            <ExternalLink className="size-3.5" />
          </Link>
        )}
      </div>

      <FormularioOferta
        guardar={guardarOferta}
        subirImagen={subirImagenDeOfertaAdmin}
        logistica={await logisticaDisponible()}
        zonas={await enviosPorZonaDisponible()}
        destino="/admin/ofertas"
        oferta={oferta}
        proveedores={proveedores.map((p) => ({
          id: p.id,
          name: p.name,
          aprobado: p.status === "approved",
        }))}
        fechas={
          oferta.kind === "experience" ? (
            <FechasDeExperiencia
              className="order-3"
              inicial={await getFechasDeOferta(oferta.id)}
              guardar={guardarFechas.bind(null, oferta.id)}
            />
          ) : undefined
        }
      />
    </div>
  );
}
