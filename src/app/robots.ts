import type { MetadataRoute } from "next";
import { RUTAS_PRIVADAS } from "@/lib/rutas";

/**
 * `/robots.txt`, generado.
 *
 * Archivo y no estático en `public/` por una razón concreta: la línea `Sitemap:`
 * necesita el dominio absoluto, y el dominio cambia entre producción y los
 * despliegues de vista previa. Un `robots.txt` fijo apuntaría siempre al mismo
 * sitio, que es lo que hace que un entorno de pruebas mande a indexar
 * producción.
 *
 * ## Qué se bloquea, y por qué tan poco
 *
 * Solo lo que no tiene sentido en un buscador: el panel, la cuenta de alguien,
 * su carrito, su orden y los caminos de autenticación. **No es una medida de
 * seguridad** y no hay que confundirla con una: `robots.txt` es una petición
 * que un robot educado respeta y cualquier otro ignora. Lo que de verdad impide
 * que alguien lea la orden de otro son las políticas RLS de
 * `supabase/migrations/`. Esto solo evita que esas rutas ensucien el índice.
 *
 * La lista sale de `src/lib/rutas.ts` y no está escrita aquí: el sitemap usa la
 * misma, y dos listas que hay que mantener iguales acaban distintas.
 *
 * ## La IA
 *
 * Ver `ROBOTS_IA` abajo. Es una decisión de producto, no técnica.
 */

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Los robots de IA, separados en dos grupos que casi siempre se confunden.
 *
 * **Entrenamiento** (`GPTBot`, `ClaudeBot`, `Google-Extended`, `CCBot`,
 * `meta-externalagent`): leen el sitio para entrenar modelos. Lo que se llevan
 * no devuelve a nadie — ni una visita, ni una mención, ni un enlace.
 *
 * **Búsqueda** (`OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`,
 * `Claude-User`): leen el sitio para **responderle a alguien que preguntó**, y
 * citan la fuente con su enlace. Son un canal de descubrimiento, y cada vez más
 * el primero: quien busca «proveedor de amenities biodegradables en Colombia»
 * hoy se lo pregunta a un asistente antes que a un buscador.
 *
 * Por eso se bloquea el primer grupo y se deja pasar el segundo. Bloquearlos a
 * todos —que es lo que suele querer decir «bloquear la IA»— le cierra la puerta
 * al canal que trae proveedores y compradores, a cambio de un beneficio que
 * aquí no existe: **el contenido de este sitio son fichas de producto, no obra
 * original que alguien vaya a monetizar**. Lo que sí es nuestro y no queremos
 * regalar son los datos de las empresas, y esos no están en el HTML público:
 * están detrás de RLS.
 *
 * Si algún día el criterio cambia, se cambia esta lista y nada más.
 */
const ROBOTS_IA_ENTRENAMIENTO = [
  "GPTBot",
  "ClaudeBot",
  "Google-Extended",
  "CCBot",
  "anthropic-ai",
  "meta-externalagent",
  "Applebot-Extended",
  "Bytespider",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: RUTAS_PRIVADAS.map((r) => `${r}/`),
      },
      {
        userAgent: ROBOTS_IA_ENTRENAMIENTO,
        disallow: "/",
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
