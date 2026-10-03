"use client";

import { useEffect, useRef } from "react";

/**
 * Una cifra que sube desde cero cuando se deja ver. Para las cifras del hero de
 * la portada: «12 proveedores verificados» se lee como algo que crece, no como
 * una etiqueta.
 *
 * **El HTML trae el valor final.** Sin JavaScript, con `prefers-reduced-motion`
 * o para un buscador, la cifra es la correcta desde el principio. El conteo no
 * pasa por el estado de React: se escribe directamente en el nodo, así que no
 * hay un render por fotograma ni un valor intermedio que pueda quedarse pegado.
 *
 * Por qué no parpadea «12 → 0 → 12»: en el hero, las cifras están dentro de la
 * `.cascada-hero`, que las tiene invisibles durante el primer segundo. El cero
 * se pone al hidratar, mientras todavía no se ven, y se empieza a contar cuando
 * aparecen.
 */
export function Contador({
  valor,
  sufijo = "",
  className,
}: {
  valor: number;
  sufijo?: string;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || valor <= 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;

    /* Se reescribe el MISMO nodo de texto que pintó React, no `textContent`:
       `textContent` lo reemplaza por uno nuevo, React se queda apuntando al
       viejo (ya fuera del DOM) y en el siguiente cambio de `valor` actualizaría
       un nodo que nadie ve. */
    const nodo = el.firstChild;
    if (!(nodo instanceof Text)) return;
    const escribir = (n: number) => (nodo.nodeValue = `${n}${sufijo}`);

    escribir(0);
    let raf = 0;

    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (!entrada.isIntersecting) return;
        observador.disconnect();
        // Si está en la cascada del hero, espera a que termine de entrar.
        const retraso = el.closest(".cascada-hero") ? 650 : 0;
        const duracion = Math.min(900 + valor * 8, 1600);
        const t0 = performance.now() + retraso;
        const paso = (t: number) => {
          // `t` puede ser anterior a `t0`: sin el tope inferior la primera
          // vuelta da un progreso negativo y la cifra sale como «-1».
          const k = Math.min(Math.max((t - t0) / duracion, 0), 1);
          const suave = 1 - Math.pow(1 - k, 3);
          escribir(Math.round(valor * suave));
          if (k < 1) raf = requestAnimationFrame(paso);
        };
        raf = requestAnimationFrame(paso);
      },
      { threshold: 0.6 },
    );
    observador.observe(el);

    return () => {
      observador.disconnect();
      cancelAnimationFrame(raf);
      // Si se desmonta a medio contar, que no quede una cifra a medias.
      escribir(valor);
    };
  }, [valor, sufijo]);

  // Una sola cadena = un solo nodo de texto, que es el que reescribe el efecto.
  return (
    <span ref={ref} className={className}>
      {`${valor}${sufijo}`}
    </span>
  );
}
