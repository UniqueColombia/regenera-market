import Link from "next/link";
import { Star } from "lucide-react";
import { BotonReaccion } from "./boton-reaccion";
import { ProviderAvatar } from "./provider-avatar";
import { TierBadge } from "./tier-badge";
import type { CommunityPost, CommunityTopic } from "@/lib/types";

/**
 * Una publicación del muro.
 *
 * Componente de servidor: todo lo que pinta es texto que ya vino de la consulta.
 * Lo único que necesita el navegador es el botón de reacción, y por eso es el
 * único que lleva `"use client"` — la regla de `componentizacion` de bajar el
 * límite del cliente hasta la hoja que de verdad lo necesita.
 *
 * **La firma es doble a propósito.** Quien publica en nombre de una empresa
 * sigue siendo una persona, y la tarjeta dice las dos cosas: el avatar y el
 * enlace son de la empresa, el nombre de quien escribió va debajo. Mostrar solo
 * la empresa convierte el muro en un tablón de anuncios corporativo, y mostrar
 * solo a la persona le quita al proveedor la razón por la que publica.
 */

export const TEMAS: Record<CommunityTopic, { label: string; clase: string }> = {
  experiencia: { label: "Experiencia", clase: "bg-brand-50 text-brand-700 ring-brand-200" },
  noticia: { label: "Noticia", clase: "bg-clay-100 text-clay-600 ring-clay-300" },
  practica: { label: "Práctica", clase: "bg-sand text-ink ring-hairline" },
  pregunta: { label: "Pregunta", clase: "bg-white text-muted ring-hairline" },
};

/**
 * «hace 3 días».
 *
 * A mano y no con `Intl.RelativeTimeFormat` porque el formateador pide que uno
 * elija la unidad, que es justo el trabajo que hay abajo. Por encima de un mes
 * se pasa a fecha: «hace 14 semanas» no se lo imagina nadie.
 */
function hace(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutos = Math.floor(ms / 60000);
  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} días`;
  return new Date(iso).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "long",
  });
}

export function TarjetaPublicacion({
  post,
  haySesion,
}: {
  post: CommunityPost;
  haySesion: boolean;
}) {
  const tema = TEMAS[post.topic];

  return (
    <article className="flex h-full flex-col rounded-xl bg-white p-6 ring-1 ring-hairline transition hover:ring-brand-300">
      <header className="flex items-start gap-3">
        <ProviderAvatar
          name={post.provider?.name ?? post.authorName}
          logoUrl={post.provider?.logoUrl}
          className="size-11"
        />
        <div className="min-w-0 flex-1">
          {post.provider ? (
            <>
              <Link
                href={`/proveedor/${post.provider.slug}`}
                className="block truncate font-display text-base text-ink underline-offset-4 transition-colors hover:text-brand-700 hover:underline"
              >
                {post.provider.name}
              </Link>
              <p className="truncate text-xs text-muted">
                por {post.authorName} · {hace(post.createdAt)}
              </p>
            </>
          ) : (
            <>
              <p className="truncate font-display text-base text-ink">
                {post.authorName}
              </p>
              <p className="text-xs text-muted">{hace(post.createdAt)}</p>
            </>
          )}
        </div>
        {post.provider && <TierBadge tier={post.provider.tier} />}
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${tema.clase}`}
        >
          {tema.label}
        </span>
        {post.featured && (
          <span className="flex items-center gap-1 rounded-full bg-brand-700 px-2.5 py-0.5 text-xs font-medium text-white">
            <Star className="size-3" aria-hidden />
            Destacado
          </span>
        )}
      </div>

      <h3 className="mt-3 font-display text-lg leading-snug text-ink">
        {post.title}
      </h3>

      {/* `whitespace-pre-line` y no un renderizador de Markdown: lo que se
          escribe en el muro son párrafos, y meter un intérprete de marcado
          significa además tener que sanearlo. Los saltos de línea se respetan,
          que es lo único que la gente usa. */}
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">
        {post.body}
      </p>

      <footer className="mt-5 flex items-center justify-between gap-3 border-t border-hairline pt-4">
        <BotonReaccion
          postId={post.id}
          reaccionado={post.reacted}
          cuenta={post.reactionCount}
          haySesion={haySesion}
        />
        {post.provider && (
          <Link
            href={`/proveedor/${post.provider.slug}`}
            className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
          >
            Ver lo que vende
          </Link>
        )}
      </footer>
    </article>
  );
}
