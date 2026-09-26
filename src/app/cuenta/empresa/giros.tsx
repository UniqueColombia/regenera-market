"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Lock } from "lucide-react";
import { guardarGiros } from "./actions";
import { GIROS } from "@/lib/taxonomy";

/**
 * El editor del giro: qué es y qué ofrece la empresa.
 *
 * Cliente por el estado de las casillas y por el contador, que tiene que
 * frenar **antes** de enviar: dejar marcar la cuarta casilla a una empresa
 * Semilla para decirle después «solo caben dos» es enseñarle un error que se
 * podía evitar. Las que ya no caben se deshabilitan y dicen por qué.
 *
 * La base lo impone igual (`providers_limitar_giros`, migración 0012); esto es
 * la cortesía, no la barrera.
 */
export function Giros({
  iniciales,
  tope,
  nivel,
  verificada,
}: {
  iniciales: string[];
  tope: number;
  /** El nombre del nivel, para decir por qué hay tope. */
  nivel: string;
  verificada: boolean;
}) {
  const [elegidos, setElegidos] = useState<string[]>(iniciales);
  const [estado, setEstado] = useState<"quieto" | "guardado" | string>("quieto");
  const [pendiente, iniciar] = useTransition();

  const lleno = elegidos.length >= tope;
  const cambio =
    elegidos.length !== iniciales.length || elegidos.some((g) => !iniciales.includes(g));

  function alternar(id: string) {
    setEstado("quieto");
    setElegidos((a) => (a.includes(id) ? a.filter((g) => g !== id) : [...a, id]));
  }

  function guardar() {
    iniciar(async () => {
      const r = await guardarGiros(elegidos);
      setEstado(r.ok ? "guardado" : r.error);
    });
  }

  return (
    <div>
      <ul className="flex flex-wrap gap-2">
        {GIROS.map((g) => {
          const marcado = elegidos.includes(g.id);
          const sinSello = "avanzado" in g && g.avanzado && !verificada;
          const bloqueado = !marcado && (lleno || sinSello);
          return (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => alternar(g.id)}
                disabled={bloqueado || pendiente}
                aria-pressed={marcado}
                title={
                  sinSello
                    ? "Requiere el sello verificado por Seregenera"
                    : bloqueado
                      ? `Con nivel ${nivel} caben ${tope}`
                      : undefined
                }
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm ring-1 transition disabled:cursor-not-allowed disabled:opacity-45 ${
                  marcado
                    ? "bg-brand-50 font-medium text-brand-800 ring-brand-400"
                    : "text-muted ring-control hover:bg-sand hover:text-brand-700"
                }`}
              >
                {marcado ? (
                  <Check className="size-4 animate-latido motion-reduce:animate-none" aria-hidden />
                ) : sinSello ? (
                  <Lock className="size-3.5" aria-hidden />
                ) : null}
                {g.label}
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-xs text-muted" aria-live="polite">
        {elegidos.length} de {tope} · Con nivel {nivel} puedes ofrecer hasta{" "}
        {tope === GIROS.length ? "todos a la vez" : `${tope} a la vez`}.
        {tope < GIROS.length && " Al subir de nivel caben más."}
      </p>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={guardar}
          disabled={!cambio || pendiente}
          className="flex items-center gap-2 rounded-full bg-brand-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:bg-muted"
        >
          {pendiente && <Loader2 className="size-4 animate-spin" />}
          Guardar
        </button>
        {estado === "guardado" && (
          <span className="animate-aviso text-sm text-brand-700 motion-reduce:animate-none">
            Guardado
          </span>
        )}
        {estado !== "guardado" && estado !== "quieto" && (
          <span role="alert" className="text-sm text-red-700">
            {estado}
          </span>
        )}
      </div>
    </div>
  );
}
