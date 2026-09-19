"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Eye, Loader2, Pause, Star, StarOff } from "lucide-react";
import { destacarPublicacion, moderarPublicacion } from "./actions";
import type { ReviewStatus } from "@/lib/types";

/**
 * Los botones de una fila del panel de Comunidad.
 *
 * Isla de cliente dentro de una página de servidor, como `DecisionProveedor`:
 * lo único que necesita el navegador es esto, y la lista entera se sigue
 * pintando en el servidor.
 *
 * Solo se ofrece lo que cambia algo: a una publicación visible no se le ofrece
 * «volver a publicar».
 */
export function DecisionPublicacion({
  postId,
  estado,
  destacada,
  titulo,
  puedeDestacar,
}: {
  postId: string;
  estado: ReviewStatus;
  destacada: boolean;
  titulo: string;
  /** Solo se destaca lo que firma una empresa: es a ella a quien le da puntos. */
  puedeDestacar: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function correr(
    accion: () => Promise<{ ok: boolean; error?: string }>,
    confirmar?: string,
  ) {
    if (confirmar && !window.confirm(confirmar)) return;
    iniciar(async () => {
      const r = await accion();
      if (r.ok) {
        setError(null);
        router.refresh();
      } else {
        setError(r.error ?? "No se pudo completar la acción");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {pendiente && <Loader2 className="size-4 animate-spin text-muted" />}

        {puedeDestacar && (
          <button
            type="button"
            disabled={pendiente || estado !== "approved"}
            onClick={() =>
              correr(
                () => destacarPublicacion({ postId, destacada: !destacada }),
                destacada
                  ? undefined
                  : `¿Destacar «${titulo}»? Le suma 80 puntos de experiencia a la empresa que la firma, y eso le baja la comisión.`,
              )
            }
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
              destacada
                ? "bg-brand-700 text-white hover:bg-brand-800"
                : "text-muted ring-1 ring-control hover:bg-sand hover:text-brand-700"
            }`}
          >
            {destacada ? (
              <StarOff className="size-3.5" />
            ) : (
              <Star className="size-3.5" />
            )}
            {destacada ? "Quitar destacado" : "Destacar"}
          </button>
        )}

        {estado === "approved" ? (
          <button
            type="button"
            disabled={pendiente}
            onClick={() =>
              correr(
                () => moderarPublicacion({ postId, estado: "suspended" }),
                `¿Ocultar «${titulo}»? Deja de verse en el muro; su autor la sigue viendo.`,
              )
            }
            className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-muted ring-1 ring-control transition hover:bg-sand hover:text-red-700 active:bg-sand disabled:opacity-40"
          >
            <Pause className="size-3.5" />
            Ocultar
          </button>
        ) : (
          <button
            type="button"
            disabled={pendiente}
            onClick={() => correr(() => moderarPublicacion({ postId, estado: "approved" }))}
            className="flex items-center gap-1.5 rounded-full bg-brand-700 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-800 active:bg-brand-800 disabled:bg-muted"
          >
            <Eye className="size-3.5" />
            Volver a publicar
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
