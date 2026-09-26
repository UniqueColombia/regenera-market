import { categoriaLabel } from "@/lib/taxonomy";
import { CONTACTO } from "@/lib/legal";
import type { Listing, Provider } from "@/lib/types";

/**
 * Datos estructurados (JSON-LD) para buscadores y asistentes.
 *
 * ## Qué resuelve, en concreto
 *
 * Un buscador leyendo el HTML de una ficha ve un título, un número y unas
 * palabras; no sabe cuál de esos números es el precio ni en qué moneda. El
 * JSON-LD se lo dice sin ambigüedad, y eso es lo que habilita que el resultado
 * salga con precio y disponibilidad en vez de con dos líneas de texto. Lo mismo
 * vale para un asistente que responde «¿quién vende esto en Colombia?».
 *
 * ## La regla que hace que esto no se vuelva mentira
 *
 * **Todo lo que se declara aquí tiene que estar también en la página, visible.**
 * Declarar un precio que la ficha no muestra, o una valoración que no existe, es
 * lo que los buscadores penalizan —y con razón: es describirle al robot algo
 * distinto de lo que ve una persona. Por eso aquí no hay `aggregateRating`: el
 * sitio todavía no muestra reseñas. El día que las muestre, se agrega.
 *
 * ## Por qué se escapa el `<`
 *
 * `JSON.stringify` no escapa `</script>`. Si el título de una oferta lo
 * contuviera —y el título lo escribe un proveedor, o sea que viene de fuera— el
 * navegador cerraría la etiqueta ahí y ejecutaría el resto como HTML. Es un XSS
 * de manual y la defensa cabe en una línea, así que va en una función por la que
 * pasa todo lo que se serializa.
 */

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** Un objeto cualquiera de schema.org. `unknown` y no `any`: nadie lo desreferencia. */
type Esquema = Record<string, unknown>;

function Script({ datos }: { datos: Esquema }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(datos).replace(/</g, "\\u003c"),
      }}
    />
  );
}

/** Absoluta a partir de una ruta del sitio. Las relativas no valen en JSON-LD. */
function url(ruta: string): string {
  return ruta.startsWith("http") ? ruta : `${siteUrl}${ruta}`;
}

/**
 * Quiénes somos y qué es este sitio. Va una sola vez, en la portada.
 *
 * **No en el layout**, aunque tentaría: repetir `Organization` en las 30 rutas
 * no aporta nada y obliga al rastreador a reconciliar treinta declaraciones de
 * la misma entidad. La portada es la página canónica de la organización.
 *
 * `SearchAction` le dice al buscador que el sitio tiene búsqueda propia y con
 * qué URL se consulta. Es lo que puede hacer que aparezca una caja de búsqueda
 * dentro del propio resultado.
 */
export function DatosDelSitio() {
  return (
    <Script
      datos={{
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Organization",
            "@id": `${siteUrl}/#organizacion`,
            name: "Seregenera",
            legalName: CONTACTO.razonSocial,
            url: siteUrl,
            logo: url("/icon.png"),
            image: url("/opengraph-image.jpg"),
            description:
              "Marketplace que conecta empresas turísticas con proveedores de productos, experiencias y servicios regenerativos.",
            address: {
              "@type": "PostalAddress",
              addressCountry: "CO",
            },
            contactPoint: {
              "@type": "ContactPoint",
              contactType: "customer service",
              email: CONTACTO.correo,
              telephone: CONTACTO.telefonoE164,
              availableLanguage: ["es"],
            },
          },
          {
            "@type": "WebSite",
            "@id": `${siteUrl}/#sitio`,
            url: siteUrl,
            name: "Seregenera",
            inLanguage: "es-CO",
            publisher: { "@id": `${siteUrl}/#organizacion` },
            potentialAction: {
              "@type": "SearchAction",
              target: {
                "@type": "EntryPoint",
                urlTemplate: `${siteUrl}/catalogo?q={search_term_string}`,
              },
              "query-input": "required name=search_term_string",
            },
          },
        ],
      }}
    />
  );
}

/**
 * Una oferta del catálogo.
 *
 * `offers` solo se declara cuando hay un precio de verdad. Los ítems de
 * cotización no lo tienen —no hay venta hasta que se acepta un precio, que es la
 * invariante 7 de `dominio-regenera`— y declararles uno inventado sería
 * describirle al buscador una compra que el sitio no permite hacer.
 */
export function DatosDeOferta({
  listing,
  provider,
}: {
  listing: Listing;
  provider?: Provider;
}) {
  const imagenes = listing.images.filter((i) => i.startsWith("/")).map(url);

  return (
    <Script
      datos={{
        "@context": "https://schema.org",
        "@type": "Product",
        name: listing.title,
        description: listing.summary,
        ...(imagenes.length > 0 && { image: imagenes }),
        sku: listing.slug,
        category: categoriaLabel(listing.category),
        ...(provider && {
          brand: { "@type": "Brand", name: provider.name },
        }),
        ...(!listing.quoteOnly && {
          offers: {
            "@type": "Offer",
            url: url(`/oferta/${listing.slug}`),
            price: listing.priceCop,
            priceCurrency: "COP",
            availability: "https://schema.org/InStock",
            ...(provider && {
              seller: { "@type": "Organization", name: provider.name },
            }),
          },
        }),
      }}
    />
  );
}

/** La ficha de un proveedor. */
export function DatosDeProveedor({ provider }: { provider: Provider }) {
  return (
    <Script
      datos={{
        "@context": "https://schema.org",
        "@type": "Organization",
        name: provider.name,
        ...(provider.legalName && { legalName: provider.legalName }),
        url: url(`/proveedor/${provider.slug}`),
        ...(provider.logoUrl && { logo: url(provider.logoUrl) }),
        description: provider.tagline || provider.description,
        address: {
          "@type": "PostalAddress",
          addressLocality: provider.city,
          addressRegion: provider.department,
          addressCountry: "CO",
        },
        ...(provider.foundedYear && {
          foundingDate: String(provider.foundedYear),
        }),
        // Quién lo lista, no quién lo certifica: el sello de sostenibilidad lo
        // otorga el equipo y no es una acreditación de un tercero. Decirlo como
        // `hasCredential` sería subirle el rango a algo que damos nosotros.
        memberOf: { "@id": `${siteUrl}/#organizacion` },
      }}
    />
  );
}

/**
 * La miga de pan, para que el resultado del buscador muestre la ruta en vez de
 * la URL cruda.
 *
 * Recibe lo mismo que ya se pinta en la página: si se declara una ruta distinta
 * de la que ve una persona, vuelve a ser describirle otra cosa al robot.
 */
export function DatosDeMiga({
  pasos,
}: {
  pasos: { nombre: string; ruta: string }[];
}) {
  return (
    <Script
      datos={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: pasos.map((p, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: p.nombre,
          item: url(p.ruta),
        })),
      }}
    />
  );
}
