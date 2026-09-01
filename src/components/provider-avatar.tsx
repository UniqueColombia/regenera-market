import Image from "next/image";

/**
 * Marca visual de un proveedor.
 *
 * Si subió logo, se muestra. Si no —que es el caso de todos hoy— se dibuja un
 * monograma: sus iniciales sobre un degradado estable derivado del nombre, con
 * el mismo criterio que `listing-media.tsx` usa para las ofertas sin foto.
 *
 * No se les generan logos con IA a propósito. Los proveedores de `src/data/`
 * son de demostración y se reemplazan por reales en el primer lote de
 * onboarding: inventarle una identidad gráfica a una asociación campesina que
 * sí podría existir crea un problema, no resuelve uno. El día que suban su
 * logo de verdad, `logoUrl` deja de estar vacío y esto desaparece solo.
 *
 * `object-contain` y no `cover` para el logo real: recortar un logo apaisado
 * para meterlo en una caja cuadrada lo mutila.
 */

const GRADIENTS = [
  "from-brand-700 to-brand-500",
  "from-brand-800 to-brand-600",
  "from-clay-600 to-clay-300",
  "from-brand-600 to-clay-500",
  "from-brand-900 to-brand-600",
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Iniciales de las dos primeras palabras con peso: "Aromas del Páramo" → AP. */
function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function ProviderAvatar({
  name,
  logoUrl,
  className = "size-12",
}: {
  name: string;
  logoUrl?: string;
  className?: string;
}) {
  if (logoUrl) {
    return (
      <div
        className={`relative shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-hairline ${className}`}
      >
        <Image
          src={logoUrl}
          alt={`Logo de ${name}`}
          fill
          sizes="96px"
          className="object-contain p-1"
        />
      </div>
    );
  }

  const gradient = GRADIENTS[hash(name) % GRADIENTS.length];

  return (
    <div
      role="img"
      aria-label={name}
      className={`shrink-0 rounded-xl bg-gradient-to-br ${gradient} grid place-items-center font-display font-semibold text-white ${className}`}
    >
      {iniciales(name)}
    </div>
  );
}
