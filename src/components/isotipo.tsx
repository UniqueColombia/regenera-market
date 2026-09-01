/**
 * Isotipo de Seregenera: hoja, mundo y raíz.
 *
 * Va inline y no como `<img src="/img/marca/isotipo.svg">` por una razón
 * concreta: a través de `<img>` el SVG se carga en su propio documento y
 * `currentColor` deja de resolver contra el texto de alrededor. Inline, el
 * mismo componente sale verde en la cabecera y blanco en el pie sin más que la
 * clase de color del contenedor, y sin una petición de red extra.
 *
 * La geometría está duplicada en `public/img/marca/*.svg`, que es el juego de
 * archivos para quien no es el sitio: documentos, redes, prensa. Si se cambia
 * la marca, se cambian los dos — y se vuelve a correr
 * `scripts/generar-marca.sh`, que deriva de ahí el favicon, los avatares y los
 * banners.
 */
export function Isotipo({
  variante = "detalle",
  className = "",
}: {
  /**
   * `compacto` quita nervios, continentes y la mitad de las raíces. Es lo que
   * hay que usar por debajo de ~32 px: a ese tamaño el detalle se empasta hasta
   * parecer una mancha.
   */
  variante?: "detalle" | "compacto";
  className?: string;
}) {
  const compacto = variante === "compacto";

  return (
    <svg
      viewBox="0 0 100 148"
      className={className}
      role="img"
      aria-label="Seregenera"
    >
      {!compacto && (
        <>
          <defs>
            <clipPath id="seregenera-globo">
              <circle cx="50" cy="76" r="26" />
            </clipPath>
          </defs>
          {/* Continentes recortados contra el círculo: así el trazo del mundo
              se dibuja encima y tapa cualquier borde que no cierre bien. */}
          <g fill="currentColor" clipPath="url(#seregenera-globo)">
            <path d="M43 61c1 3-1 5-3 6s-4 2-4 5 2 3 2 6-1 4 1 6 2 4 2 7c-6-3-10-9-11-15s4-13 13-15Z" />
            <path d="M58 60c6 1 11 5 14 10-2 1-4 1-6 3s-1 5-3 7-4 1-5 4-1 4-3 6-2 3-3 5c-3-3-2-8-1-11s-2-6-3-9 4-11 10-15Z" />
          </g>
        </>
      )}

      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={compacto ? 8 : 5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {compacto ? (
          <>
            <path d="M50 5c5 7 55 25 0 47C-5 30 45 12 50 5Z" />
            <circle cx="50" cy="76" r="24" />
            <path d="M50 100v44" />
            <path d="M50 111c-12 3-24 7-35 12m35-12c12 3 24 7 35 12" />
            <path d="M50 123c-5 6-8 12-10 20m10-20c5 6 8 12 10 20" />
          </>
        ) : (
          <>
            <path d="M50 2c6 7 62 26 0 48C-12 28 44 9 50 2Z" />
            <path d="M50 12v34" />
            <path d="m50 22-10-6m10 6 10-6M50 32l-12-7m12 7 12-7M50 41l-9-5m9 5 9-5" />
            <circle cx="50" cy="76" r="26" />
            <path d="M50 102v42" />
            <path d="M50 108c-8 3-14 6-18 11m18-11c8 3 14 6 18 11" />
            <path d="M50 115c-13 3-27 6-41 11m41-11c13 3 27 6 41 11" />
            <path d="M50 123c-5 6-9 12-11 20m11-20c5 6 9 12 11 20" />
            <path d="m32 119-6 8m36-8 6 8" />
          </>
        )}
      </g>
    </svg>
  );
}
