"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe, Loader2, Mail, MessageCircle, Phone, Send, Trash2, X } from "lucide-react";
import {
  cambiarEstadoProspectos,
  eliminarProspectos,
  enviarLote,
  idsDelFiltro,
} from "./actions";
import {
  ENCAJES,
  ESTADOS,
  POR_LOTE,
  TEXTOS,
  enlaceDeWhatsApp,
  rellenar,
  type EstadoProspecto,
  type Prospecto,
  type TipoCampana,
} from "@/lib/prospectos";
import type { FiltrosProspectos } from "@/lib/repo";

/**
 * La lista de prospectos, con selección en bloque y el editor del correo.
 *
 * Se elige de dos formas: marcando filas de esta página, o «todos los N del
 * filtro», que pide los `id` al servidor y no depende de la página en que se
 * esté. El envío va por lotes (`POR_LOTE`) para poder enseñar el avance y para
 * que ninguna llamada se acerque al tiempo máximo de una función.
 *
 * La llave de la campaña (`campana.current`) se genera al primer envío y se
 * conserva hasta que cambie el texto: si la conexión se corta a la mitad y se
 * vuelve a pulsar «Enviar», el servidor salta a quienes ya les llegó.
 */
export function TablaProspectos({
  filas,
  total,
  filtros,
  sitio,
  correoListo,
}: {
  filas: Prospecto[];
  total: number;
  filtros: FiltrosProspectos;
  sitio: string;
  correoListo: boolean;
}) {
  const router = useRouter();
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [todosDelFiltro, setTodosDelFiltro] = useState(false);
  const [editor, setEditor] = useState(false);
  const [tipo, setTipo] = useState<TipoCampana>("invitacion");
  const [asunto, setAsunto] = useState(TEXTOS.invitacion.asunto);
  const [cuerpo, setCuerpo] = useState(TEXTOS.invitacion.cuerpo);
  const [avance, setAvance] = useState<{ hechos: number; de: number } | null>(null);
  const [resultado, setResultado] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const campana = useRef<string | null>(null);

  const elegidos = todosDelFiltro ? total : marcados.size;
  const visiblesElegidas = filas.filter((f) => todosDelFiltro || marcados.has(f.id));
  const alcanzables = visiblesElegidas.filter((f) => f.correo && !f.bajaAt && f.estado !== "descartado").length;
  const ejemplo = visiblesElegidas.find((f) => f.correo) ?? filas[0];

  const todaLaPagina = filas.length > 0 && filas.every((f) => marcados.has(f.id));

  function alternar(id: string) {
    setTodosDelFiltro(false);
    setMarcados((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function cambiarTexto(cambio: () => void) {
    cambio();
    campana.current = null;
    setResultado(null);
  }

  async function idsElegidos(): Promise<string[]> {
    return todosDelFiltro ? idsDelFiltro(filtros) : [...marcados];
  }

  function enviar() {
    setResultado(null);
    iniciar(async () => {
      const ids = await idsElegidos();
      if (ids.length === 0) return;
      campana.current ??= crypto.randomUUID();
      let enviados = 0;
      let omitidos = 0;
      let fallidos = 0;
      setAvance({ hechos: 0, de: ids.length });
      for (let i = 0; i < ids.length; i += POR_LOTE) {
        const r = await enviarLote({
          campanaId: campana.current,
          tipo,
          asunto,
          cuerpo,
          ids: ids.slice(i, i + POR_LOTE),
        });
        if (!r.ok) {
          setResultado({ tipo: "error", texto: r.error });
          setAvance(null);
          router.refresh();
          return;
        }
        enviados += r.enviados;
        omitidos += r.omitidos;
        fallidos += r.fallidos;
        setAvance({ hechos: Math.min(i + POR_LOTE, ids.length), de: ids.length });
        if (r.tope) {
          setResultado({
            tipo: "error",
            texto: `Se llegó al tope de correos de hoy después de ${enviados}. Mañana vuelve a pulsar «Enviar» con el mismo texto: se salta a quienes ya les llegó.`,
          });
          setAvance(null);
          router.refresh();
          return;
        }
      }
      setAvance(null);
      setResultado({
        tipo: fallidos ? "error" : "ok",
        texto: `Enviados: ${enviados}.${omitidos ? ` Se saltaron ${omitidos} (sin correo, con baja, descartados o ya enviados).` : ""}${fallidos ? ` No salieron ${fallidos}: vuelve a pulsar «Enviar» para reintentar solo esos.` : ""}`,
      });
      router.refresh();
    });
  }

  function marcarComo(estado: EstadoProspecto) {
    iniciar(async () => {
      const r = await cambiarEstadoProspectos(await idsElegidos(), estado);
      setResultado(r.ok ? { tipo: "ok", texto: `${r.cambiados} marcados.` } : { tipo: "error", texto: r.error });
      router.refresh();
    });
  }

  function eliminar() {
    if (!window.confirm(`¿Eliminar ${elegidos} prospectos? Los que pidieron la baja se conservan.`)) return;
    iniciar(async () => {
      const r = await eliminarProspectos(await idsElegidos());
      setResultado(r.ok ? { tipo: "ok", texto: `${r.eliminados} eliminados.` } : { tipo: "error", texto: r.error });
      setMarcados(new Set());
      setTodosDelFiltro(false);
      router.refresh();
    });
  }

  const vistaPrevia = useMemo(
    () => (ejemplo ? { asunto: rellenar(asunto, ejemplo), cuerpo: rellenar(cuerpo, ejemplo) } : null),
    [ejemplo, asunto, cuerpo],
  );

  return (
    <section className="mt-6">
      {/* Barra de selección */}
      <div className="sticky top-16 z-10 flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 text-sm ring-1 ring-hairline">
        <label className="flex items-center gap-2 pl-1">
          <input
            type="checkbox"
            checked={todaLaPagina}
            onChange={() => {
              setTodosDelFiltro(false);
              setMarcados(todaLaPagina ? new Set() : new Set(filas.map((f) => f.id)));
            }}
            className="size-4"
            aria-label="Elegir todos los de esta página"
          />
          {elegidos > 0 ? `${elegidos} elegidos` : `${total} en este filtro`}
        </label>
        {todaLaPagina && !todosDelFiltro && total > filas.length && (
          <button type="button" onClick={() => setTodosDelFiltro(true)} className="font-medium text-brand-700 underline">
            Elegir los {total} del filtro
          </button>
        )}
        {elegidos > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setEditor(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-700 px-4 py-1.5 font-semibold text-white hover:bg-brand-800"
            >
              <Send className="size-4" aria-hidden />
              Escribir correo
            </button>
            <select
              value=""
              onChange={(e) => e.target.value && marcarComo(e.target.value as EstadoProspecto)}
              disabled={pendiente}
              aria-label="Marcar los elegidos como"
              className="rounded-full border border-control bg-white px-3 py-1.5"
            >
              <option value="">Marcar como…</option>
              {Object.entries(ESTADOS).map(([valor, e]) => (
                <option key={valor} value={valor}>
                  {e.texto}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={eliminar}
              disabled={pendiente}
              className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-muted ring-1 ring-hairline hover:text-red-700"
            >
              <Trash2 className="size-4" aria-hidden />
              Eliminar
            </button>
          </div>
        )}
      </div>

      {resultado && !editor && (
        <p role="status" className={`mt-3 text-sm ${resultado.tipo === "ok" ? "text-brand-700" : "text-red-700"}`}>
          {resultado.texto}
        </p>
      )}

      {/* Editor del correo */}
      {editor && (
        <div className="mt-4 rounded-xl bg-white p-5 ring-1 ring-brand-300">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display text-xl text-ink">Correo a {elegidos} {elegidos === 1 ? "empresa" : "empresas"}</h2>
            <button type="button" onClick={() => setEditor(false)} aria-label="Cerrar el editor" className="text-muted hover:text-ink">
              <X className="size-5" />
            </button>
          </div>

          <fieldset className="mt-3 flex flex-wrap gap-4 text-sm" disabled={pendiente}>
            <legend className="sr-only">Qué mandas</legend>
            {(["invitacion", "noticia"] as const).map((t) => (
              <label key={t} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="tipo"
                  checked={tipo === t}
                  onChange={() =>
                    cambiarTexto(() => {
                      setTipo(t);
                      setAsunto(TEXTOS[t].asunto);
                      setCuerpo(TEXTOS[t].cuerpo);
                    })
                  }
                  className="size-4"
                />
                {t === "invitacion" ? "Invitación a vender (lleva el botón para darse de alta)" : "Noticia"}
              </label>
            ))}
          </fieldset>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">Asunto</span>
                <input
                  value={asunto}
                  maxLength={160}
                  onChange={(e) => cambiarTexto(() => setAsunto(e.target.value))}
                  className="w-full rounded-lg border border-control bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">Mensaje</span>
                <textarea
                  value={cuerpo}
                  rows={12}
                  maxLength={8000}
                  onChange={(e) => cambiarTexto(() => setCuerpo(e.target.value))}
                  className="w-full rounded-lg border border-control bg-white px-3 py-2 text-sm"
                />
              </label>
              <p className="text-xs text-muted">
                {"{empresa}"} y {"{ciudad}"} se cambian por los de cada una. El pie
                con el enlace de baja y de dónde sacamos su correo lo pone el
                sistema; la respuesta llega al correo de contacto de Seregenera.
              </p>
            </div>

            {vistaPrevia && (
              <div className="rounded-lg bg-sand p-4 text-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Así le llega a {ejemplo?.nombre}</p>
                <p className="mt-2 font-semibold text-ink">{vistaPrevia.asunto}</p>
                <div className="mt-2 whitespace-pre-line text-ink">{vistaPrevia.cuerpo}</div>
                {tipo === "invitacion" && (
                  <p className="mt-3 inline-block rounded-full bg-brand-700 px-4 py-1.5 text-xs font-semibold text-white">
                    Publicar mis productos
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={enviar}
              disabled={pendiente || !correoListo}
              className="inline-flex items-center gap-2 rounded-full bg-brand-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
            >
              {pendiente && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {avance ? `Enviando ${avance.hechos} de ${avance.de}…` : `Enviar`}
            </button>
            <span className="text-xs text-muted">
              {todosDelFiltro
                ? `Hasta ${total}: se salta a quien no tiene correo, pidió la baja o está descartado.`
                : `${alcanzables} de ${elegidos} tienen correo y pueden recibirlo.`}
            </span>
          </div>
          {!correoListo && (
            <p className="mt-2 text-xs text-clay-700">
              Faltan las SMTP_* en Vercel: hasta entonces no sale ningún correo.
            </p>
          )}
          {resultado && (
            <p role="status" className={`mt-3 text-sm ${resultado.tipo === "ok" ? "text-brand-700" : "text-red-700"}`}>
              {resultado.texto}
            </p>
          )}
        </div>
      )}

      {/* La lista */}
      {filas.length === 0 ? (
        <p className="mt-6 rounded-xl bg-white p-8 text-center text-muted ring-1 ring-hairline">
          Ningún prospecto con estos filtros. Importa una planilla o agrega uno a mano.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-hairline rounded-xl bg-white ring-1 ring-hairline">
          {filas.map((p) => {
            const whatsapp = enlaceDeWhatsApp(p, sitio);
            return (
              <li key={p.id} className="flex gap-3 p-4 text-sm">
                <input
                  type="checkbox"
                  checked={todosDelFiltro || marcados.has(p.id)}
                  onChange={() => alternar(p.id)}
                  aria-label={`Elegir ${p.nombre}`}
                  className="mt-1 size-4 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{p.nombre}</span>
                    {p.bajaAt ? (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-200">
                        Pidió la baja
                      </span>
                    ) : (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${ESTADOS[p.estado].clase}`}>
                        {ESTADOS[p.estado].texto}
                      </span>
                    )}
                    {p.registrada && (
                      <Link
                        href={`/proveedor/${p.registrada.slug}`}
                        className="rounded-full bg-brand-700 px-2 py-0.5 text-xs font-medium text-white"
                      >
                        Ya está en Seregenera
                      </Link>
                    )}
                    {p.encaje && <span className="text-xs text-muted">Encaje {ENCAJES[p.encaje].toLowerCase()}</span>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {[p.categoria, [p.ciudad, p.departamento].filter(Boolean).join(", "), p.nit && `NIT ${p.nit}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {p.correo && (
                      <a href={`mailto:${p.correo}`} className="flex items-center gap-1 text-brand-700 hover:underline">
                        <Mail className="size-3.5" aria-hidden />
                        {p.correo}
                      </a>
                    )}
                    {p.telefono && (
                      <span className="flex items-center gap-1 text-muted">
                        <Phone className="size-3.5" aria-hidden />
                        {p.telefono}
                      </span>
                    )}
                    {p.sitioWeb && (
                      <a
                        href={/^https?:\/\//i.test(p.sitioWeb) ? p.sitioWeb : `https://${p.sitioWeb}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-brand-700 hover:underline"
                      >
                        <Globe className="size-3.5" aria-hidden />
                        Sitio web
                      </a>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {p.envios > 0
                      ? `${p.envios} ${p.envios === 1 ? "correo" : "correos"}, el último el ${new Date(p.ultimoEnvioAt ?? p.createdAt).toLocaleDateString("es-CO")}`
                      : "Sin correos todavía"}
                    {p.fuente && ` · Fuente: ${p.fuente}`}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {whatsapp && !p.bajaAt && (
                    <a
                      href={whatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        // Abrir el chat no es mandarlo, pero casi siempre lo
                        // es: se anota «Invitado» solo si estaba sin contactar.
                        void cambiarEstadoProspectos([p.id], "invitado", "nuevo").then(() => router.refresh());
                      }}
                      className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-control hover:bg-sand"
                    >
                      <MessageCircle className="size-3.5" aria-hidden />
                      WhatsApp
                    </a>
                  )}
                  <select
                    value={p.estado}
                    disabled={pendiente}
                    onChange={(e) =>
                      iniciar(async () => {
                        await cambiarEstadoProspectos([p.id], e.target.value);
                        router.refresh();
                      })
                    }
                    aria-label={`Estado de ${p.nombre}`}
                    className="rounded-full border border-control bg-white px-2 py-1 text-xs"
                  >
                    {Object.entries(ESTADOS).map(([valor, e]) => (
                      <option key={valor} value={valor}>
                        {e.texto}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
