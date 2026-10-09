"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { HandHeart, Loader2, Truck } from "lucide-react";
import { despachar, marcarEntregado } from "./actions";
import { TRANSPORTADORAS } from "@/lib/envios";
import type { Despacho, EnvioEstado } from "@/lib/types";

/**
 * Los botones de un ítem vendido: despacharlo (con su guía si va por
 * transportadora) y marcarlo entregado si lo llevó la empresa.
 *
 * El botón se deshabilita mientras se guarda, pero lo que impide despachar dos
 * veces es la base: ver `despachar_item()` en la migración 0014.
 */
export function AccionesDespacho({
  itemId,
  estado,
  despacho,
  transportadora,
}: {
  itemId: string;
  estado: EnvioEstado;
  despacho?: Despacho;
  transportadora?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const porTransportadora = despacho !== "vendedor";

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    iniciar(async () => {
      const r = await despachar({
        itemId,
        transportadora: String(fd.get("transportadora") ?? ""),
        guia: String(fd.get("guia") ?? ""),
      });
      if (r.ok) {
        setError(null);
        setAviso(r.aviso ?? null);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  function entregar() {
    if (!window.confirm("¿Confirmas que el comprador ya lo recibió?")) return;
    iniciar(async () => {
      const r = await marcarEntregado({ itemId });
      if (r.ok) {
        setError(null);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <div className="mt-3 space-y-2">
      {estado === "pendiente" && (
        <form onSubmit={enviar} className="flex flex-wrap items-end gap-2">
          {porTransportadora && (
            <>
              <label className="min-w-0 flex-1 basis-40">
                <span className="mb-1 block text-xs font-medium text-muted">Transportadora</span>
                <input
                  name="transportadora"
                  list={`transportadoras-${itemId}`}
                  defaultValue={transportadora ?? ""}
                  maxLength={60}
                  className="w-full rounded-lg border border-control bg-white px-3 py-1.5 text-sm outline-none focus:border-brand-500"
                />
                <datalist id={`transportadoras-${itemId}`}>
                  {TRANSPORTADORAS.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </label>
              <label className="min-w-0 flex-1 basis-40">
                <span className="mb-1 block text-xs font-medium text-muted">Número de guía</span>
                <input
                  name="guia"
                  required={despacho === "transportadora"}
                  maxLength={80}
                  className="w-full rounded-lg border border-control bg-white px-3 py-1.5 font-mono text-sm outline-none focus:border-brand-500"
                />
              </label>
            </>
          )}
          <button
            type="submit"
            disabled={pendiente}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-800 disabled:opacity-50"
          >
            {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <Truck className="size-3.5" />}
            {porTransportadora ? "Marcar despachado" : "Ya salió"}
          </button>
        </form>
      )}

      {(estado === "despachado" || (estado === "pendiente" && !porTransportadora)) && (
        <button
          type="button"
          onClick={entregar}
          disabled={pendiente}
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-brand-700 ring-1 ring-control transition hover:bg-sand disabled:opacity-50"
        >
          <HandHeart className="size-3.5" />
          Ya lo entregué
        </button>
      )}

      {error && <p className="text-xs text-red-700">{error}</p>}
      {aviso && <p className="text-xs text-brand-700">{aviso}</p>}
    </div>
  );
}
