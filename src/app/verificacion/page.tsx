import type { Metadata } from "next";
import Link from "next/link";
import {
  BadgeCheck,
  ClipboardCheck,
  Eye,
  ShieldCheck,
  Sprout,
  Users,
} from "lucide-react";
import { SustainabilityQuiz } from "@/components/sustainability-quiz";
import { HeroBanner } from "@/components/hero-banner";
import { DIMENSIONS, PUNTAJE_MINIMO_SELLO } from "@/lib/sustainability";
import { eventoExperiencia } from "@/lib/niveles";

/** Lo que suma la evaluación al nivel. Sale de la tabla, no de un número escrito aquí. */
const PUNTOS_EVALUACION = eventoExperiencia("evaluacion_aprobada").puntos;

export const metadata: Metadata = {
  title: "Cómo verificamos",
  description:
    "La metodología de verificación de Seregenera: seis dimensiones, evidencia documental y revisión humana antes de asignar el nivel Semilla, Raíz o Bosque.",
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
    title: "Se otorga el sello",
    body: "El puntaje y el sello de evaluación verificada aparecen en la ficha. No se compran, no se negocian y se revisan cada doce meses. El nivel del proveedor es otra cosa: ese se gana vendiendo.",
  },
  {
    icon: Users,
    title: "El comprador puede reclamar",
    body: "Si lo que recibiste no corresponde con lo declarado, lo investigamos. Un proveedor puede perder el sello, y las ofertas quedan suspendidas mientras tanto.",
  },
];

export default function VerificacionPage() {
  return (
    <div>
      <HeroBanner
        foto="/img/secciones/hero-verificacion.webp"
        encuadreMovil="object-[80%_50%]"
        encabezado="Metodología"
        titulo="Cómo sabemos que un proveedor es realmente regenerativo"
      >
        <p className="mt-4 max-w-2xl text-lg text-brand-100">
          El mercado está lleno de sellos verdes que nadie audita. Aquí cada
          punto del puntaje sale de una respuesta concreta con evidencia
          detrás, y cualquiera puede ver de dónde salió.
        </p>
      </HeroBanner>

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

      {/* ------------------------------------------------------------------ */}
      {/* Qué da aprobarla — y qué no                                         */}
      {/*                                                                     */}
      {/* Aquí vivían los tres niveles con su umbral de puntaje. Dejó de ser  */}
      {/* verdad: el nivel sale de los puntos de experiencia y esta página    */}
      {/* trata del sello, que es la otra cosa. Ver `src/lib/niveles.ts`.     */}
      {/* ------------------------------------------------------------------ */}
      <section className="container-page py-14">
        <h2 className="font-display text-3xl text-ink">Qué da aprobarla</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-white p-6 ring-1 ring-hairline">
            <BadgeCheck className="size-7 text-brand-600" />
            <h3 className="mt-4 font-display text-lg text-ink">
              El sello de evaluación verificada
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Aparece en la ficha del proveedor junto a su puntaje y al desglose
              por dimensión. No se compra, no se negocia y se revisa cada doce
              meses.
            </p>
          </div>
          <div className="rounded-xl bg-white p-6 ring-1 ring-hairline">
            <Sprout className="size-7 text-clay-600" />
            <h3 className="mt-4 font-display text-lg text-ink">
              {PUNTOS_EVALUACION} puntos de experiencia
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Es, con diferencia, lo que más suma para el nivel del proveedor —
              pero el nivel no depende de esto: se gana publicando, vendiendo y
              entregando.{" "}
              <Link
                href="/niveles"
                className="font-medium text-brand-700 underline underline-offset-4"
              >
                Cómo funcionan los niveles
              </Link>
              .
            </p>
          </div>
        </div>
        <p className="mt-6 max-w-2xl text-sm text-muted">
          Por debajo de {PUNTAJE_MINIMO_SELLO} puntos no se otorga el sello, y
          eso no frena a nadie: publicar y vender no dependen de esta evaluación.
          Le indicamos qué dimensión lo está frenando y puede volver a
          presentarse cuando la mejore.
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
