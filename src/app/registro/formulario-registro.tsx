"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { registrarse } from "../entrar/actions";
import { CampoClave } from "@/components/campo-clave";
import { CampoTelefono } from "@/components/campo-telefono";
import { PasoCodigo } from "@/components/paso-codigo";

/**
 * Crear cuenta: nombre, apellido, teléfono, correo y contraseña; después, el
 * código que confirma que el correo es suyo.
 *
 * **El correo y el nombre se guardan en estado a medida que se escriben**, y no
 * es un capricho: `CampoClave` los necesita para rechazar la contraseña que los
 * contiene. Una clave que es el propio correo con una mayúscula no protege de
 * nadie que haya visto el correo — que es exactamente quien ataca la cuenta.
 *
 * El teléfono se pide aquí y no después porque un pedido que hay que coordinar
 * (una experiencia con fecha, una entrega) se resuelve por teléfono, y pedirlo
 * en el momento de la urgencia es tarde. Se guarda en `profiles.phone` en E.164.
 */
export function FormularioRegistro({ volver }: { volver?: string }) {
  const router = useRouter();
  const [paso, setPaso] = useState<"datos" | "codigo">("datos");
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendiente, iniciar] = useTransition();

  const destino = volver && volver.startsWith("/") && !volver.startsWith("//") ? volver : "/";

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(e.currentTarget));
    iniciar(async () => {
      const r = await registrarse(datos);
      if (!r.ok) {
        setErrors(r.errors);
        return;
      }
      setErrors({});

      // Con la confirmación de correo desactivada en el panel, `signUp` ya deja
      // la sesión abierta y no hay código que pedir. Se pasa igual por la
      // pantalla de bienvenida: el resultado es el mismo —la cuenta quedó
      // activa— y decirlo en los dos caminos evita que el registro termine en
      // una portada que no explica qué pasó.
      if (!r.requiereCodigo) {
        router.refresh();
        router.push(`/registro/listo?volver=${encodeURIComponent(destino)}`);
        return;
      }

      setPaso("codigo");
    });
  }

  if (paso === "codigo") {
    return (
      <PasoCodigo
        email={email}
        volver={volver}
        origen="registro"
        onCambiarCorreo={() => {
          setPaso("datos");
          setErrors({});
        }}
      />
    );
  }

  return (
    <form onSubmit={enviar} className="mt-8">
      <fieldset className="space-y-4" disabled={pendiente}>
        <legend className="sr-only">Datos de la cuenta</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="nombre" className="mb-1 block text-xs font-medium text-muted">
              Nombre
            </label>
            <input
              id="nombre"
              name="nombre"
              autoComplete="given-name"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              aria-invalid={errors.nombre ? true : undefined}
              className={`w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 ${
                errors.nombre ? "border-red-500" : "border-control"
              }`}
            />
            {errors.nombre && <p className="mt-1 text-xs text-red-700">{errors.nombre}</p>}
          </div>

          <div>
            <label htmlFor="apellido" className="mb-1 block text-xs font-medium text-muted">
              Apellido
            </label>
            <input
              id="apellido"
              name="apellido"
              autoComplete="family-name"
              required
              value={apellido}
              onChange={(e) => setApellido(e.target.value)}
              aria-invalid={errors.apellido ? true : undefined}
              className={`w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 ${
                errors.apellido ? "border-red-500" : "border-control"
              }`}
            />
            {errors.apellido && (
              <p className="mt-1 text-xs text-red-700">{errors.apellido}</p>
            )}
          </div>
        </div>

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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={errors.email ? true : undefined}
            className={`w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 ${
              errors.email ? "border-red-500" : "border-control"
            }`}
          />
          {errors.email && <p className="mt-1 text-xs text-red-700">{errors.email}</p>}
        </div>

        <CampoTelefono error={errors.telefono ?? errors.pais} />

        <CampoClave
          name="password"
          label="Contraseña"
          autoComplete="new-password"
          error={errors.password}
          mostrarFuerza
          contexto={[email, nombre, apellido]}
          ayuda="Al menos 10 caracteres. Tres o cuatro palabras sueltas funcionan mejor que símbolos."
        />

        <CampoClave
          name="password2"
          label="Repite la contraseña"
          autoComplete="new-password"
          error={errors.password2}
        />

        <div>
          <label className="flex items-start gap-2.5 text-sm text-muted">
            <input
              type="checkbox"
              name="acepto"
              className="mt-0.5 size-4 shrink-0 rounded border-control text-brand-700 focus:ring-brand-500"
            />
            <span>
              Acepto que Seregenera use mis datos para gestionar mis pedidos y
              contactarme sobre ellos.
            </span>
          </label>
          {errors.acepto && <p className="mt-1 text-xs text-red-700">{errors.acepto}</p>}
        </div>
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
        Crear mi cuenta
      </button>

      <p className="mt-4 text-center text-sm text-muted">
        ¿Ya tienes cuenta?{" "}
        <Link
          href="/entrar"
          className="font-medium text-brand-700 underline underline-offset-4"
        >
          Entrar
        </Link>
      </p>

      <p className="mt-4 text-xs leading-relaxed text-muted">
        Te mandaremos un código de seis dígitos para confirmar tu correo. Después
        entrarás con tu contraseña, y solo te pediremos el código cuando entres
        desde un dispositivo nuevo.
      </p>
    </form>
  );
}
