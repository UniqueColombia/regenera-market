import Image from "next/image";

/**
 * Una foto de oferta, con el camino que le toca según de dónde venga.
 *
 * - **Ruta local** (`/img/ofertas/…`) → `next/image`: fotos del repositorio, que
 *   Next recorta y sirve al tamaño de cada hueco.
 * - **URL absoluta** (lo que sube el proveedor a Storage) → `<img>` pelado. El
 *   dominio solo existe en `remotePatterns` si el build tuvo
 *   `NEXT_PUBLIC_SUPABASE_URL`; un `next/image` sobre un dominio que no está ahí
 *   rompe la página entera en vez de la foto.
 *
 * Sin directiva a propósito: la usan `ListingMedia`, que es de servidor, y la
 * galería y el fundido de la tarjeta, que son de cliente. El contenedor tiene
 * que ser `relative`: las dos ramas lo llenan en absoluto.
 */
export function FotoOferta({
  src,
  alt,
  sizes,
  priority = false,
  className = "",
  onLoad,
}: {
  src: string;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
  /** Para quien necesita saber que ya se puede mostrar sin un hueco en blanco. */
  onLoad?: () => void;
}) {
  if (src.startsWith("/")) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className={`object-cover ${className}`}
        onLoad={onLoad}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={`absolute inset-0 size-full object-cover ${className}`}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      onLoad={onLoad}
    />
  );
}
