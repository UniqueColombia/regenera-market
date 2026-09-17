"use client";

import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";

/**
 * Aparición al entrar en pantalla.
 *
 * Es cliente porque usa `IntersectionObserver`, que es una API del navegador
 * (criterio 3 de la skill `componentizacion`). Envuelve contenido que sigue
 * siendo de servidor: lo recibe ya renderizado en `children` y no lo manda al
 * bundle.
 *
 * ## Por qué el HTML sale visible y se esconde después
 *
 * Lo evidente sería pintarlo oculto y revelarlo al verse. Eso deja la página
 * **en blanco para quien llegue sin JavaScript**, y en `/vender` eso es la mitad
 * de la propuesta comercial. Así que el servidor lo manda visible y el efecto
 * solo se arma al montar, y **únicamente para lo que está debajo del pliegue**:
 * esconder algo que ya se está viendo produciría un parpadeo justo después de
 * hidratar, que es peor que no animar nada.
 *
 * Consecuencia buscada: lo que entra en la primera pantalla no se anima. No es
 * una carencia — es lo que hace que la página no titile al cargar.
 *
 * ## `prefers-reduced-motion`
 *
 * Se respeta, y no con una animación más suave: no hay animación. Quien lo
 * activa suele hacerlo porque el movimiento le produce mareo, y media animación
 * sigue siendo movimiento.
 */
export function Revelar({
  children,
  as = "div",
  retraso = 0,
  className = "",
}: {
  children: ReactNode;
  /** Qué elemento se pinta. `li` cuando va dentro de una lista: un `div` ahí rompe la semántica. */
  as?: "div" | "li" | "section";
  /** Milisegundos de espera antes de entrar. Sirve para escalonar una lista. */
  retraso?: number;
  className?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [estado, setEstado] = useState<"suelto" | "oculto" | "visible">("suelto");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (quieto || !("IntersectionObserver" in window)) return;

    // Ya se ve: se queda como está. Ver la cabecera.
    if (el.getBoundingClientRect().top < window.innerHeight) return;

    setEstado("oculto");

    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (!entrada.isIntersecting) return;
        setEstado("visible");
        // Se revela una sola vez. Volver a esconderlo al salir por arriba hace
        // que la página parpadee al desplazarse hacia atrás.
        observador.disconnect();
      },
      // El margen inferior lo dispara un poco antes de asomar, para que el
      // movimiento termine cuando el bloque ya está encuadrado.
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );

    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  // Un elemento dinámico con tres etiquetas posibles obliga a TypeScript a
  // resolver la unión de sus tres juegos de props, y ahí ni el `ref` ni el
  // `style` tipan. Se fija a una y el `ref` se castea: lo que se pinta en el DOM
  // es la etiqueta que llegó por props, que es lo único que importa en runtime.
  const Etiqueta = as as "div";

  return (
    <Etiqueta
      ref={ref as Ref<HTMLDivElement>}
      // El retraso viaja con el estado final, que es el que gobierna la
      // transición: ponerlo solo mientras está oculto lo dejaría sin efecto
      // justo en el cambio que había que escalonar.
      style={estado === "suelto" || !retraso ? undefined : { transitionDelay: `${retraso}ms` }}
      className={`motion-safe:transition-[opacity,transform] motion-safe:duration-700 motion-safe:ease-out ${
        estado === "oculto" ? "opacity-0 translate-y-3" : "opacity-100 translate-y-0"
      } ${className}`}
    >
      {children}
    </Etiqueta>
  );
}
