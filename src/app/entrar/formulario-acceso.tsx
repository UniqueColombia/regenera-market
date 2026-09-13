"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { entrarConClave, pedirCodigo } from "./actions";
import { CampoClave } from "@/components/campo-clave";
import { PasoCodigo } from "@/components/paso-codigo";

/**
 * Acceso: correo y contraseña, con el código como segundo factor.
 *
 * Tres caminos, y el estado de cuál se está recorriendo vive aquí porque no hay
 * ninguna razón para que sean tres URL — quien recarga a mitad no querría
 * aterrizar en «escribe el código» sin haberlo pedido:
 *
 * 1. **Clave + aparato conocido** → entra directo.
 * 2. **Clave + aparato nuevo** → código de seis dígitos. Es el segundo factor.
 * 3. **Sin clave** → código directo. Cubre a quien se registró cuando el acceso
 *    era solo por correo, a quien la olvidó y a las cuentas que crea un
 *    administrador. Al entrar, la aplicación le pide que se ponga una.
 *
 * El tercero **es** la recuperación de contraseña. No hay un flujo aparte de
 * «olvidé mi clave» a propósito: usar la misma plantilla de correo que ya
 * funciona es un camino menos que se puede romper sin que nadie lo note. La
 * razón larga está en `actions.ts`.
 */
export function FormularioAcceso({ volver }: { volver?: string }) {
  const router = useRouter();
  const [paso, setPaso] = useState<"clave" | "correo" | "codigo">("clave");
  const [email, setEmail] = useState("");
  const [aparatoNuevo, setAparatoNuevo] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendiente, iniciar] = useTransition();

  const destino = volver && volver.startsWith("/") && !volver.startsWith("//") ? volver : "/";

  function entrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(e.currentTarget));
    iniciar(async () => {
      const r = await entrarConClave(datos);
      if (!r.ok) {
        setErrors(r.errors);
        return;
      }
      setErrors({});
      setEmail(String(datos.email));

      if (r.requiereCodigo) {
        setAparatoNuevo(true);
        setPaso("codigo");
        return;
      }

      router.refresh();
      router.push(
        r.necesitaClave ? `/cuenta/clave?volver=${encodeURIComponent(destino)}` : destino,
      );
    });
  }

  function mandarCodigo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(e.currentTarget));
    iniciar(async () => {
      const r = await pedirCodigo(datos);
      if (!r.ok) {
        setErrors(r.errors);
        return;
      }
      setEmail(String(datos.email));
      setErrors({});
      setAparatoNuevo(false);
      setPaso("codigo");
    });
  }

  if (paso === "codigo") {
    return (
      <PasoCodigo
        email={email}
        volver={volver}
        nota={
          aparatoNuevo ? (
            <span className="mt-2 flex items-start gap-2 text-sm text-brand-800">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              Es la primera vez que entras desde este dispositivo. Cuando
              verifiques, dejamos de pedirte el código aquí.
            </span>
          ) : undefined
        }
        onCambiarCorreo={() => {
          setPaso("clave");
          setErrors({});
        }}
      />
    );
  }

  if (paso === "correo") {
    return (
      <form onSubmit={mandarCodigo} className="mt-8">
        <p className="rounded-xl bg-sand p-4 text-sm text-muted ring-1 ring-hairline">
          Te mandamos un código al correo y entras sin contraseña. Si tu cuenta
          no tiene una, después te pediremos que la crees.
        </p>

        <div className="mt-5">
          <label htmlFor="email" className="mb-1 block text-xs font-medium text-muted">
            Correo
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            aria-invalid={errors.email ? true : undefined}
            className={`w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 ${
              errors.email ? "border-red-500" : "border-control"
            }`}
          />
          {errors.email && <p className="mt-1 text-xs text-red-700">{errors.email}</p>}
        </div>

        {errors.form && <p className="mt-3 text-sm text-red-700">{errors.form}</p>}

        <button
          type="submit"
          disabled={pendiente}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-brand-700 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:bg-muted"
        >
          {pendiente && <Loader2 className="size-4 animate-spin" />}
          Enviarme el código
        </button>

        <button
          type="button"
          onClick={() => {
            setPaso("clave");
            setErrors({});
          }}
          className="mt-3 w-full rounded-full px-6 py-2 text-sm text-muted transition hover:bg-sand hover:text-brand-700"
        >
          Volver a entrar con contraseña
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={entrar} className="mt-8">
      <fieldset className="space-y-3" disabled={pendiente}>
        <legend className="sr-only">Acceso con correo y contraseña</legend>

        <div>
          <label htmlFor="email" className="mb-1 block text-xs font-medium text-muted">
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
          {errors.email && <p className="mt-1 text-xs text-red-700">{errors.email}</p>}
        </div>

        <CampoClave
          name="password"
          label="Contraseña"
          autoComplete="current-password"
          error={errors.password}
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
        <KeyRound className="size-4" />
        Olvidé mi contraseña · Entrar con código
      </button>

      <p className="mt-4 text-center text-sm text-muted">
        ¿No tienes cuenta?{" "}
        <Link
          href="/registro"
          className="font-medium text-brand-700 underline underline-offset-4"
        >
          Crear una
        </Link>
      </p>

      <p className="mt-4 text-xs leading-relaxed text-muted">
        La primera vez que entras desde un dispositivo te pedimos un código de
        seis dígitos que mandamos a tu correo. Después, en ese mismo dispositivo,
        basta con la contraseña.
      </p>
    </form>
  );
}
