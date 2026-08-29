import Image from "next/image";
import {
  Bike,
  Boxes,
  Compass,
  Droplets,
  GraduationCap,
  Leaf,
  Lightbulb,
  Megaphone,
  Package,
  Sofa,
  Sparkles,
  Wrench,
} from "lucide-react";

/**
 * Imagen de la oferta.
 *
 * Tres caminos, y el orden importa:
 *
 * 1. Ruta local (`/img/ofertas/…`) → next/image. Es lo que hay hoy: fotos del
 *    repositorio, que Next puede recortar y servir en el tamaño que pida cada
 *    hueco.
 * 2. URL absoluta → `<img>` pelado. Es lo que habrá cuando el proveedor suba su
 *    foto a Supabase Storage: el dominio no se conoce en build y next/image
 *    exige declararlo en next.config antes de tocarlo.
 * 3. Sin imagen → tapiz derivado del propio título: gradiente estable por
 *    categoría más un ícono. Es preferible a un placeholder gris repetido, que
 *    es exactamente lo que se veía roto en el prototipo.
 *
 * El contenedor tiene que ser `relative`: las dos primeras ramas se posicionan
 * en absoluto para llenarlo.
 */

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Amenities: Sparkles,
  Capacitación: GraduationCap,
  Empaques: Package,
  Energía: Lightbulb,
  Equipamiento: Boxes,
  Experiencias: Compass,
  Mantenimiento: Wrench,
  Marketing: Megaphone,
  Mobiliario: Sofa,
  Servicios: Droplets,
  Tecnología: Bike,
};

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

  if (src?.startsWith("/")) {
    return (
      <Image
        src={src}
        alt={title}
        fill
        sizes={sizes}
        priority={priority}
        className={`object-cover ${className}`}
      />
    );
  }

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={title}
        className={`absolute inset-0 size-full object-cover ${className}`}
        loading="lazy"
      />
    );
  }

  const Icon = ICONS[category] ?? Leaf;
  const gradient = GRADIENTS[hash(title) % GRADIENTS.length];

  return (
    <div
      role="img"
      aria-label={`${category}: sin fotografía disponible`}
      className={`size-full bg-gradient-to-br ${gradient} grid place-items-center ${className}`}
    >
      <Icon className={`${iconClassName} text-white/70`} />
    </div>
  );
}
