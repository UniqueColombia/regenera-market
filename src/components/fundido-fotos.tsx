"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export type FotoHero = {
  src: string;
  /** Igual que `encuadreMovil` del `HeroBanner`: clase de `object-position`
      que ancla el recorte en un teléfono. Cada foto tiene su sujeto en un sitio
      distinto, así que cada una trae el suyo (ver docs/IMAGENES.md). */
  encuadreMovil?: string;
};

/**
 * Las fotos que se van turnando detrás del velo del hero, con un fundido lento.
 *
 * **La primera foto no está aquí.** La pinta el `HeroBanner` desde el servidor,
 * con `priority`, igual que antes: es la que cuenta para el LCP y la que ve
 * quien llega sin JavaScript. Este componente monta las demás **encima**, todas
 * transparentes, y las enciende de una en una. Volver a la primera es apagarlas
 * todas: debajo seguía estando.
 *
 * Por qué así y no un carrusel que cambie el `src`:
 * - Cambiar el `src` de una `<Image>` hace un corte, no un fundido.
 * - Las fotos extra no se piden hasta que la portada ya cargó: se montan unos
 *   segundos después. La primera visita no paga 1,5 MB de fotos que aún no se
 *   ven.
 * - El tamaño del hero no cambia: todas son 16:9 a 2400 px, `fill` y
 *   `object-cover`, igual que la original. Por eso no entran las `vertical-*`,
 *   que son 4:3 y más pequeñas: a todo el ancho se verían borrosas.
 *
 * Se detiene con `prefers-reduced-motion` (queda la primera, quieta), fuera de
 * pantalla y con la pestaña oculta. No hay controles ni puntos de paginación:
 * es un fondo, el contenido es el mismo en todas, y un control que no cambia
 * nada de lo que uno lee sería un botón de mentira.
 */
export function FundidoFotos({
  fotos,
  intervalo = 7000,
}: {
  /** Las fotos que van DESPUÉS de la del servidor, en orden. */
  fotos: FotoHero[];
  intervalo?: number;
}) {
  const [montadas, setMontadas] = useState(false);
  /** 0 = la del servidor; 1..n = la n-ésima de `fotos`. */
  const [activa, setActiva] = useState(0);

  useEffect(() => {
    if (fotos.length === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let visible = true;
    let temporizador = 0;
    const siguiente = () => setActiva((a) => (a + 1) % (fotos.length + 1));
    const programar = () => {
      window.clearInterval(temporizador);
      if (visible && !document.hidden) temporizador = window.setInterval(siguiente, intervalo);
    };

    // Las fotos se piden cuando la portada ya está en pie, no compitiendo con
    // la primera. La primera rotación llega un intervalo después de eso.
    const montar = window.setTimeout(() => {
      setMontadas(true);
      programar();
    }, 2500);

    const hero = document.querySelector("[data-hero-fotos]");
    const observador = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      programar();
    });
    if (hero) observador.observe(hero);
    document.addEventListener("visibilitychange", programar);

    return () => {
      window.clearTimeout(montar);
      window.clearInterval(temporizador);
      observador.disconnect();
      document.removeEventListener("visibilitychange", programar);
    };
  }, [fotos.length, intervalo]);

  if (!montadas) return null;

  return (
    <>
      {fotos.map((foto, i) => (
        <Image
          key={foto.src}
          src={foto.src}
          alt=""
          fill
          sizes="100vw"
          className={`object-cover ${foto.encuadreMovil ?? "object-center"} md:object-center transition-opacity duration-[1800ms] ease-in-out ${
            activa === i + 1 ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
    </>
  );
}
