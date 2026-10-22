"use client";

import { useState, useTransition } from "react";
import { Loader2, Store } from "lucide-react";
import { cerrarMiEmpresa } from "./actions";
import { Tarjeta } from "@/components/tarjeta";

/**
 * Cerrar la empresa, al final de «Tu empresa».
 *
 * Cerrado por defecto por lo mismo que «Eliminar tu cuenta»: es lo último que
 * alguien viene a hacer aquí. Se confirma escribiendo el nombre de la empresa,
 * que es lo que se usa para lo que no se puede deshacer y afecta a algo más
 * grande que un clic: sus ofertas salen del catálogo para todos.
 *
 * Si se puede o no lo decide la base (`cerrar_mi_empresa()`, 0021): solo la
 * dueña, y nunca con pedidos o cotizaciones pendientes.
 *
 * Centrada y estrecha, debajo de todo, igual que «Eliminar tu cuenta»: a lo
 * ancho de una columna quedaba descolgada al lado de un hueco. Al abrirla, lo
 * que hay que leer va alineado a la izquierda.
 */
export function CerrarEmpresa({ nombre }: { nombre: string }) {
  const [abierto, setAbierto] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendiente, iniciar] = useTransition();

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(e.currentTarget));
    iniciar(async () => {
      // Si sale bien, la acción vuelve a esta misma página, ya sin empresa.
      const r = await cerrarMiEmpresa(datos);
      setErrors(r.errors);
    });
  }

  return (
    <Tarjeta i={5} className="mx-auto w-full max-w-xl text-center">
      <h2 className="font-display text-xl text-ink">Cerrar la empresa</h2>

      {!abierto ? (
        <>
          <p className="mt-1 text-sm text-muted">
            Saca a {nombre} de Seregenera, con todas sus ofertas.
          </p>
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-200 transition hover:bg-red-50"
          >
            <Store className="size-4" aria-hidden />
            Quiero cerrar la empresa
          </button>
        </>
      ) : (
        <form method="post" onSubmit={enviar} className="mt-3 space-y-4 text-left">
          <div className="rounded-lg bg-sand p-4 text-sm text-ink">
            <p className="font-medium">Si la cierras:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
              <li>Sale del sitio con todas sus ofertas, y nadie podrá comprarle.</li>
              <li>
                Si ya vendió algo, guardamos sus ventas, porque la ley contable nos
                obliga. Si nunca vendió, la borramos con sus ofertas y sus fotos.
              </li>
              <li>
                Si ya vendió, queda ligada a su documento tributario: si la das
                de alta otra vez con el mismo, vuelve como la dejaste, con su
                nivel, sus puntos y sus reseñas.
              </li>
              <li>
                Con pedidos o cotizaciones sin terminar no se puede: primero se
                entregan, se responden o se cancelan.
              </li>
            </ul>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">
              Escribe «{nombre}» para confirmar
            </span>
            <input
              name="nombre"
              autoComplete="off"
              aria-invalid={errors.nombre ? true : undefined}
              className={`w-full rounded-lg border bg-white px-3 py-2 text-sm ${errors.nombre ? "border-red-600" : "border-control"}`}
            />
            {errors.nombre && <span className="mt-1 block text-xs text-red-700">{errors.nombre}</span>}
          </label>

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
              Cerrar la empresa
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
    </Tarjeta>
  );
}
