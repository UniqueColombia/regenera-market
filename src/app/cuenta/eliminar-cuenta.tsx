"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { eliminarMiCuenta } from "./actions";
import { CampoClave } from "@/components/campo-clave";

/**
 * Eliminar la cuenta, al final de «Tu cuenta».
 *
 * Cerrado por defecto: es lo último que alguien viene a hacer aquí, y un botón
 * rojo a la vista entre la contraseña y los pedidos se pulsa sin querer. Al
 * abrirlo dice antes que nada qué se borra y qué se queda, y pide la
 * contraseña y una casilla: es lo único de la cuenta que no se puede deshacer.
 *
 * Quién puede y quién no lo decide la base (`preparar_baja_de_cuenta()`, 0021);
 * aquí solo se le dice al administrador por qué no le sirve, para no hacerle
 * escribir la contraseña en vano.
 */
export function EliminarCuenta({ esAdmin, conEmpresa }: { esAdmin: boolean; conEmpresa: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendiente, iniciar] = useTransition();

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(e.currentTarget));
    iniciar(async () => {
      // Si sale bien, la acción redirige a la portada y esto no vuelve.
      const r = await eliminarMiCuenta(datos);
      setErrors(r.errors);
    });
  }

  return (
    <section className="rounded-xl bg-white p-5 ring-1 ring-hairline">
      <h2 className="font-display text-xl text-ink">Eliminar tu cuenta</h2>

      {!abierto ? (
        <>
          <p className="mt-1 text-sm text-muted">
            Borra tu perfil y lo que publicaste. No se puede deshacer.
          </p>
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-200 transition hover:bg-red-50"
          >
            <Trash2 className="size-4" aria-hidden />
            Quiero eliminar mi cuenta
          </button>
        </>
      ) : esAdmin ? (
        <p className="mt-2 text-sm text-ink">
          Eres administrador de Seregenera. Pídele a otro administrador que te
          quite el rol en{" "}
          <Link href="/admin/usuarios" className="font-medium text-brand-700 underline">
            Usuarios
          </Link>{" "}
          y después podrás eliminar tu cuenta desde aquí.
        </p>
      ) : (
        <form onSubmit={enviar} className="mt-3 space-y-4">
          <div className="rounded-lg bg-sand p-4 text-sm text-ink">
            <p className="font-medium">Si la eliminas:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
              <li>Borramos tu perfil, tu foto, tus dispositivos de confianza, lo que publicaste en la Comunidad y tus reseñas.</li>
              {conEmpresa && (
                <li>
                  Si eres la única persona de tu empresa, la cerramos también: si ya vendió, sale del sitio y guardamos sus ventas; si no, la borramos.
                </li>
              )}
              <li>
                Tus pedidos se conservan sin tu cuenta, con el nombre y el correo con los que compraste: la ley contable nos obliga a guardarlos.
              </li>
              <li>Si tienes pedidos o cotizaciones sin terminar, primero tienen que completarse o cancelarse.</li>
            </ul>
          </div>

          <CampoClave name="clave" label="Tu contraseña" autoComplete="current-password" error={errors.clave} />

          <label className="flex items-start gap-2 text-sm text-ink">
            <input type="checkbox" name="entiendo" className="mt-0.5 size-4" />
            <span>Entiendo que no se puede deshacer.</span>
          </label>
          {errors.entiendo && <p className="-mt-2 text-xs text-red-700">{errors.entiendo}</p>}

          {errors.form && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
              {errors.form}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pendiente}
              className="inline-flex items-center gap-2 rounded-full bg-red-700 px-5 py-2.5 text-sm font-semibold text-red-50 transition hover:bg-red-800 disabled:opacity-50"
            >
              {pendiente && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Eliminar mi cuenta
            </button>
            <button
              type="button"
              onClick={() => {
                setAbierto(false);
                setErrors({});
              }}
              className="text-sm font-medium text-muted hover:text-ink"
            >
              Mejor no
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
