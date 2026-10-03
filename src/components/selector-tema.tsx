"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { COOKIE_TEMA, VIDA_TEMA, type Tema } from "@/lib/tema";

/** Evento que avisa a las demás copias del botón (barra y menú móvil). */
const EVENTO = "sgr:tema";

/**
 * Botón de modo claro / oscuro.
 *
 * El tema vive en el atributo `data-tema` del `<html>` y en la cookie
 * `sgr_tema`. El layout la lee en el servidor y pinta el `<html>` ya con el
 * tema elegido, así que **no hay destello** de página clara al cargar en
 * oscuro (el clásico problema de guardarlo en `localStorage`, que solo se lee
 * cuando la página ya se pintó).
 *
 * La cookie es una preferencia que la persona pide al pulsar el botón: no se
 * crea si nadie lo pulsa, y por eso no necesita consentimiento previo. Está
 * declarada en `/privacidad`.
 *
 * El cambio se hace con un círculo que crece desde el botón (View Transitions,
 * reglas en `globals.css`). Donde el navegador no lo soporta, o con
 * `prefers-reduced-motion`, cambia sin animación.
 *
 * ## Dos copias, un tema
 *
 * - `icono` va en la barra, **desde `sm`**: a 375 px no cabe junto al idioma, la
 *   cesta y el menú sin partir en dos el lema del logo.
 * - `fila` va dentro del menú móvil, **solo por debajo de `sm`**. Así la acción
 *   existe en todos los anchos (paridad móvil de `diseno-visual`).
 *
 * Las dos leen el tema del `<html>` y no de su propio estado al pulsar, y se
 * avisan con un evento: si se cambia desde el menú y luego se ensancha la
 * ventana, el icono de la barra ya muestra lo correcto.
 */
export function SelectorTema({
  inicial,
  variante = "icono",
}: {
  inicial: Tema;
  variante?: "icono" | "fila";
}) {
  // En el servidor manda la cookie (`inicial`). En el navegador manda el
  // `<html>`, que es la verdad aunque esta copia se monte tarde (el menú móvil
  // se monta al abrirlo, quizá después de un cambio).
  const [tema, setTema] = useState<Tema>(() =>
    typeof document !== "undefined" && document.documentElement.dataset.tema === "oscuro"
      ? "oscuro"
      : inicial,
  );
  const oscuro = tema === "oscuro";

  useEffect(() => {
    const alCambiar = (e: Event) => setTema((e as CustomEvent<Tema>).detail);
    window.addEventListener(EVENTO, alCambiar);
    return () => window.removeEventListener(EVENTO, alCambiar);
  }, []);

  function aplicar(nuevo: Tema) {
    const raiz = document.documentElement;
    if (nuevo === "oscuro") raiz.dataset.tema = "oscuro";
    else delete raiz.dataset.tema;
    document.cookie = `${COOKIE_TEMA}=${nuevo}; path=/; max-age=${VIDA_TEMA}; samesite=lax`;
    window.dispatchEvent(new CustomEvent<Tema>(EVENTO, { detail: nuevo }));
  }

  function alternar(e: React.MouseEvent<HTMLButtonElement>) {
    const raiz = document.documentElement;
    const nuevo: Tema = raiz.dataset.tema === "oscuro" ? "claro" : "oscuro";
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (quieto || !("startViewTransition" in document)) {
      aplicar(nuevo);
      return;
    }

    // El círculo sale del centro del botón y llega a la esquina más lejana.
    const r = e.currentTarget.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const radio = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    raiz.style.setProperty("--tema-x", `${x}px`);
    raiz.style.setProperty("--tema-y", `${y}px`);
    raiz.style.setProperty("--tema-r", `${radio}px`);
    raiz.dataset.cambiandoTema = "";

    const transicion = document.startViewTransition(() => aplicar(nuevo));
    transicion.finished.finally(() => {
      delete raiz.dataset.cambiandoTema;
    });
  }

  const Icono = oscuro ? Sun : Moon;
  const etiqueta = oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro";

  if (variante === "fila") {
    return (
      <button
        type="button"
        onClick={alternar}
        aria-pressed={oscuro}
        className="flex min-h-11 w-full items-center gap-3 text-left text-sm font-medium text-ink transition-colors hover:text-brand-700 active:text-brand-700"
      >
        {/* El mismo hueco que deja el indicador de `FilaMovil`: así el texto
            cae en la columna de las demás filas, y el icono va a la derecha,
            donde la fila de «Categorías» lleva su flecha. */}
        <span aria-hidden className="h-4 w-0.5" />
        {oscuro ? "Modo claro" : "Modo oscuro"}
        <Icono aria-hidden className="ml-auto size-4 text-muted" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={alternar}
      aria-pressed={oscuro}
      aria-label={etiqueta}
      title={oscuro ? "Modo claro" : "Modo oscuro"}
      className="hidden rounded-full p-2 text-ink transition-colors hover:bg-sand hover:text-brand-700 active:bg-sand sm:inline-flex"
    >
      <Icono className="size-5" />
    </button>
  );
}
