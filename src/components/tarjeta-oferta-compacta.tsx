import Link from "next/link";
import { ListingMedia } from "./listing-media";
import { money } from "@/lib/format";
import { KIND_LABEL } from "@/lib/taxonomy";
import type { Listing } from "@/lib/types";

/** El ancho real de la tarjeta en la rejilla del carrusel (2 · 3 · 4 · 6 columnas). */
const TAMANOS = "(min-width: 1024px) 16vw, (min-width: 768px) 25vw, (min-width: 640px) 33vw, 50vw";

/**
 * La tarjeta de oferta de la portada: la mitad de `ListingCard`.
 *
 * Existe porque en la portada caben doce por tanda y no seis (pedido de Jesús,
 * 2026-10-23): con la tarjeta del catálogo, seis ocupaban la pantalla entera.
 * Se queda con lo que decide un clic —foto, tipo, título, quién lo vende y
 * precio— y deja el impacto, el nivel y el mayorista para la ficha.
 *
 * Sin directiva: la pinta el servidor y la pasa ya hecha al carrusel, que es
 * de cliente.
 */
export function TarjetaOfertaCompacta({
  listing,
  proveedor,
}: {
  listing: Listing;
  /** El nombre del proveedor; sin él, la línea no se pinta. */
  proveedor?: string;
}) {
  return (
    <article
      data-brillo
      className="group flex h-full flex-col overflow-hidden rounded-xl bg-white ring-1 ring-hairline transition hover:ring-brand-300 hover:shadow-lg hover:shadow-brand-900/5"
    >
      <Link
        href={`/oferta/${listing.slug}`}
        tabIndex={-1}
        aria-hidden
        className="group/foto relative block aspect-4/3 overflow-hidden"
      >
        <ListingMedia
          title={listing.title}
          category={listing.category}
          images={listing.images}
          sizes={TAMANOS}
          className="transition duration-500 group-hover:scale-105 group-active/foto:scale-105"
        />
        <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-medium text-ink shadow-sm">
          {KIND_LABEL[listing.kind]}
        </span>
      </Link>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 font-display text-sm leading-snug text-ink">
          <Link
            href={`/oferta/${listing.slug}`}
            className="transition-colors hover:text-brand-700 active:text-brand-700"
          >
            {listing.title}
          </Link>
        </h3>
        {proveedor && <p className="truncate text-xs text-muted">{proveedor}</p>}

        <p className="mt-auto pt-1.5 text-xs text-muted">
          {listing.quoteOnly && "Desde "}
          <span className="font-display text-base text-ink tabular-nums">
            {money(listing.priceCop)}
          </span>
          {!listing.quoteOnly && ` / ${listing.unit}`}
        </p>
      </div>
    </article>
  );
}
