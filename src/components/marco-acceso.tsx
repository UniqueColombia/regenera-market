import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { FondoBotanico } from "./fondo-botanico";
import { Tarjeta } from "./tarjeta";

/**
 * La pantalla de `/entrar` y de `/registro`.
 *
 * Pedido de Jesús el 2026-10-17, con captura: en escritorio el formulario era
 * una columna de `max-w-md` en el centro de una página de 80rem, y se veía
 * pequeño y perdido. Ahora ocupa todo el `container-page` en dos columnas —a la
 * izquierda a qué entras, a la derecha el formulario en su tarjeta— con el
 * mismo `FondoBotanico` de «Tu cuenta» y de los formularios de oferta.
 *
 * - **En el teléfono no cambia lo que funcionaba**: título, frase y formulario,
 *   en una columna. Los `puntos` solo salen desde `lg`: a 375 px empujarían el
 *   formulario debajo del pliegue, y quien llega aquí viene a entrar.
 * - **El formulario va a la derecha a propósito**: el bosque del fondo está
 *   pegado al borde derecho, y la tarjeta blanca queda delante de los árboles.
 *   Con el texto a la derecha, un árbol se vería detrás de las letras (la
 *   trampa de los botones sin fondo del hito del 2026-10-15).
 * - **Arriba y no centrado**, y el texto fijo al bajar: el formulario de registro
 *   es más alto que la pantalla, y centrado dejaba el título a media altura con
 *   un hueco encima. Así el título queda alineado con el primer campo y a la
 *   vista mientras se llena el formulario.
 * - Los formularios traen su `mt-8` de cuando iban sueltos bajo el título;
 *   dentro de la tarjeta sobra, y `[&>form]:mt-0` lo quita sin tocarlos.
 */
export function MarcoAcceso({
  etiqueta,
  icono: Icono,
  titulo,
  resumen,
  puntos,
  children,
}: {
  etiqueta: string;
  icono: LucideIcon;
  titulo: string;
  resumen: string;
  /** Lo que la persona consigue con la cuenta, en una frase cada uno. */
  puntos: { icono: LucideIcon; texto: string }[];
  /** Los avisos de la pantalla y el formulario. */
  children: ReactNode;
}) {
  return (
    <div className="relative isolate">
      <FondoBotanico />
      <div className="container-page grid gap-8 py-12 lg:grid-cols-[minmax(0,1fr)_30rem] lg:items-start lg:gap-16 lg:py-20">
        <div className="lg:sticky lg:top-28 lg:pt-6">
          <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.2em] text-brand-600">
            <Icono className="size-4" />
            {etiqueta}
          </p>
          <h1 className="mt-3 font-display text-3xl text-ink sm:text-4xl lg:text-5xl">{titulo}</h1>
          <p className="mt-3 max-w-xl text-muted lg:text-lg">{resumen}</p>
          <ul className="mt-10 hidden max-w-xl space-y-4 lg:block">
            {puntos.map(({ icono: IconoPunto, texto }) => (
              <li key={texto} className="flex items-start gap-3 text-ink">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white ring-1 ring-hairline">
                  <IconoPunto className="size-4 text-brand-700" aria-hidden />
                </span>
                <span className="pt-1.5">{texto}</span>
              </li>
            ))}
          </ul>
        </div>
        <Tarjeta i={0} className="sm:p-8 [&>form]:mt-0">
          {children}
        </Tarjeta>
      </div>
    </div>
  );
}
