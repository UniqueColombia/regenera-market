import Image from "next/image";

/**
 * Franja de cabecera con fotografía de fondo, para las páginas que cuentan algo
 * antes de mostrar una lista.
 *
 * Existe como componente por el velo, no por el maquetado: es lo único que
 * separa el texto blanco de una foto con niebla clara detrás. Repetido a mano
 * en tres páginas, basta con que alguien lo aclare en una para dejar un titular
 * ilegible sin que nadie lo note. Aquí se cambia en un sitio.
 *
 * El degradado va hacia la derecha porque las cuatro fotos de sección están
 * encuadradas con el sujeto a la derecha y aire a la izquierda, que es donde
 * cae el titular: el lado del texto queda casi opaco y el del sujeto se ve.
 * Ver docs/IMAGENES.md.
 *
 * `alt=""` a propósito: la foto ilustra lo que el `<h1>` ya dice. Un lector de
 * pantalla que la anuncie solo repite el titular.
 */
export function HeroBanner({
  foto,
  encabezado,
  distintivo,
  titulo,
  children,
}: {
  foto: string;
  /** Antetítulo en versalitas: "Metodología", "Para proveedores". */
  encabezado?: React.ReactNode;
  /** Alternativa al antetítulo cuando lo que va encima no es texto, como el
      sello de nivel en la ficha de un proveedor. Se pinta tal cual. */
  distintivo?: React.ReactNode;
  titulo: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="relative isolate overflow-hidden bg-brand-900">
      <Image
        src={foto}
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-r from-brand-900 via-brand-900/90 to-brand-900/60"
      />

      <div className="container-page relative py-16">
        {encabezado && (
          <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.2em] text-brand-300">
            {encabezado}
          </p>
        )}
        {distintivo}
        <h1 className="mt-3 max-w-3xl font-display text-4xl text-white md:text-5xl">
          {titulo}
        </h1>
        {children}
      </div>
    </section>
  );
}
