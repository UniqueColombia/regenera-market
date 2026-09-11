"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { pedirCodigo, verificarCodigo } from "./actions";

/**
 * Formulario de acceso y de registro.
 *
 * Uno solo para las dos pantallas: cambian el texto y si el correo puede crear
 * cuenta, nada más. Dos componentes casi idénticos se desincronizan en cuanto
 * alguien arregla un mensaje en uno.
 *
 * Tiene dos pasos —pedir el código y escribirlo— y el estado del paso vive aquí
 * porque no hay razón para que sean dos URL: quien recarga a mitad no querría
 * volver a la pantalla del código sin haberlo pedido.
 */
export function FormularioAcceso({
  registro,
  volver,
}: {
  registro: boolean;
  /** A dónde ir después de entrar. Viene de `?volver=` que pone `requireUser`. */
  volver?: string;
}) {
  const router = useRouter();
  const [paso, setPaso] = useState<"correo" | "codigo">("correo");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendiente, iniciar] = useTransition();

  function enviarCorreo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(e.currentTarget));
    iniciar(async () => {
      const r = await pedirCodigo(datos, registro);
      if (r.ok) {
        setEmail(String(datos.email));
        setErrors({});
        setPaso("codigo");
      } else {
        setErrors(r.errors);
      }
    });
  }

  function enviarCodigo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(e.currentTarget));
    iniciar(async () => {
      const r = await verificarCodigo({ ...datos, email });
      if (r.ok) {
        // `refresh()` antes de navegar: el encabezado se pinta en el servidor y
        // sin esto seguiría diciendo "Entrar" con la sesión ya abierta.
        router.refresh();
        router.push(volver && volver.startsWith("/") ? volver : "/");
      } else {
        setErrors(r.errors);
      }
    });
  }

  if (paso === "codigo") {
    return (
      <form onSubmit={enviarCodigo} className="mt-8">
        <div className="flex items-start gap-3 rounded-xl bg-brand-50 p-4 ring-1 ring-brand-100">
          <MailCheck className="mt-0.5 size-5 shrink-0 text-brand-700" />
          <p className="text-sm text-brand-800">
            Te mandamos un código de seis dígitos a{" "}
            <strong className="font-semibold">{email}</strong>. Puede tardar un
            minuto y a veces cae en correo no deseado.
          </p>
        </div>

        <div className="mt-5">
          <label
            htmlFor="token"
            className="mb-1 block text-xs font-medium text-muted"
          >
            Código de seis dígitos
          </label>
          <input
            id="token"
            name="token"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            // Diez dígitos es el máximo que Supabase puede emitir, más margen
            // para los espacios con que llega pegado desde el correo (el
            // servidor los quita). Estaba en 7, que no dejaba ni escribir un
            // código de 8 — el campo cortaba antes de terminar de teclearlo.
            maxLength={14}
            aria-invalid={errors.token ? true : undefined}
            className={`w-full rounded-lg border bg-white px-3 py-3 text-center font-display text-2xl tracking-[0.4em] tabular-nums outline-none transition focus:border-brand-500 ${
              errors.token ? "border-red-500" : "border-control"
            }`}
          />
          {errors.token && (
            <p className="mt-1 text-xs text-red-700">{errors.token}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={pendiente}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-brand-700 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:bg-muted"
        >
          {pendiente && <Loader2 className="size-4 animate-spin" />}
          Entrar
        </button>

        <button
          type="button"
          onClick={() => {
            setPaso("correo");
            setErrors({});
          }}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full px-6 py-2 text-sm text-muted transition hover:bg-sand hover:text-brand-700"
        >
          <ArrowLeft className="size-4" />
          Usar otro correo
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={enviarCorreo} className="mt-8">
      <fieldset className="space-y-3" disabled={pendiente}>
        <legend className="sr-only">
          {registro ? "Datos de registro" : "Acceso"}
        </legend>

        {registro && (
          <div>
            <label
              htmlFor="name"
              className="mb-1 block text-xs font-medium text-muted"
            >
              Nombre completo
            </label>
            <input
              id="name"
              name="name"
              autoComplete="name"
              required
              aria-invalid={errors.name ? true : undefined}
              className={`w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 ${
                errors.name ? "border-red-500" : "border-control"
              }`}
            />
            {errors.name && (
              <p className="mt-1 text-xs text-red-700">{errors.name}</p>
            )}
          </div>
        )}

        <div>
          <label
            htmlFor="email"
            className="mb-1 block text-xs font-medium text-muted"
          >
            Correo
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={errors.email ? true : undefined}
            className={`w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 ${
              errors.email ? "border-red-500" : "border-control"
            }`}
          />
          {errors.email && (
            <p className="mt-1 text-xs text-red-700">{errors.email}</p>
          )}
        </div>
      </fieldset>

      {errors.form && <p className="mt-3 text-sm text-red-700">{errors.form}</p>}

      <button
        type="submit"
        disabled={pendiente}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-brand-700 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:bg-muted"
      >
        {pendiente && <Loader2 className="size-4 animate-spin" />}
        {registro ? "Crear mi cuenta" : "Enviar código"}
      </button>

      <p className="mt-4 text-center text-sm text-muted">
        {registro ? (
          <>
            ¿Ya tienes cuenta?{" "}
            <Link
              href="/entrar"
              className="font-medium text-brand-700 underline underline-offset-4"
            >
              Entrar
            </Link>
          </>
        ) : (
          <>
            ¿No tienes cuenta?{" "}
            <Link
              href="/registro"
              className="font-medium text-brand-700 underline underline-offset-4"
            >
              Crear una
            </Link>
          </>
        )}
      </p>

      <p className="mt-4 text-xs leading-relaxed text-muted">
        No usamos contraseña. Te mandamos un código de seis dígitos al correo
        cada vez que entras.
      </p>
    </form>
  );
}
