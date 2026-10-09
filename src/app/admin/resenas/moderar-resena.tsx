"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { moderarResena } from "./actions";

/** El botón de ocultar o mostrar una reseña, con su error al lado. */
export function ModerarResena({
  id,
  oculta,
  slug,
}: {
  id: string;
  oculta: boolean;
  slug?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function alternar() {
    if (!oculta && !window.confirm("¿Ocultar esta reseña del catálogo? Su autor la seguirá viendo.")) {
      return;
    }
    iniciar(async () => {
      const r = await moderarResena({ id, oculta: !oculta, slug });
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
        onClick={alternar}
        disabled={pendiente}
        className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-muted ring-1 ring-control transition hover:bg-sand hover:text-brand-700 disabled:opacity-40"
      >
        {pendiente ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : oculta ? (
          <Eye className="size-3.5" />
        ) : (
          <EyeOff className="size-3.5" />
        )}
        {oculta ? "Mostrar" : "Ocultar"}
      </button>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
