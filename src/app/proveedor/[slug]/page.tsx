import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Calendar, Globe, Mail, MapPin, Phone } from "lucide-react";
import { DatosDeMiga, DatosDeProveedor } from "@/components/datos-estructurados";
import { ListingCard } from "@/components/listing-card";
import { HeroBanner } from "@/components/hero-banner";
import { TierBadge } from "@/components/tier-badge";
import {
  getListingsByProvider,
  getProviderBySlug,
} from "@/lib/repo";
import { descripcion, publica } from "@/lib/seo";
import { CERTIFICATIONS, TIERS, TRAIT_LABEL } from "@/lib/taxonomy";

export async function generateMetadata(
  props: PageProps<"/proveedor/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const provider = await getProviderBySlug(slug);
  if (!provider) return { title: "Proveedor no encontrado" };

  // El titular de la ficha puede venir corto de la postulación, y una
  // descripción de ocho palabras en un resultado de búsqueda se lee como una
  // ficha vacía. Se completa con dónde está, que es parte de lo que alguien
  // busca cuando busca un proveedor.
  const resumen =
    provider.tagline.length >= 60
      ? provider.tagline
      : `${provider.tagline || provider.name} · Proveedor de ${provider.city}, ${provider.department}, en el marketplace de turismo regenerativo Seregenera.`;

  return {
    title: provider.name,
    description: descripcion(resumen),
    openGraph: { title: provider.name, description: resumen, type: "website" },
    ...publica(`/proveedor/${provider.slug}`),
  };
}

