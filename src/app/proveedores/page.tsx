import type { Metadata } from "next";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { TierBadge } from "@/components/tier-badge";
import { getApprovedProviders, getListingsByProvider } from "@/lib/repo";
import { certLabel, TRAIT_LABEL } from "@/lib/taxonomy";

export const metadata: Metadata = {
  title: "Proveedores aliados",
  description:
    "Las empresas, cooperativas y comunidades colombianas que producen lo que se vende en Regenera Market, con su nivel de verificación de sostenibilidad.",
};

export default async function ProveedoresPage() {
  const providers = await getApprovedProviders();
  const counts = await Promise.all(
    providers.map(async (p) => (await getListingsByProvider(p.id)).length),
  );

  return (
    <div className="container-page py-10">
      <header className="max-w-2xl">
        <h1 className="font-display text-4xl text-ink">Proveedores aliados</h1>
        <p className="mt-3 text-muted">
          Cooperativas campesinas, consejos comunitarios, empresas B y talleres
          familiares. Todos pasaron por la misma evaluación de sostenibilidad, y
          el nivel que ves es el que les dio su puntaje.
        </p>
      </header>

      <ul className="mt-10 grid gap-5 md:grid-cols-2">
        {providers.map((p, i) => (
          <li key={p.id}>
            <Link
              href={`/proveedor/${p.slug}`}
              className="group flex h-full flex-col rounded-xl bg-white p-6 ring-1 ring-hairline transition hover:ring-brand-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl text-ink group-hover:text-brand-700">
                    {p.name}
                  </h2>
                  <p className="mt-0.5 text-sm text-muted">{p.tagline}</p>
                </div>
                <TierBadge tier={p.tier} score={p.sustainabilityScore} />
              </div>

              <p className="mt-3 line-clamp-3 text-sm text-muted">
                {p.description}
              </p>

              {p.traits.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-1.5">
                  {p.traits.map((t) => (
                    <li
                      key={t}
                      className="rounded-full bg-clay-100 px-2 py-0.5 text-xs text-clay-600"
                    >
                      {TRAIT_LABEL[t]}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-auto flex items-center justify-between gap-3 pt-5 text-sm text-muted">
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-4" />
                  {p.city}, {p.department}
                </span>
                <span>
                  {counts[i]} {counts[i] === 1 ? "oferta" : "ofertas"}
                </span>
              </div>

              {p.certifications.length > 0 && (
                <p className="mt-3 border-t border-hairline pt-3 text-xs text-muted">
                  {p.certifications.map(certLabel).join(" · ")}
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
