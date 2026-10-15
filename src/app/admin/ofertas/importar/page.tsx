import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { guardarOferta, subirImagenDeOfertaAdmin } from "../actions";
import { ElegirCantidadOfertas } from "@/components/elegir-cantidad-ofertas";
import { ImportarOfertas } from "@/components/importar-ofertas";
import { enviosPorZonaDisponible, getProvidersForReview, logisticaDisponible } from "@/lib/repo";

export const metadata: Metadata = { title: "Cargar ofertas desde Excel" };

export const dynamic = "force-dynamic";

/**
 * Cargar el portafolio de un proveedor desde la planilla.
 *
 * Es el camino para «un proveedor nos mandó su catálogo en Word o PDF»: el
 * equipo pasa cada oferta a una fila de la plantilla, elige el proveedor y
 * sube la planilla con las fotos. Cada fila pasa por `guardarOferta()`, la
 * misma acción del formulario del panel, y RLS autoriza igual que allí.
 *
 * Se ofrecen todos los proveedores, aprobados o no, por lo mismo que en
 * «Nueva oferta»: preparar el catálogo de una empresa mientras se revisa su
 * alta es un caso real.
 */
export default async function ImportarOfertasAdminPage() {
  const proveedores = await getProvidersForReview();
  const logistica = await logisticaDisponible();

  return (
    <div className="max-w-4xl">
      <Link
        href="/admin/ofertas"
        className="mt-8 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-brand-700"
      >
        <ArrowLeft className="size-4" />
        Ofertas
      </Link>

      <h1 className="mt-3 font-display text-3xl text-ink sm:text-4xl">Cargar ofertas desde Excel</h1>
      <ElegirCantidadOfertas
        activa="varias"
        hrefUna="/admin/ofertas/nueva"
        hrefVarias="/admin/ofertas/importar"
      />
      <p className="mt-2 max-w-2xl text-muted">
        Para el portafolio que un proveedor te mandó: pásalo a la plantilla,
        elige de quién es y súbelo con sus fotos. Si el proveedor tiene cuenta,
        también puede hacerlo él desde «Tus ofertas».
      </p>

      <ImportarOfertas
        modo="admin"
        proveedores={proveedores.map((p) => ({
          id: p.id,
          name: p.name,
          aprobado: p.status === "approved",
        }))}
        logistica={logistica}
        zonas={logistica && (await enviosPorZonaDisponible())}
        guardar={guardarOferta}
        subirImagen={subirImagenDeOfertaAdmin}
        rutaEdicion="/admin/ofertas/"
        volver="/admin/ofertas"
      />
    </div>
  );
}
