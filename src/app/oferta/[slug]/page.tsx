import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BadgeCheck,
  Clock,
  MapPin,
  Package,
  Users,
} from "lucide-react";
import { AddToCart, RequestQuote } from "@/components/add-to-cart";
import { ImpactChips } from "@/components/impact-chips";
import { ListingCard } from "@/components/listing-card";
import { ListingMedia } from "@/components/listing-media";
import { TierBadge } from "@/components/tier-badge";
import { duration } from "@/lib/format";
import {
  getListingBySlug,
  getProviderById,
  getRelatedListings,
} from "@/lib/repo";
import { certLabel, KIND_LABEL, VERTICAL_LABEL } from "@/lib/taxonomy";

export async function generateMetadata(
  props: PageProps<"/oferta/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const listing = await getListingBySlug(slug);
  if (!listing) return { title: "Oferta no encontrada" };

  const provider = await getProviderById(listing.providerId);
  return {
    title: listing.title,
    description: listing.summary,
    openGraph: {
      title: listing.title,
      description: listing.summary,
      type: "website",
    },
    other: provider ? { "product:brand": provider.name } : undefined,
  };
}

export default async function OfertaPage(props: PageProps<"/oferta/[slug]">) {
  const { slug } = await props.params;
  const listing = await getListingBySlug(slug);
  if (!listing) notFound();

  const provider = await getProviderById(listing.providerId);
  const related = await getRelatedListings(listing);
  const relatedProviders = await Promise.all(
    related.map((l) => getProviderById(l.providerId)),
  );

  return (
    <div className="container-page py-8">
      <nav aria-label="Ruta" className="text-sm text-muted">
        <Link href="/catalogo" className="hover:text-brand-700">
          Catálogo
        </Link>
        <span className="mx-2">/</span>
        <Link
          href={`/catalogo?category=${encodeURIComponent(listing.category)}`}
          className="hover:text-brand-700"
        >
          {listing.category}
        </Link>
      </nav>

      <div className="mt-5 grid gap-10 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <div className="aspect-16/9 overflow-hidden rounded-2xl">
            <ListingMedia
              title={listing.title}
              category={listing.category}
              images={listing.images}
              iconClassName="size-20"
            />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-sand px-2.5 py-1 text-xs font-medium text-ink">
              {KIND_LABEL[listing.kind]}
            </span>
            <span className="rounded-full bg-sand px-2.5 py-1 text-xs font-medium text-ink">
              {listing.category}
            </span>
            {provider && (
              <TierBadge
                tier={provider.tier}
                score={provider.sustainabilityScore}
              />
            )}
          </div>

          <h1 className="mt-3 font-display text-4xl leading-tight text-ink">
            {listing.title}
          </h1>
          <p className="mt-3 text-lg text-muted">{listing.summary}</p>

          {(listing.department || listing.city) && (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-muted">
              <MapPin className="size-4" />
              Producido en {listing.city}, {listing.department}
            </p>
          )}

          <div className="mt-8 max-w-2xl space-y-4 text-ink">
            <p className="leading-relaxed">{listing.description}</p>
          </div>

          {listing.experience && (
            <section className="mt-8">
              <h2 className="font-display text-2xl text-ink">La experiencia</h2>
              <dl className="mt-4 grid gap-4 sm:grid-cols-3">
                <Spec
                  icon={<Clock className="size-4" />}
                  label="Duración"
                  value={duration(listing.experience.durationHours)}
                />
                <Spec
                  icon={<Users className="size-4" />}
                  label="Grupo"
                  value={`${listing.experience.minPeople} a ${listing.experience.maxPeople} personas`}
                />
                <Spec
                  icon={<MapPin className="size-4" />}
                  label="Punto de encuentro"
                  value={listing.experience.meetingPoint}
                />
              </dl>

              <h3 className="mt-6 font-display text-lg text-ink">Incluye</h3>
              <ul className="mt-2 space-y-1.5">
                {listing.experience.includes.map((item) => (
                  <li key={item} className="flex gap-2 text-sm text-muted">
                    <BadgeCheck className="mt-0.5 size-4 shrink-0 text-brand-600" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {listing.service && (
            <section className="mt-8">
              <h2 className="font-display text-2xl text-ink">El servicio</h2>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <Spec
                  icon={<Clock className="size-4" />}
                  label="Tiempo de entrega"
                  value={listing.service.deliveryTime}
                />
                <Spec
                  icon={<Package className="size-4" />}
                  label="Se cobra por"
                  value={listing.unit}
                />
              </dl>

              <h3 className="mt-6 font-display text-lg text-ink">Alcance</h3>
              <ul className="mt-2 space-y-1.5">
                {listing.service.scope.map((item) => (
                  <li key={item} className="flex gap-2 text-sm text-muted">
                    <BadgeCheck className="mt-0.5 size-4 shrink-0 text-brand-600" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-8">
            <h2 className="font-display text-2xl text-ink">
              Impacto por {listing.unit}
            </h2>
            <ImpactChips
              impact={listing.impact}
              unit={listing.unit}
              className="mt-3"
            />
            {Object.keys(listing.impact).length === 0 && (
              <p className="mt-2 text-sm text-muted">
                Esta oferta todavía no tiene impacto cuantificado. El proveedor
                lo declara y nuestro equipo lo revisa antes de publicarlo.
              </p>
            )}

            {listing.certifications.length > 0 && (
              <>
                <h3 className="mt-6 font-display text-lg text-ink">
                  Certificaciones
                </h3>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {listing.certifications.map((code) => (
                    <li
                      key={code}
                      className="rounded-full bg-white px-3 py-1 text-sm text-ink ring-1 ring-hairline"
                    >
                      {certLabel(code)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="mt-8">
            <h2 className="font-display text-2xl text-ink">Ideal para</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {listing.verticals.map((v) => (
                <li key={v}>
                  <Link
                    href={`/catalogo?vertical=${v}`}
                    className="rounded-full bg-sand px-3 py-1.5 text-sm text-ink hover:bg-brand-100"
                  >
                    {VERTICAL_LABEL[v]}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          {listing.quoteOnly ? (
            <RequestQuote listing={listing} />
          ) : (
            <AddToCart listing={listing} />
          )}

          {provider && (
            <div className="mt-5 rounded-xl bg-white p-6 ring-1 ring-hairline">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Vendido por
              </p>
              <h2 className="mt-1.5 font-display text-xl text-ink">
                <Link
                  href={`/proveedor/${provider.slug}`}
                  className="hover:text-brand-700"
                >
                  {provider.name}
                </Link>
              </h2>
              <p className="mt-1 text-sm text-muted">{provider.tagline}</p>
              <p className="mt-3 flex items-center gap-1.5 text-sm text-muted">
                <MapPin className="size-4" />
                {provider.city}, {provider.department}
              </p>
              <div className="mt-4">
                <TierBadge
                  tier={provider.tier}
                  score={provider.sustainabilityScore}
                  size="md"
                />
              </div>
              <Link
                href={`/proveedor/${provider.slug}`}
                className="mt-4 block rounded-full border border-brand-600 px-5 py-2.5 text-center text-sm font-semibold text-brand-700 transition hover:bg-brand-50"
              >
                Ver el perfil del proveedor
              </Link>
            </div>
          )}
        </aside>
      </div>

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="font-display text-2xl text-ink">
            Otras soluciones parecidas
          </h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((l, i) => (
              <ListingCard
                key={l.id}
                listing={l}
                provider={relatedProviders[i]}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Spec({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-white p-4 ring-1 ring-hairline">
      <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
        {icon}
        {label}
      </dt>
      <dd className="mt-1.5 text-sm text-ink">{value}</dd>
    </div>
  );
}
