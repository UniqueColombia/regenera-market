"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CircleCheck, LogOut, X } from "lucide-react";
import { AVISOS, COOKIE_AVISO, esAviso, type AvisoId } from "@/lib/avisos-tipos";

/**
 * La confirmación de que entraste o saliste.
 *
 * Hasta ahora, entrar o salir bien no daba ninguna señal: la página cambiaba y
 * el nombre del encabezado aparecía o desaparecía. Quien no mira el encabezado
 * no se entera, y quien sí, no sabe si fue a propósito o un fallo — «se me cerró
 * la sesión» es la queja que eso produce.
 *
 * Lee la cookie que deja `avisarAlVolver()` (`src/lib/avisos.ts`) y la borra al
 * leerla, para que recargar no vuelva a enseñar el aviso. Se comprueba en cada
 * cambio de ruta porque la acción que la escribe termina navegando, y este
 * componente vive en el layout: no se vuelve a montar.
 *
 * Es cliente por dos razones del criterio de `componentizacion`: lee
 * `document.cookie` y tiene un temporizador.
 */
export function AvisoAlVolver() {
  const pathname = usePathname();
  const [aviso, setAviso] = useState<{ id: AvisoId; vez: number } | null>(null);

  useEffect(() => {
    // En un temporizador y no en el cuerpo del efecto: la cookie es un sistema
    // externo que se consulta, y el estado se actualiza desde su «respuesta»
    // (regla `react-hooks/set-state-in-effect`). De paso deja que la página
    // nueva pinte primero y el aviso entre después, que es el orden que se lee.
    const t = setTimeout(() => {
      const valor = document.cookie
        .split("; ")
        .find((c) => c.startsWith(`${COOKIE_AVISO}=`))
        ?.split("=")[1];
      if (!esAviso(valor)) return;

      document.cookie = `${COOKIE_AVISO}=; path=/; max-age=0; samesite=lax`;
      // `vez` hace que dos avisos iguales seguidos —salir, entrar, salir—
      // vuelvan a animarse en vez de quedarse quietos por ser el mismo valor.
      setAviso({ id: valor, vez: Date.now() });
    }, 120);
    return () => clearTimeout(t);
  }, [pathname]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4500);
    return () => clearTimeout(t);
  }, [aviso]);

  if (!aviso) return null;

  const { titulo, texto } = AVISOS[aviso.id];
  const Icono = aviso.id === "salida" ? LogOut : CircleCheck;

  return (
    <div
      key={aviso.vez}
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-4 z-[60] mx-auto flex max-w-sm animate-aviso items-start gap-3 rounded-xl bg-white p-4 shadow-xl shadow-brand-900/10 ring-1 ring-brand-200 motion-reduce:animate-none sm:inset-x-auto sm:right-6 sm:bottom-6"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
        <Icono className="size-5 animate-latido motion-reduce:animate-none" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-base text-ink">{titulo}</p>
        <p className="mt-0.5 text-sm text-muted">{texto}</p>
      </div>
      <button
        type="button"
        onClick={() => setAviso(null)}
        aria-label="Cerrar aviso"
        className="rounded-full p-1 text-muted transition hover:bg-sand hover:text-ink"
      >
        <X className="size-4" />
      </button>
      {/* La barra que se vacía dice cuánto le queda al aviso sin que haga falta
          leer nada: quien quiere cerrarlo antes ve que se va a ir solo. */}
      <span
        aria-hidden
        className="absolute inset-x-4 bottom-0 h-0.5 origin-left animate-consumir rounded-full bg-brand-400 motion-reduce:hidden"
      />
    </div>
  );
}
