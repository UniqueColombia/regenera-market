"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";

/**
 * El botón «Eliminar» del panel (2026-10-23): órdenes, postulaciones y
 * usuarios.
 *
 * Recibe la Server Action y sus datos desde la página de servidor, así las tres
 * listas comparten el mismo trato: pregunta antes con el nombre de lo que se
 * borra dentro de la frase —equivocarse de fila es fácil—, enseña el error
 * donde se pulsó y recarga la lista si salió bien. Quién puede borrar qué lo
 * decide la acción, no este botón.
 */
export function BotonEliminar({
  accion,
  datos,
  pregunta,
  etiqueta = "Eliminar",
}: {
  accion: (datos: unknown) => Promise<{ ok: true } | { ok: false; error: string }>;
  datos: unknown;
  /** La pregunta de confirmación, con el nombre de lo que se borra. */
  pregunta: string;
  etiqueta?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function eliminar() {
    if (!window.confirm(`${pregunta}\n\nNo se puede deshacer.`)) return;
    iniciar(async () => {
      const r = await accion(datos);
      if (r.ok) {
        setError(null);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <button
        type="button"
        onClick={eliminar}
        disabled={pendiente}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-muted ring-1 ring-control transition hover:bg-red-50 hover:text-red-700 hover:ring-red-200 disabled:opacity-40"
      >
        {pendiente ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Trash2 className="size-3.5" aria-hidden />}
        {etiqueta}
      </button>
      {error && <p className="max-w-xs text-xs text-red-700 sm:text-right">{error}</p>}
    </div>
  );
}
