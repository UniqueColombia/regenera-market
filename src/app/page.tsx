import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Search, ShieldCheck, Sprout, Store } from "lucide-react";
import { ListingCard } from "@/components/listing-card";
import { TierBadge } from "@/components/tier-badge";
import { getFeaturedListings, getMarketplaceStats, getProviderById } from "@/lib/repo";
import { TIERS, VERTICALS } from "@/lib/taxonomy";

export default async function HomePage() {
  const [featured, stats] = await Promise.all([
    getFeaturedListings(6),
    getMarketplaceStats(),
  ]);
  const providers = await Promise.all(
    featured.map((l) => getProviderById(l.providerId)),
  );

  return (
    <>
      <section className="relative isolate overflow-hidden bg-brand-900">
        {/* La foto va detrás del velo, no en lugar de él: el titular es blanco
            y la mitad izquierda de hero-home es niebla clara. El degradado
            hacia la derecha deja casi opaco el lado del texto y abre el lado
            del sujeto. Ver docs/IMAGENES.md.

            En un teléfono nada de eso se sostiene: el bloque es más alto que
            ancho, así que object-cover recorta cerca del 70 % del ancho de la
            foto y con el centro por defecto se queda enseñando niebla — el
            rancho y la pareja, que están a la derecha, salen del cuadro. El
            recorte se ancla al 78 % para que se vean, y el velo pasa a
            vertical porque ahí el texto ocupa las dos columnas y uno
            horizontal dejaría el final de cada renglón sobre foto clara. */}
        <Image
          src="/img/secciones/hero-home.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[78%_50%] md:object-center"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-brand-900/95 via-brand-900/88 to-brand-900/80 md:bg-gradient-to-r md:from-brand-900 md:via-brand-900/90 md:to-brand-900/55"
        />
        <div className="container-page relative py-14 md:py-28">
          <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.2em] text-brand-300">
            <Sprout className="size-4" />
            Marketplace regenerativo
          </p>
          <h1 className="mt-4 max-w-3xl font-display text-3xl leading-[1.1] text-white sm:text-4xl md:text-6xl">
            Soluciones que transforman el turismo colombiano
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-brand-100">
            Compra productos, experiencias y servicios a proveedores colombianos
            verificados uno por uno. Cada compra deja valor en el territorio
            donde se produjo.
          </p>

          <form
            action="/catalogo"
            className="mt-8 flex max-w-xl gap-2 rounded-full bg-white p-1.5 shadow-lg"
          >
            <label htmlFor="hero-search" className="sr-only">
              Buscar en el catálogo
            </label>
            <input
              id="hero-search"
              name="q"
              placeholder="Amenities, compostaje, guadua, Amazonas…"
              className="flex-1 rounded-full bg-transparent px-4 text-sm text-ink outline-none placeholder:text-muted"
            />
            <button
              type="submit"
              className="flex shrink-0 items-center gap-2 rounded-full bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800 sm:px-5"
            >
              <Search className="size-4" />
              Buscar
            </button>
          </form>

          <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-6 sm:flex sm:flex-wrap sm:gap-x-12 md:mt-12">
            <Stat value={`${stats.providers}`} label="Proveedores verificados" />
            <Stat value={`${stats.listings}`} label="Ofertas publicadas" />
            <Stat value={`${stats.departments}`} label="Departamentos" />
            <Stat value={`${stats.verifiedShare}%`} label="Con nivel asignado" />
          </dl>
        </div>
      </section>

      <section className="container-page py-16">
        <h2 className="font-display text-3xl text-ink">
          Soluciones para cada tipo de negocio
        </h2>
        <p className="mt-2 max-w-2xl text-muted">
          Encuentra productos y servicios verificados para hacer tu empresa más
          sostenible.
        </p>

        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {VERTICALS.map((v) => (
            <li key={v.id}>
              <Link
                href={`/catalogo?vertical=${v.id}`}
                className="group flex h-full flex-col overflow-hidden rounded-xl bg-white ring-1 ring-hairline transition hover:ring-brand-400 hover:shadow-md"
              >
                {/* alt vacío a propósito: el <h3> de debajo dice lo mismo, y un
                    lector de pantalla que anuncie la foto solo lo repite. */}
                <div className="relative aspect-16/9 overflow-hidden">
                  <Image
                    src={`/img/secciones/vertical-${v.id}.webp`}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover transition duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="font-display text-lg text-ink group-hover:text-brand-700">
                    {v.label}
                  </h3>
                  <p className="mt-1.5 text-sm text-muted">{v.blurb}</p>
                  <span className="mt-4 flex items-center gap-1 text-sm font-medium text-brand-600">
                    Ver ofertas
                    <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="container-page py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl text-ink">
              Ofertas destacadas
            </h2>
            <p className="mt-2 text-muted">
              Priorizamos a quienes completaron su evaluación de sostenibilidad.
            </p>
          </div>
          <Link
            href="/catalogo"
            className="flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
          >
            Ver el catálogo completo
            <ArrowRight className="size-4" />
          </Link>
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((listing, i) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              provider={providers[i]}
            />
          ))}
        </div>
      </section>

      <section className="mt-16 bg-sand py-16">
        <div className="container-page">
          <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.2em] text-brand-600">
            <ShieldCheck className="size-4" />
            Verificación
          </p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl text-ink">
            &ldquo;Sostenible&rdquo; no es una etiqueta que se pone sola
          </h2>
          <p className="mt-3 max-w-2xl text-muted">
            Cada proveedor responde una evaluación de seis dimensiones, adjunta
            evidencia y la revisa nuestro equipo. El nivel que ves en cada ficha
            sale de ese puntaje, no de una promesa.
          </p>

          <ul className="mt-8 grid gap-4 md:grid-cols-3">
            {(["semilla", "raiz", "bosque"] as const).map((t) => (
              <li
                key={t}
                className="rounded-xl bg-white p-6 ring-1 ring-hairline"
              >
                <TierBadge tier={t} size="md" />
                <p className="mt-3 text-sm text-muted">{TIERS[t].description}</p>
                <p className="mt-4 text-xs font-medium uppercase tracking-wide text-brand-600">
                  Desde {TIERS[t].min} puntos
                </p>
              </li>
            ))}
          </ul>

          <Link
            href="/verificacion"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-800"
          >
            Conoce la metodología completa
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <section className="container-page py-16">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl bg-brand-800 p-8 text-white">
            <Store className="size-8 text-brand-300" />
            <h2 className="mt-4 font-display text-2xl">
              ¿Produces algo regenerativo?
            </h2>
            <p className="mt-2 text-brand-100">
              Publica tu catálogo, llega a hoteles y operadores de todo el país y
              cobra sin intermediarios. La comisión solo se cobra cuando vendes.
            </p>
            <Link
              href="/vender"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-brand-800 transition hover:bg-brand-50"
            >
              Postula tu empresa
              <ArrowRight className="size-4" />
            </Link>
          </div>

          <div className="rounded-2xl bg-clay-100 p-8">
            <Sprout className="size-8 text-clay-600" />
            <h2 className="mt-4 font-display text-2xl text-ink">
              ¿Compras para tu operación turística?
            </h2>
            <p className="mt-2 text-muted">
              Precios mayoristas, impacto medido por unidad y certificado de
              compra para sustentar tu reporte de sostenibilidad.
            </p>
            <Link
              href="/catalogo"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-clay-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-clay-600"
            >
              Explorar el catálogo
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd className="font-display text-3xl text-white tabular-nums">{value}</dd>
      <p className="mt-1 text-sm text-brand-200">{label}</p>
    </div>
  );
}
