import Image from "next/image";
import { Onda } from "./onda";
import { Fragment, type CSSProperties } from "react";
import { FondoHero, type VarianteFondo } from "./fondo-hero";
import { FundidoFotos, type FotoHero } from "./fundido-fotos";

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
/**
 * Cuánto pesa la franja. `portada` es la de la raíz del sitio: más alta y con el
 * titular un paso más grande, porque no compite con nada arriba. `seccion` es la
 * de las páginas interiores, que abren una lista justo debajo.
 *
 * Son dos tamaños y no un `className` libre a propósito: el velo solo funciona
 * si el alto y el cuerpo del titular guardan la proporción con la que se
 * calibró. Un tercer tamaño se agrega aquí, no en la página que lo pide.
 */
const TAMANOS = {
  seccion: {
    relleno: "pt-12 pb-16 md:pt-16 md:pb-20",
    titular: "text-3xl sm:text-4xl md:text-5xl",
  },
  portada: {
    relleno: "pt-14 pb-20 md:py-28",
    titular: "text-3xl leading-[1.1] sm:text-4xl md:text-6xl",
  },
} as const;

export function HeroBanner({
  foto,
  encuadreMovil = "object-center",
  tamano = "seccion",
  encabezado,
  distintivo,
  titulo,
  fondo,
  fotosExtra,
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
  tamano?: keyof typeof TAMANOS;
  /** Antetítulo en versalitas: "Metodología", "Para proveedores". */
  encabezado?: React.ReactNode;
  /** Alternativa al antetítulo cuando lo que va encima no es texto, como el
      sello de nivel en la ficha de un proveedor. Se pinta tal cual. */
  distintivo?: React.ReactNode;
  titulo: string;
  /**
   * Capa viva entre el velo y el texto (`fondo-hero.tsx`). Se elige por lo que
   * cuenta la página, no por gusto: semillas donde se habla de crecer,
   * luciérnagas donde se habla de gente y territorio, hojas que caen donde se
   * habla del trabajo en campo. Sin ella, el hero es el de siempre.
   */
  fondo?: VarianteFondo;
  /**
   * Fotos que se turnan con `foto` mediante un fundido lento
   * (`fundido-fotos.tsx`). `foto` sigue siendo la primera y la que sale del
   * servidor; estas se montan después. Solo la portada lo usa: en una página
   * interior la foto ilustra un tema concreto y cambiarla lo diluiría.
   */
  fotosExtra?: FotoHero[];
  children?: React.ReactNode;
}) {
  /* El titular entra palabra por palabra (`.palabra-hero` en globals.css) y lo
     demás —bajada, buscador, botones, cifras— entra cuando él termina. El
     retraso del resto se calcula aquí, en el servidor, con tope: en un titular
     largo no se puede hacer esperar al buscador más de un segundo. */
  const palabras = titulo.split(/\s+/);
  const retrasoResto = 160 + Math.min(palabras.length, 8) * 70;

  return (
    <section
      className="relative isolate overflow-hidden bg-brand-900"
      data-hero-fotos={fotosExtra?.length ? "" : undefined}
    >
      <Image
        src={foto}
        alt=""
        fill
        priority
        sizes="100vw"
        className={`object-cover ${encuadreMovil} md:object-center`}
      />
      {/* Debajo del velo, para que el titular se lea igual sobre todas. */}
      {fotosExtra && fotosExtra.length > 0 && <FundidoFotos fotos={fotosExtra} />}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-b from-brand-900/95 via-brand-900/88 to-brand-900/80 md:bg-gradient-to-r md:from-brand-900 md:via-brand-900/90 md:to-brand-900/60"
      />

      {fondo && <FondoHero variante={fondo} />}

      {/* El borde de abajo es una ola y no una recta. Rellena con el color de la
          página, así que sigue al modo oscuro. */}
      <Onda className="onda-hero" />

      <div className={`container-page relative ${TAMANOS[tamano].relleno}`}>
        {encabezado && (
          <p className="entrada-hero flex items-center gap-2 text-sm font-medium uppercase tracking-[0.2em] text-brand-300">
            {encabezado}
          </p>
        )}
        {distintivo}
        <h1
          className={`mt-3 max-w-3xl font-display text-white ${TAMANOS[tamano].titular}`}
        >
          {/* Cada palabra es un span con su orden en `--i`. El texto sigue siendo
              texto: un lector de pantalla y un buscador leen el titular entero,
              con sus espacios, sin que haga falta un aria-label. */}
          {palabras.map((palabra, i) => (
            <Fragment key={i}>
              {i > 0 && " "}
              <span className="palabra-hero" style={{ "--i": i } as CSSProperties}>
                {palabra}
              </span>
            </Fragment>
          ))}
        </h1>
        <div
          className="cascada-hero"
          style={{ "--retraso": `${retrasoResto}ms` } as CSSProperties}
        >
          {children}
        </div>
      </div>
    </section>
  );
}
