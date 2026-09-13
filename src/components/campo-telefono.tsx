"use client";

import { useId, useState } from "react";
import { PAIS_POR_DEFECTO, PAISES, buscarPais } from "@/lib/telefono";

/**
 * Teléfono partido en dos: indicativo de país y número.
 *
 * Se guarda unido en E.164 (`+573001234567`) — lo arma `armarTelefono()` en el
 * servidor, nunca este componente. Aquí solo se eligen las dos partes.
 *
 * **Por qué un `<select>` nativo y no un desplegable propio.** En un móvil, el
 * selector nativo abre la rueda del sistema, filtra escribiendo y es accesible
 * sin que nadie lo programe. Un desplegable a medida con banderas se ve mejor en
 * una captura y es peor de usar con el pulgar. La lista de países vive en
 * `src/lib/telefono.ts`.
 *
 * El `placeholder` muestra la forma que espera el país elegido, que es la única
 * pista que evita el error más común: escribir el indicativo otra vez dentro del
 * número. (El servidor lo perdona igualmente, pero mejor no llegar ahí.)
 */
export function CampoTelefono({
  error,
  paisInicial = PAIS_POR_DEFECTO,
}: {
  error?: string;
  paisInicial?: string;
}) {
  const id = useId();
  const [pais, setPais] = useState(paisInicial);

  const elegido = buscarPais(pais);
  const digitos = elegido ? Math.max(...elegido.digitos) : 10;
  const ejemplo = "3".padEnd(digitos, "0");

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted">
        Teléfono
      </label>

      <div className="flex gap-2">
        <select
          name="pais"
          value={pais}
          onChange={(e) => setPais(e.target.value)}
          aria-label="Indicativo de país"
          className="w-32 shrink-0 rounded-lg border border-control bg-white px-2 py-2 text-sm outline-none transition focus:border-brand-500"
        >
          {PAISES.map((p) => (
            <option key={p.codigo} value={p.codigo}>
              {p.bandera} +{p.indicativo}
            </option>
          ))}
        </select>

        <input
          id={id}
          name="telefono"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          required
          placeholder={ejemplo}
          aria-invalid={error ? true : undefined}
          className={`w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 ${
            error ? "border-red-500" : "border-control"
          }`}
        />
      </div>

      {error ? (
        <p className="mt-1 text-xs text-red-700">{error}</p>
      ) : (
        <p className="mt-1 text-xs text-muted">
          Sin el indicativo: {elegido?.nombre ?? "tu país"} usa{" "}
          {elegido?.digitos.join(" o ") ?? digitos} dígitos. Lo usamos para
          contactarte por un pedido, nunca para publicidad.
        </p>
      )}
    </div>
  );
}
