import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { guardarOfertaDeEmpresa } from "../actions";
import { FormularioOferta } from "@/components/formulario-oferta";
import { requireUser } from "@/lib/auth";
import { getMiEmpresa } from "@/lib/repo";
import { privada } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Nueva oferta",
  ...privada(),
};

export const dynamic = "force-dynamic";

export default async function NuevaOfertaDeEmpresaPage() {
  await requireUser("/cuenta/empresa/ofertas/nueva");
  const empresa = await getMiEmpresa();
  if (!empresa) redirect("/cuenta/empresa/ofertas");

  return (
    <div className="container-page max-w-3xl py-12">
      <Link
        href="/cuenta/empresa/ofertas"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-brand-700"
      >
        <ArrowLeft className="size-4" />
        Tus ofertas
      </Link>

      <h1 className="mt-3 font-display text-3xl text-ink sm:text-4xl">
        ¿Qué quieres vender?
      </h1>
      <p className="mt-2 max-w-2xl text-muted">
        Un producto, una experiencia o un servicio de {empresa.name}. Lo
        revisamos antes de publicarlo y te avisamos cuando esté en el catálogo.
      </p>

      {!empresa.evaluacionVerificada && (
        <p className="mt-4 flex max-w-2xl items-start gap-2 rounded-xl bg-sand p-4 text-sm text-muted">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-clay-600" aria-hidden />
          <span>
            Para ofrecer consultoría o implementación necesitas el sello
            verificado por Seregenera.{" "}
            <Link
              href="/verificacion"
              className="font-medium text-brand-700 underline underline-offset-4"
            >
              Cómo se obtiene
            </Link>
            .
          </span>
        </p>
      )}

      <FormularioOferta
        modo="empresa"
        guardar={guardarOfertaDeEmpresa}
        destino="/cuenta/empresa/ofertas"
        verificada={empresa.evaluacionVerificada}
      />
    </div>
  );
}
