"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  ImagePlus,
  Loader2,
  X,
  XCircle,
} from "lucide-react";
import { recortar, type ResultadoImagenUI } from "./selector-imagen";
import type { ProveedorOpcion, ResultadoGuardarOferta } from "./formulario-oferta";
import { ErrorDeHoja, leerLibro } from "@/lib/hoja-de-calculo";
import {
  CamposOferta,
  CamposOfertaEmpresa,
  erroresDeOferta,
  reglasDeOferta,
} from "@/lib/ofertas";
import {
  MAXIMO_FOTOS,
  claveDeArchivo,
  coincideConTitulo,
  convertirFila,
  esArchivo,
  leerPlanillaDeOfertas,
  tituloDeColumna,
} from "@/lib/plantilla-ofertas";
import { money } from "@/lib/format";
import { KIND_LABEL } from "@/lib/taxonomy";
import type { ListingKind } from "@/lib/types";

/** Una fila de la planilla, ya traducida y validada. */
interface Fila {
  numero: number;
  titulo: string;
  datos: Record<string, unknown>;
  errores: Record<string, string>;
  fotos: string[];
  estado:
    | { fase: "lista" }
    | { fase: "subiendo"; detalle: string }
    | { fase: "creada"; id: string; aviso?: string }
    | { fase: "fallo"; mensaje: string };
}

/** Cuántas fotos se suben a la vez. Más satura el teléfono y no termina antes. */
const FOTOS_EN_PARALELO = 3;

/** Una foto agregada a una fila, con su miniatura ya hecha. */
interface Propia {
  archivo: File;
  vista: string;
}

/**
 * Una imagen diminuta del archivo, para la miniatura de la fila.
 *
 * Se hace una vez, al agregar la foto: así no hay direcciones locales que
 * soltar ni efectos, y 300 filas con 6 fotos no guardan 1.800 originales de
 * varios megas como imagen en memoria. Si el navegador no puede leerla, la
 * miniatura queda vacía: la foto se intenta subir igual y, si no sirve, se avisa.
 */
async function miniaturaDe(archivo: File): Promise<string> {
  try {
    const bitmap = await createImageBitmap(archivo, { resizeWidth: 80, resizeHeight: 80, resizeQuality: "low" });
    const lienzo = document.createElement("canvas");
    lienzo.width = 80;
    lienzo.height = 80;
    lienzo.getContext("2d")?.drawImage(bitmap, 0, 0);
    bitmap.close();
    return lienzo.toDataURL("image/jpeg", 0.6);
  } catch {
    return "";
  }
}

/** Una foto de una fila: un archivo que subir o un enlace que se deja tal cual. */
interface FotoPorSubir {
  nombre: string;
  archivo: File | null;
  enlace?: string;
}

/**
 * Cargar muchas ofertas de una vez desde la planilla de Excel.
 *
 * ## Por qué se lee en el navegador
 *
 * La planilla se abre aquí (`leerLibro`) y al servidor solo llegan las filas,
 * una por una, por **la misma acción** que usa el formulario de una oferta. Así:
 *
 * - cada fila pasa exactamente las mismas validaciones que una oferta escrita a
 *   mano, y la base la protege con las mismas políticas;
 * - el archivo no choca con el límite de cuerpo de una Server Action aunque
 *   alguien haya pegado fotos dentro de las celdas;
 * - la revisión previa es instantánea: se valida con el mismo esquema
 *   (`CamposOferta`) antes de mandar nada, y se dice qué corregir en qué fila.
 *
 * ## Por qué no se duplica nada al subirla otra vez
 *
 * La llave de cada oferta nueva (`clave`, invariante 24) no es al azar: sale
 * del proveedor y del título. Quien corrige tres filas y vuelve a subir la
 * planilla entera recibe las ya creadas como «ya estaba» en vez de copias con
 * «-2» en la dirección. Por lo mismo, dos filas con el mismo título en la misma
 * planilla son un error que se dice antes de cargar.
 *
 * ## Las fotos, de tres maneras
 *
 * Escribir nombres de archivo en una planilla era lo más engorroso de cargar
 * veinte ofertas, así que no hace falta:
 *
 * 1. **En su fila**: cada oferta lista tiene «Agregar fotos» y se eligen ahí,
 *    sin escribir nada en la planilla.
 * 2. **Por el título**: una foto llamada como la oferta (`cacao-arhuaco.jpg`,
 *    `cacao-arhuaco-2.jpg`) se une sola, de las que se eligieron en bloque.
 * 3. **Por la columna «Fotos»**: nombres de archivo (se emparejan sin
 *    mayúsculas) o enlaces directos a una imagen.
 *
 * Se juntan en ese orden hasta `MAXIMO_FOTOS`, se recortan a 4:3 como en el
 * formulario y se suben por la misma acción. Una foto nombrada que falta no
 * frena la fila: la oferta se crea sin ella y se avisa.
 */
