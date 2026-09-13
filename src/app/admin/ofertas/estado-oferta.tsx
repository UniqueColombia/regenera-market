"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { cambiarEstadoOferta } from "./actions";
import type { ReviewStatus } from "@/lib/types";

/**
 * Publicar o retirar una oferta desde la lista, sin abrir el formulario.
 *
 * Es la operación que más se repite en el panel: aprobar lo que mandó un
 * proveedor, o retirar algo que se agotó. Obligarla a pasar por el formulario
 * entero serían seis clics para cambiar una palabra.
 */
export function EstadoOferta({
  id,
  estado,
  titulo,
}: {
  id: string;
  estado: ReviewStatus;
  titulo: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const publicada = estado === "approved";

  function alternar() {
    const destino: ReviewStatus = publicada ? "draft" : "approved";
    if (
      publicada &&
      !window.confirm(`¿Retirar «${titulo}» del catálogo? Vuelve a borrador; no se borra nada.`)
    ) {
      return;
    }

    iniciar(async () => {
      const r = await cambiarEstadoOferta({ id, status: destino });
      if (r.ok) {
        setError(null);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pendiente}
        onClick={alternar}
        className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
          publicada
            ? "text-muted ring-1 ring-control hover:bg-sand hover:text-clay-700"
            : "bg-brand-700 text-white hover:bg-brand-800"
        }`}
      >
        {pendiente ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : publicada ? (
          <EyeOff className="size-3.5" />
        ) : (
          <Eye className="size-3.5" />
        )}
        {publicada ? "Retirar" : "Publicar"}
      </button>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
