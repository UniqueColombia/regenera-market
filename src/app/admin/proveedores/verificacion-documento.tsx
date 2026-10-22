"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BadgeCheck, Loader2 } from "lucide-react";
import { verificarDocumento } from "./actions";

/**
 * El sello de «documento verificado» de una empresa (auditoría del 2026-10-22).
 * Antes de marcarlo: buscar el documento en el registro público del país (RUES
 * en Colombia) y comprobar que la empresa es la que dice ser.
 */
export function VerificacionDocumento({
  providerId,
  nombre,
  documento,
  verificado,
}: {
  providerId: string;
  nombre: string;
  documento?: string;
  verificado: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function cambiar() {
    const pregunta = verificado
      ? `¿Quitar la verificación de ${nombre}? Su ficha dejará de decir «Empresa verificada».`
      : `¿Comprobaste el documento ${documento ?? "(sin documento)"} de ${nombre} en el registro público?`;
    if (!window.confirm(pregunta)) return;
    iniciar(async () => {
      const r = await verificarDocumento({ providerId, verificado: !verificado });
      if (r.ok) {
        setError(null);
        router.refresh();
      } else setError(r.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pendiente || (!verificado && !documento)}
        onClick={cambiar}
        title={!verificado && !documento ? "No declaró documento" : undefined}
        className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
          verificado
            ? "bg-brand-50 text-brand-800 ring-1 ring-brand-200 hover:bg-sand"
            : "text-muted ring-1 ring-control hover:bg-sand hover:text-brand-700"
        }`}
      >
        {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <BadgeCheck className="size-3.5" />}
        {verificado ? "Documento verificado" : "Verificar documento"}
      </button>
      {error && <p className="max-w-56 text-right text-xs text-red-700">{error}</p>}
    </div>
  );
}
