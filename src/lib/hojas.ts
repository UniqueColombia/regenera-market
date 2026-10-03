/**
 * Un puñado de hojas que sale del botón «Agregar a la cesta» y cae girando.
 *
 * Es la confirmación con la que el gesto se siente: el cambio del botón a
 * «Agregado» ya lo dice en texto (y eso es lo que importa para accesibilidad),
 * las hojas solo lo celebran. Por eso son `aria-hidden` y no se repiten en
 * «Comprar ahora», que navega en el mismo clic y se las llevaría por delante.
 *
 * Solo navegador: se llama desde un manejador de evento, nunca al renderizar.
 * Con `prefers-reduced-motion` no sale ninguna.
 *
 * Inspirado en `ClickSpark` de React Bits (MIT + Commons Clause, usado dentro
 * del sitio); la forma de hoja y el vuelo son propios.
 */
export function soltarHojas(origen: HTMLElement, x?: number, y?: number) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // Un clic de teclado (Enter, Espacio) llega sin coordenadas útiles: se sale
  // del centro del botón.
  const r = origen.getBoundingClientRect();
  const cx = x || r.left + r.width / 2;
  const cy = y || r.top + r.height / 2;

  // Variables del tema, no colores literales (skill `diseno-visual`).
  const colores = [
    "var(--color-brand-400)",
    "var(--color-brand-500)",
    "var(--color-brand-300)",
    "var(--color-clay-300)",
  ];

  const cantidad = 9;
  for (let i = 0; i < cantidad; i++) {
    const hoja = document.createElement("span");
    hoja.className = "hoja-al-vuelo";
    hoja.setAttribute("aria-hidden", "true");
    hoja.style.left = `${cx}px`;
    hoja.style.top = `${cy}px`;
    hoja.style.background = colores[i % colores.length];
    document.body.appendChild(hoja);

    // Salen en abanico hacia arriba y caen: arco de -150° a -30°.
    const angulo = (-150 + (120 * i) / (cantidad - 1) + (Math.random() - 0.5) * 16) * (Math.PI / 180);
    const impulso = 40 + Math.random() * 30;
    const dx = Math.cos(angulo) * impulso;
    const dy = Math.sin(angulo) * impulso;
    const giro = (Math.random() < 0.5 ? -1 : 1) * (180 + Math.random() * 220);

    hoja
      .animate(
        [
          { transform: "translate(-50%, -50%) rotate(0deg) scale(0.6)", opacity: 0 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${giro * 0.4}deg) scale(1)`, opacity: 1, offset: 0.35 },
          { transform: `translate(calc(-50% + ${dx * 1.4}px), calc(-50% + ${dy + 46}px)) rotate(${giro}deg) scale(0.8)`, opacity: 0 },
        ],
        { duration: 900 + Math.random() * 300, easing: "cubic-bezier(0.25, 0.6, 0.35, 1)", fill: "forwards" },
      )
      .finished.catch(() => {})
      .finally(() => hoja.remove());
  }
}
