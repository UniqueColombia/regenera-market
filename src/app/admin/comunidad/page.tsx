import type { Metadata } from "next";
import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { DecisionPublicacion } from "./decision-publicacion";
import { TEMAS } from "@/components/tarjeta-publicacion";
import { getPostsForAdmin } from "@/lib/repo";
import { longDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Comunidad",
};

/**
 * Moderar el muro.
 *
 * **No comprueba el rol**: lo hace `src/app/admin/layout.tsx`, una sola vez para
 * todo el panel. Y aunque no lo hiciera, `community_posts_read` solo le
 * devolvería a un curioso lo aprobado y lo suyo, y `community_posts_admin` no le
 * dejaría escribir una fila.
 *
 * **La moderación es posterior, no previa.** Una publicación se ve desde que se
 * escribe; lo que hay aquí es el botón de retirarla. Es la misma decisión que
 * tomó la migración 0006 con las postulaciones —el control es una palanca, no
 * una puerta— y está explicada en la cabecera de la 0007.
 */
export const dynamic = "force-dynamic";

export default async function AdminComunidadPage() {
  const posts = await getPostsForAdmin();
  const ocultas = posts.filter((p) => p.status !== "approved").length;

  return (
    <div>
      <h1 className="font-display text-2xl text-ink">Comunidad</h1>
      <p className="mt-1 text-sm text-muted">
        {posts.length === 0
          ? "Todavía no hay publicaciones."
          : `${posts.length} publicaciones${ocultas > 0 ? `, ${ocultas} oculta${ocultas === 1 ? "" : "s"}` : ""}.`}{" "}
        <Link
          href="/comunidad"
          className="font-medium text-brand-700 underline underline-offset-4"
        >
          Ver el muro público
        </Link>
      </p>

      {posts.length === 0 ? (
        <div className="mt-8 rounded-xl bg-white p-10 text-center ring-1 ring-hairline">
          <MessagesSquare className="mx-auto size-8 text-muted" />
          <p className="mt-3 text-sm text-muted">
            Cuando alguien escriba en la Comunidad, aparecerá aquí para moderar.
          </p>
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {posts.map((post) => (
            <li
              key={post.id}
              className={`rounded-xl p-5 ring-1 ${
                post.status === "approved"
                  ? "bg-white ring-hairline"
                  : "bg-sand ring-clay-300/60"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${TEMAS[post.topic].clase}`}
                    >
                      {TEMAS[post.topic].label}
                    </span>
                    {post.status !== "approved" && (
                      <span className="rounded-full bg-clay-100 px-2.5 py-0.5 text-xs font-medium text-clay-700 ring-1 ring-clay-300/60">
                        Oculta
                      </span>
                    )}
                    {post.featured && (
                      <span className="rounded-full bg-brand-700 px-2.5 py-0.5 text-xs font-medium text-white">
                        Destacada
                      </span>
                    )}
                  </div>

                  <h2 className="mt-2 font-display text-base text-ink">
                    {post.title}
                  </h2>
                  <p className="mt-1 text-xs text-muted">
                    {post.provider ? (
                      <>
                        <Link
                          href={`/proveedor/${post.provider.slug}`}
                          className="font-medium text-brand-700 underline underline-offset-2"
                        >
                          {post.provider.name}
                        </Link>
                        {" · "}
                      </>
                    ) : null}
                    {post.authorName} · {longDate(post.createdAt)} ·{" "}
                    {post.reactionCount} reacciones
                  </p>

                  {/* Recortado: el panel es para decidir, no para leer. El texto
                      completo está en el muro, a un clic. */}
                  <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-muted">
                    {post.body}
                  </p>
                </div>

                <DecisionPublicacion
                  postId={post.id}
                  estado={post.status}
                  destacada={post.featured}
                  titulo={post.title}
                  puedeDestacar={Boolean(post.provider)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
