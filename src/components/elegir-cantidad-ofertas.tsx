"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FileSpreadsheet, Plus } from "lucide-react";

/** Lo que tarda la píldora en cruzar. El estilo (`globals.css`) usa el mismo número. */
const MS_CRUCE = 420;
/** Si la otra pantalla no llega (se cortó la red, el usuario volvió atrás), el contenido se recupera. */
const MS_ESPERA_MAXIMA = 8000;

type Cantidad = "una" | "varias";

/**
 * «¿Una oferta o varias?», justo debajo del enlace de volver en «Nueva oferta»
 * y en «Cargar desde Excel».
 *
 * La carga masiva existía pero se llegaba a ella por «Ver todas» → «Cargar
 * desde Excel»: quien abría «Nueva oferta» con veinte productos por subir
 * llenaba el formulario veinte veces sin saber que había otro camino. Este
 * selector está en las dos pantallas, así que desde cualquiera se pasa a la
 * otra de un clic.
 *
 * ## Por qué es de cliente y se anima solo
 *
 * Son dos páginas, y el cambio de una a otra era un salto: la píldora aparecía
 * en el otro lado y el contenido se reemplazaba. Un primer intento con View
 * Transitions del navegador no se notaba en la pantalla real, así que ahora el
 * selector hace él mismo lo que se ve, en este orden:
 *
 * 1. **Al pulsar**, la píldora cruza de una opción a la otra (`MS_CRUCE`) y,
 *    a la vez, todo lo que hay debajo se difumina y se apaga: el atributo
 *    `data-saliendo` activa la regla de `globals.css`.
 * 2. **Cuando termina el cruce**, se navega. El contenido viejo se queda
 *    difuminado hasta que llega el nuevo: así el tiempo de espera se lee como
 *    parte del cambio y no como una página vacía.
 * 3. **La pantalla nueva** monta el selector ya en su sitio (sin salto, porque
 *    la píldora terminó donde ella empieza) y su contenido entra desde el
 *    desenfoque hasta quedar nítido.
 *
 * Con `prefers-reduced-motion` no hay nada de esto: se navega al instante.
 * Con una tecla modificadora (abrir en otra pestaña) tampoco: el enlace es un
 * enlace normal.
 *
 * **Tiene que estar en el mismo sitio en las dos pantallas** (debajo del
 * enlace de volver, antes del título), y lo que se difumina son sus hermanos
 * siguientes: si una pantalla lo pone en otro lugar, la píldora «salta» al
 * llegar.
 *
 * **Lleva `view-transition-name` solo para quedarse quieto**: la transición
 * general entre páginas (`template.tsx`) funde la pantalla entera, y sin
 * nombre el selector se atenuaría y volvería justo cuando llega la otra. Con
 * nombre y sin animación (`globals.css`) es como el encabezado: un punto fijo.
 * La animación del selector es la de arriba, no la del navegador.
 */
export function ElegirCantidadOfertas({
  activa,
  hrefUna,
  hrefVarias,
}: {
  activa: Cantidad;
  hrefUna: string;
  hrefVarias: string;
}) {
  const router = useRouter();
  /** A qué opción se pulsó estando en `desde`. Si la pantalla cambia, deja de valer. */
  const [pulsada, setPulsada] = useState<{ desde: Cantidad; hacia: Cantidad } | null>(null);
  const temporizadores = useRef<number[]>([]);

  const enCamino = pulsada !== null && pulsada.desde === activa;
  const elegida: Cantidad = enCamino ? pulsada.hacia : activa;

  useEffect(() => {
    const t = temporizadores.current;
    return () => t.forEach((id) => window.clearTimeout(id));
  }, []);

  function alPulsar(evento: React.MouseEvent<HTMLAnchorElement>, hacia: Cantidad, href: string) {
    const conTecla = evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey || evento.button !== 0;
    if (conTecla || hacia === elegida) {
      if (hacia === elegida && !conTecla) evento.preventDefault();
      return;
    }
    evento.preventDefault();
    router.prefetch(href);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      router.push(href);
      return;
    }

    setPulsada({ desde: activa, hacia });
    temporizadores.current.push(
      window.setTimeout(() => router.push(href), MS_CRUCE),
      window.setTimeout(() => setPulsada(null), MS_CRUCE + MS_ESPERA_MAXIMA),
    );
  }

  return (
    <nav
      aria-label="Cuántas ofertas vas a publicar"
      data-saliendo={enCamino ? "" : undefined}
      style={{ viewTransitionName: "selector-oferta" }}
      className="selector-oferta relative mt-5 grid w-full max-w-md grid-cols-2 gap-1 rounded-full bg-white p-1 ring-1 ring-control sm:w-fit"
    >
      {/* La píldora no es el fondo de la opción activa: es una sola pieza que
          se desplaza. Mide lo que una columna de la rejilla (las dos opciones
          miden lo mismo) y cruza con `translate`; el ancho y el recorrido
          están en `globals.css`. */}
      <span
        aria-hidden
        data-lado={elegida}
        className="pildora-oferta pointer-events-none absolute inset-y-1 left-1 rounded-full bg-brand-700"
      />
      <Opcion
        href={hrefUna}
        activa={elegida === "una"}
        actual={activa === "una"}
        alPulsar={(e) => alPulsar(e, "una", hrefUna)}
        icono={<Plus className="size-4" aria-hidden />}
      >
        Una oferta
      </Opcion>
      <Opcion
        href={hrefVarias}
        activa={elegida === "varias"}
        actual={activa === "varias"}
        alPulsar={(e) => alPulsar(e, "varias", hrefVarias)}
        icono={<FileSpreadsheet className="size-4" aria-hidden />}
      >
        Varias desde Excel
      </Opcion>
    </nav>
  );
}

function Opcion({
  href,
  activa,
  actual,
  alPulsar,
  icono,
  children,
}: {
  href: string;
  /** ¿Está elegida? Cambia al pulsar, antes de que llegue la otra pantalla. */
  activa: boolean;
  /** ¿Es la pantalla en la que estás? Es lo que lee un lector de pantalla. */
  actual: boolean;
  alPulsar: (evento: React.MouseEvent<HTMLAnchorElement>) => void;
  icono: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={alPulsar}
      aria-current={actual ? "page" : undefined}
      className={`relative z-10 flex items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold transition-colors duration-300 sm:px-5 ${
        activa ? "text-white" : "text-brand-700 hover:text-brand-900"
      }`}
    >
      {icono}
      {children}
    </Link>
  );
}
