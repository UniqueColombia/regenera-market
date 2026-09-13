"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Loader2, Pause, X } from "lucide-react";
import { decidirProveedor } from "./actions";
import type { ReviewStatus } from "@/lib/types";

/**
 * Botones de decisión de una fila del panel.
 *
 * Isla de cliente dentro de una página de servidor: lo único que necesita
 * interactividad es esto, así que la página sigue renderizándose en el servidor
 * y la lista completa no viaja al navegador.
 *
 * Solo se ofrecen las decisiones que cambian algo: a un proveedor ya aprobado no
 * se le vuelve a ofrecer "aprobar".
 */
export function DecisionProveedor({
  providerId,
  estado,
  nombre,
}: {
  providerId: string;
  estado: ReviewStatus;
  nombre: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function decidir(destino: ReviewStatus, confirmar?: string) {
    if (confirmar && !window.confirm(confirmar)) return;
    iniciar(async () => {
      const r = await decidirProveedor({ providerId, estado: destino });
      if (r.ok) {
        setError(null);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {pendiente && <Loader2 className="size-4 animate-spin text-muted" />}

        {estado !== "approved" && (
          <button
            type="button"
            disabled={pendiente}
            onClick={() => decidir("approved")}
            className="flex items-center gap-1.5 rounded-full bg-brand-700 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-800 active:bg-brand-800 disabled:bg-muted"
          >
            <Check className="size-3.5" />
            Aprobar
          </button>
        )}

        {estado !== "rejected" && (
          <button
            type="button"
            disabled={pendiente}
            onClick={() =>
              decidir(
                "rejected",
                `¿Rechazar a ${nombre}? Sus ofertas dejarán de verse en el catálogo.`,
              )
            }
            className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-muted ring-1 ring-control transition hover:bg-sand hover:text-red-700 active:bg-sand disabled:opacity-40"
          >
            <X className="size-3.5" />
            Rechazar
          </button>
        )}

        {estado === "approved" && (
          <button
            type="button"
            disabled={pendiente}
            onClick={() =>
              decidir(
                "suspended",
                `¿Suspender a ${nombre}? Sus ofertas dejan de verse hasta que lo reactives.`,
              )
            }
            className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-muted ring-1 ring-control transition hover:bg-sand hover:text-clay-700 active:bg-sand disabled:opacity-40"
          >
            <Pause className="size-3.5" />
            Suspender
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
