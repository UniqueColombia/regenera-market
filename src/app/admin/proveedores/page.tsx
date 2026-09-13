import type { Metadata } from "next";
import Link from "next/link";
import { DecisionProveedor } from "./decision-proveedor";
import { ProviderAvatar } from "@/components/provider-avatar";
import { TierBadge } from "@/components/tier-badge";
import { getProvidersForReview } from "@/lib/repo";
import { longDate } from "@/lib/format";
import type { ReviewStatus } from "@/lib/types";

export const metadata: Metadata = {
  title: "Proveedores",
};

/**
 * Aprobar, rechazar y suspender proveedores.
 *
 * **No comprueba el rol**: lo hace `src/app/admin/layout.tsx`, una sola vez para
 * todo el panel. Y aunque no lo hiciera, la política `providers_public_read`
 * solo le devolvería a un curioso los proveedores aprobados, y
 * `providers_admin_all` no le dejaría escribir ni una fila.
 */

const ORDEN: ReviewStatus[] = [
  "pending_review",
  "draft",
  "approved",
  "suspended",
  "rejected",
];

const ETIQUETA: Record<ReviewStatus, string> = {
  pending_review: "Esperando decisión",
  draft: "Borrador del proveedor",
  approved: "Aprobados",
  suspended: "Suspendidos",
  rejected: "Rechazados",
};

const COLOR: Record<ReviewStatus, string> = {
  pending_review: "bg-clay-100 text-clay-700 ring-clay-300/60",
  draft: "bg-sand text-muted ring-hairline",
  approved: "bg-brand-50 text-brand-700 ring-brand-200",
  suspended: "bg-clay-100 text-clay-700 ring-clay-300/60",
  rejected: "bg-red-50 text-red-700 ring-red-200",
};

/**
 * Nunca se prerenderiza en el build.
 *
 * No es una optimización renunciada: es el objetivo del Bloque 1. Una página que
 * se congela en compilación vuelve a exigir un deploy para que se vea un dato
 * nuevo, que es exactamente lo que se quitó de en medio. Además, sin esto el
 * build de un clon sin credenciales intenta renderizarla y revienta.
 */
export const dynamic = "force-dynamic";

export default async function ProveedoresPage() {
  const proveedores = await getProvidersForReview();

  const porEstado = ORDEN.map((estado) => ({
    estado,
    filas: proveedores.filter((p) => p.status === estado),
  })).filter((g) => g.filas.length > 0);

  const pendientes = proveedores.filter(
    (p) => p.status === "pending_review",
  ).length;

  return (
    <div>
      <header className="mt-8">
        <h1 className="font-display text-3xl text-ink sm:text-4xl">
          Proveedores
        </h1>
        <p className="mt-2 max-w-2xl text-muted">
          {pendientes === 0
            ? "No hay postulaciones esperando decisión."
            : `${pendientes} ${pendientes === 1 ? "postulación espera" : "postulaciones esperan"} decisión.`}{" "}
          Aprobar a un proveedor hace visibles sus ofertas en el catálogo;
          suspenderlo las esconde sin borrar nada.
        </p>
      </header>

      <p className="mt-6 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800 ring-1 ring-brand-100">
        El nivel y el puntaje no se tocan desde aquí: los escribe la base cuando
        se aprueba una evaluación de sostenibilidad. Aprobar a un proveedor le
        permite vender, no le da un sello.
      </p>

      {porEstado.map(({ estado, filas }) => (
        <section key={estado} className="mt-10">
          <h2 className="flex items-center gap-3 font-display text-xl text-ink">
            {ETIQUETA[estado]}
            <span className="rounded-full bg-sand px-2 py-0.5 text-xs font-medium tabular-nums text-muted">
              {filas.length}
            </span>
          </h2>

          <ul className="mt-4 space-y-3">
            {filas.map((p) => (
              <li
                key={p.id}
                className="flex flex-col gap-4 rounded-xl bg-white p-4 ring-1 ring-hairline sm:flex-row sm:items-center"
              >
                <ProviderAvatar name={p.name} logoUrl={p.logoUrl} />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-lg leading-snug text-ink">
                      {p.status === "approved" ? (
                        <Link
                          href={`/proveedor/${p.slug}`}
                          className="transition-colors hover:text-brand-700 active:text-brand-700"
                        >
                          {p.name}
                        </Link>
                      ) : (
                        p.name
                      )}
                    </h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${COLOR[p.status]}`}
                    >
                      {p.status}
                    </span>
                    <TierBadge tier={p.tier} score={p.sustainabilityScore} />
                  </div>

                  <p className="mt-0.5 truncate text-sm text-muted">
                    {p.tagline}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {p.city}, {p.department} · {p.email} · postuló el{" "}
                    {longDate(p.createdAt)}
                  </p>
                </div>

                <DecisionProveedor
                  providerId={p.id}
                  estado={p.status}
                  nombre={p.name}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {proveedores.length === 0 && (
        <p className="mt-10 rounded-xl bg-white p-10 text-center text-muted ring-1 ring-hairline">
          Todavía no hay proveedores en la base.
        </p>
      )}
    </div>
  );
}
