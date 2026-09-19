import type { MetadataRoute } from "next";
import { RUTAS_PUBLICAS } from "@/lib/rutas";
import { getApprovedProviders, searchListings } from "@/lib/repo";

/**
 * `/sitemap.xml`, generado en cada petición.
 *
 * ## Por qué dinámico y no un archivo
 *
 * Porque el catálogo lo es. Cada oferta aprobada y cada proveedor aprobado son
 * una URL indexable, y las dos listas cambian cuando un proveedor publica algo
 * —no cuando alguien se acuerda de regenerar un archivo—. Un sitemap escrito a
 * mano nace desactualizado y nadie se entera, porque un sitemap viejo no falla:
 * simplemente deja fuera lo nuevo.
 *
 * ## Solo entra lo que un visitante sin cuenta puede ver
 *
 * `searchListings()` y `getApprovedProviders()` consultan con el cliente de
 * sesión, así que pasan por RLS y por la vista `listings_publicos`, que ya
 * filtra a «aprobado de proveedor aprobado». **No se escribe aquí ningún filtro
 * de estado**: el día que se olvidara en otra consulta ahí sí habría fuga, y
 * duplicarlo aquí daría la falsa impresión de que este archivo es quien
 * protege algo. Es la invariante 17 de `dominio-regenera`.
 *
 * ## Si la base no responde
 *
 * Devuelve las rutas fijas y ya. Un sitemap corto es un problema de posiciona-
 * miento; un sitemap que responde 500 hace que el buscador deje de pedirlo
 * durante días. Y sin Supabase configurado —un clon recién bajado— tiene que
 * seguir compilando: es la propiedad que protege `docs/DEPLOY.md`.
 */

export const dynamic = "force-dynamic";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fijas: MetadataRoute.Sitemap = RUTAS_PUBLICAS.map((r) => ({
    url: `${siteUrl}${r.ruta}`,
    lastModified: new Date(),
    changeFrequency: r.frecuencia,
    priority: r.prioridad,
  }));

  try {
    const [ofertas, proveedores] = await Promise.all([
      searchListings(),
      getApprovedProviders(),
    ]);

    return [
      ...fijas,
      ...ofertas.map((o) => ({
        url: `${siteUrl}/oferta/${o.slug}`,
        lastModified: new Date(o.createdAt),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
      ...proveedores.map((p) => ({
        url: `${siteUrl}/proveedor/${p.slug}`,
        lastModified: new Date(p.createdAt),
        changeFrequency: "weekly" as const,
        priority: 0.6,
      })),
    ];
  } catch (error) {
    console.error(
      `[sitemap] sin catálogo, se sirven solo las rutas fijas: ${
        error instanceof Error ? error.message : error
      }`,
    );
    return fijas;
  }
}
