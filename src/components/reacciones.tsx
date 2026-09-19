"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { alternarReaccion } from "@/app/comunidad/actions";
import { REACCIONES, personas, type ReaccionId } from "@/lib/comunidad";

/**
 * Las cinco reacciones de una publicación.
 *
 * ## Por qué es optimista
 *
 * Los contadores viven en Postgres y los mueve un trigger, así que la verdad
 * tarda un viaje de ida y vuelta más la revalidación de la ruta. Sin
 * `useOptimistic`, el número se queda quieto medio segundo después de pulsar y
 * la reacción natural es volver a pulsar — que cancela la primera. El optimismo
 * aquí no es pulido: evita el doble toque.
 *
 * ## Y por qué además hay un mensaje de error
 *
 * El optimismo solo sirve cuando la acción termina bien. Cuando falla,
 * `useOptimistic` descarta el valor provisional y vuelve a pintar lo que dice el
 * servidor — o sea que **el fallo se ve idéntico al éxito seguido de un cambio
 * de opinión**: el número sube y baja solo. Esa es exactamente la avería que se
 * reportó («le da clic otro usuario y no se suma»), y la mitad que faltaba era
 * esta: mirar lo que devuelve la acción y decirlo.
 *
 * ## Sin sesión no son botones
 *
 * Son un enlace a `/entrar`, y no botones que al pulsarlos digan «tienes que
 * entrar». Quien no tiene cuenta ve a dónde va antes de tocar, y el `volver` lo
 * devuelve al muro con la sesión abierta.
 */

interface Estado {
  conteos: Partial<Record<ReaccionId, number>>;
  mias: ReaccionId[];
}

export function Reacciones({
  postId,
  conteos,
  mias,
  haySesion,
}: {
  postId: string;
  conteos: Partial<Record<ReaccionId, number>>;
  mias: ReaccionId[];
  haySesion: boolean;
}) {
  const [estado, marcarOptimista] = useOptimistic(
    { conteos, mias } satisfies Estado,
    (previo: Estado, tipo: ReaccionId): Estado => {
      const estaba = previo.mias.includes(tipo);
      const actual = previo.conteos[tipo] ?? 0;
      return {
        conteos: {
          ...previo.conteos,
          [tipo]: Math.max(0, actual + (estaba ? -1 : 1)),
        },
        mias: estaba
          ? previo.mias.filter((m) => m !== tipo)
          : [...previo.mias, tipo],
      };
    },
  );
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const total = REACCIONES.reduce((n, r) => n + (estado.conteos[r.id] ?? 0), 0);

  if (!haySesion) {
    return (
      <Link
        href="/entrar?volver=%2Fcomunidad"
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted ring-1 ring-hairline transition hover:bg-sand hover:text-brand-700 active:bg-sand"
      >
        {REACCIONES.filter((r) => (estado.conteos[r.id] ?? 0) > 0)
          .slice(0, 3)
          .map((r) => (
            <r.icono key={r.id} className="size-4" aria-hidden />
          ))}
        <span className="tabular-nums">{total}</span>
        <span className="sr-only">
          Entra para reaccionar a esta publicación
        </span>
      </Link>
    );
  }

  function pulsar(tipo: ReaccionId, marcada: boolean) {
    iniciar(async () => {
      marcarOptimista(tipo);
      const r = await alternarReaccion(postId, tipo, marcada);
      setError(r.ok ? null : r.error);
    });
  }

  return (
    <div className="min-w-0">
      <ul className="flex flex-wrap items-center gap-1.5">
        {REACCIONES.map((r) => {
          const n = estado.conteos[r.id] ?? 0;
          const marcada = estado.mias.includes(r.id);
          return (
            <li key={r.id}>
              <button
                type="button"
                disabled={pendiente}
                aria-pressed={marcada}
                // El título dice el número en palabras porque el botón solo
                // muestra la cifra: «12» sin contexto no se lee como «a doce
                // personas les sirvió».
                title={
                  n > 0 ? `${r.etiqueta} — ${personas(n)}` : r.etiqueta
                }
                onClick={() => pulsar(r.id, marcada)}
                className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-sm ring-1 transition disabled:opacity-60 ${
                  marcada
                    ? "bg-brand-50 text-brand-700 ring-brand-300"
                    : "text-muted ring-hairline hover:bg-sand hover:text-brand-700 active:bg-sand"
                }`}
              >
                <r.icono className="size-4" aria-hidden />
                {n > 0 && <span className="tabular-nums">{n}</span>}
                <span className="sr-only">
                  {marcada ? `Quitar «${r.etiqueta}»` : r.etiqueta}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="status" className="mt-2 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
