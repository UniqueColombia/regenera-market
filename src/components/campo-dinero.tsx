"use client";

import { useRef, useState } from "react";
import { miles, pesosDesdeTexto } from "@/lib/format";

/**
 * Un monto en pesos que se lee mientras se escribe: «20000» se ve «20.000».
 *
 * **Por qué no `<input type="number">`.** Era lo que había, y tenía tres
 * fallos que se notaban en plata (revisión del 2026-10-12):
 * - «20.000», como se escribe en Colombia, el navegador lo tomaba por el
 *   decimal 20,000 y la oferta salía publicada a $20;
 * - no admite ver el separador de miles, así que un cero de más o de menos en
 *   una cifra de siete dígitos pasaba sin que nadie lo viera;
 * - la rueda del mouse cambiaba el monto si el campo tenía el foco.
 *
 * Por dentro manda el número limpio («20000») en un campo oculto con el mismo
 * `name`, así que `FormData` y el servidor no cambian. El servidor además lee
 * «20.000» bien aunque este componente no llegue a cargar (`pesosDesdeTexto()`).
 *
 * `moneda` hoy siempre es COP: todo el dinero del marketplace es en pesos
 * colombianos (invariante 5 de `dominio-regenera`). Está como prop para que el
 * día que se decida otra cosa no cambie la interfaz de quien lo usa.
 */
export function CampoDinero({
  name,
  defaultValue,
  required,
  invalido,
  className = "",
  moneda = "COP",
}: {
  name: string;
  defaultValue?: number | null;
  required?: boolean;
  invalido?: boolean;
  className?: string;
  moneda?: "COP";
}) {
  const [texto, setTexto] = useState(defaultValue != null ? miles(defaultValue) : "");
  const campo = useRef<HTMLInputElement>(null);
  const valor = pesosDesdeTexto(texto);

  function cambiar(e: React.ChangeEvent<HTMLInputElement>) {
    const escrito = e.target.value;
    const cursor = e.target.selectionStart ?? escrito.length;
    // Cuántas cifras hay antes del cursor: es lo que se conserva al reformatear,
    // para que el cursor no salte al final cada vez que aparece un punto.
    const cifrasAntes = escrito.slice(0, cursor).replace(/\D/g, "").length;
    const cifras = escrito.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 12);
    const nuevo = cifras ? miles(Number(cifras)) : "";
    setTexto(nuevo);

    requestAnimationFrame(() => {
      const el = campo.current;
      if (!el || document.activeElement !== el) return;
      let pos = 0;
      for (let vistas = 0; pos < nuevo.length && vistas < cifrasAntes; pos++) {
        if (/\d/.test(nuevo[pos])) vistas++;
      }
      el.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="relative">
      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">
        $
      </span>
      <input
        ref={campo}
        data-campo={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={texto}
        onChange={cambiar}
        required={required}
        aria-invalid={invalido || undefined}
        className={`${className} pl-7 pr-14 tabular-nums`}
      />
      <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted">
        {moneda}
      </span>
      <input type="hidden" name={name} value={valor === null || Number.isNaN(valor) ? texto : String(valor)} />
    </div>
  );
}
