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
 * Mientras los proveedores no suban sus fotos, se dibuja un tapiz derivado del
 * propio título: gradiente estable por categoría más un ícono. Es preferible a
 * un placeholder gris repetido, que es exactamente lo que se veía roto en el
 * prototipo.
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
}: {
  title: string;
  category: string;
  images: string[];
  className?: string;
  iconClassName?: string;
}) {
  if (images.length > 0) {
    return (
      /* Las sube el proveedor a Storage y el dominio no se conoce en build, así
         que next/image no puede optimizarlas todavía. */
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={images[0]}
        alt={title}
        className={`size-full object-cover ${className}`}
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
