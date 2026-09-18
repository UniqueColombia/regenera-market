import type { Metadata } from "next";
import Link from "next/link";
import { Building2, FileText, Landmark, Mail, MapPin, Phone } from "lucide-react";
import { DecisionPostulacion } from "./decision-postulacion";
import { getApplications } from "@/lib/repo";
import { etiquetaTipoOrganizacion } from "@/lib/paises";
import { VERTICALS } from "@/lib/taxonomy";
import { longDate } from "@/lib/format";
import { mostrarTelefono } from "@/lib/telefono";
import type { ReviewStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Postulaciones" };

export const dynamic = "force-dynamic";

const ETIQUETA: Partial<Record<ReviewStatus, string>> = {
  pending_review: "Esperando respuesta",
  approved: "Aprobadas",
  rejected: "Rechazadas",
};

const COLOR: Partial<Record<ReviewStatus, string>> = {
  pending_review: "bg-clay-100 text-clay-700 ring-clay-300/60",
  approved: "bg-brand-50 text-brand-700 ring-brand-200",
  rejected: "bg-red-50 text-red-700 ring-red-200",
};

/**
 * Lo que llega de `/vender`.
 *
 * Se muestra la descripción **entera**, sin recortar: es el texto sobre el que
 * se decide si una empresa entra al marketplace, y resumirlo obligaría a abrir
 * otra pantalla para lo único que importa de esta.
 */
export default async function PostulacionesPage() {
  const postulaciones = await getApplications();

  const grupos = (["pending_review", "approved", "rejected"] as const)
    .map((estado) => ({
      estado,
      filas: postulaciones.filter((p) => p.status === estado),
    }))
    .filter((g) => g.filas.length > 0);

  return (
    <div>
      <header className="mt-8">
        <h1 className="font-display text-3xl text-ink sm:text-4xl">Postulaciones</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Aprobar crea la ficha del proveedor, la enlaza con la persona que
          postuló y le da el rol para gestionarla. El nivel y el puntaje no se
          tocan aquí: los escribe la base al aprobar una evaluación.
        </p>
      </header>

      {postulaciones.length === 0 && (
        <p className="mt-10 rounded-xl bg-white p-10 text-center text-muted ring-1 ring-hairline">
          Todavía no ha postulado nadie por{" "}
          <Link href="/vender" className="text-brand-700 underline underline-offset-4">
            /vender
          </Link>
          .
        </p>
      )}

      {grupos.map(({ estado, filas }) => (
        <section key={estado} className="mt-10">
          <h2 className="flex items-center gap-3 font-display text-xl text-ink">
            {ETIQUETA[estado]}
            <span className="rounded-full bg-sand px-2 py-0.5 text-xs font-medium tabular-nums text-muted">
              {filas.length}
            </span>
          </h2>

          <ul className="mt-4 space-y-3">
            {filas.map((p) => (
              <li key={p.id} className="rounded-xl bg-white p-5 ring-1 ring-hairline">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-lg leading-snug text-ink">
                    {p.name}
                  </h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${COLOR[p.status]}`}
                  >
                    {ETIQUETA[p.status]}
                  </span>
                  {!p.userId && p.status === "pending_review" && (
                    <span className="rounded-full bg-sand px-2 py-0.5 text-xs font-medium text-muted ring-1 ring-hairline">
                      postuló sin cuenta
                    </span>
                  )}
                </div>

                <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm text-muted sm:grid-cols-2">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="size-3.5 shrink-0" />
                    <dt className="sr-only">Contacto</dt>
                    <dd>{p.contactName}</dd>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="size-3.5 shrink-0" />
                    <dt className="sr-only">Dónde</dt>
                    {/* El país va aquí desde la 0006: «Cusco, Cusco» sin país no
                        dice dónde está una empresa cuando el formulario ya no es
                        solo colombiano. */}
                    <dd>
                      {p.city}, {p.department} · {p.country}
                    </dd>
                  </div>
                  {p.taxId && (
                    <div className="flex items-center gap-1.5">
                      <FileText className="size-3.5 shrink-0" />
                      <dt className="sr-only">Identificación tributaria</dt>
                      <dd>
                        {p.taxIdKind ?? "Identificación"} {p.taxId}
                      </dd>
                    </div>
                  )}
                  {p.orgType && (
                    <div className="flex items-center gap-1.5">
                      <Landmark className="size-3.5 shrink-0" />
                      <dt className="sr-only">Tipo de organización</dt>
                      <dd>{etiquetaTipoOrganizacion(p.orgType)}</dd>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <Mail className="size-3.5 shrink-0" />
                    <dt className="sr-only">Correo</dt>
                    <dd className="truncate">{p.email}</dd>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Phone className="size-3.5 shrink-0" />
                    <dt className="sr-only">Teléfono</dt>
                    <dd>{mostrarTelefono(p.phone) || p.phone}</dd>
                  </div>
                </dl>

                {p.website && (
                  <p className="mt-1 text-sm">
                    <a
                      href={p.website}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-brand-700 underline underline-offset-4"
                    >
                      {p.website}
                    </a>
                  </p>
                )}

                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink">
                  {p.description}
                </p>

                {p.categories.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {p.categories.map((c) => (
                      <li
                        key={c}
                        className="rounded-full bg-sand px-2.5 py-0.5 text-xs font-medium text-muted"
                      >
                        {VERTICALS.find((v) => v.id === c)?.label ?? c}
                      </li>
                    ))}
                  </ul>
                )}

                <p className="mt-3 text-xs text-muted">
                  Postuló el {longDate(p.createdAt)}
                  {p.reviewerNotes && ` · Notas: ${p.reviewerNotes}`}
                </p>

                <DecisionPostulacion
                  id={p.id}
                  nombre={p.name}
                  decidida={p.status !== "pending_review"}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
