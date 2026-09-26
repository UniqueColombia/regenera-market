import type { Metadata } from "next";
import Link from "next/link";
import {
  BadgeCheck,
  Briefcase,
  ClipboardCheck,
  Eye,
  ReceiptText,
  ShieldCheck,
  Sprout,
  Users,
} from "lucide-react";
import { SustainabilityQuiz } from "@/components/sustainability-quiz";
import { HeroBanner } from "@/components/hero-banner";
import { DIMENSIONS, PUNTAJE_MINIMO_SELLO } from "@/lib/sustainability";
import { eventoExperiencia } from "@/lib/niveles";
import { publica } from "@/lib/seo";

/** Lo que suma la evaluación al nivel. Sale de la tabla, no de un número escrito aquí. */
const PUNTOS_EVALUACION = eventoExperiencia("evaluacion_aprobada").puntos;

export const metadata: Metadata = {
  title: "Cómo verificamos",
  description:
    "El sello Green Watching de Seregenera: seis dimensiones, evidencia documental, un estudio de nuestro equipo y una licencia. Solo lo otorga Seregenera.",
  ...publica("/verificacion"),
};

/**
 * El proceso del sello, en el orden en que ocurre.
 *
 * **Green Watching es el nombre del sello**, y es lo que ya existía como
 * «evaluación verificada» (`providers.sustainability_verified_at`): no hay dos
 * sellos. Lo que se hizo explícito el 2026-09-26 es cómo se obtiene —un estudio
 * de nuestro equipo y el pago de una licencia— y que **solo lo otorga
 * Seregenera**: ni se compra por fuera ni se lo pone el proveedor. En la base lo
 * escribe `sync_provider_score()` cuando un administrador aprueba la evaluación,
 * y el trigger `providers_proteger_derivados` impide escribirlo desde una sesión
 * de proveedor.
 */
const STEPS = [
  {
    icon: ClipboardCheck,
    title: "Te autoevalúas",
    body: "Respondes 16 preguntas repartidas en seis dimensiones y adjuntas la evidencia de las que la exigen: facturas de compra local, certificados vigentes, actas de reparto comunitario.",
  },
  {
    icon: Eye,
    title: "Hacemos el estudio",
    body: "Aplicamos nuestra metodología de revisión: contrastamos cada documento con lo declarado y, si algo no cuadra, te pedimos aclaración. Una respuesta sin su evidencia no puntúa.",
  },
  {
    icon: ReceiptText,
    title: "Pagas la licencia",
    body: "Si el estudio sale favorable, te enviamos el resultado junto con el valor de la licencia del sello. Sin licencia vigente, el sello no se muestra.",
  },
  {
    icon: ShieldCheck,
    title: "Recibes el sello Green Watching",
    body: "Aparece en tu ficha con tu puntaje y lo revisamos cada doce meses. El nivel que se ve al lado mide otra cosa: cuánto llevas vendido y entregado.",
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
          El mercado está lleno de sellos verdes que nadie audita. El sello
          Green Watching solo lo otorga Seregenera, después de un estudio, y
          cada punto del puntaje sale de una respuesta con evidencia detrás.
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

        <p className="mt-6 flex max-w-3xl items-start gap-2 text-sm text-muted">
          <Users className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
          Y después, el comprador puede reclamar: si lo que recibió no
          corresponde con lo declarado, lo investigamos. Un proveedor puede
          perder el sello, y sus ofertas quedan suspendidas mientras tanto.
        </p>
      </section>

      <section className="bg-sand py-14">
        <div className="container-page">
          <h2 className="font-display text-3xl text-ink">
            Las seis dimensiones
          </h2>
          <p className="mt-2 max-w-2xl text-muted">
            Los pesos están repartidos para que un taller pequeño, sin plata
            para certificarse, pueda sacar un buen puntaje por lo que hace de
            verdad.
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
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl bg-white p-6 ring-1 ring-hairline">
            <BadgeCheck className="size-7 text-brand-600" />
            <h3 className="mt-4 font-display text-lg text-ink">
              El sello Green Watching
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Aparece en tu ficha junto a tu puntaje y al desglose por
              dimensión. Lo revisamos cada doce meses.
            </p>
          </div>
          <div className="rounded-xl bg-white p-6 ring-1 ring-hairline">
            <Briefcase className="size-7 text-brand-600" />
            <h3 className="mt-4 font-display text-lg text-ink">
              Poder vender consultoría e implementación
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Es la categoría avanzada del catálogo: diagnósticos,
              acompañamiento a certificaciones, implementación de sistemas y
              formación de equipos. Vender eso es vender criterio, y por eso
              solo la ofrece quien tiene el sello. Sin él, la categoría se ve
              pero no se puede elegir.
            </p>
          </div>
          <div className="rounded-xl bg-white p-6 ring-1 ring-hairline">
            <Sprout className="size-7 text-clay-600" />
            <h3 className="mt-4 font-display text-lg text-ink">
              {PUNTOS_EVALUACION} puntos de experiencia
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Es el evento que más experiencia da de una sola vez. Tu nivel
              además sube con lo que publicas, vendes y entregas.{" "}
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
          El sello se otorga desde {PUNTAJE_MINIMO_SELLO} puntos. Si te quedas
          corto te decimos qué dimensión te está pesando, y puedes volver a
          presentarte cuando la mejores. Mientras tanto sigues publicando y
          vendiendo igual.
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
