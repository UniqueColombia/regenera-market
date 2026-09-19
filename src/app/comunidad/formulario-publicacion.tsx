"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2, PenLine } from "lucide-react";
import { publicar } from "./actions";
import { TEMAS } from "@/components/tarjeta-publicacion";
import type { CommunityTopic } from "@/lib/types";

/**
 * Escribir en el muro.
 *
 * ## Empieza plegado
 *
 * Un formulario de cuatro campos abierto encima del muro empuja el contenido
 * fuera de la pantalla en un teléfono, y lo primero que alguien quiere de una
 * comunidad es **leerla**. Plegado ocupa una línea y se abre al tocarlo.
 *
 * ## Los mínimos se enseñan mientras se escribe
 *
 * El contador de caracteres no es decoración: el servidor rechaza por debajo de
 * 80 y, sin el contador, ese rechazo llega después de pulsar «Publicar», que es
 * el peor momento para enterarse. Los mismos números están en `actions.ts` y en
 * los `check` de la tabla — tres sitios, y es a propósito: la barrera es la
 * base, el mensaje en español es la acción, y esto es que no haga falta ninguno
 * de los dos.
 */

const MINIMO_CUERPO = 80;

export function FormularioPublicacion({
  empresas,
}: {
  /** Empresas en cuyo nombre puede firmar. Vacío si no gestiona ninguna. */
  empresas: { id: string; name: string }[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [largo, setLargo] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendiente, iniciar] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const datos = Object.fromEntries(new FormData(form));

    iniciar(async () => {
      const r = await publicar(datos);
      if (!r.ok) {
        setErrors(r.errors);
        return;
      }
      setErrors({});
      form.reset();
      setLargo(0);
      setAbierto(false);
    });
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex w-full items-center gap-3 rounded-xl bg-white px-5 py-4 text-left text-sm text-muted ring-1 ring-hairline transition hover:ring-brand-300 active:ring-brand-300"
      >
        <PenLine className="size-5 shrink-0 text-brand-600" />
        Cuenta algo: cómo te fue con un pedido, una práctica que te funcionó, una
        noticia del sector…
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={enviar}
      className="rounded-xl bg-white p-6 ring-1 ring-hairline"
    >
      <fieldset disabled={pendiente} className="space-y-4">
        <legend className="font-display text-lg text-ink">
          Publicar en la Comunidad
        </legend>

        <div>
          <label htmlFor="title" className="mb-1 block text-xs font-medium text-muted">
            Título
          </label>
          <input
            id="title"
            name="title"
            required
            maxLength={140}
            placeholder="Cambiamos los amenities de plástico y esto pasó"
            aria-invalid={errors.title ? true : undefined}
            className={`w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 ${
              errors.title ? "border-red-600" : "border-control"
            }`}
          />
          {errors.title && (
            <p className="mt-1 text-xs font-medium text-red-700">{errors.title}</p>
          )}
        </div>

        <div>
          <label htmlFor="body" className="mb-1 block text-xs font-medium text-muted">
            Lo que quieres contar
          </label>
          <textarea
            id="body"
            name="body"
            required
            rows={6}
            maxLength={4000}
            onChange={(e) => setLargo(e.target.value.trim().length)}
            placeholder="Escríbelo como se lo contarías a otro que está en lo mismo."
            aria-invalid={errors.body ? true : undefined}
            aria-describedby="body-cuenta"
            className={`w-full rounded-lg border px-3 py-2 text-sm leading-relaxed outline-none transition focus:border-brand-500 ${
              errors.body ? "border-red-600" : "border-control"
            }`}
          />
          <p id="body-cuenta" className="mt-1 text-xs text-muted tabular-nums">
            {largo < MINIMO_CUERPO
              ? `${MINIMO_CUERPO - largo} caracteres para el mínimo`
              : `${largo} caracteres`}
          </p>
          {errors.body && (
            <p className="mt-1 text-xs font-medium text-red-700">{errors.body}</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="topic" className="mb-1 block text-xs font-medium text-muted">
              ¿De qué va?
            </label>
            <select
              id="topic"
              name="topic"
              defaultValue="experiencia"
              className="w-full rounded-lg border border-control bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500"
            >
              {(Object.keys(TEMAS) as CommunityTopic[]).map((id) => (
                <option key={id} value={id}>
                  {TEMAS[id].label}
                </option>
              ))}
            </select>
            {errors.topic && (
              <p className="mt-1 text-xs font-medium text-red-700">{errors.topic}</p>
            )}
          </div>

          {/* El selector de empresa solo existe para quien gestiona alguna. A
              quien no, un desplegable con una sola opción le pregunta algo que
              no tiene que decidir. */}
          {empresas.length > 0 && (
            <div>
              <label
                htmlFor="providerId"
                className="mb-1 block text-xs font-medium text-muted"
              >
                ¿Quién lo firma?
              </label>
              <select
                id="providerId"
                name="providerId"
                defaultValue=""
                className="w-full rounded-lg border border-control bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500"
              >
                <option value="">A título personal</option>
                {empresas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted">
                Firmar con tu empresa le suma puntos de experiencia.
              </p>
            </div>
          )}
        </div>
      </fieldset>

      {errors.form && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-800 ring-1 ring-red-200"
        >
          {errors.form}
        </p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setAbierto(false)}
          disabled={pendiente}
          className="rounded-full px-4 py-3 text-sm font-semibold text-muted transition hover:bg-sand hover:text-ink active:bg-sand"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pendiente}
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-800 active:bg-brand-800 disabled:bg-muted"
        >
          {pendiente && <Loader2 className="size-4 animate-spin" />}
          Publicar
        </button>
      </div>
    </form>
  );
}
