"use client";

import { useMemo, useState } from "react";
import { ArrowRight, FileCheck2, RotateCcw } from "lucide-react";
import { TierBadge } from "./tier-badge";
import {
  DIMENSIONS,
  scoreProvider,
  TOTAL_QUESTIONS,
} from "@/lib/sustainability";
import { CERTIFICATIONS, TIERS } from "@/lib/taxonomy";

/**
 * Autodiagnóstico público.
 *
 * Es el mismo motor que usa la evaluación oficial, pero sin evidencia ni
 * revisión: el proveedor ve su puntaje estimado antes de postularse. Se dice
 * explícitamente que el resultado no otorga el sello, para no confundirlo con
 * la verificación real.
 */
export function SustainabilityQuiz() {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [certs, setCerts] = useState<string[]>([]);

  const answered = Object.keys(answers).length;
  const result = useMemo(() => scoreProvider(answers, certs), [answers, certs]);
  const complete = answered === TOTAL_QUESTIONS;

  return (
    <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
      <div>
        {DIMENSIONS.map((dim) => (
          <section key={dim.id} className="mb-8">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-display text-xl text-ink">{dim.label}</h3>
              <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-brand-600">
                {dim.weight}% del puntaje
              </span>
            </div>
            <p className="mt-1 text-sm text-muted">{dim.description}</p>

            <div className="mt-4 space-y-5">
              {dim.questions.map((q) => (
                <fieldset key={q.id}>
                  <legend className="text-sm font-medium text-ink">
                    {q.text}
                    {q.requiresEvidence && (
                      <span
                        className="ml-2 inline-flex items-center gap-1 rounded bg-clay-100 px-1.5 py-0.5 text-[11px] font-normal text-clay-600"
                        title="En la evaluación oficial esta respuesta exige documento de respaldo"
                      >
                        <FileCheck2 className="size-3" />
                        requiere evidencia
                      </span>
                    )}
                  </legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {q.options.map((opt, i) => {
                      const selected = answers[q.id] === i;
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() =>
                            setAnswers((prev) => ({ ...prev, [q.id]: i }))
                          }
                          aria-pressed={selected}
                          className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
                            selected
                              ? "border-brand-600 bg-brand-600 text-white"
                              : "border-hairline bg-white text-ink hover:border-brand-400"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
          </section>
        ))}

        <section className="mb-8">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-display text-xl text-ink">
              Certificaciones vigentes
            </h3>
            <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-brand-600">
              10% del puntaje
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            Marca las que puedas respaldar con documento vigente. Tienen tope:
            acumular sellos no compensa una operación floja.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(CERTIFICATIONS).map(([code, cert]) => {
              const selected = certs.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() =>
                    setCerts((prev) =>
                      selected
                        ? prev.filter((c) => c !== code)
                        : [...prev, code],
                    )
                  }
                  aria-pressed={selected}
                  className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
                    selected
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-hairline bg-white text-ink hover:border-brand-400"
                  }`}
                >
                  {cert.label}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-xl bg-white p-6 ring-1 ring-hairline">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Puntaje estimado
          </p>
          <p className="mt-1 font-display text-5xl text-brand-700 tabular-nums">
            {result.total}
            <span className="text-xl text-muted">/100</span>
          </p>

          <div className="mt-3">
            {result.tier === "unverified" ? (
              <p className="text-sm text-muted">
                Todavía por debajo de {TIERS.semilla.min} puntos, el umbral de
                Semilla.
              </p>
            ) : (
              <TierBadge tier={result.tier} size="md" />
            )}
          </div>

          <div className="mt-5">
            <div className="flex justify-between text-xs text-muted">
              <span>
                {answered} de {TOTAL_QUESTIONS} preguntas
              </span>
              <span>{Math.round((answered / TOTAL_QUESTIONS) * 100)}%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sand">
              <div
                className="h-full rounded-full bg-brand-500 transition-all"
                style={{ width: `${(answered / TOTAL_QUESTIONS) * 100}%` }}
              />
            </div>
          </div>

          <h4 className="mt-6 font-display text-sm text-ink">
            Desglose por dimensión
          </h4>
          <ul className="mt-3 space-y-3">
            {result.dimensions.map((d) => (
              <li key={d.id}>
                <div className="flex justify-between text-xs">
                  <span className="text-muted">{d.label}</span>
                  <span className="tabular-nums text-ink">{d.percent}%</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-sand">
                  <div
                    className="h-full rounded-full bg-brand-400"
                    style={{ width: `${d.percent}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-5 border-t border-hairline pt-4 text-xs text-muted">
            Este resultado es orientativo. El nivel real se asigna cuando nuestro
            equipo revisa la evidencia que respalda cada respuesta.
          </p>

          {complete && (
            <a
              href="/vender"
              className="mt-4 flex items-center justify-center gap-2 rounded-full bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-800"
            >
              Postular mi empresa
              <ArrowRight className="size-4" />
            </a>
          )}

          {answered > 0 && (
            <button
              type="button"
              onClick={() => {
                setAnswers({});
                setCerts([]);
              }}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full px-5 py-2 text-sm text-muted hover:text-brand-700"
            >
              <RotateCcw className="size-3.5" />
              Empezar de nuevo
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
