"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { submitApplication } from "./actions";
import { DEPARTMENTS } from "@/lib/taxonomy";

export function ApplicationForm() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    startTransition(async () => {
      const result = await submitApplication(data);
      if (result.ok) {
        setErrors({});
        setSent(true);
      } else {
        setErrors(result.errors);
      }
    });
  }

  if (sent) {
    return (
      <div className="rounded-xl bg-brand-50 p-8 text-center ring-1 ring-brand-200">
        <CheckCircle2 className="mx-auto size-10 text-brand-600" />
        <h3 className="mt-4 font-display text-2xl text-brand-900">
          Recibimos tu postulación
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-brand-800">
          Te escribimos en menos de cinco días hábiles con el enlace para
          completar la evaluación de sostenibilidad y cargar tu evidencia.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl bg-white p-6 ring-1 ring-hairline"
    >
      <fieldset disabled={pending} className="space-y-4">
        <legend className="sr-only">Datos de la empresa</legend>

        <Field
          name="name"
          label="Nombre de la empresa, cooperativa o asociación"
          error={errors.name}
          required
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="contactName"
            label="Tu nombre"
            error={errors.contactName}
            required
          />
          <Field
            name="email"
            label="Correo"
            type="email"
            error={errors.email}
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="phone"
            label="Teléfono"
            error={errors.phone}
            required
          />
          <div>
            <label
              htmlFor="department"
              className="mb-1 block text-xs font-medium text-muted"
            >
              Departamento
            </label>
            <select
              id="department"
              name="department"
              required
              defaultValue=""
              className="w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
            >
              <option value="" disabled>
                Elige…
              </option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            {errors.department && (
              <p className="mt-1 text-xs text-red-700">{errors.department}</p>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="city"
            label="Ciudad o municipio"
            error={errors.city}
            required
          />
          <Field
            name="website"
            label="Sitio web o red social (opcional)"
            placeholder="https://"
            error={errors.website}
          />
        </div>

        <div>
          <label
            htmlFor="description"
            className="mb-1 block text-xs font-medium text-muted"
          >
            ¿Qué produces y por qué es regenerativo?
          </label>
          <textarea
            id="description"
            name="description"
            rows={5}
            required
            placeholder="Cuéntanos qué vendes, de qué está hecho, quién lo produce y qué deja en el territorio."
            className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-brand-500 ${
              errors.description ? "border-red-500" : "border-hairline"
            }`}
          />
          {errors.description && (
            <p className="mt-1 text-xs text-red-700">{errors.description}</p>
          )}
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:bg-muted"
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        Enviar postulación
      </button>
    </form>
  );
}

function Field({
  name,
  label,
  type = "text",
  error,
  required,
  placeholder,
}: {
  name: string;
  label: string;
  type?: string;
  error?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label
        htmlFor={name}
        className="mb-1 block text-xs font-medium text-muted"
      >
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-brand-500 ${
          error ? "border-red-500" : "border-hairline"
        }`}
      />
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
