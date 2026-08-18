import Link from "next/link";
import { MapPin } from "lucide-react";
import { ImpactChips } from "./impact-chips";
import { ListingMedia } from "./listing-media";
import { TierBadge } from "./tier-badge";
import { money } from "@/lib/format";
import { KIND_LABEL } from "@/lib/taxonomy";
import type { Listing, Provider } from "@/lib/types";

export function ListingCard({
  listing,
  provider,
}: {
  listing: Listing;
  provider?: Provider;
}) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl bg-white ring-1 ring-hairline transition hover:ring-brand-300 hover:shadow-lg hover:shadow-brand-900/5">
      <Link
        href={`/oferta/${listing.slug}`}
        className="relative block aspect-4/3 overflow-hidden"
      >
        <ListingMedia
          title={listing.title}
          category={listing.category}
          images={listing.images}
          className="transition duration-500 group-hover:scale-105"
        />
        <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2 py-0.5 text-xs font-medium text-ink shadow-sm">
          {KIND_LABEL[listing.kind]}
        </span>
      </Link>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            {listing.category}
          </span>
          {provider && <TierBadge tier={provider.tier} />}
        </div>

        <h3 className="font-display text-lg leading-snug text-ink">
          <Link
            href={`/oferta/${listing.slug}`}
            className="hover:text-brand-700"
          >
            {listing.title}
          </Link>
        </h3>

        <p className="line-clamp-2 text-sm text-muted">{listing.summary}</p>

        <ImpactChips impact={listing.impact} unit={listing.unit} />

        {provider && (
          <p className="mt-auto flex items-center gap-1 pt-1 text-xs text-muted">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">
              {provider.name} · {provider.city}
            </span>
          </p>
        )}

        <div className="flex items-end justify-between gap-2 border-t border-hairline pt-3">
          <div>
            {listing.quoteOnly ? (
              <>
                <p className="text-xs text-muted">Desde</p>
                <p className="font-display text-lg text-ink">
                  {money(listing.priceCop)}
                </p>
              </>
            ) : (
              <>
                <p className="font-display text-lg text-ink">
                  {money(listing.priceCop)}
                </p>
                <p className="text-xs text-muted">por {listing.unit}</p>
              </>
            )}
          </div>
          {listing.wholesalePriceCop && (
            <div className="text-right">
              <p className="text-xs text-muted">Mayorista</p>
              <p className="text-sm font-semibold text-brand-700">
                {money(listing.wholesalePriceCop)}
              </p>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
