"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { definirClave } from "../actions";
import { CampoClave } from "@/components/campo-clave";

/**
 * Poner o cambiar la contraseña.
 *
 * El mismo formulario para las dos cosas: lo único que cambia es si aparece el
 * campo «contraseña actual», que depende de si la cuenta ya tenía una.
 */
export function FormularioClave({
  yaTenia,
  email,
  nombre,
  volver,
}: {
  yaTenia: boolean;
  email: string;
  nombre: string;
  /** A dónde seguir después. Lo pone quien mandó aquí a la persona. */
  volver?: string;
}) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [listo, setListo] = useState(false);
  const [pendiente, iniciar] = useTransition();

  const destino = volver && volver.startsWith("/") && !volver.startsWith("//") ? volver : "/";

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(e.currentTarget));
    iniciar(async () => {
      const r = await definirClave(datos);
      if (!r.ok) {
        setErrors(r.errors);
        return;
      }
      setErrors({});
      setListo(true);
      router.refresh();
      router.push(destino);
    });
  }

  if (listo) {
    return (
      <p className="mt-8 flex items-center gap-2 rounded-xl bg-brand-50 p-4 text-sm text-brand-800 ring-1 ring-brand-100">
        <Check className="size-4 shrink-0" />
        Contraseña guardada. La próxima vez entras con ella.
      </p>
    );
  }

  return (
    <form onSubmit={enviar} className="mt-8">
      <fieldset className="space-y-4" disabled={pendiente}>
        <legend className="sr-only">
          {yaTenia ? "Cambiar la contraseña" : "Crear una contraseña"}
        </legend>

        {yaTenia && (
          <CampoClave
            name="actual"
            label="Contraseña actual"
            autoComplete="current-password"
            error={errors.actual}
          />
        )}

        <CampoClave
          name="password"
          label={yaTenia ? "Contraseña nueva" : "Contraseña"}
          autoComplete="new-password"
          error={errors.password}
          mostrarFuerza
          contexto={[email, nombre]}
          ayuda="Al menos 10 caracteres. Tres o cuatro palabras sueltas funcionan mejor que símbolos."
        />

        <CampoClave
          name="password2"
          label="Repítela"
          autoComplete="new-password"
          error={errors.password2}
        />
      </fieldset>

      {errors.form && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {errors.form}
        </p>
      )}

      <button
        type="submit"
        disabled={pendiente}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-brand-700 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:bg-muted"
      >
        {pendiente && <Loader2 className="size-4 animate-spin" />}
        Guardar contraseña
      </button>
    </form>
  );
}
