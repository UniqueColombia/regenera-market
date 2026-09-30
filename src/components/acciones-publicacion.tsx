"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { editarPublicacion, eliminarPublicacion, puntosEnJuego } from "@/app/comunidad/actions";
import { avisoDeEliminar } from "@/lib/comunidad";
import { TEMAS } from "./tarjeta-publicacion";
import type { CommunityTopic } from "@/lib/types";

const MINIMO_CUERPO = 80;

/**
 * Editar y eliminar, para quien escribió la publicación.
 *
 * Solo se pinta si quien mira es el autor (lo decide `TarjetaPublicacion`); la
 * barrera de verdad está en la base (`community_posts_update_own` y
 * `community_posts_delete_own`), esto es solo no ofrecer lo que rebotaría.
 *
 * Editar deja una marca «editada» en la tarjeta —es todo el historial—; eliminar
 * es definitivo y no deja nada.
 */
export function AccionesPublicacion({
  postId,
  titulo,
  cuerpo,
  tema,
}: {
  postId: string;
  titulo: string;
  cuerpo: string;
  tema: CommunityTopic;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [largo, setLargo] = useState(cuerpo.trim().length);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendiente, iniciar] = useTransition();

  function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = { ...Object.fromEntries(new FormData(e.currentTarget)), postId };
    iniciar(async () => {
      const r = await editarPublicacion(datos);
      if (!r.ok) return setErrors(r.errors);
      setErrors({});
      setEditando(false);
      router.refresh();
    });
  }

  function eliminar() {
    iniciar(async () => {
      // Se pregunta cuántos puntos se perderían ANTES de confirmar, para que el
      // aviso diga el número real.
      const puntos = await puntosEnJuego(postId);
      if (!window.confirm(avisoDeEliminar(titulo, puntos))) return;
      const r = await eliminarPublicacion(postId);
      if (!r.ok) return setErrors({ form: r.error });
      router.refresh();
    });
  }

  if (!editando) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {pendiente && <Loader2 className="size-4 animate-spin text-muted" aria-hidden />}
        <button
          type="button"
          disabled={pendiente}
          onClick={() => setEditando(true)}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-muted ring-1 ring-control transition hover:bg-sand hover:text-brand-700 active:bg-sand disabled:opacity-40"
        >
          <Pencil className="size-3.5" aria-hidden />
          Editar
        </button>
        <button
          type="button"
          disabled={pendiente}
          onClick={eliminar}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-muted ring-1 ring-control transition hover:bg-red-50 hover:text-red-700 active:bg-red-50 disabled:opacity-40"
        >
          <Trash2 className="size-3.5" aria-hidden />
          Eliminar
        </button>
        {errors.form && <p className="basis-full text-xs text-red-700">{errors.form}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={guardar} className="basis-full space-y-3 rounded-lg bg-sand p-4">
      <fieldset disabled={pendiente} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted" htmlFor={`t-${postId}`}>
            Título
          </label>
          <input
            id={`t-${postId}`}
            name="title"
            defaultValue={titulo}
            required
            maxLength={140}
            className={`w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 ${
              errors.title ? "border-red-600" : "border-control"
            }`}
          />
          {errors.title && <p className="mt-1 text-xs font-medium text-red-700">{errors.title}</p>}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted" htmlFor={`b-${postId}`}>
            Lo que cuentas
          </label>
          <textarea
            id={`b-${postId}`}
            name="body"
            defaultValue={cuerpo}
            required
            rows={7}
            maxLength={4000}
            onChange={(e) => setLargo(e.target.value.trim().length)}
            className={`w-full rounded-lg border bg-white px-3 py-2 text-sm leading-relaxed outline-none focus:border-brand-500 ${
              errors.body ? "border-red-600" : "border-control"
            }`}
          />
          <p className="mt-1 text-xs text-muted tabular-nums">
            {largo < MINIMO_CUERPO
              ? `${MINIMO_CUERPO - largo} caracteres para el mínimo`
              : `${largo} caracteres`}
          </p>
          {errors.body && <p className="mt-1 text-xs font-medium text-red-700">{errors.body}</p>}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted" htmlFor={`k-${postId}`}>
            ¿De qué va?
          </label>
          <select
            id={`k-${postId}`}
            name="topic"
            defaultValue={tema}
            className="w-full rounded-lg border border-control bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 sm:w-64"
          >
            {(Object.keys(TEMAS) as CommunityTopic[]).map((id) => (
              <option key={id} value={id}>
                {TEMAS[id].label}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      {errors.form && (
        <p role="alert" className="text-xs font-medium text-red-700">
          {errors.form}
        </p>
      )}
      <p className="text-xs text-muted">
        Al guardar, la publicación mostrará que fue editada y la fecha del cambio.
      </p>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pendiente}
          className="flex items-center gap-1.5 rounded-full bg-brand-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-800 disabled:bg-muted"
        >
          {pendiente && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          Guardar cambios
        </button>
        <button
          type="button"
          disabled={pendiente}
          onClick={() => {
            setEditando(false);
            setErrors({});
          }}
          className="rounded-full px-4 py-2 text-xs text-muted transition hover:bg-white hover:text-brand-700"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
