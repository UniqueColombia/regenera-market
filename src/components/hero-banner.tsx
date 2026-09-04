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
 * **El velo cambia de eje con el ancho.** En escritorio va hacia la derecha
 * porque las fotos de sección están encuadradas con el sujeto a la derecha y
 * aire a la izquierda, que es donde cae el titular: el lado del texto queda
 * casi opaco y el del sujeto se ve. En móvil el texto ocupa las dos columnas,
 * así que un degradado horizontal deja la mitad derecha de cada renglón sobre
 * foto clara — por eso ahí es vertical y parejo. Ver docs/IMAGENES.md.
 *
 * `alt=""` a propósito: la foto ilustra lo que el `<h1>` ya dice. Un lector de
 * pantalla que la anuncie solo repite el titular.
 */
export function HeroBanner({
  foto,
  encuadreMovil = "object-center",
  encabezado,
  distintivo,
  titulo,
  children,
}: {
  foto: string;
  /**
   * Dónde ancla el recorte mientras la columna es estrecha, como clase de
   * `object-position`. **No es cosmética.** La foto es 16:9 y el bloque en un
   * teléfono es más alto que ancho, así que `object-cover` descarta cerca del
   * 70 % del ancho: con el centro por defecto, una foto con el sujeto a la
   * derecha se queda enseñando el fondo. Se pasa el punto de interés y a
   * partir de `md`, donde el bloque vuelve a ser apaisado, manda el centro.
   */
  encuadreMovil?: string;
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
        className={`object-cover ${encuadreMovil} md:object-center`}
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-b from-brand-900/95 via-brand-900/88 to-brand-900/80 md:bg-gradient-to-r md:from-brand-900 md:via-brand-900/90 md:to-brand-900/60"
      />

      <div className="container-page relative py-12 md:py-16">
        {encabezado && (
          <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.2em] text-brand-300">
            {encabezado}
          </p>
        )}
        {distintivo}
        <h1 className="mt-3 max-w-3xl font-display text-3xl text-white sm:text-4xl md:text-5xl">
          {titulo}
        </h1>
        {children}
      </div>
    </section>
  );
}
