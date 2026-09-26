"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { EyeOff, Loader2 } from "lucide-react";
import { retirarOferta } from "./actions";

/**
 * Sacar una oferta del catálogo sin borrarla.
 *
 * Cliente por el botón y la confirmación. Pide confirmar porque, aunque se
 * puede deshacer, volver a publicarla pasa otra vez por revisión: no es un
 * interruptor que se pueda probar a ver qué pasa.
 */
export function RetirarOferta({ id, titulo }: { id: string; titulo: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function retirar() {
    if (
      !window.confirm(
        `¿Retirar «${titulo}» del catálogo? Queda como borrador y para volver a publicarla la revisamos otra vez.`,
      )
    ) {
      return;
    }
    iniciar(async () => {
      const r = await retirarOferta(id);
      if (r.ok) {
        setError(null);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={retirar}
        disabled={pendiente}
        className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-muted ring-1 ring-control transition hover:bg-sand hover:text-clay-700 disabled:opacity-40"
      >
        {pendiente ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <EyeOff className="size-3.5" />
        )}
        Retirar
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </span>
  );
}
