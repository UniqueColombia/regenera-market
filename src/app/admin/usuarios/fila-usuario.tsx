"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Link2, Loader2, ShieldCheck, Store, Unlink } from "lucide-react";
import { cambiarRol, desenlazarProveedor, enlazarProveedor } from "./actions";
import type { AdminUsuario } from "@/lib/types";

export interface EmpresaOpcion {
  id: string;
  name: string;
}

export interface VinculoVisible {
  providerId: string;
  providerName: string;
}

/**
 * Una fila de la tabla de usuarios, con sus interruptores.
 *
 * Isla de cliente: la lista se pinta en el servidor y solo esto viaja al
 * navegador. Toda la validación real la hacen las Server Actions y, detrás,
 * RLS — los botones solo deciden qué se ofrece.
 *
 * **El interruptor de administración pide confirmación y el de proveedor no.**
 * No es inconsistencia: dar administración entrega el control de la plataforma,
 * incluida la capacidad de quitártela. Dar proveedor deja publicar ofertas que
 * un administrador puede retirar.
 */
export function FilaUsuario({
  usuario,
  empresas,
  vinculos,
  esYo,
}: {
  usuario: AdminUsuario;
  empresas: EmpresaOpcion[];
  vinculos: VinculoVisible[];
  /** El propio administrador que está mirando: no se le ofrece degradarse. */
  esYo: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [empresa, setEmpresa] = useState("");
  const [pendiente, iniciar] = useTransition();

  const esAdmin = usuario.roles.includes("admin");
  const esProveedor = usuario.roles.includes("provider");

  function correr(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    iniciar(async () => {
      const r = await fn();
      if (r.ok) {
        setError(null);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  function alternarAdmin() {
    const aviso = esAdmin
      ? `¿Quitarle la administración a ${usuario.email}?`
      : `¿Dar administración a ${usuario.email}? Podrá aprobar proveedores, publicar ofertas, confirmar pagos y cambiar roles — incluido el tuyo.`;
    if (!window.confirm(aviso)) return;
    correr(() => cambiarRol({ userId: usuario.id, role: "admin", conceder: !esAdmin }));
  }

  return (
    <li className="rounded-xl bg-white p-4 ring-1 ring-hairline">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink">{usuario.fullName || "Sin nombre"}</span>
            {esAdmin && (
              <span className="flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 ring-1 ring-brand-200">
                <ShieldCheck className="size-3" />
                admin
              </span>
            )}
            {esProveedor && (
              <span className="flex items-center gap-1 rounded-full bg-sand px-2 py-0.5 text-xs font-medium text-muted ring-1 ring-hairline">
                <Store className="size-3" />
                proveedor
              </span>
            )}
            {esYo && (
              <span className="rounded-full bg-sand px-2 py-0.5 text-xs font-medium text-muted ring-1 ring-hairline">
                tú
              </span>
            )}
          </p>

          <p className="mt-0.5 truncate text-sm text-muted">{usuario.email}</p>
          <p className="mt-0.5 text-xs text-muted">
            {usuario.phone ? `${usuario.phone} · ` : ""}
            se registró el {usuario.createdAt.slice(0, 10)}
            {usuario.lastSignInAt
              ? ` · última entrada el ${usuario.lastSignInAt.slice(0, 10)}`
              : " · nunca ha entrado"}
            {!usuario.emailConfirmedAt && " · correo sin confirmar"}
          </p>

          {vinculos.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {vinculos.map((v) => (
                <li key={v.providerId}>
                  <button
                    type="button"
                    disabled={pendiente}
                    onClick={() =>
                      correr(() =>
                        desenlazarProveedor({
                          userId: usuario.id,
                          providerId: v.providerId,
                        }),
                      )
                    }
                    aria-label={`Quitar el vínculo con ${v.providerName}`}
                    className="flex items-center gap-1 rounded-full bg-sand px-2 py-0.5 text-xs text-muted ring-1 ring-hairline transition hover:text-red-700 disabled:opacity-40"
                  >
                    {v.providerName}
                    <Unlink className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {pendiente && <Loader2 className="size-4 animate-spin text-muted" />}
          {!esYo && (
            <button
              type="button"
              disabled={pendiente}
              onClick={alternarAdmin}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
                esAdmin
                  ? "text-muted ring-1 ring-control hover:bg-sand hover:text-red-700"
                  : "bg-brand-700 text-white hover:bg-brand-800"
              }`}
            >
              {esAdmin ? "Quitar administración" : "Hacer administrador"}
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
        <label htmlFor={`empresa-${usuario.id}`} className="text-xs text-muted">
          Enlazar con una empresa:
        </label>
        <select
          id={`empresa-${usuario.id}`}
          value={empresa}
          onChange={(e) => setEmpresa(e.target.value)}
          className="rounded-lg border border-control bg-white px-2 py-1.5 text-xs outline-none transition focus:border-brand-500"
        >
          <option value="">Elige…</option>
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={pendiente || !empresa}
          onClick={() =>
            correr(() => enlazarProveedor({ userId: usuario.id, providerId: empresa }))
          }
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-control transition hover:bg-sand disabled:opacity-40"
        >
          <Link2 className="size-3.5" />
          Enlazar
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </li>
  );
}
