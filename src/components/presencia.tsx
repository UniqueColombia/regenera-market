"use client";

import { useEffect, useState } from "react";

/**
 * Entrada y salida de lo que se despliega.
 *
 * Un `{abierto && <Panel/>}` desmonta el panel en el mismo instante en que se
 * cierra, y por eso solo se le podía animar la entrada. Este hook lo mantiene
 * montado lo que dura la salida:
 *
 * - `montado`: se pinta el nodo. Pasa a `true` en cuanto se pide abrir y vuelve a
 *   `false` `ms` después de pedir cerrar.
 * - `visible`: el nodo está en su estado abierto. Va un cuadro **detrás** de
 *   `montado` al abrir (si no, el navegador pinta el nodo ya abierto y no hay
 *   nada que transicionar) y cae al instante al cerrar.
 *
 * El CSS (`.desplegable`, `.plegable` en `globals.css`) anima el paso de
 * `visible` a no `visible`; `ms` tiene que ser al menos lo que dura esa
 * transición.
 */
export function usePresencia(abierto: boolean, ms = 220) {
  const [montado, setMontado] = useState(abierto);
  const [listo, setListo] = useState(false);

  // Ajuste durante el render y no en un efecto: evita un cuadro en que el panel
  // existe pero todavía no está montado.
  if (abierto && !montado) setMontado(true);

  useEffect(() => {
    if (abierto) {
      let segundo = 0;
      const primero = requestAnimationFrame(() => {
        segundo = requestAnimationFrame(() => setListo(true));
      });
      return () => {
        cancelAnimationFrame(primero);
        cancelAnimationFrame(segundo);
      };
    }
    const t = setTimeout(() => {
      setMontado(false);
      setListo(false);
    }, ms);
    return () => clearTimeout(t);
  }, [abierto, ms]);

  return { montado, visible: abierto && listo };
}

type Props = {
  abierto: boolean;
  className?: string;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "className" | "children">;

/**
 * Panel flotante (menú, lista de idiomas, cuenta): aparece y se va con un
 * desvanecido y un pequeño desplazamiento vertical.
 *
 * Anima `transform` y no `translate`, igual que el keyframe `desplegar`: el
 * panel de categorías va centrado con `-translate-x-1/2`, que Tailwind 4 emite
 * como la propiedad `translate`, y las dos se componen.
 */
export function Flotante({ abierto, className = "", children, ...resto }: Props) {
  const { montado, visible } = usePresencia(abierto, 180);
  if (!montado) return null;
  return (
    <div
      {...resto}
      data-visible={visible ? "" : undefined}
      className={`desplegable ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Bloque que se despliega empujando lo de abajo (acordeón, menú móvil): su alto
 * crece y se encoge con la salida. Usa `grid-template-rows: 0fr → 1fr`, la forma
 * de animar un alto `auto` sin medirlo.
 *
 * Se desmonta al terminar la salida: lo que tenga dentro (campos de formulario)
 * no se envía ni se enfoca estando cerrado.
 */
export function Plegable({ abierto, className = "", children, ...resto }: Props) {
  const { montado, visible } = usePresencia(abierto, 260);
  if (!montado) return null;
  return (
    <div
      {...resto}
      data-visible={visible ? "" : undefined}
      className={`plegable ${className}`}
    >
      <div>{children}</div>
    </div>
  );
}
