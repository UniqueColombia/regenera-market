import type { Metadata } from "next";
import { ClipboardCheck, Eye, ShieldCheck, Users } from "lucide-react";
import { SustainabilityQuiz } from "@/components/sustainability-quiz";
import { TierBadge } from "@/components/tier-badge";
import { DIMENSIONS } from "@/lib/sustainability";
import { TIERS } from "@/lib/taxonomy";

export const metadata: Metadata = {
  title: "Cómo verificamos",
  description:
    "La metodología de verificación de Regenera Market: seis dimensiones, evidencia documental y revisión humana antes de asignar el nivel Semilla, Raíz o Bosque.",
};

const STEPS = [
  {
    icon: ClipboardCheck,
    title: "El proveedor se autoevalúa",
    body: "Responde 16 preguntas repartidas en seis dimensiones y adjunta la evidencia de las que la exigen: facturas de compra local, certificados vigentes, actas de reparto comunitario.",
  },
  {
    icon: Eye,
    title: "Nuestro equipo revisa la evidencia",
    body: "Ninguna respuesta puntúa sola. Contrastamos el documento con lo declarado y, cuando algo no cuadra, pedimos aclaración antes de aprobar.",
  },
  {
    icon: ShieldCheck,
    title: "Se asigna un nivel público",
    body: "El puntaje determina el sello que aparece en cada ficha. No se compra, no se negocia y se revisa cada doce meses.",
  },
  {
    icon: Users,
    title: "El comprador puede reclamar",
    body: "Si lo que recibiste no corresponde con lo declarado, lo investigamos. Un proveedor puede perder su nivel, y las ofertas quedan suspendidas mientras tanto.",
  },
];

export default function VerificacionPage() {
  return (
    <div>
      <section className="bg-brand-900">
        <div className="container-page py-16">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-300">
            Metodología
          </p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl text-white md:text-5xl">
            Cómo sabemos que un proveedor es realmente regenerativo
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-brand-100">
            El mercado está lleno de sellos verdes que nadie audita. Aquí cada
            punto del puntaje sale de una respuesta concreta con evidencia
            detrás, y cualquiera puede ver de dónde salió.
          </p>
        </div>
      </section>

      <section className="container-page py-14">
        <h2 className="font-display text-3xl text-ink">El proceso</h2>
        <ol className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              className="rounded-xl bg-white p-6 ring-1 ring-hairline"
            >
              <step.icon className="size-7 text-brand-600" />
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-brand-600">
                Paso {i + 1}
              </p>
              <h3 className="mt-1 font-display text-lg text-ink">
                {step.title}
              </h3>
              <p className="mt-2 text-sm text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-sand py-14">
        <div className="container-page">
          <h2 className="font-display text-3xl text-ink">
            Las seis dimensiones
          </h2>
          <p className="mt-2 max-w-2xl text-muted">
            Los pesos están pensados para que un taller pequeño sin plata para
            certificarse pueda igual llegar a Raíz por prácticas reales.
          </p>

          <ul className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {DIMENSIONS.map((dim) => (
              <li
                key={dim.id}
                className="rounded-xl bg-white p-6 ring-1 ring-hairline"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-display text-lg text-ink">{dim.label}</h3>
                  <span className="shrink-0 font-display text-2xl text-brand-600 tabular-nums">
                    {dim.weight}%
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted">{dim.description}</p>
                <p className="mt-3 text-xs text-muted">
                  {dim.questions.length} preguntas ·{" "}
                  {dim.questions.filter((q) => q.requiresEvidence).length} con
                  evidencia obligatoria
                </p>
              </li>
            ))}
            <li className="rounded-xl bg-white p-6 ring-1 ring-hairline">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-display text-lg text-ink">
                  Certificaciones verificadas
                </h3>
                <span className="shrink-0 font-display text-2xl text-brand-600 tabular-nums">
                  10%
                </span>
              </div>
              <p className="mt-2 text-sm text-muted">
                Sellos externos vigentes cuyo documento revisamos uno por uno.
              </p>
              <p className="mt-3 text-xs text-muted">
                Con tope: una certificación comprada no basta por sí sola.
              </p>
            </li>
          </ul>
        </div>
      </section>

      <section className="container-page py-14">
        <h2 className="font-display text-3xl text-ink">Los tres niveles</h2>
        <ul className="mt-8 grid gap-4 md:grid-cols-3">
          {(["semilla", "raiz", "bosque"] as const).map((t) => (
            <li key={t} className="rounded-xl bg-white p-6 ring-1 ring-hairline">
              <TierBadge tier={t} size="md" />
              <p className="mt-4 font-display text-3xl text-ink tabular-nums">
                {TIERS[t].min}
                <span className="text-base text-muted"> puntos o más</span>
              </p>
              <p className="mt-2 text-sm text-muted">{TIERS[t].description}</p>
            </li>
          ))}
        </ul>
        <p className="mt-6 max-w-2xl text-sm text-muted">
          Por debajo de {TIERS.semilla.min} puntos el proveedor no obtiene sello
          y no puede publicar. Le indicamos qué dimensión lo está frenando y
          puede volver a presentarse cuando la mejore.
        </p>
      </section>

      <section className="bg-sand py-14">
        <div className="container-page">
          <h2 className="font-display text-3xl text-ink">
            Calcula tu puntaje ahora
          </h2>
          <p className="mt-2 max-w-2xl text-muted">
            Este es el mismo cuestionario de la evaluación oficial. Respóndelo
            para saber en qué nivel quedarías antes de postularte.
          </p>
          <div className="mt-8">
            <SustainabilityQuiz />
          </div>
        </div>
      </section>
    </div>
  );
}
