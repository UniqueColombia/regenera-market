"use client";

import { useState, useTransition } from "react";
import { CalendarPlus, Check, Loader2, Trash2 } from "lucide-react";
import { hoyEnBogota } from "@/lib/envios";
import {
  DIAS_HACIA_ADELANTE,
  MAX_CUPO,
  sumarDias,
  type FechasDeOferta,
  type ModoFechas,
  type ResultadoGuardarFechas,
} from "@/lib/fechas";
import { shortDate } from "@/lib/format";
import { Tarjeta } from "./tarjeta";

interface Fila {
  /** Para React: la fecha de una fila nueva todavía puede estar vacía. */
  clave: string;
  date: string;
  total: string;
  tomados: number;
  /** Ya está en la base: su fecha no se cambia, se quita y se abre otra. */
  guardada: boolean;
}

function filasDe(f: FechasDeOferta): Fila[] {
  return f.fechas.map((x) => ({
    clave: x.date,
    date: x.date,
    total: String(x.total),
    tomados: x.tomados,
    guardada: true,
  }));
}

/**
 * Quién elige la fecha de una experiencia y, si la abre quien la organiza, con
 * cuánto cupo. Las reglas viven en `src/lib/fechas.ts`.
 *
 * Va fuera de `FormularioOferta` y con su propio botón porque se guarda aparte:
 * el formulario devuelve a revisión una oferta publicada, y abrir una fecha no
 * tiene por qué sacarla del catálogo.
 */
