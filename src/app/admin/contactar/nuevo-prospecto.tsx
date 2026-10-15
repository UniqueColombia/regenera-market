"use client";

import { useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { guardarProspecto } from "./actions";
import { ENCAJES } from "@/lib/prospectos";

const CAMPOS = [
  ["nombre", "Empresa", true],
  ["correo", "Correo de contacto", false],
  ["telefono", "Teléfono o WhatsApp", false],
  ["sitioWeb", "Sitio web", false],
  ["ciudad", "Ciudad", false],
  ["categoria", "Qué vende", false],
  ["fuente", "De dónde sale el dato", false],
] as const;

/** Agregar un prospecto a mano: el que alguien recomendó, el que se vio en una feria. */
export function NuevoProspecto() {
  const formulario = useRef<HTMLFormElement>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [hecho, setHecho] = useState(false);
  const [pendiente, iniciar] = useTransition();

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(e.currentTarget));
    iniciar(async () => {
      const r = await guardarProspecto(datos);
      if (r.ok) {
        setErrores({});
        setHecho(true);
        formulario.current?.reset();
      } else {
        setHecho(false);
        setErrores(r.errors);
      }
    });
  }

  return (
    <details className="rounded-xl bg-white p-5 ring-1 ring-hairline">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-ink">
        <Plus className="size-5 text-brand-600" aria-hidden />
        Agregar uno a mano
      </summary>
      <form ref={formulario} onSubmit={enviar} className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        {CAMPOS.map(([nombre, etiqueta, obligatorio]) => (
          <label key={nombre} className="block">
            <span className="mb-1 block text-xs font-medium text-muted">{etiqueta}</span>
            <input
              name={nombre}
              required={obligatorio}
              type={nombre === "correo" ? "email" : "text"}
              className={`w-full rounded-lg border bg-white px-3 py-2 ${errores[nombre] ? "border-red-600" : "border-control"}`}
            />
            {errores[nombre] && <span className="mt-1 block text-xs text-red-700">{errores[nombre]}</span>}
          </label>
        ))}
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Encaje</span>
          <select name="encaje" defaultValue="" className="w-full rounded-lg border border-control bg-white px-3 py-2">
            <option value="">Sin evaluar</option>
            {Object.entries(ENCAJES).map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button
            type="submit"
            disabled={pendiente}
            className="rounded-full bg-brand-700 px-5 py-2 font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
          >
            Agregar
          </button>
          {hecho && <span className="text-brand-700">Agregado.</span>}
          {errores.form && <span className="text-red-700">{errores.form}</span>}
        </div>
      </form>
    </details>
  );
}
