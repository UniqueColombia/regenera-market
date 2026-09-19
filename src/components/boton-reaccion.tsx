"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { Sprout } from "lucide-react";
import { alternarReaccion } from "@/app/comunidad/actions";

/**
 * El «me sirve» de una publicación.
 *
 * ## Por qué es optimista
 *
 * El contador vive en Postgres y lo mueve un trigger, así que la verdad tarda un
 * viaje de ida y vuelta más la revalidación de la ruta. Sin `useOptimistic`, el
 * número se queda quieto medio segundo después de pulsar y la reacción natural
 * es volver a pulsar — que cancela la primera. El optimismo aquí no es pulido:
 * evita el doble toque.
 *
 * Si la acción falla, `useOptimistic` descarta el valor provisional solo al
 * terminar la transición y vuelve a pintar lo que dice el servidor. No hace
 * falta deshacerlo a mano.
 *
 * ## Sin sesión no es un botón
 *
 * Es un enlace a `/entrar`, y no un botón que al pulsarlo dice «tienes que
 * entrar». Quien no tiene cuenta ve a dónde va antes de tocar, y el `volver`
 * lo devuelve al muro con la sesión abierta.
 */
export function BotonReaccion({
  postId,
  reaccionado,
  cuenta,
  haySesion,
}: {
  postId: string;
  reaccionado: boolean;
  cuenta: number;
  haySesion: boolean;
}) {
  const [estado, marcarOptimista] = useOptimistic(
    { reaccionado, cuenta },
    (previo) => ({
      reaccionado: !previo.reaccionado,
      cuenta: previo.cuenta + (previo.reaccionado ? -1 : 1),
    }),
  );
  const [pendiente, iniciar] = useTransition();

  const etiqueta = estado.cuenta === 1 ? "1 persona" : `${estado.cuenta} personas`;

  if (!haySesion) {
    return (
      <Link
        href="/entrar?volver=%2Fcomunidad"
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted ring-1 ring-hairline transition hover:bg-sand hover:text-brand-700 active:bg-sand"
      >
        <Sprout className="size-4" />
        <span className="tabular-nums">{estado.cuenta}</span>
        <span className="sr-only">
          Entra para marcar que esta publicación te sirvió
        </span>
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled={pendiente}
      aria-pressed={estado.reaccionado}
      // El título dice el número en palabras porque el botón solo muestra la
      // cifra: «12» sin contexto no se lee como «a doce personas les sirvió».
      title={`Le sirvió a ${etiqueta}`}
      onClick={() =>
        iniciar(async () => {
          marcarOptimista(null);
          await alternarReaccion(postId, estado.reaccionado);
        })
      }
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ring-1 transition disabled:opacity-60 ${
        estado.reaccionado
          ? "bg-brand-50 text-brand-700 ring-brand-300"
          : "text-muted ring-hairline hover:bg-sand hover:text-brand-700 active:bg-sand"
      }`}
    >
      <Sprout className="size-4" />
      <span className="tabular-nums">{estado.cuenta}</span>
      <span className="sr-only">
        {estado.reaccionado ? "Quitar «me sirve»" : "Marcar que te sirvió"}
      </span>
    </button>
  );
}