export default async function ProveedorPage(
  props: PageProps<"/proveedor/[slug]">,
) {
  const { slug } = await props.params;
  const provider = await getProviderBySlug(slug);
  if (!provider) notFound();

  const listings = await getListingsByProvider(provider.id);

  // La portada, en tres escalones y en este orden:
  //
  //   1. La que subió la empresa desde `/cuenta/empresa`. Es suya y decidió
  //      cómo encuadrarla, así que manda sobre todo lo demás.
  //   2. La foto de una de sus ofertas. Es el respaldo que había antes de que
  //      se pudiera subir una: siempre muestra algo que esa empresa vende de
  //      verdad y se mantiene solo cuando el catálogo cambia.
  //   3. El retrato genérico de proveedores.
  //
  // Los tres escalones existen para que **no haya ficha sin imagen en ningún
  // momento**: una ficha con un hueco gris arriba se lee como rota, no como
  // pendiente. Es la misma razón por la que no hay `placeholder.svg` en el
  // catálogo (skill `diseno-visual`).
  const portada =
    provider.coverUrl ??
    listings.find((l) => l.images[0]?.startsWith("/"))?.images[0] ??
    "/img/secciones/hero-proveedores.webp";

  return (
    <div>
      <DatosDeProveedor provider={provider} />
      <DatosDeMiga
        pasos={[
          { nombre: "Proveedores", ruta: "/proveedores" },
          { nombre: provider.name, ruta: `/proveedor/${provider.slug}` },
        ]}
      />

      {/*
        El distintivo lleva el nivel y ya no el puntaje al lado: desde la
        migración 0006 son dos cosas distintas —el nivel se gana con actividad,
        el puntaje sale de la evaluación— y juntarlos en la misma píldora es lo
        que hacía creer que uno salía del otro. El puntaje tiene su tarjeta.
      */}
      <HeroBanner
        foto={portada}
        distintivo={<TierBadge tier={provider.tier} size="md" />}
        titulo={provider.name}
      >
        <p className="mt-2 text-lg text-brand-100">{provider.tagline}</p>

        <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-brand-200 [&_a]:break-all">
          <li className="flex items-center gap-1.5">
            <MapPin className="size-4" />
            {provider.city}, {provider.department}
          </li>
          {provider.foundedYear && (
            <li className="flex items-center gap-1.5">
              <Calendar className="size-4" />
              Desde {provider.foundedYear}
            </li>
          )}
          <li className="flex items-center gap-1.5">
            <Mail className="size-4" />
            <a href={`mailto:${provider.email}`} className="hover:text-white">
              {provider.email}
            </a>
          </li>
          {provider.phone && (
            <li className="flex items-center gap-1.5">
              <Phone className="size-4" />
              {provider.phone}
            </li>
          )}
          {provider.website && (
            <li className="flex items-center gap-1.5">
              <Globe className="size-4" />
              <a href={provider.website} className="hover:text-white">
                {provider.website}
              </a>
            </li>
          )}
        </ul>
      </HeroBanner>

      <div className="container-page grid gap-10 py-12 lg:grid-cols-[1.7fr_1fr]">
        <div>
          <h2 className="font-display text-2xl text-ink">Quiénes son</h2>
          <p className="mt-3 max-w-2xl leading-relaxed text-ink">
            {provider.description}
          </p>

          {provider.traits.length > 0 && (
            <ul className="mt-6 flex flex-wrap gap-2">
              {provider.traits.map((t) => (
                <li
                  key={t}
                  className="rounded-full bg-clay-100 px-3 py-1 text-sm text-clay-700"
                >
                  {TRAIT_LABEL[t]}
                </li>
              ))}
            </ul>
          )}

          <h2 className="mt-12 font-display text-2xl text-ink">
            {listings.length} {listings.length === 1 ? "oferta" : "ofertas"} en el
            catálogo
          </h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            {listings.map((l) => (
              <ListingCard key={l.id} listing={l} provider={provider} />
            ))}
          </div>
        </div>

        <aside className="space-y-5">
          <div className="rounded-xl bg-white p-6 ring-1 ring-hairline">
            <h2 className="font-display text-lg text-ink">
              Nivel {TIERS[provider.tier].label}
            </h2>
            <p className="mt-2 text-sm text-muted">
              {TIERS[provider.tier].description}
            </p>
            <p className="mt-3 text-sm text-muted">
              <span className="font-medium tabular-nums text-ink">
                {provider.experiencePoints.toLocaleString("es-CO")}
              </span>{" "}
              puntos de experiencia ·{" "}
              <Link
                href="/niveles"
                className="font-medium text-brand-700 underline underline-offset-4"
              >
                cómo se ganan
              </Link>
            </p>
          </div>

          <div className="rounded-xl bg-white p-6 ring-1 ring-hairline">
            <h2 className="font-display text-lg text-ink">
              Evaluación de sostenibilidad
            </h2>
            <p className="mt-3 font-display text-4xl text-brand-700 tabular-nums">
              {provider.sustainabilityScore}
              <span className="text-lg text-muted">/100</span>
            </p>
            <p className="mt-2 text-sm text-muted">
              {provider.evaluacionVerificada
                ? "Nuestro equipo revisó la evidencia de las seis dimensiones."
                : "Este puntaje es su autoevaluación: todavía no lo ha revisado nuestro equipo."}
            </p>
            <div
              className="mt-4 h-2 overflow-hidden rounded-full bg-sand"
              role="img"
              aria-label={`Puntaje ${provider.sustainabilityScore} de 100`}
            >
              <div
                className="h-full rounded-full bg-brand-600"
                style={{ width: `${provider.sustainabilityScore}%` }}
              />
            </div>
          </div>

          {provider.certifications.length > 0 && (
            <div className="rounded-xl bg-white p-6 ring-1 ring-hairline">
              <h2 className="font-display text-lg text-ink">
                Certificaciones verificadas
              </h2>
              <ul className="mt-3 space-y-3">
                {provider.certifications.map((code) => {
                  const cert = CERTIFICATIONS[code];
                  return (
                    <li key={code}>
                      <p className="text-sm font-medium text-ink">
                        {cert?.label ?? code}
                      </p>
                      {cert && (
                        <p className="text-xs text-muted">{cert.issuer}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-4 border-t border-hairline pt-3 text-xs text-muted">
                Nuestro equipo revisó el documento vigente de cada una.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
