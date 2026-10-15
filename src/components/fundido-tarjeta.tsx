"use client";

import { useEffect, useRef, useState } from "react";
import { FotoOferta } from "./foto-oferta";

/** Cuánto se queda cada foto. Con seis, la vuelta completa dura medio minuto. */
const INTERVALO = 3800;

/**
 * Las demás fotos de una oferta, turnándose con un fundido encima de la
 * primera, en la tarjeta del catálogo.
 *
 * Hasta el 2026-10-14 la tarjeta enseñaba solo `images[0]`: un proveedor subía
 * seis fotos del cacao y en el catálogo se veía una. La ficha tiene la galería
 * completa (`GaleriaOferta`); esto es el vistazo antes de entrar.
 *
 * Mismo esquema que `FundidoFotos` del hero, y por lo mismo:
 *
 * - **La primera foto no está aquí.** La pinta `ListingMedia` desde el servidor.
 *   Este componente monta las demás encima, transparentes, y las enciende de
 *   una en una; volver a la primera es apagarlas todas.
 * - **Nada se pide hasta que la tarjeta se ve.** Un catálogo de 24 ofertas con
 *   seis fotos cada una serían 120 imágenes de golpe; así solo cargan las de las
 *   tarjetas que están en pantalla.
 * - **Solo se pasa a una foto que ya cargó.** Si no, el fundido entra a un hueco
 *   y se ve la de abajo parpadear.
 * - **Cada tarjeta arranca con su propio desfase**, para que la rejilla no
 *   cambie entera al mismo tiempo, que se lee como un fallo y no como vida.
 *
 * Con el ratón encima, la foto la elige la posición del puntero (de izquierda a
 * derecha, una franja por foto) y el turno se para: quien está mirando decide.
 * Lo mismo con el foco del teclado en el enlace. Con `prefers-reduced-motion`
 * no se turna nada; los puntos siguen diciendo cuántas fotos hay.
 *
 * Los puntos son `aria-hidden`: la tarjeta es un enlace a la ficha, que tiene la
 * galería con sus controles, y un control dentro de un enlace no es válido.
 */
export function FundidoTarjeta({
  fotos,
  sizes,
  className = "",
}: {
  /** Todas, incluida la primera (que no se pinta aquí). */
  fotos: string[];
  sizes: string;
  /** La misma clase de la foto de abajo, para que crezcan juntas al pasar el ratón. */
  className?: string;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const listas = useRef(new Set<number>([0]));
  const [montadas, setMontadas] = useState(false);
  const [vista, setVista] = useState({ activa: 0, anterior: 0 });
  const [apuntada, setApuntada] = useState<number | null>(null);
  const total = fotos.length;

  useEffect(() => {
    const el = caja.current;
    if (!el || total < 2) return;
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ancla = el.closest("a");

    let visible = false;
    let pausada = false;
    let arranque = 0;
    let temporizador = 0;

    const avanzar = () =>
      setVista((v) => {
        for (let paso = 1; paso < total; paso++) {
          const j = (v.activa + paso) % total;
          if (listas.current.has(j)) return { activa: j, anterior: v.activa };
        }
        return v;
      });

    const programar = () => {
      window.clearTimeout(arranque);
      window.clearInterval(temporizador);
      if (quieto || !visible || pausada || document.hidden) return;
      arranque = window.setTimeout(() => {
        avanzar();
        temporizador = window.setInterval(avanzar, INTERVALO);
      }, INTERVALO * (0.4 + Math.random()));
    };

    const observador = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
        if (visible) setMontadas(true);
        programar();
      },
      { rootMargin: "200px 0px" },
    );
    observador.observe(el);

    const pausar = () => {
      pausada = true;
      programar();
    };
    const seguir = () => {
      pausada = false;
      programar();
    };
    ancla?.addEventListener("focusin", pausar);
    ancla?.addEventListener("focusout", seguir);
    document.addEventListener("visibilitychange", programar);

    return () => {
      window.clearTimeout(arranque);
      window.clearInterval(temporizador);
      observador.disconnect();
      ancla?.removeEventListener("focusin", pausar);
      ancla?.removeEventListener("focusout", seguir);
      document.removeEventListener("visibilitychange", programar);
    };
  }, [total]);

  if (total < 2) return null;

  // Con el ratón encima manda el puntero; si no, el turno.
  const mostrada = apuntada ?? vista.activa;
  const rapido = apuntada !== null;

  function apuntar(evento: React.PointerEvent<HTMLDivElement>) {
    if (evento.pointerType !== "mouse") return;
    const r = evento.currentTarget.getBoundingClientRect();
    const i = Math.min(total - 1, Math.max(0, Math.floor(((evento.clientX - r.left) / r.width) * total)));
    setMontadas(true);
    setApuntada(i);
  }

  return (
    <div
      ref={caja}
      className="absolute inset-0"
      onPointerMove={apuntar}
      onPointerLeave={() => setApuntada(null)}
    >
      {montadas &&
        fotos.slice(1).map((src, k) => {
          const i = k + 1;
          // La que entra se pinta encima de la que sale, que se queda opaca
          // debajo hasta que termina el fundido. Si ambas bajaran a la vez,
          // a media transición se transparentaría la primera foto.
          const encendida =
            i === mostrada || (!rapido && i === vista.anterior && vista.anterior < mostrada);
          return (
            <div
              key={`${i}-${src}`}
              aria-hidden
              className={`absolute inset-0 transition-opacity ease-in-out ${
                rapido ? "duration-200" : "duration-1000"
              } ${encendida ? "opacity-100" : "opacity-0"}`}
            >
              <FotoOferta
                src={src}
                alt=""
                sizes={sizes}
                className={className}
                onLoad={() => listas.current.add(i)}
              />
            </div>
          );
        })}

      <span
        aria-hidden
        data-tema-fijo
        className="pointer-events-none absolute bottom-2.5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-ink/35 px-1.5 py-1 backdrop-blur-sm"
      >
        {fotos.map((src, i) => (
          <span
            key={`${i}-${src}`}
            className={`h-1.5 rounded-full bg-white transition-all duration-300 ${
              i === mostrada ? "w-4" : "w-1.5 opacity-60"
            }`}
          />
        ))}
      </span>
    </div>
  );
}
