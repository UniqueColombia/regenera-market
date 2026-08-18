import { TIERS } from "@/lib/taxonomy";
import type { Tier } from "@/lib/types";

const STYLES: Record<Tier, string> = {
  unverified: "bg-sand text-muted ring-hairline",
  semilla: "bg-brand-50 text-brand-700 ring-brand-200",
  raiz: "bg-brand-100 text-brand-800 ring-brand-300",
  bosque: "bg-brand-700 text-white ring-brand-700",
};

/** Hojas llenas según el nivel: 1 Semilla, 2 Raíz, 3 Bosque. */
const LEAVES: Record<Tier, number> = {
  unverified: 0,
  semilla: 1,
  raiz: 2,
  bosque: 3,
};

export function TierBadge({
  tier,
  score,
  size = "sm",
}: {
  tier: Tier;
  score?: number;
  size?: "sm" | "md";
}) {
  if (tier === "unverified") return null;
  const label = TIERS[tier].label;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full ring-1 font-medium ${STYLES[tier]} ${
        size === "md" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs"
      }`}
      title={`${label} — ${TIERS[tier].description}`}
    >
      <span aria-hidden className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <svg
            key={i}
            viewBox="0 0 12 12"
            className={`${size === "md" ? "size-3.5" : "size-2.5"} ${
              i < LEAVES[tier] ? "opacity-100" : "opacity-25"
            }`}
            fill="currentColor"
          >
            <path d="M11 1C5.5 1 1 3.6 1 8.2c0 1 .2 1.9.6 2.8l1.6-2.7c.9-1.6 2.5-2.7 4.3-3-1.4.7-2.6 1.9-3.4 3.3L2.4 11.6c.7.3 1.4.4 2.2.4C9.1 12 11 7.6 11 1Z" />
          </svg>
        ))}
      </span>
      {label}
      {score !== undefined && (
        <span className="opacity-60 tabular-nums">{score}</span>
      )}
    </span>
  );
}