export function ImportarOfertas({
  modo,
  empresaId,
  verificada = false,
  proveedores = [],
  logistica,
  zonas,
  guardar,
  subirImagen,
  avisar,
  rutaEdicion,
  volver,
}: {
  modo: "empresa" | "admin";
  /** En modo empresa: de quién son las ofertas. Solo para derivar las llaves. */
  empresaId?: string;
  /** En modo empresa: ¿tiene el sello? Sin él, la consultoría se rechaza. */
  verificada?: boolean;
  proveedores?: ProveedorOpcion[];
  logistica: boolean;
  zonas: boolean;
  guardar: (datos: unknown, opciones?: { avisar?: boolean }) => Promise<ResultadoGuardarOferta>;
  subirImagen: (datos: FormData) => Promise<ResultadoImagenUI>;
  /** En modo empresa: el aviso único al terminar. */
  avisar?: (titulos: string[]) => Promise<void>;
  /** A dónde lleva el enlace de cada oferta creada: se le pega el `id`. */
  rutaEdicion: string;
  volver: string;
}) {
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [desconocidas, setDesconocidas] = useState<string[]>([]);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [fotos, setFotos] = useState<Map<string, File>>(new Map());
  /** Las fotos que se agregaron directamente a una fila, por número de fila. */
  const [propias, setPropias] = useState<Map<number, Propia[]>>(new Map());
  const [proveedor, setProveedor] = useState(proveedores[0]?.id ?? "");
  const [estadoAdmin, setEstadoAdmin] = useState<"draft" | "pending_review" | "approved">("pending_review");
  const [enviar, setEnviar] = useState<"revision" | "borrador">("revision");
  const [cargando, setCargando] = useState(false);
  const [terminado, setTerminado] = useState(false);
  const entradaPlanilla = useRef<HTMLInputElement>(null);
  const entradaFotos = useRef<HTMLInputElement>(null);

  const validas = filas.filter((f) => Object.keys(f.errores).length === 0);
  const conErrores = filas.length - validas.length;

  const fotosFaltantes = useMemo(() => {
    const faltan = new Map<number, string[]>();
    for (const f of filas) {
      const sin = f.fotos.filter((n) => esArchivo(n) && !fotos.has(claveDeArchivo(n)));
      if (sin.length > 0) faltan.set(f.numero, sin);
    }
    return faltan;
  }, [filas, fotos]);

  const fotosPedidas = filas.reduce((n, f) => n + f.fotos.filter(esArchivo).length, 0);

  /**
   * Las fotos que de verdad llevará una fila, en orden: las de la columna
   * «Fotos» (enlaces y archivos), las que se agregaron a la fila y las elegidas
   * en bloque que se llaman como la oferta. Sin repetir un archivo.
   */
  function fotosDeFila(f: Fila): FotoPorSubir[] {
    const lista: FotoPorSubir[] = [];
    for (const nombre of f.fotos) {
      if (!esArchivo(nombre)) lista.push({ nombre, archivo: null, enlace: nombre });
      else {
        const archivo = fotos.get(claveDeArchivo(nombre));
        if (archivo) lista.push({ nombre, archivo });
      }
    }
    const usadas = new Set(lista.map((x) => x.archivo));
    const porTitulo = [...fotos.values()].filter((a) => coincideConTitulo(a.name, f.titulo));
    for (const archivo of [...(propias.get(f.numero) ?? []).map((p) => p.archivo), ...porTitulo]) {
      if (usadas.has(archivo)) continue;
      usadas.add(archivo);
      lista.push({ nombre: archivo.name, archivo });
    }
    return lista.slice(0, MAXIMO_FOTOS);
  }

  async function agregarFotosA(numero: number, archivos: File[]) {
    const nuevas = await Promise.all(archivos.map(async (archivo) => ({ archivo, vista: await miniaturaDe(archivo) })));
    setPropias((previas) => {
      const todas = new Map(previas);
      const actuales = todas.get(numero) ?? [];
      const sinRepetir = nuevas.filter(
        (n) => !actuales.some((x) => x.archivo.name === n.archivo.name && x.archivo.size === n.archivo.size),
      );
      todas.set(numero, [...actuales, ...sinRepetir].slice(0, MAXIMO_FOTOS));
      return todas;
    });
  }

  function quitarFotoDe(numero: number, archivo: File) {
    setPropias((previas) => {
      const todas = new Map(previas);
      todas.set(numero, (todas.get(numero) ?? []).filter((p) => p.archivo !== archivo));
      return todas;
    });
  }

  async function alElegirPlanilla(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!archivo) return;
    setErrorArchivo(null);
    setTerminado(false);
    setLeyendo(true);
    try {
      const hojas = await leerLibro(new Uint8Array(await archivo.arrayBuffer()));
      const leida = leerPlanillaDeOfertas(hojas);
      if ("error" in leida) {
        setErrorArchivo(leida.error);
        setFilas([]);
        return;
      }
      if (leida.filas.length === 0) {
        setErrorArchivo("La planilla no tiene ninguna oferta debajo de los títulos.");
        setFilas([]);
        return;
      }
      setNombreArchivo(archivo.name);
      setPropias(new Map());
      setDesconocidas(leida.desconocidas);
      setFilas(validar(leida.filas.map((f) => ({ numero: f.numero, ...convertirFila(f.valores) }))));
    } catch (e) {
      setErrorArchivo(
        e instanceof ErrorDeHoja
          ? e.message
          : "No pudimos leer el archivo. Guárdalo como Excel (.xlsx) o CSV y vuelve a intentarlo.",
      );
      setFilas([]);
    } finally {
      setLeyendo(false);
    }
  }

  /** Las mismas reglas que el formulario, más las propias de una planilla. */
  function validar(convertidas: { numero: number; datos: Record<string, unknown>; errores: Record<string, string>; fotos: string[] }[]): Fila[] {
    const esquema = modo === "empresa" ? CamposOfertaEmpresa : CamposOferta;
    const vistos = new Map<string, number>();
    return convertidas.map((c) => {
      const errores: Record<string, string> = {};
      const r = esquema.safeParse({ ...c.datos, images: "" });
      Object.assign(
        errores,
        r.success ? reglasDeOferta(r.data, { logistica, zonas }) : erroresDeOferta(r.error),
      );
      // Lo que no se pudo traducir manda sobre lo que el esquema dice de eso.
      Object.assign(errores, c.errores);
      if (modo === "empresa" && c.datos.category === "consultoria" && !verificada) {
        errores.category = "Consultoría e implementación exige el sello verificado por Seregenera.";
      }
      const titulo = String(c.datos.title ?? "").trim();
      const clave = titulo.toLowerCase();
      if (titulo && vistos.has(clave)) {
        errores.title = `Hay otra oferta con el mismo título en la fila ${vistos.get(clave)}.`;
      } else if (titulo) vistos.set(clave, c.numero);
      return { numero: c.numero, titulo, datos: c.datos, errores, fotos: c.fotos, estado: { fase: "lista" } };
    });
  }

  function alElegirFotos(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivos = Array.from(evento.target.files ?? []);
    evento.target.value = "";
    setFotos((previas) => {
      const nuevas = new Map(previas);
      for (const a of archivos) nuevas.set(claveDeArchivo(a.name), a);
      return nuevas;
    });
  }

  function actualizar(numero: number, estado: Fila["estado"]) {
    setFilas((previas) => previas.map((f) => (f.numero === numero ? { ...f, estado } : f)));
  }

  async function subirFotosDe(fila: Fila, dueño: string): Promise<{ urls: string[]; fallidas: string[] }> {
    const porSubir = fotosDeFila(fila);
    const total = porSubir.filter((x) => x.archivo).length;
    const urls: (string | null)[] = new Array(porSubir.length).fill(null);
    const fallidas: string[] = [];
    let siguiente = 0;
    let hechas = 0;
    const trabajar = async () => {
      while (siguiente < porSubir.length) {
        const i = siguiente++;
        const { nombre, archivo, enlace } = porSubir[i];
        if (!archivo) {
          urls[i] = enlace ?? null;
          continue;
        }
        try {
          const recortada = await recortar(archivo, "foto");
          const datos = new FormData();
          datos.set("imagen", recortada, "imagen");
          if (modo === "admin") datos.set("providerId", dueño);
          const r = await subirImagen(datos);
          if (r.ok) urls[i] = r.url;
          else fallidas.push(nombre);
        } catch {
          fallidas.push(nombre);
        }
        hechas++;
        actualizar(fila.numero, { fase: "subiendo", detalle: `Fotos ${hechas} de ${total}` });
      }
    };
    await Promise.all(Array.from({ length: FOTOS_EN_PARALELO }, trabajar));
    return { urls: urls.filter((u): u is string => u !== null), fallidas };
  }

  async function cargar() {
    const dueño = modo === "admin" ? proveedor : (empresaId ?? "");
    if (modo === "admin" && !dueño) return;
    setCargando(true);
    const creadas: string[] = [];

    for (const fila of validas) {
      if (fila.estado.fase === "creada") continue;
      actualizar(fila.numero, { fase: "subiendo", detalle: "Preparando" });
      try {
        const { urls, fallidas } = await subirFotosDe(fila, dueño);
        actualizar(fila.numero, { fase: "subiendo", detalle: "Guardando" });
        const r = await guardar(
          {
            ...fila.datos,
            images: urls.join("\n"),
            clave: await llaveDeOferta(dueño, fila.titulo),
            ...(modo === "admin"
              ? { providerId: dueño, status: estadoAdmin, featured: false }
              : { enviar }),
          },
          { avisar: false },
        );
        if (r.ok) {
          actualizar(fila.numero, {
            fase: "creada",
            id: r.id,
            aviso:
              fallidas.length > 0
                ? `No pudimos subir ${fallidas.join(", ")}: agrégalas al editarla.`
                : undefined,
          });
          creadas.push(fila.titulo);
        } else {
          actualizar(fila.numero, {
            fase: "fallo",
            mensaje: Object.entries(r.errors)
              .map(([campo, m]) => (campo === "form" ? m : `${tituloDeColumna(campo)}: ${m}`))
              .join(" · "),
          });
        }
      } catch {
        actualizar(fila.numero, { fase: "fallo", mensaje: "Se cortó la conexión. Vuelve a cargar: lo que ya entró no se duplica." });
      }
    }

    if (modo === "empresa" && enviar === "revision" && creadas.length > 0 && avisar) {
      // El aviso es cortesía: si falla, las ofertas ya están guardadas.
      await avisar(creadas).catch(() => {});
    }
    setCargando(false);
    setTerminado(true);
  }

  const listasParaCargar = validas.filter((f) => f.estado.fase !== "creada").length;

  function nFotos(f: Fila): string {
    const n = fotosDeFila(f).length;
    return n === 0 ? "sin fotos" : `${n} ${n === 1 ? "foto" : "fotos"}`;
  }

  return (
    <div className="mt-8 space-y-8">
      {/* Paso 1 */}
      <section style={{ "--i": 0 } as React.CSSProperties} className="tarjeta-viva rounded-xl bg-white p-5 ring-1 ring-hairline transition-shadow duration-300 focus-within:shadow-lg focus-within:shadow-brand-900/5 focus-within:ring-brand-300 sm:p-6">
        <h2 className="font-display text-xl text-ink">1. Descarga la plantilla y llénala</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Una fila por cada producto, experiencia o servicio. Trae una hoja de
          instrucciones y otra con tres ejemplos llenos. Si tienes tu portafolio
          en Word o PDF, copia de ahí cada oferta a una fila.
        </p>
        <a
          href="/api/plantilla-ofertas"
          download
          className="mt-4 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-brand-700 ring-1 ring-control transition hover:bg-sand"
        >
          <Download className="size-4" aria-hidden />
          Descargar plantilla (.xlsx)
        </a>
      </section>

      {/* Paso 2 */}
      <section style={{ "--i": 1 } as React.CSSProperties} className="tarjeta-viva rounded-xl bg-white p-5 ring-1 ring-hairline transition-shadow duration-300 focus-within:shadow-lg focus-within:shadow-brand-900/5 focus-within:ring-brand-300 sm:p-6">
        <h2 className="font-display text-xl text-ink">2. Sube la planilla</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={leyendo || cargando}
            onClick={() => entradaPlanilla.current?.click()}
            className="inline-flex items-center gap-2 rounded-full bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:opacity-50"
          >
            {leyendo ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileSpreadsheet className="size-4" aria-hidden />}
            {nombreArchivo ? "Elegir otra planilla" : "Elegir planilla"}
          </button>
          <button
            type="button"
            disabled={cargando}
            onClick={() => entradaFotos.current?.click()}
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-brand-700 ring-1 ring-control transition hover:bg-sand disabled:opacity-50"
          >
            <ImagePlus className="size-4" aria-hidden />
            {fotos.size > 0 ? `Agregar fotos (${fotos.size} elegidas)` : "Elegir fotos de varias ofertas"}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">
          Excel (.xlsx) o CSV. Las fotos no hacen falta ahora: al subir la
          planilla, cada oferta te deja agregar las suyas. Si ya las tienes
          juntas, elígelas aquí y las unimos por el nombre del archivo o por
          el título de la oferta.
        </p>
        {nombreArchivo && !errorArchivo && (
          <p className="mt-3 text-sm text-ink">
            <span className="font-medium">{nombreArchivo}</span> · {filas.length}{" "}
            {filas.length === 1 ? "oferta" : "ofertas"}
            {fotosPedidas > 0 && ` · ${fotosPedidas} fotos nombradas`}
          </p>
        )}
        {errorArchivo && (
          <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-red-700">
            <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {errorArchivo}
          </p>
        )}
        {desconocidas.length > 0 && (
          <p className="mt-2 text-xs text-muted">
            No usamos estas columnas: {desconocidas.join(", ")}.
          </p>
        )}

        <input
          ref={entradaPlanilla}
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          onChange={alElegirPlanilla}
          className="sr-only"
          aria-label="Elegir la planilla de ofertas"
        />
        <input
          ref={entradaFotos}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/*"
          onChange={alElegirFotos}
          className="sr-only"
          aria-label="Elegir las fotos de las ofertas"
        />
      </section>

      {/* Paso 3 */}
      {filas.length > 0 && (
        <section style={{ "--i": 2 } as React.CSSProperties} className="tarjeta-viva rounded-xl bg-white p-5 ring-1 ring-hairline transition-shadow duration-300 focus-within:shadow-lg focus-within:shadow-brand-900/5 focus-within:ring-brand-300 sm:p-6">
          <h2 className="font-display text-xl text-ink">3. Revisa y carga</h2>
          <p className="mt-2 text-sm text-muted">
            {validas.length === filas.length
              ? `Las ${filas.length} filas están listas.`
              : `${validas.length} de ${filas.length} filas están listas. Las ${conErrores} con errores no se cargan: corrígelas en la planilla y súbela otra vez — lo que ya se cargó no se duplica.`}
          </p>

          <ul className="mt-5 divide-y divide-hairline rounded-lg ring-1 ring-hairline">
            {filas.map((f) => {
              const errores = Object.entries(f.errores);
              const faltan = fotosFaltantes.get(f.numero);
              return (
                <li key={f.numero} className="flex gap-3 p-3 text-sm sm:p-4">
                  <span className="w-12 shrink-0 text-xs tabular-nums text-muted">Fila {f.numero}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">{f.titulo || "(sin título)"}</p>
                    <p className="text-xs text-muted">
                      {KIND_LABEL[f.datos.kind as ListingKind] ?? "Tipo sin reconocer"}
                      {typeof f.datos.priceCop === "string" &&
                        /^\d+$/.test(f.datos.priceCop) &&
                        ` · ${money(Number(f.datos.priceCop))}`}
                      {` · ${nFotos(f)}`}
                    </p>
                    {errores.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5 text-xs text-red-700">
                        {errores.map(([campo, mensaje]) => (
                          <li key={campo}>
                            <span className="font-medium">{tituloDeColumna(campo)}:</span> {mensaje}
                          </li>
                        ))}
                      </ul>
                    )}
                    {errores.length === 0 && faltan && (
                      <p className="mt-1.5 flex items-start gap-1 text-xs text-clay-700">
                        <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
                        Faltan {faltan.join(", ")}: elígelas arriba, agrégalas aquí o se crea sin ellas.
                      </p>
                    )}
                    {errores.length === 0 && f.estado.fase !== "creada" && (
                      <FotosDeFila
                        propias={propias.get(f.numero) ?? []}
                        lleno={fotosDeFila(f).length >= MAXIMO_FOTOS}
                        bloqueado={cargando}
                        alAgregar={(a) => void agregarFotosA(f.numero, a)}
                        alQuitar={(a) => quitarFotoDe(f.numero, a)}
                      />
                    )}
                    {f.estado.fase === "fallo" && (
                      <p className="mt-1.5 text-xs text-red-700">{f.estado.mensaje}</p>
                    )}
                    {f.estado.fase === "creada" && f.estado.aviso && (
                      <p className="mt-1.5 text-xs text-clay-700">{f.estado.aviso}</p>
                    )}
                  </div>
                  <span className="shrink-0">
                    {f.estado.fase === "subiendo" ? (
                      <span className="flex items-center gap-1.5 text-xs text-muted">
                        <Loader2 className="size-4 animate-spin text-brand-600" aria-hidden />
                        {f.estado.detalle}
                      </span>
                    ) : f.estado.fase === "creada" ? (
                      <Link
                        href={`${rutaEdicion}${f.estado.id}`}
                        className="flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
                      >
                        <CheckCircle2 className="size-4" aria-hidden />
                        Cargada
                      </Link>
                    ) : errores.length > 0 ? (
                      <XCircle className="size-5 text-red-700" aria-label="Con errores" />
                    ) : (
                      <CheckCircle2 className="size-5 text-brand-600" aria-label="Lista" />
                    )}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="mt-6 space-y-4">
            {modo === "admin" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Proveedor de estas ofertas</span>
                  <select
                    value={proveedor}
                    onChange={(e) => setProveedor(e.target.value)}
                    disabled={cargando}
                    className="w-full rounded-lg border border-control bg-white px-3 py-2 text-sm"
                  >
                    {proveedores.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.aprobado ? "" : " (sin aprobar)"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Cómo quedan</span>
                  <select
                    value={estadoAdmin}
                    onChange={(e) => setEstadoAdmin(e.target.value as typeof estadoAdmin)}
                    disabled={cargando}
                    className="w-full rounded-lg border border-control bg-white px-3 py-2 text-sm"
                  >
                    <option value="pending_review">En revisión</option>
                    <option value="draft">Borrador</option>
                    <option value="approved">Publicadas</option>
                  </select>
                </label>
              </div>
            ) : (
              <fieldset className="flex flex-wrap gap-x-5 gap-y-2 text-sm" disabled={cargando}>
                <legend className="sr-only">Cómo quedan</legend>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="enviar"
                    checked={enviar === "revision"}
                    onChange={() => setEnviar("revision")}
                    className="size-4 text-brand-700"
                  />
                  Enviar a revisión para publicarlas
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="enviar"
                    checked={enviar === "borrador"}
                    onChange={() => setEnviar("borrador")}
                    className="size-4 text-brand-700"
                  />
                  Guardarlas como borradores
                </label>
              </fieldset>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={cargar}
                disabled={cargando || listasParaCargar === 0 || (modo === "admin" && !proveedor)}
                className="inline-flex items-center gap-2 rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:opacity-50"
              >
                {cargando && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {cargando
                  ? "Cargando…"
                  : listasParaCargar === 0
                    ? "Nada por cargar"
                    : `Cargar ${listasParaCargar} ${listasParaCargar === 1 ? "oferta" : "ofertas"}`}
              </button>
              {terminado && (
                <Link href={volver} className="text-sm font-semibold text-brand-700 hover:underline">
                  Ver las ofertas
                </Link>
              )}
            </div>
            {cargando && (
              <p className="text-xs text-muted">
                No cierres esta pestaña hasta que termine. Si se corta, vuelve a
                cargar la misma planilla: lo que ya entró no se duplica.
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/** «Agregar fotos» de una fila, con sus miniaturas y una equis para quitarlas. */
function FotosDeFila({
  propias,
  lleno,
  bloqueado,
  alAgregar,
  alQuitar,
}: {
  propias: Propia[];
  lleno: boolean;
  bloqueado: boolean;
  alAgregar: (archivos: File[]) => void;
  alQuitar: (archivo: File) => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {propias.map(({ archivo, vista }) => (
        <span key={`${archivo.name}-${archivo.size}`} className="relative">
          {vista ? (
            // eslint-disable-next-line @next/next/no-img-element -- miniatura local de un archivo recién elegido
            <img src={vista} alt={archivo.name} className="size-10 rounded-md object-cover ring-1 ring-hairline" />
          ) : (
            <span className="grid size-10 place-items-center rounded-md bg-sand text-muted ring-1 ring-hairline" title={archivo.name}>
              <ImagePlus className="size-4" aria-hidden />
            </span>
          )}
          <button
            type="button"
            disabled={bloqueado}
            onClick={() => alQuitar(archivo)}
            aria-label={`Quitar ${archivo.name}`}
            className="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full bg-ink text-white disabled:opacity-50"
          >
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      <button
        type="button"
        disabled={bloqueado || lleno}
        onClick={() => entrada.current?.click()}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-control transition hover:bg-sand disabled:opacity-50"
      >
        <ImagePlus className="size-3.5" aria-hidden />
        {propias.length > 0 ? "Agregar más" : "Agregar fotos"}
      </button>
      <input
        ref={entrada}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/*"
        className="sr-only"
        aria-label="Elegir las fotos de esta oferta"
        onChange={(e) => {
          alAgregar(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </div>
  );
}

/**
 * La llave de una oferta cargada desde la planilla: un uuid que sale del
 * proveedor y del título, siempre el mismo para la misma oferta.
 *
 * Con versión 5 y variante RFC 4122 escritas a mano, porque `z.uuid()` de Zod 4
 * exige las dos.
 */
async function llaveDeOferta(dueño: string, titulo: string): Promise<string> {
  const datos = new TextEncoder().encode(`seregenera-planilla:${dueño}:${titulo.trim().toLowerCase()}`);
  const b = new Uint8Array(await crypto.subtle.digest("SHA-256", datos)).slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
