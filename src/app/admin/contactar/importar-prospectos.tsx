"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { importarProspectos } from "./actions";
import { ErrorDeHoja, leerLibro } from "@/lib/hoja-de-calculo";
import { leerPlanillaDeProspectos, type PlanillaDeProspectos } from "@/lib/prospectos";

const POR_TANDA = 300;

/**
 * Subir prospectos desde un Excel o un CSV.
 *
 * Sirve el Excel del prospector (`outputs/prospectos-proveedores-*.xlsx`) tal
 * cual: se leen todas sus hojas con nombre de empresa y algún dato de
 * contacto, y se saltan las de resumen. También cualquier planilla propia con
 * columnas como «Empresa», «Correo», «Teléfono», «Ciudad».
 *
 * Se lee aquí, en el navegador, y se manda por tandas de 300 filas: el
 * archivo nunca viaja entero, que es lo que no cabe en una Server Action.
 */
export function ImportarProspectos() {
  const entrada = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [leida, setLeida] = useState<PlanillaDeProspectos | null>(null);
  const [incluirDescartados, setIncluirDescartados] = useState(false);
  const [incluirSinContacto, setIncluirSinContacto] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  async function leer(f: File, opciones = { incluirDescartados, incluirSinContacto }) {
    setMensaje(null);
    setTrabajando(true);
    try {
      const hojas = await leerLibro(new Uint8Array(await f.arrayBuffer()));
      const r = leerPlanillaDeProspectos(hojas, { ...opciones, fuente: `Planilla ${f.name}` });
      setLeida(r);
      if (r.hojas.length === 0) {
        setMensaje({
          tipo: "error",
          texto: "No encontramos una columna con el nombre de la empresa y otra con correo, teléfono, sitio web o NIT.",
        });
      }
    } catch (e) {
      setLeida(null);
      setMensaje({ tipo: "error", texto: e instanceof ErrorDeHoja ? e.message : "No pudimos leer el archivo." });
    } finally {
      setTrabajando(false);
    }
  }

  async function importar() {
    if (!leida || leida.filas.length === 0) return;
    setTrabajando(true);
    setMensaje(null);
    let nuevos = 0;
    let repetidos = 0;
    let invalidos = 0;
    for (let i = 0; i < leida.filas.length; i += POR_TANDA) {
      const r = await importarProspectos(leida.filas.slice(i, i + POR_TANDA));
      if (!r.ok) {
        setMensaje({ tipo: "error", texto: r.error });
        setTrabajando(false);
        return;
      }
      nuevos += r.nuevos;
      repetidos += r.repetidos;
      invalidos += r.invalidos;
    }
    setMensaje({
      tipo: "ok",
      texto: `Listo: ${nuevos} nuevos${repetidos ? `, ${repetidos} ya estaban` : ""}${invalidos ? `, ${invalidos} con datos que no sirven` : ""}.`,
    });
    setLeida(null);
    setArchivo(null);
    setTrabajando(false);
  }

  return (
    <details className="group rounded-xl bg-white p-5 ring-1 ring-hairline">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-ink">
        <FileSpreadsheet className="size-5 text-brand-600" aria-hidden />
        Importar desde Excel o CSV
      </summary>
      <div className="mt-4 space-y-3 text-sm">
        <p className="text-muted">
          Sirve el Excel del prospector tal cual, o{" "}
          <a href="/api/plantilla-prospectos" className="font-medium text-brand-700 underline">
            descarga el formato en blanco
          </a>{" "}
          y llénalo. Los que ya están (mismo NIT o correo) se saltan sin pisar lo
          que anotaste.
        </p>
        <button
          type="button"
          disabled={trabajando}
          onClick={() => entrada.current?.click()}
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 font-semibold text-brand-700 ring-1 ring-control hover:bg-sand disabled:opacity-50"
        >
          {trabajando && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {archivo ? archivo.name : "Elegir archivo"}
        </button>
        <input
          ref={entrada}
          type="file"
          accept=".xlsx,.csv"
          className="sr-only"
          aria-label="Elegir la planilla de prospectos"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) {
              setArchivo(f);
              void leer(f);
            }
          }}
        />
        <div className="space-y-1">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={incluirDescartados}
              onChange={(e) => {
                setIncluirDescartados(e.target.checked);
                if (archivo) void leer(archivo, { incluirDescartados: e.target.checked, incluirSinContacto });
              }}
              className="size-4"
            />
            Incluir los marcados «descartar» en la columna Encaje
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={incluirSinContacto}
              onChange={(e) => {
                setIncluirSinContacto(e.target.checked);
                if (archivo) void leer(archivo, { incluirDescartados, incluirSinContacto: e.target.checked });
              }}
              className="size-4"
            />
            Incluir los que no tienen correo ni teléfono
          </label>
        </div>
        {leida && leida.filas.length > 0 && (
          <div className="rounded-lg bg-sand p-3">
            <p className="text-ink">
              {leida.filas.length} para importar, de {leida.hojas.length}{" "}
              {leida.hojas.length === 1 ? "hoja" : "hojas"}
              {leida.descartadas > 0 && ` · ${leida.descartadas} descartados se saltan`}
              {leida.sinContacto > 0 && ` · ${leida.sinContacto} sin contacto se saltan`}.
            </p>
            <button
              type="button"
              onClick={importar}
              disabled={trabajando}
              className="mt-2 rounded-full bg-brand-700 px-4 py-2 font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
            >
              Importar {leida.filas.length}
            </button>
          </div>
        )}
        {mensaje && (
          <p role="status" className={mensaje.tipo === "ok" ? "text-brand-700" : "text-red-700"}>
            {mensaje.texto}
          </p>
        )}
      </div>
    </details>
  );
}
