import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { avisarOfertasImportadas, guardarOfertaDeEmpresa, subirImagenDeOferta } from "../actions";
import { ElegirCantidadOfertas } from "@/components/elegir-cantidad-ofertas";
import { ImportarOfertas } from "@/components/importar-ofertas";
import { requireUser } from "@/lib/auth";
import { enviosPorZonaDisponible, getMiEmpresa, logisticaDisponible } from "@/lib/repo";
import { privada } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Cargar ofertas desde Excel",
  ...privada(),
};

export const dynamic = "force-dynamic";

/**
 * Cargar muchas ofertas de una vez, desde la planilla.
 *
 * Para la empresa que tiene veinte productos y no quiere llenar veinte veces el
 * formulario, o que ya tiene su catálogo en un Excel. Cada fila pasa por
 * `guardarOfertaDeEmpresa()`, la misma acción del formulario: mismas reglas,
 * misma revisión del equipo antes de publicarse.
 */
export default async function ImportarOfertasPage() {
  await requireUser("/cuenta/empresa/ofertas/importar");
  const empresa = await getMiEmpresa();
  if (!empresa) redirect("/cuenta/empresa/ofertas");

  const logistica = await logisticaDisponible();

  return (
    <div className="container-page max-w-4xl py-12">
      <Link
        href="/cuenta/empresa/ofertas"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-brand-700"
      >
        <ArrowLeft className="size-4" />
        Tus ofertas
      </Link>

      <ElegirCantidadOfertas
        activa="varias"
        hrefUna="/cuenta/empresa/ofertas/nueva"
        hrefVarias="/cuenta/empresa/ofertas/importar"
      />

      <p className="mt-6 flex items-center gap-2 text-sm font-medium uppercase tracking-[0.2em] text-brand-600">
        <FileSpreadsheet className="size-4" />
        Carga masiva
      </p>
      <h1 className="mt-2 font-display text-3xl text-ink">Carga todas tus ofertas de una vez</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Llena la plantilla con tus productos, experiencias o servicios, súbela
        con sus fotos y te mostramos cada fila antes de guardar. Las revisamos
        antes de publicarlas, como cuando las escribes una a una.
      </p>

      <ImportarOfertas
        modo="empresa"
        empresaId={empresa.id}
        verificada={empresa.evaluacionVerificada}
        logistica={logistica}
        zonas={logistica && (await enviosPorZonaDisponible())}
        guardar={guardarOfertaDeEmpresa}
        subirImagen={subirImagenDeOferta}
        avisar={avisarOfertasImportadas}
        rutaEdicion="/cuenta/empresa/ofertas/"
        volver="/cuenta/empresa/ofertas"
      />
    </div>
  );
}
