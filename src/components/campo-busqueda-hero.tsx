"use client";

import { useEffect, useRef } from "react";

/**
 * El campo de búsqueda del hero de la portada, con sugerencias que se escriben
 * solas en el placeholder: «Amenities…», «Compostaje…», «Guadua…».
 *
 * Por qué: el placeholder fijo enumeraba cuatro cosas en una línea que en un
 * teléfono se cortaba a la mitad. Escritas una a una se leen enteras, y enseñan
 * que el catálogo va de amenities a experiencias en el Amazonas.
 *
 * Lo que no cambia: es el mismo `<input name="q">` dentro del mismo formulario
 * GET (skill `diseno-visual`: los filtros son URL). La etiqueta sigue siendo el
 * `<label>` de la página; el placeholder nunca fue la etiqueta.
 *
 * Se detiene en cuanto la persona enfoca el campo o escribe, y no arranca con
 * `prefers-reduced-motion`: ahí se queda el placeholder del servidor.
 * Se escribe sobre el atributo directamente, sin estado de React, para no
 * repintar el formulario cuarenta veces por sugerencia.
 */
export function CampoBusquedaHero({
  id,
  placeholder,
  sugerencias,
  className,
}: {
  id: string;
  /** El que sale del servidor y el que queda si no hay animación. */
  placeholder: string;
  sugerencias: string[];
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = ref.current;
    if (!input || sugerencias.length === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let temporizador = 0;
    let indice = 0;
    let letras = 0;
    let borrando = false;
    let detenido = false;

    const detener = () => {
      detenido = true;
      window.clearTimeout(temporizador);
      input.placeholder = placeholder;
    };

    const paso = () => {
      if (detenido) return;
      const palabra = sugerencias[indice];
      letras += borrando ? -1 : 1;
      input.placeholder = `${palabra.slice(0, letras)}${letras > 0 ? "…" : ""}`;

      let espera = borrando ? 35 : 75;
      if (!borrando && letras === palabra.length) {
        borrando = true;
        espera = 1800; // tiempo para leerla entera
      } else if (borrando && letras === 0) {
        borrando = false;
        indice = (indice + 1) % sugerencias.length;
        espera = 400;
      }
      temporizador = window.setTimeout(paso, espera);
    };

    // Arranca cuando el hero ya entró (ver `.cascada-hero`), no antes.
    temporizador = window.setTimeout(() => {
      letras = 0;
      paso();
    }, 1600);

    input.addEventListener("focus", detener);
    input.addEventListener("input", detener);
    return () => {
      window.clearTimeout(temporizador);
      input.removeEventListener("focus", detener);
      input.removeEventListener("input", detener);
    };
  }, [placeholder, sugerencias]);

  return (
    <input
      ref={ref}
      id={id}
      name="q"
      placeholder={placeholder}
      className={className}
    />
  );
}