export function FechasDeExperiencia({
  inicial,
  guardar,
  esEmpresa = false,
}: {
  inicial: FechasDeOferta;
  guardar: (plan: unknown) => Promise<ResultadoGuardarFechas>;
  esEmpresa?: boolean;
}) {
  const [modo, setModo] = useState<ModoFechas>(inicial.modo);
  const [filas, setFilas] = useState<Fila[]>(() => filasDe(inicial));
  const [errores, setErrores] = useState<string[]>([]);
  const [guardado, setGuardado] = useState(false);
  const [pendiente, iniciar] = useTransition();

  const hoy = hoyEnBogota();
  const ultimo = sumarDias(hoy, DIAS_HACIA_ADELANTE);
  const reservadas = filas.reduce((s, f) => s + f.tomados, 0);

  function cambiar(clave: string, cambio: Partial<Fila>) {
    setGuardado(false);
    setFilas((fs) => fs.map((f) => (f.clave === clave ? { ...f, ...cambio } : f)));
  }

  function agregar() {
    setGuardado(false);
    // El cupo de la última, que casi siempre es el mismo.
    setFilas((fs) => [
      ...fs,
      { clave: crypto.randomUUID(), date: "", total: fs.at(-1)?.total ?? "", tomados: 0, guardada: false },
    ]);
  }

  function enviar() {
    setErrores([]);
    setGuardado(false);
    const plan =
      modo === "cliente"
        ? { modo }
        : { modo, fechas: filas.map((f) => ({ date: f.date, total: f.total })) };
    iniciar(async () => {
      const r = await guardar(plan);
      if (r.fechas) {
        setModo(r.fechas.modo);
        setFilas(filasDe(r.fechas));
      }
      if (r.ok) setGuardado(true);
      else setErrores(r.errores);
    });
  }

  return (
    <div id="fechas" className="mt-8 scroll-mt-24">
      <Tarjeta>
        <fieldset className="space-y-5" disabled={pendiente}>
          <legend className="font-display text-xl text-ink">Fechas y cupos</legend>
          <p className="-mt-2 text-sm text-muted">
            {esEmpresa
              ? "Se guardan aparte: tu experiencia sigue publicada mientras las cambias."
              : "Se guardan aparte del formulario de arriba y no cambian el estado de la oferta."}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Opcion
              activa={modo === "proveedor"}
              onElegir={() => {
                setModo("proveedor");
                setGuardado(false);
                if (filas.length === 0) agregar();
              }}
              titulo="Fechas fijas, con cupo"
              detalle="Abres las fechas y cuántas personas caben en cada una. Quien reserva elige entre ellas."
            />
            <Opcion
              activa={modo === "cliente"}
              onElegir={() => {
                setModo("cliente");
                setGuardado(false);
              }}
              titulo="Quien reserva elige el día"
              detalle={
                esEmpresa
                  ? "Te llega el pedido con el día que la persona necesita y te pones de acuerdo con ella."
                  : "El pedido llega con el día que la persona necesita y la empresa se pone de acuerdo con ella."
              }
            />
          </div>

          {modo === "cliente" && reservadas > 0 && (
            <p className="rounded-xl bg-clay-100 p-3 text-sm text-clay-700">
              Las {reservadas} personas que ya reservaron mantienen su fecha.
            </p>
          )}

          {modo === "proveedor" && (
            <div className="space-y-3">
              {filas.length === 0 && (
                <p className="text-sm text-muted">Agrega la primera fecha.</p>
              )}
              <ul className="space-y-2">
                {filas.map((f) => (
                  <li
                    key={f.clave}
                    className="grid grid-cols-[1fr_6rem_auto] items-end gap-2 rounded-lg bg-sand/60 p-3"
                  >
                    {f.guardada ? (
                      <div>
                        <span className="mb-1 block text-xs font-medium text-muted">Fecha</span>
                        <span className="block py-2 text-sm font-medium text-ink first-letter:uppercase">
                          {shortDate(f.date)}
                        </span>
                      </div>
                    ) : (
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-muted">Fecha</span>
                        <input
                          type="date"
                          min={hoy}
                          max={ultimo}
                          value={f.date}
                          onChange={(e) => cambiar(f.clave, { date: e.target.value })}
                          className={entrada}
                        />
                      </label>
                    )}
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-muted">Cupo</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={Math.max(1, f.tomados)}
                        max={MAX_CUPO}
                        value={f.total}
                        onChange={(e) => cambiar(f.clave, { total: e.target.value })}
                        className={entrada}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setGuardado(false);
                        setFilas((fs) => fs.filter((x) => x.clave !== f.clave));
                      }}
                      disabled={f.tomados > 0}
                      title={f.tomados > 0 ? "Ya tiene reservas" : undefined}
                      aria-label={f.date ? `Quitar el ${shortDate(f.date)}` : "Quitar esta fecha"}
                      className="grid size-10 place-items-center rounded-lg text-muted transition hover:bg-white hover:text-red-700 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted"
                    >
                      <Trash2 className="size-4" />
                    </button>
                    {f.tomados > 0 && (
                      <span className="col-span-3 text-xs text-muted">
                        {f.tomados === 1 ? "1 persona reservada" : `${f.tomados} personas reservadas`}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={agregar}
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-brand-700 ring-1 ring-control transition hover:bg-sand"
              >
                <CalendarPlus className="size-4" />
                Agregar fecha
              </button>
            </div>
          )}

          {errores.length > 0 && (
            <ul role="alert" className="space-y-1 rounded-xl bg-red-50 p-3 text-sm text-red-800">
              {errores.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-5">
            <button
              type="button"
              onClick={enviar}
              className="flex items-center justify-center gap-2 rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:bg-muted"
            >
              {pendiente && <Loader2 className="size-4 animate-spin" />}
              Guardar fechas
            </button>
            {guardado && (
              <span role="status" className="flex items-center gap-1.5 text-sm text-brand-700">
                <Check className="size-4" />
                Guardado
              </span>
            )}
          </div>
        </fieldset>
      </Tarjeta>
    </div>
  );
}

const entrada =
  "w-full rounded-lg border border-control bg-white px-3 py-2 text-base outline-none transition focus:border-brand-500 disabled:bg-sand disabled:text-muted sm:text-sm";

function Opcion({
  activa,
  onElegir,
  titulo,
  detalle,
}: {
  activa: boolean;
  onElegir: () => void;
  titulo: string;
  detalle: string;
}) {
  return (
    <label
      className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition ${
        activa ? "border-brand-600 bg-brand-50" : "border-control hover:border-brand-400"
      }`}
    >
      <input
        type="radio"
        name="modo-fechas"
        checked={activa}
        onChange={onElegir}
        className="mt-0.5 size-4 border-control text-brand-700 focus:ring-brand-500"
      />
      <span>
        <span className="block text-sm font-semibold text-ink">{titulo}</span>
        <span className="mt-1 block text-xs text-muted">{detalle}</span>
      </span>
    </label>
  );
}
