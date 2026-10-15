"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import type { DatoDePago } from "@/lib/payments";

/**
 * El botón de pago de la pasarela.
 *
 * La librería de la pasarela busca en la página sus etiquetas `<script>` con
 * atributos `data-…` **cuando carga**, y las convierte en botón. En una página
 * de React eso obliga a un orden concreto —primero la etiqueta del botón en el
 * DOM, después la librería—, que es lo que recomienda la propia documentación
 * de BOLD para sitios hechos con frameworks. Al salir de la página se quitan
 * las dos: volver a entrar las vuelve a poner en ese orden.
 *
 * Los atributos llegan armados desde el servidor (`src/lib/payments.ts`), con
 * la firma de integridad calculada allá: la llave secreta nunca está aquí.
 */
export function BotonDePago({ script, atributos }: { script: string; atributos: Record<string, string> }) {
  const caja = useRef<HTMLDivElement>(null);
  const clave = JSON.stringify(atributos);

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const boton = document.createElement("script");
    for (const [k, v] of Object.entries(JSON.parse(clave) as Record<string, string>)) boton.setAttribute(k, v);
    el.appendChild(boton);

    for (const previa of document.querySelectorAll("script[data-libreria-de-pago]")) previa.remove();
    const libreria = document.createElement("script");
    libreria.src = script;
    libreria.async = true;
    libreria.setAttribute("data-libreria-de-pago", "");
    document.head.appendChild(libreria);

    return () => {
      el.replaceChildren();
      libreria.remove();
    };
  }, [script, clave]);

  return <div ref={caja} className="min-h-12" />;
}

/** Los datos para transferir o pagar con llave, cada uno con su botón de copiar. */
export function DatosDePago({ datos }: { datos: DatoDePago[] }) {
  const [copiado, setCopiado] = useState<string | null>(null);

  async function copiar(etiqueta: string, valor: string) {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(etiqueta);
      setTimeout(() => setCopiado((c) => (c === etiqueta ? null : c)), 2000);
    } catch {
      // Sin permiso de portapapeles el dato sigue a la vista para copiarlo a mano.
    }
  }

  return (
    <dl className="mt-3 divide-y divide-clay-300/50 rounded-lg bg-white/70 text-sm">
      {datos.map((d) => (
        <div key={d.etiqueta} className="flex items-center justify-between gap-3 px-3 py-2">
          <div className="min-w-0">
            <dt className="text-xs text-muted">{d.etiqueta}</dt>
            <dd className="break-all font-medium text-ink">{d.valor}</dd>
          </div>
          <button
            type="button"
            onClick={() => copiar(d.etiqueta, d.copiar ?? d.valor)}
            aria-label={`Copiar ${d.etiqueta.toLowerCase()}`}
            className="grid size-9 shrink-0 place-items-center rounded-full text-clay-700 ring-1 ring-clay-300/60 transition hover:bg-clay-100"
          >
            {copiado === d.etiqueta ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          </button>
        </div>
      ))}
    </dl>
  );
}
