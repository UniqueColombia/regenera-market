"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { vistaPreviaCorreo } from "./actions";
import type { Prospecto, TipoCampana } from "@/lib/prospectos";

/**
 * El correo de campaña como le llega a la empresa, con el logo, el botón y el
 * pie: lo arma el servidor con la misma plantilla que lo envía.
 *
 * Se pide de nuevo medio segundo después de dejar de escribir, no en cada
 * tecla. Va en un `iframe` con `sandbox` vacío: el HTML del correo trae sus
 * propios estilos, que dentro de la página pisarían los del panel, y así
 * tampoco puede ejecutar nada.
 */
export function VistaPreviaCorreo({
  tipo,
  asunto,
  cuerpo,
  ejemplo,
}: {
  tipo: TipoCampana;
  asunto: string;
  cuerpo: string;
  ejemplo: Prospecto;
}) {
  const [vista, setVista] = useState<{ asunto: string; html: string } | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vigente = true;
    const espera = window.setTimeout(async () => {
      setCargando(true);
      const r = await vistaPreviaCorreo({
        tipo,
        asunto,
        cuerpo,
        empresa: ejemplo.nombre,
        ciudad: ejemplo.ciudad,
        correo: ejemplo.correo,
      });
      if (!vigente) return;
      if (r.ok) setVista({ asunto: r.asunto, html: r.html });
      setCargando(false);
    }, 500);
    return () => {
      vigente = false;
      window.clearTimeout(espera);
    };
  }, [tipo, asunto, cuerpo, ejemplo.nombre, ejemplo.ciudad, ejemplo.correo]);

  return (
    <div className="rounded-lg bg-sand p-3 text-sm">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
        Así le llega a {ejemplo.nombre}
        {cargando && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
      </p>
      {vista && (
        <>
          <p className="mt-2 font-semibold text-ink">{vista.asunto}</p>
          <iframe
            title={`Vista previa del correo para ${ejemplo.nombre}`}
            srcDoc={vista.html}
            sandbox=""
            className="mt-2 h-[34rem] w-full rounded-md bg-white ring-1 ring-hairline"
          />
        </>
      )}
    </div>
  );
}
