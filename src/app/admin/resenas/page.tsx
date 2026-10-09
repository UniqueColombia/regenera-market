import type { Metadata } from "next";
import Link from "next/link";
import { ModerarResena } from "./moderar-resena";
import { Estrellas } from "@/components/estrellas";
import { longDate } from "@/lib/format";
import { getResenasParaModerar, logisticaDisponible } from "@/lib/repo";

export const metadata: Metadata = { title: "Reseñas" };

export const dynamic = "force-dynamic";

/**
 * Las reseñas de los compradores, para moderarlas.
 *
 * Se publican al instante —las escribe solo quien compró y recibió, así que no
 * hay spam que filtrar antes— y aquí el equipo oculta la que no debería estar:
 * un insulto, un dato personal, algo que no habla del producto.
 */
export default async function ResenasAdminPage() {
  const disponible = await logisticaDisponible();
  const resenas = await getResenasParaModerar();
  const ocultas = resenas.filter((r) => r.oculta).length;

  return (
    <div>
      <header className="mt-8">
        <h1 className="font-display text-3xl text-ink sm:text-4xl">Reseñas</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Las escribe quien compró y ya recibió lo que compró. Se publican al
          instante; aquí se oculta la que no cumple las normas. El texto no se
          edita nunca.
        </p>
      </header>

      {!disponible ? (
        <p className="mt-8 rounded-xl bg-sand p-6 text-sm text-muted">
          Falta aplicar la migración <code>0014</code> en Supabase.
        </p>
      ) : resenas.length === 0 ? (
        <p className="mt-8 rounded-xl bg-white p-8 text-center text-sm text-muted ring-1 ring-hairline">
          Todavía no hay reseñas.
        </p>
      ) : (
        <>
          <p className="mt-6 text-sm text-muted">
            {resenas.length} {resenas.length === 1 ? "reseña" : "reseñas"}
            {ocultas > 0 && ` · ${ocultas} ${ocultas === 1 ? "oculta" : "ocultas"}`}
          </p>
          <ul className="mt-3 space-y-3">
            {resenas.map((r) => (
              <li
                key={r.id}
                className={`flex flex-wrap items-start justify-between gap-4 rounded-xl p-4 ring-1 ${
                  r.oculta ? "bg-sand ring-hairline" : "bg-white ring-hairline"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span aria-label={`${r.rating} de 5 estrellas`}>
                      <Estrellas valor={r.rating} />
                    </span>
                    <span className="font-medium text-ink">{r.autorNombre}</span>
                    <span className="text-muted">· {longDate(r.createdAt)}</span>
                    {r.oculta && (
                      <span className="rounded-full bg-clay-100 px-2 py-0.5 text-xs text-clay-700">
                        Oculta
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Sobre{" "}
                    {r.listingSlug ? (
                      <Link href={`/oferta/${r.listingSlug}`} className="underline hover:text-brand-700">
                        {r.listingTitle}
                      </Link>
                    ) : (
                      r.listingTitle
                    )}
                  </p>
                  {r.body && <p className="mt-2 text-sm text-ink">{r.body}</p>}
                </div>
                <ModerarResena id={r.id} oculta={r.oculta} slug={r.listingSlug || undefined} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
