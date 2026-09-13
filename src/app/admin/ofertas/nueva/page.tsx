import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { FormularioOferta } from "../formulario-oferta";
import { getProvidersForReview } from "@/lib/repo";

export const metadata: Metadata = { title: "Nueva oferta" };

export const dynamic = "force-dynamic";

export default async function NuevaOfertaPage() {
  // Se ofrecen todos los proveedores, aprobados o no, marcando cuáles no lo
  // están: preparar el catálogo de una empresa mientras se revisa su
  // postulación es un caso real. Lo que la publicación exige lo impone RLS
  // (`listings_public_read` pide oferta aprobada **y** proveedor aprobado), no
  // este desplegable.
  const proveedores = await getProvidersForReview();

  return (
    <div>
      <Link
        href="/admin/ofertas"
        className="mt-8 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-brand-700"
      >
        <ArrowLeft className="size-4" />
        Ofertas
      </Link>

      <h1 className="mt-3 font-display text-3xl text-ink sm:text-4xl">Nueva oferta</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Nace en borrador si así lo dejas al final. Publicarla la hace aparecer en
        el catálogo sin desplegar nada.
      </p>

      <FormularioOferta
        proveedores={proveedores.map((p) => ({
          id: p.id,
          name: p.name,
          aprobado: p.status === "approved",
        }))}
      />
    </div>
  );
}
