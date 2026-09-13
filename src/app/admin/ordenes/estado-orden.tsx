"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { cambiarEstadoOrden } from "./actions";
import { ETIQUETA_ESTADO, TRANSICIONES } from "@/lib/order-status";
import { money } from "@/lib/format";
import type { OrderStatus } from "@/lib/types";

/**
 * Los botones que mueven una orden de estado.
 *
 * Solo se ofrecen los saltos que el servidor va a aceptar: la tabla
 * `TRANSICIONES` es la misma en los dos lados. Un botón que existe para dar un
 * error no es un botón, es una trampa.
 *
 * Confirmar el pago pide confirmación **con el monto dentro de la pregunta**.
 * Es la única acción del panel que da por buena una transferencia que alguien
 * miró en el banco, y equivocarse de fila es fácil cuando hay varias del mismo
 * día.
 */
export function EstadoOrden({
  orderId,
  estado,
  referencia,
  totalCop,
}: {
  orderId: string;
  estado: OrderStatus;
  referencia: string;
  totalCop: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const destinos = TRANSICIONES[estado];
  if (destinos.length === 0) return null;

  function mover(destino: OrderStatus) {
    const pregunta =
      destino === "paid"
        ? `¿Confirmar que entró el pago de ${money(totalCop)} por la orden ${referencia}?`
        : `¿Marcar la orden ${referencia} como «${ETIQUETA_ESTADO[destino].toLowerCase()}»?`;
    if (!window.confirm(pregunta)) return;

    iniciar(async () => {
      const r = await cambiarEstadoOrden({ orderId, estado: destino });
      if (r.ok) {
        setError(null);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      <div className="flex flex-wrap items-center gap-2">
        {pendiente && <Loader2 className="size-4 animate-spin text-muted" />}
        {destinos.map((destino) => (
          <button
            key={destino}
            type="button"
            disabled={pendiente}
            onClick={() => mover(destino)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
              destino === "paid"
                ? "bg-brand-700 text-white hover:bg-brand-800"
                : "text-muted ring-1 ring-control hover:bg-sand hover:text-brand-700"
            }`}
          >
            {destino === "paid" ? "Confirmar pago" : ETIQUETA_ESTADO[destino]}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
