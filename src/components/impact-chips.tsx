import { Droplet, Recycle, Wind } from "lucide-react";
import { num } from "@/lib/format";
import type { ImpactMetrics } from "@/lib/types";

/**
 * Métricas de impacto por unidad.
 *
 * Siempre "por unidad" y nunca redondeadas hacia arriba: la credibilidad del
 * marketplace depende de que estas cifras resistan que alguien las revise.
 */
export function ImpactChips({
  impact,
  unit,
  className = "",
}: {
  impact: ImpactMetrics;
  unit?: string;
  className?: string;
}) {
  const chips: { icon: React.ReactNode; text: string }[] = [];

  if (impact.co2KgSaved) {
    chips.push({
      icon: <Wind className="size-3.5" />,
      text: `${num(impact.co2KgSaved)} kg CO₂`,
    });
  }
  if (impact.waterLitersSaved) {
    chips.push({
      icon: <Droplet className="size-3.5" />,
      text: `${num(impact.waterLitersSaved)} L agua`,
    });
  }
  if (impact.wasteKgReduced) {
    chips.push({
      icon: <Recycle className="size-3.5" />,
      text: `${num(impact.wasteKgReduced)} kg residuos`,
    });
  }

  if (chips.length === 0) return null;

  return (
    <ul className={`flex flex-wrap gap-1.5 ${className}`}>
      {chips.map((chip, i) => (
        <li
          key={i}
          className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-1.5 py-0.5 text-xs text-brand-700 ring-1 ring-brand-100"
          title={unit ? `Evitado por cada ${unit}` : "Evitado por unidad"}
        >
          {chip.icon}
          {chip.text}
        </li>
      ))}
    </ul>
  );
}
