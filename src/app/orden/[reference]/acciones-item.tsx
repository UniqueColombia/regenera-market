"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, PackageCheck, Star } from "lucide-react";
import { confirmarRecibido, guardarResena } from "./actions";
import { Estrellas } from "@/components/estrellas";

/**
 * Lo que quien compró puede hacer con un ítem de su pedido: confirmar que le
 * llegó y reseñarlo.
 *
 * Los botones se deshabilitan mientras se espera, pero **no son lo que impide
 * el doble efecto**: eso lo hace la base (la entrega solo avanza una vez y la
 * reseña es una por ítem). Un botón deshabilitado protege esta pestaña; la
 * base protege también la otra pestaña y el reintento tras un corte.
 */
export function ConfirmarRecibido({ itemId, reference }: { itemId: string; reference: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function confirmar() {
    if (!window.confirm("¿Confirmas que ya recibiste este producto?")) return;
    iniciar(async () => {
      const r = await confirmarRecibido({ itemId, reference });
      if (r.ok) {
        setError(null);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={confirmar}
        disabled={pendiente}
        className="inline-flex items-center gap-1.5 rounded-full bg-brand-700 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-800 disabled:opacity-50"
      >
        {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <PackageCheck className="size-3.5" />}
        Ya me llegó
      </button>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}

export function FormularioResena({
  itemId,
  reference,
  slug,
  previa,
}: {
  itemId: string;
  reference: string;
  slug?: string;
  previa?: { rating: number; body: string; oculta: boolean };
}) {
  const router = useRouter();
  const [rating, setRating] = useState(previa?.rating ?? 0);
  const [abierta, setAbierta] = useState(!previa);
  const [error, setError] = useState<string | null>(null);
  const [guardada, setGuardada] = useState(false);
  const [pendiente, iniciar] = useTransition();

  if (previa && !abierta) {
    return (
      <div className="mt-2 rounded-lg bg-sand p-3 text-sm">
        <p className="flex items-center gap-1 text-ink" aria-label={`${previa.rating} de 5 estrellas`}>
          <Estrellas valor={previa.rating} />
          <span className="ml-1 text-xs text-muted">Tu reseña</span>
        </p>
        {previa.body && <p className="mt-1 text-muted">{previa.body}</p>}
        {previa.oculta && (
          <p className="mt-1 text-xs text-clay-700">
            El equipo la ocultó del catálogo por no cumplir las normas de la comunidad.
          </p>
        )}
        <button
          type="button"
          onClick={() => setAbierta(true)}
          className="mt-2 text-xs font-semibold text-brand-700 underline underline-offset-4"
        >
          Corregirla
        </button>
      </div>
    );
  }

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (rating < 1) {
      setError("Elige de 1 a 5 estrellas.");
      return;
    }
    const comentario = String(new FormData(e.currentTarget).get("comentario") ?? "");
    iniciar(async () => {
      const r = await guardarResena({ itemId, reference, slug, rating, comentario });
      if (r.ok) {
        setError(null);
        setGuardada(true);
        setAbierta(false);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <form onSubmit={enviar} className="mt-2 rounded-lg bg-sand p-3">
      <fieldset disabled={pendiente}>
        <legend className="text-xs font-medium text-muted">
          {previa ? "Corrige tu reseña" : "¿Qué tal te pareció?"}
        </legend>
        <div role="radiogroup" aria-label="Estrellas" className="mt-1 flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} ${n === 1 ? "estrella" : "estrellas"}`}
              onClick={() => setRating(n)}
              className="rounded p-0.5 transition hover:scale-110"
            >
              <Star
                className={`size-6 ${n <= rating ? "fill-amber-400 text-amber-500" : "text-hairline"}`}
              />
            </button>
          ))}
        </div>
        <textarea
          name="comentario"
          rows={3}
          maxLength={2000}
          defaultValue={previa?.body}
          placeholder="Cuéntale a otros compradores cómo te fue (opcional)."
          className="mt-2 w-full rounded-lg border border-control bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500"
        />
        <button
          type="submit"
          className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-brand-700 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-800 disabled:opacity-50"
        >
          {pendiente && <Loader2 className="size-3.5 animate-spin" />}
          {previa ? "Guardar cambios" : "Publicar reseña"}
        </button>
      </fieldset>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
      {guardada && <p className="mt-1 text-xs text-brand-700">Gracias: tu reseña quedó publicada.</p>}
    </form>
  );
}
