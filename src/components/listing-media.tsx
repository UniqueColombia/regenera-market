import { FotoOferta } from "./foto-oferta";
import { IconoCategoria } from "./icono-categoria";
import { categoriaLabel } from "@/lib/taxonomy";

/**
 * La primera imagen de la oferta, o su tapiz si no tiene ninguna.
 *
 * Con foto, la pinta `FotoOferta` (local con next/image, subida con `<img>`).
 * Sin foto, un tapiz derivado del propio título: gradiente estable por
 * categoría más un ícono. Es preferible a un placeholder gris repetido, que es
 * exactamente lo que se veía roto en el prototipo.
 *
 * **Solo la primera.** Las demás las enseñan `FundidoTarjeta` (catálogo) y
 * `GaleriaOferta` (ficha), que se montan encima o en su lugar. Esta sigue
 * siendo la que pinta el servidor: la que cuenta para el LCP y la que ve quien
 * llega sin JavaScript.
 *
 * El contenedor tiene que ser `relative`: la foto se posiciona en absoluto para
 * llenarlo.
 */

const GRADIENTS = [
  "from-brand-700 to-brand-500",
  "from-brand-800 to-brand-600",
  "from-clay-600 to-clay-300",
  "from-brand-600 to-clay-500",
  "from-brand-900 to-brand-600",
];

/** Hash estable: la misma oferta muestra siempre el mismo tapiz. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function ListingMedia({
  title,
  category,
  images,
  className = "",
  iconClassName = "size-10",
  sizes = "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
  priority = false,
}: {
  title: string;
  category: string;
  images: string[];
  className?: string;
  iconClassName?: string;
  /**
   * Ancho real del hueco, para que next/image no baje una foto de 1600 px a un
   * cuadro de 400. El valor por defecto es el de la rejilla del catálogo.
   */
  sizes?: string;
  /** Solo para la imagen que se ve sin desplazar la página. */
  priority?: boolean;
}) {
  const src = images[0];

  if (src) {
    return (
      <FotoOferta src={src} alt={title} sizes={sizes} priority={priority} className={className} />
    );
  }

  const gradient = GRADIENTS[hash(title) % GRADIENTS.length];

  return (
    <div
      role="img"
      aria-label={`${categoriaLabel(category)}: sin fotografía disponible`}
      className={`size-full bg-gradient-to-br ${gradient} grid place-items-center ${className}`}
    >
      <IconoCategoria id={category} className={`${iconClassName} text-white/70`} />
    </div>
  );
}
