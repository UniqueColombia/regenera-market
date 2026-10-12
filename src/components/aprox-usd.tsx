import { aproxUsd, longDate } from "@/lib/format";
import type { Cotizacion } from "@/lib/tipo-de-cambio";

/**
 * «≈ US$ 6,26» debajo de un precio en pesos: referencia para quien piensa en
 * dólares (un hotel que compra para huéspedes extranjeros, alguien de fuera).
 * Sin cotización no pinta nada.
 *
 * Sin estado ni efectos, así que sirve en un Server Component y dentro de uno
 * de cliente (`add-to-cart.tsx`, la cesta): la cotización llega como prop desde
 * la página, que es la única que llama a la fuente.
 *
 * El `title` dice de dónde sale y que no se cobra así: un número en dólares al
 * lado de un precio se lee como una oferta en dólares si nadie lo aclara.
 */
export function AproxUsd({
  cop,
  cotizacion,
  className = "",
}: {
  cop: number;
  cotizacion?: Cotizacion;
  className?: string;
}) {
  if (!cotizacion || cop <= 0) return null;
  const detalle = `Aproximado con la ${cotizacion.fuente} del ${longDate(cotizacion.vigenteDesde)} ($${Math.round(
    cotizacion.copPorUsd,
  ).toLocaleString("es-CO")} por dólar). Solo de referencia: se paga en pesos colombianos.`;
  return (
    <span title={detalle} className={`text-xs text-muted tabular-nums ${className}`}>
      {aproxUsd(cop, cotizacion.copPorUsd)}
      <span className="sr-only"> (aproximado en dólares; se paga en pesos)</span>
    </span>
  );
}
