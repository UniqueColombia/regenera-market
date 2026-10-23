"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Star, StarOff } from "lucide-react";
import { destacarOferta } from "./actions";

/**
 * Poner o quitar una oferta de «Ofertas destacadas» de la portada, desde la
 * lista. Es el compañero de `EstadoOferta`: los dos existen para no abrir el
 * formulario entero por un solo cambio.
 */
export function DestacarOferta({
  id,
  destacada,
  titulo,
}: {
  id: string;
  destacada: boolean;
  titulo: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function alternar() {
    iniciar(async () => {
      const r = await destacarOferta({ id, featured: !destacada });
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
        aria-label={destacada ? `Quitar «${titulo}» de destacadas` : `Destacar «${titulo}» en la portada`}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
          destacada
            ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200 hover:bg-sand"
            : "text-muted ring-1 ring-control hover:bg-sand hover:text-brand-700"
        }`}
      >
        {pendiente ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : destacada ? (
          <StarOff className="size-3.5" />
        ) : (
          <Star className="size-3.5" />
        )}
        {destacada ? "Quitar destacado" : "Destacar"}
      </button>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
