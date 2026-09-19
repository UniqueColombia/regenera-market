"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft, Loader2, MailCheck, RefreshCw } from "lucide-react";
import { pedirCodigo, verificarCodigo } from "@/app/entrar/actions";

/**
 * Segundo paso de todo: escribir el código de seis dígitos que llegó al correo.
 *
 * Lo usan `/entrar` (aparato nuevo, o acceso sin contraseña) y `/registro`
 * (confirmar el correo). Es el mismo paso, así que vive en `src/components/` y
 * no junto a una de las dos rutas: dos copias se desincronizan en cuanto alguien
 * arregla un mensaje en una.
 *
 * **Qué pasa después de verificar, y por qué se decide aquí.** Si la cuenta no
 * tiene contraseña —las que nacieron cuando el acceso era solo por código, y las
 * que crea un administrador— se manda a `/cuenta/clave` en vez de a la portada.
 * Ponerse contraseña deja de ser una tarea que alguien tiene que acordarse de
 * hacer.
 *
 * **Salvo cuando se viene del registro, y esa excepción es el motivo de que
 * exista `origen`.** Quien acaba de crear su cuenta ya eligió contraseña dos
 * pantallas antes; mandarlo a `/cuenta/clave` le pide por segunda vez lo mismo
 * que acaba de dar, y lo único que comunica es que la primera no sirvió de nada.
 * Desde el registro, verificar el código termina en `/registro/listo`, que dice
 * que la cuenta quedó activa. El camino de `/entrar` no cambia.
 */
export function PasoCodigo({
  email,
  volver,
  nota,
  origen = "acceso",
  onCambiarCorreo,
}: {
  email: string;
  /** A dónde ir después de entrar. Viene de `?volver=` que pone `requireUser`. */
  volver?: string;
  /** Explica por qué se está pidiendo el código, cuando no es lo de siempre. */
  nota?: React.ReactNode;
  /** De dónde se llega. Decide a dónde se va al verificar — ver la cabecera. */
  origen?: "acceso" | "registro";
  /** Vuelve al primer paso. Si no se pasa, no se ofrece el botón. */
  onCambiarCorreo?: () => void;
}) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reenviado, setReenviado] = useState(false);
  const [pendiente, iniciar] = useTransition();

  const destino = volver && volver.startsWith("/") && !volver.startsWith("//") ? volver : "/";

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(e.currentTarget));
    iniciar(async () => {
      const r = await verificarCodigo({ ...datos, email });
      if (!r.ok) {
        setErrors(r.errors);
        return;
      }
      // `refresh()` antes de navegar: el encabezado se pinta en el servidor y
      // sin esto seguiría diciendo "Entrar" con la sesión ya abierta.
      router.refresh();

      if (origen === "registro") {
        // `necesitaClave` se ignora a propósito: quien viene del registro acaba
        // de ponerla. Si la marca `tiene_clave` no llegó a los metadatos, el
        // sitio se lo pedirá la próxima vez que entre a algo que exija sesión
        // (`requireUser`), no en la pantalla de bienvenida.
        router.push(`/registro/listo?volver=${encodeURIComponent(destino)}`);
        return;
      }

      router.push(
        r.necesitaClave
          ? `/cuenta/clave?volver=${encodeURIComponent(destino)}`
          : destino,
      );
    });
  }

  function reenviar() {
    iniciar(async () => {
      const r = await pedirCodigo({ email });
      setReenviado(r.ok);
      if (!r.ok) setErrors(r.errors);
    });
  }

  return (
    <form onSubmit={enviar} className="mt-8">
      <div className="flex items-start gap-3 rounded-xl bg-brand-50 p-4 ring-1 ring-brand-100">
        <MailCheck className="mt-0.5 size-5 shrink-0 text-brand-700" />
        <p className="text-sm text-brand-800">
          Te mandamos un código de seis dígitos a{" "}
          <strong className="font-semibold">{email}</strong>. Puede tardar un
          minuto y a veces cae en correo no deseado.
          {nota}
        </p>
      </div>

      <div className="mt-5">
        <label htmlFor="token" className="mb-1 block text-xs font-medium text-muted">
          Código de seis dígitos
        </label>
        <input
          id="token"
          name="token"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          // Diez dígitos es el máximo que Supabase puede emitir, más margen para
          // los espacios con que llega pegado desde el correo (el servidor los
          // quita). Un `maxLength` justo cortaría el código antes de terminar de
          // teclearlo si alguien sube el ajuste del panel.
          maxLength={14}
          aria-invalid={errors.token ? true : undefined}
          className={`w-full rounded-lg border bg-white px-3 py-3 text-center font-display text-2xl tracking-[0.4em] tabular-nums outline-none transition focus:border-brand-500 ${
            errors.token ? "border-red-500" : "border-control"
          }`}
        />
        {errors.token && <p className="mt-1 text-xs text-red-700">{errors.token}</p>}
      </div>

      {errors.form && <p className="mt-3 text-sm text-red-700">{errors.form}</p>}

      <button
        type="submit"
        disabled={pendiente}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-brand-700 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:bg-muted"
      >
        {pendiente && <Loader2 className="size-4 animate-spin" />}
        Verificar y entrar
      </button>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
        <button
          type="button"
          onClick={reenviar}
          disabled={pendiente}
          className="flex items-center gap-1.5 rounded-full px-3 py-2 text-muted transition hover:bg-sand hover:text-brand-700 disabled:opacity-40"
        >
          <RefreshCw className="size-4" />
          {reenviado ? "Te mandamos otro" : "No me llegó"}
        </button>

        {onCambiarCorreo && (
          <button
            type="button"
            onClick={onCambiarCorreo}
            className="flex items-center gap-1.5 rounded-full px-3 py-2 text-muted transition hover:bg-sand hover:text-brand-700"
          >
            <ArrowLeft className="size-4" />
            Usar otro correo
          </button>
        )}
      </div>
    </form>
  );
}
