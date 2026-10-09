import { Star } from "lucide-react";
import type { Calificacion } from "@/lib/types";

/**
 * Cinco estrellas, rellenas hasta `valor` (redondeado a la entera más cercana).
 *
 * Decorativas: quien las usa pone el número en palabras, porque «★★★★☆» no lo
 * lee igual un lector de pantalla que una persona. Sin `"use client"`: no
 * tienen estado y las pintan tanto la ficha (servidor) como el pedido.
 */
export function Estrellas({ valor, clase = "size-4" }: { valor: number; clase?: string }) {
  return (
    <span className="inline-flex" aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`${clase} ${n <= Math.round(valor) ? "fill-amber-400 text-amber-500" : "text-hairline"}`}
        />
      ))}
    </span>
  );
}

/** «★★★★☆ 4,3 (12 reseñas)», para la ficha y el perfil del proveedor. */
export function ResumenCalificacion({
  calificacion,
  className = "",
}: {
  calificacion: Calificacion;
  className?: string;
}) {
  const { promedio, cantidad } = calificacion;
  const texto = promedio.toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-sm text-ink ${className}`}
      aria-label={`${texto} de 5 estrellas, ${cantidad} ${cantidad === 1 ? "reseña" : "reseñas"}`}
    >
      <Estrellas valor={promedio} />
      <span aria-hidden className="font-medium">{texto}</span>
      <span aria-hidden className="text-muted">
        ({cantidad} {cantidad === 1 ? "reseña" : "reseñas"})
      </span>
    </span>
  );
}
