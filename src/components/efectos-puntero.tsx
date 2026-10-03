"use client";

import { useEffect } from "react";

/**
 * Reparte la posición del cursor a los elementos que la piden. No pinta nada:
 * el aspecto vive en `globals.css` (`[data-brillo]` y `[data-iman]`).
 *
 * Se monta **una vez**, en el layout, y escucha en el documento. Así las
 * tarjetas siguen siendo de servidor: `listing-card.tsx` solo lleva un atributo
 * `data-brillo`, y no hace falta convertir cada tarjeta en cliente para que
 * reaccione al ratón (criterio de la skill `componentizacion`: el "use client"
 * se empuja hacia abajo, y aquí se empuja hasta un único listener).
 *
 * Solo arranca con ratón de verdad y movimiento permitido; el CSS tiene la
 * misma condición, así que en un teléfono no hay nada que repartir.
 */
export function EfectosPuntero() {
  useEffect(() => {
    const conRaton = window.matchMedia(
      "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
    ).matches;
    if (!conRaton) return;

    /** Hasta dónde llega el imán (px desde el borde del botón), cuánto sigue al
        cursor y su tope. Más de ~8 px y el botón parece que se escapa. */
    const ALCANCE = 70;
    const FUERZA = 0.2;
    const TOPE = 7;

    let pendiente = 0;
    let ultimo: PointerEvent | null = null;

    function aplicar() {
      pendiente = 0;
      const e = ultimo;
      if (!e) return;

      const ficha = (e.target as Element | null)?.closest?.<HTMLElement>("[data-brillo]");
      if (ficha) {
        const r = ficha.getBoundingClientRect();
        ficha.style.setProperty("--mx", `${e.clientX - r.left}px`);
        ficha.style.setProperty("--my", `${e.clientY - r.top}px`);
      }

      for (const boton of document.querySelectorAll<HTMLElement>("[data-iman]")) {
        const r = boton.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        // Distancia al borde, no al centro: un botón ancho reaccionaría tarde.
        const fuera = Math.hypot(
          Math.max(Math.abs(dx) - r.width / 2, 0),
          Math.max(Math.abs(dy) - r.height / 2, 0),
        );
        if (fuera > ALCANCE) {
          boton.style.removeProperty("--iman-x");
          boton.style.removeProperty("--iman-y");
          continue;
        }
        const tope = (v: number) => Math.max(-TOPE, Math.min(TOPE, v * FUERZA));
        boton.style.setProperty("--iman-x", `${tope(dx)}px`);
        boton.style.setProperty("--iman-y", `${tope(dy)}px`);
      }
    }

    // Un cálculo por fotograma como mucho: el ratón dispara eventos más rápido
    // de lo que la pantalla los puede enseñar.
    const alMover = (e: PointerEvent) => {
      ultimo = e;
      if (!pendiente) pendiente = requestAnimationFrame(aplicar);
    };

    document.addEventListener("pointermove", alMover, { passive: true });
    return () => {
      document.removeEventListener("pointermove", alMover);
      cancelAnimationFrame(pendiente);
    };
  }, []);

  return null;
}
