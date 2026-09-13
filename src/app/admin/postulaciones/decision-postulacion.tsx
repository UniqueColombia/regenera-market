"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Loader2, X } from "lucide-react";
import { decidirPostulacion } from "./actions";

/**
 * Aprobar o rechazar una postulación.
 *
 * Isla de cliente dentro de una página de servidor: lo único que necesita
 * interactividad son los dos botones y el campo de notas.
 *
 * El aviso que devuelve el servidor se muestra **sin desaparecer solo**: cuando
 * una empresa queda creada sin dueño, eso es una tarea pendiente para el
 * administrador, no una notificación que se pueda perder en tres segundos.
 */
export function DecisionPostulacion({
  id,
  nombre,
  decidida,
}: {
  id: string;
  nombre: string;
  decidida: boolean;
}) {
  const router = useRouter();
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function decidir(decision: "approved" | "rejected") {
    const confirmar =
      decision === "approved"
        ? `¿Aprobar a ${nombre}? Se crea su ficha de proveedor y queda visible en el sitio.`
        : `¿Rechazar a ${nombre}?`;
    if (!window.confirm(confirmar)) return;

    iniciar(async () => {
      const r = await decidirPostulacion({ id, decision, notas });
      if (r.ok) {
        setError(null);
        setAviso(r.aviso ?? null);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  if (decidida) return null;

  return (
    <div className="mt-4 border-t border-hairline pt-4">
      <label htmlFor={`notas-${id}`} className="mb-1 block text-xs font-medium text-muted">
        Notas de la revisión (opcional, no se le muestran a quien postuló)
      </label>
      <textarea
        id={`notas-${id}`}
        rows={2}
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        className="w-full rounded-lg border border-control bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {pendiente && <Loader2 className="size-4 animate-spin text-muted" />}

        <button
          type="button"
          disabled={pendiente}
          onClick={() => decidir("approved")}
          className="flex items-center gap-1.5 rounded-full bg-brand-700 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-800 disabled:bg-muted"
        >
          <Check className="size-3.5" />
          Aprobar y crear la empresa
        </button>

        <button
          type="button"
          disabled={pendiente}
          onClick={() => decidir("rejected")}
          className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-muted ring-1 ring-control transition hover:bg-sand hover:text-red-700 disabled:opacity-40"
        >
          <X className="size-3.5" />
          Rechazar
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      {aviso && (
        <p className="mt-2 rounded-lg bg-clay-100 p-3 text-xs text-clay-700">
          {aviso}
        </p>
      )}
    </div>
  );
}
