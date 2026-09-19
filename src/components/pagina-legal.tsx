import Link from "next/link";

/**
 * El marco de un documento legal: términos y privacidad.
 *
 * Dos páginas con la misma forma —título, fecha de vigencia, texto largo y el
 * enlace a la otra— y por eso vive aquí y no junto a una de ellas.
 *
 * **La fecha de vigencia no es decorativa.** Un documento legal sin fecha no se
 * puede citar: si mañana cambian las condiciones, nadie puede demostrar cuáles
 * aceptó. Es también lo que obliga a que cambiar el texto sea un acto
 * consciente — hay que mover la constante, y eso se ve en el diff.
 */
export function PaginaLegal({
  titulo,
  resumen,
  vigenteDesde,
  otro,
  children,
}: {
  titulo: string;
  /** Una frase que diga de qué va, en lenguaje de persona y no de abogado. */
  resumen: string;
  /** ISO, `2026-09-19`. Se muestra en largo. */
  vigenteDesde: string;
  otro: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <div className="container-page max-w-3xl py-14">
      <h1 className="font-display text-3xl text-ink sm:text-4xl">{titulo}</h1>
      <p className="mt-3 text-lg text-muted">{resumen}</p>
      <p className="mt-4 text-xs text-muted">
        Vigente desde el{" "}
        <time dateTime={vigenteDesde}>
          {new Date(`${vigenteDesde}T12:00:00Z`).toLocaleDateString("es-CO", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </time>
        . Lo opera Dimension Natural SAS.
      </p>

      <div className="prosa-legal mt-8">{children}</div>

      <p className="mt-12 border-t border-hairline pt-6 text-sm">
        <Link
          href={otro.href}
          className="font-medium text-brand-700 underline underline-offset-4"
        >
          {otro.label}
        </Link>
      </p>
    </div>
  );
}
