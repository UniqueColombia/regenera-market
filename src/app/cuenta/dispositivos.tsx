"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, MonitorSmartphone, X } from "lucide-react";
import { olvidarDispositivo } from "./actions";

export interface DispositivoVisible {
  id: string;
  label: string;
  lastSeenAt: string;
  createdAt: string;
  /** El que está usando ahora mismo, para avisarle de lo que implica quitarlo. */
  esEste: boolean;
}

/**
 * Lista de dispositivos de confianza, con el botón de retirar la confianza.
 *
 * Isla de cliente dentro de una página de servidor: lo único que necesita
 * interactividad es el botón.
 *
 * **Que esta lista exista es la contrapartida de recordar el aparato.** Si el
 * sistema deja de pedir el segundo factor en ciertos sitios, la persona tiene
 * que poder ver cuáles son y quitarlos — el computador del hotel donde entró
 * una vez, por ejemplo.
 */
export function Dispositivos({ items }: { items: DispositivoVisible[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function olvidar(d: DispositivoVisible) {
    const aviso = d.esEste
      ? "Es el dispositivo que estás usando. Si lo quitas, la próxima vez que entres aquí te pediremos el código. ¿Seguimos?"
      : `¿Quitar «${d.label}»? La próxima vez que alguien entre desde ahí, le pediremos el código.`;
    if (!window.confirm(aviso)) return;

    iniciar(async () => {
      const r = await olvidarDispositivo(d.id);
      if (r.ok) {
        setError(null);
        router.refresh();
      } else {
        setError(r.errors.form ?? "No se pudo quitar.");
      }
    });
  }

  if (items.length === 0) {
    return (
      <p className="mt-4 rounded-xl bg-white p-6 text-center text-sm text-muted ring-1 ring-hairline">
        Todavía no hay ninguno. El primero se guarda la próxima vez que entres
        con código.
      </p>
    );
  }

  return (
    <>
      <ul className="mt-4 space-y-2">
        {items.map((d) => (
          <li
            key={d.id}
            className="flex items-center gap-3 rounded-xl bg-white p-4 ring-1 ring-hairline"
          >
            <MonitorSmartphone className="size-5 shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">
                {d.label}
                {d.esEste && (
                  <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 ring-1 ring-brand-200">
                    este
                  </span>
                )}
              </p>
              <p className="text-xs text-muted">
                Última vez:{" "}
                {new Date(d.lastSeenAt).toLocaleDateString("es-CO", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
            <button
              type="button"
              disabled={pendiente}
              onClick={() => olvidar(d)}
              aria-label={`Quitar ${d.label} de los dispositivos de confianza`}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-muted ring-1 ring-control transition hover:bg-sand hover:text-red-700 disabled:opacity-40"
            >
              {pendiente ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <X className="size-3.5" />
              )}
              Quitar
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </>
  );
}
