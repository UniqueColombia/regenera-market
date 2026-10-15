import type { CSSProperties, ReactNode } from "react";

/**
 * Un bloque de las pantallas de la cuenta y de los formularios: «Tu empresa»,
 * «Tu cuenta», la lista de ofertas, el formulario de oferta y la carga desde
 * Excel.
 *
 * Existe para que esas pantallas compartan tres cosas que, repetidas a mano,
 * se separan solas con el tiempo:
 *
 * - **La forma**: blanca sobre crema, `rounded-xl` y `ring-1 ring-hairline`
 *   (skill `diseno-visual`). `tono="marca"` es la variante verde clara, para el
 *   bloque que lleva la acción principal de la pantalla.
 * - **La entrada**: brota con un pequeño retraso según su orden (`i`), en CSS y
 *   desde el primer pintado (`.tarjeta-viva` en `globals.css`). Con
 *   `prefers-reduced-motion` no se anima.
 * - **El foco**: mientras se escribe dentro, el borde se vuelve verde y la
 *   tarjeta se levanta un poco — el patrón del hover de tarjeta del repo. En un
 *   formulario largo dice en qué bloque estás.
 *
 * Es neutral (ni servidor ni cliente): la usan páginas de servidor y el
 * formulario de oferta, que es de cliente.
 */
export function Tarjeta({
  children,
  i,
  tono = "blanco",
  className = "",
  as: Etiqueta = "section",
}: {
  children: ReactNode;
  /** Orden de entrada: 0 la primera. Sin él, entra con la página, sin retraso. */
  i?: number;
  tono?: "blanco" | "marca";
  className?: string;
  as?: "section" | "div" | "li";
}) {
  const fondo = tono === "marca" ? "bg-brand-50 ring-brand-100" : "bg-white ring-hairline";
  return (
    <Etiqueta
      style={i !== undefined ? ({ "--i": i } as CSSProperties) : undefined}
      className={`tarjeta-viva rounded-xl p-5 ring-1 transition-shadow duration-300 focus-within:shadow-lg focus-within:shadow-brand-900/5 focus-within:ring-brand-300 sm:p-6 ${fondo} ${className}`}
    >
      {children}
    </Etiqueta>
  );
}
