/**
 * El borde en forma de ola entre una sección y la siguiente.
 *
 * Dos capas: la de atrás más tenue, para que el cambio de color tenga
 * profundidad. El color lo pone la clase de quien la usa (`fill` en
 * `globals.css`, `.onda-hero` y `.onda-pie`), que es lo que permite que siga al
 * modo oscuro: un `fill` fijo aquí no podría.
 *
 * Es decorativa (`aria-hidden`) y no recibe clics.
 */
export function Onda({ className }: { className: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 1440 100"
      preserveAspectRatio="none"
      className={`onda ${className}`}
    >
      <path
        className="onda-fondo"
        d="M0 52 C 180 8 420 4 660 34 S 1140 92 1440 30 L1440 100 L0 100 Z"
      />
      <path d="M0 72 C 240 28 520 30 760 58 S 1220 96 1440 56 L1440 100 L0 100 Z" />
    </svg>
  );
}
