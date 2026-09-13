"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { evaluarClave, MINIMO_CARACTERES, type PuntajeClave } from "@/lib/password";

/**
 * Campo de contraseña con barra de fuerza.
 *
 * Es cliente porque tiene tres cosas que solo existen en el navegador: el estado
 * del ojo que muestra la clave, el puntaje que se recalcula en cada tecla y el
 * valor mismo. No hay forma de hacerlo en el servidor.
 *
 * **La barra la calcula `src/lib/password.ts`, que es el mismo módulo que valida
 * en la Server Action.** No es un detalle de organización: si fueran dos
 * implementaciones, el día que divergieran la barra diría «buena» en verde y el
 * servidor rechazaría el registro sin nada visible que corregir.
 *
 * La barra aparece solo cuando se está **eligiendo** una clave (`mostrarFuerza`),
 * nunca al escribirla para entrar: ahí no hay nada que mejorar y calificar la
 * contraseña de alguien mientras intenta acceder es ruido.
 */

/** Verde de marca cuando está bien, terracota en el medio, rojo cuando no pasa. */
const COLOR: Record<PuntajeClave, string> = {
  0: "bg-red-500",
  1: "bg-red-500",
  2: "bg-clay-500",
  3: "bg-brand-500",
  4: "bg-brand-600",
};

const COLOR_TEXTO: Record<PuntajeClave, string> = {
  0: "text-red-700",
  1: "text-red-700",
  2: "text-clay-600",
  3: "text-brand-700",
  4: "text-brand-700",
};

export function CampoClave({
  name,
  label,
  autoComplete,
  error,
  mostrarFuerza = false,
  contexto = [],
  ayuda,
}: {
  name: string;
  label: string;
  /** `new-password` al crear o cambiar; `current-password` al entrar. */
  autoComplete: "new-password" | "current-password";
  error?: string;
  mostrarFuerza?: boolean;
  /** Correo y nombre del mismo formulario: una clave no puede contenerlos. */
  contexto?: (string | undefined)[];
  ayuda?: string;
}) {
  const id = useId();
  const [valor, setValor] = useState("");
  const [visible, setVisible] = useState(false);

  const fuerza = mostrarFuerza ? evaluarClave(valor, contexto) : null;

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted">
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={autoComplete === "new-password" ? MINIMO_CARACTERES : undefined}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={fuerza && valor ? `${id}-fuerza` : undefined}
          className={`w-full rounded-lg border bg-white px-3 py-2 pr-11 text-sm outline-none transition focus:border-brand-500 ${
            error ? "border-red-500" : "border-control"
          }`}
        />

        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          // El botón no entra en el orden de tabulación: quien navega con
          // teclado va del campo al siguiente campo, no a un interruptor
          // decorativo. Sigue siendo alcanzable con el lector de pantalla.
          tabIndex={-1}
          aria-label={visible ? "Ocultar la contraseña" : "Mostrar la contraseña"}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted transition hover:text-brand-700"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>

      {fuerza && valor.length > 0 && (
        <div id={`${id}-fuerza`} className="mt-2">
          <div className="flex gap-1" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i < fuerza.puntaje ? COLOR[fuerza.puntaje] : "bg-hairline"
                }`}
              />
            ))}
          </div>
          {/* `aria-live` para que el lector de pantalla anuncie el cambio de
              nivel sin que la persona tenga que ir a buscarlo. */}
          <p className="mt-1 text-xs" aria-live="polite">
            <span className={`font-medium ${COLOR_TEXTO[fuerza.puntaje]}`}>
              {fuerza.etiqueta}
            </span>
            {fuerza.sugerencia && (
              <span className="text-muted"> · {fuerza.sugerencia}</span>
            )}
          </p>
        </div>
      )}

      {ayuda && !error && !valor && (
        <p className="mt-1 text-xs text-muted">{ayuda}</p>
      )}

      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
