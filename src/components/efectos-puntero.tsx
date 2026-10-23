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
 * Con ratón reparte la posición del cursor y el imán. **Con el dedo** (desde el
 * 2026-10-23) marca con `data-foco` la tarjeta `[data-brillo]` que se toca,
 * también al deslizar por encima, y la suelta poco después de levantarlo: es lo
 * que hace que el brillo y el foco de las tarjetas existan en el teléfono. Con
 * `prefers-reduced-motion` no arranca ninguno de los dos.
 */
export function EfectosPuntero() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const dejarTactil = escucharTactil();
    const conRaton = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!conRaton) return dejarTactil;

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
      dejarTactil();
      document.removeEventListener("pointermove", alMover);
      cancelAnimationFrame(pendiente);
    };
  }, []);

  return null;
}

/** Cuánto sigue encendida la tarjeta tras levantar el dedo: lo que tarda en verse el destello. */
const SOLTAR_MS = 450;

/**
 * El foco de las tarjetas con el dedo. `:hover` no sirve en táctil —se queda
 * pegado al último toque—, así que se marca a mano: `data-foco` en la tarjeta
 * bajo el dedo y `data-con-foco` en su `.grupo-foco`, si lo tiene. El CSS
 * de los dos atributos está en `globals.css`, junto al de `:hover`.
 *
 * Se busca con `elementFromPoint` y no con el `target` del toque: al deslizar,
 * el `target` sigue siendo la tarjeta donde empezó, y lo que se quiere es la
 * que está debajo del dedo ahora. Devuelve la función que deja de escuchar.
 */
function escucharTactil(): () => void {
  let tocada: HTMLElement | null = null;
  let soltar = 0;
  let pendiente = 0;
  let ultimo: Touch | null = null;

  function quitar() {
    if (!tocada) return;
    tocada.removeAttribute("data-foco");
    tocada.closest(".grupo-foco")?.removeAttribute("data-con-foco");
    tocada = null;
  }

  function marcar() {
    pendiente = 0;
    if (!ultimo) return;
    const { clientX: x, clientY: y } = ultimo;
    const ficha = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-brillo]") ?? null;
    if (ficha !== tocada) {
      quitar();
      if (ficha) {
        ficha.setAttribute("data-foco", "");
        ficha.closest(".grupo-foco")?.setAttribute("data-con-foco", "");
      }
      tocada = ficha;
    }
    if (ficha) {
      const r = ficha.getBoundingClientRect();
      ficha.style.setProperty("--mx", `${x - r.left}px`);
      ficha.style.setProperty("--my", `${y - r.top}px`);
    }
  }

  // Un cálculo por fotograma, como con el ratón: `touchmove` llega más seguido
  // de lo que la pantalla pinta.
  const alTocar = (e: TouchEvent) => {
    window.clearTimeout(soltar);
    ultimo = e.touches[0] ?? null;
    if (!pendiente) pendiente = requestAnimationFrame(marcar);
  };
  const alSoltar = () => {
    window.clearTimeout(soltar);
    soltar = window.setTimeout(quitar, SOLTAR_MS);
  };

  document.addEventListener("touchstart", alTocar, { passive: true });
  document.addEventListener("touchmove", alTocar, { passive: true });
  document.addEventListener("touchend", alSoltar, { passive: true });
  document.addEventListener("touchcancel", alSoltar, { passive: true });
  return () => {
    document.removeEventListener("touchstart", alTocar);
    document.removeEventListener("touchmove", alTocar);
    document.removeEventListener("touchend", alSoltar);
    document.removeEventListener("touchcancel", alSoltar);
    window.clearTimeout(soltar);
    cancelAnimationFrame(pendiente);
    quitar();
  };
}
