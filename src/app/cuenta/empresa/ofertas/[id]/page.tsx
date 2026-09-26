import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { guardarOfertaDeEmpresa } from "../actions";
import { FormularioOferta } from "@/components/formulario-oferta";
import { requireUser } from "@/lib/auth";
import { getMiEmpresa, getOfertaDeEmpresa } from "@/lib/repo";
import { privada } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Editar oferta",
  ...privada(),
};

export const dynamic = "force-dynamic";

export default async function EditarOfertaDeEmpresaPage(
  props: PageProps<"/cuenta/empresa/ofertas/[id]">,
) {
  const { id } = await props.params;
  await requireUser(`/cuenta/empresa/ofertas/${id}`);

  const empresa = await getMiEmpresa();
  if (!empresa) redirect("/cuenta/empresa/ofertas");

  // Por empresa y por id a la vez: una oferta publicada de otra empresa se
  // puede leer (está en el catálogo), pero no se puede editar desde aquí.
  const oferta = await getOfertaDeEmpresa(empresa.id, id);
  if (!oferta) notFound();

  return (
    <div className="container-page max-w-3xl py-12">
      <Link
        href="/cuenta/empresa/ofertas"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-brand-700"
      >
        <ArrowLeft className="size-4" />
        Tus ofertas
      </Link>

      <h1 className="mt-3 font-display text-3xl text-ink sm:text-4xl">{oferta.title}</h1>
      {oferta.status === "approved" && (
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Está publicada. Si cambias algo, sale del catálogo hasta que lo
          revisemos: lo que aprobamos fue esta versión.
        </p>
      )}

      <FormularioOferta
        modo="empresa"
        oferta={oferta}
        guardar={guardarOfertaDeEmpresa}
        destino="/cuenta/empresa/ofertas"
        verificada={empresa.evaluacionVerificada}
      />
    </div>
  );
}
