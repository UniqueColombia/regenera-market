/**
 * Leer y escribir hojas de cálculo (.xlsx y .csv) sin dependencias.
 *
 * Lo usan la carga masiva de ofertas y la importación de prospectos. Un `.xlsx`
 * es un ZIP de XML: leerlo es abrir el ZIP, descomprimir tres o cuatro archivos
 * y recorrer sus etiquetas. Lo mismo decidió `scripts/exportar-excel.mts` para
 * escribirlo, y por la misma razón: una librería de varios megas (o una con
 * avisos de seguridad abiertos, como la versión de npm de SheetJS) cuesta más
 * de lo que ahorra para el puñado de cosas que hacen falta aquí.
 *
 * **Isomorfo a propósito: sin `node:` en ningún import.** Descomprime con
 * `DecompressionStream`, que existe en el navegador y en Node 18+. Así la
 * planilla de un proveedor se lee **en su navegador** —no viaja entera al
 * servidor, ni choca con el límite de cuerpo de una Server Action si alguien
 * pegó fotos dentro de las celdas— y al servidor solo llegan las filas, como
 * texto, que vuelven a validarse allá antes de guardar nada.
 *
 * Lo que lee: el texto y los números de cada celda, de todas las hojas, como
 * cadenas. Lo que no: fórmulas (se lee el último resultado guardado), fechas
 * como fecha (llegan como el número de serie de Excel), estilos, imágenes.
 */

export interface Hoja {
  nombre: string;
  /** Filas de celdas, ya como texto. Una fila sin celdas es `[]`. */
  filas: string[][];
}

/** Lo que se acepta leer. Una planilla de ofertas o de prospectos pesa kilobytes. */
const MAXIMO_ARCHIVO = 15 * 1024 * 1024;
/** Lo que puede ocupar un archivo descomprimido: frena una bomba ZIP. */
const MAXIMO_DESCOMPRIMIDO = 40 * 1024 * 1024;

export class ErrorDeHoja extends Error {}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

/**
 * Lee un `.xlsx` o un `.csv` y devuelve sus hojas.
 *
 * Decide por el contenido y no por el nombre: un `.xlsx` empieza con la firma
 * de un ZIP (`PK\x03\x04`). Lo demás se intenta como CSV.
 */
export async function leerLibro(bytes: Uint8Array): Promise<Hoja[]> {
  if (bytes.length > MAXIMO_ARCHIVO) {
    throw new ErrorDeHoja("El archivo pesa demasiado. Quítale las imágenes pegadas y vuelve a intentarlo.");
  }
  const esZip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  if (esZip) return leerXlsx(bytes);
  return [{ nombre: "CSV", filas: leerCsv(new TextDecoder("utf-8").decode(bytes)) }];
}

/**
 * CSV con `;` o con `,`, comillas dobles y saltos de línea dentro del campo.
 *
 * El separador se adivina por la primera línea: Excel en configuración
 * colombiana guarda con `;`, Google Sheets con `,`.
 */
export function leerCsv(texto: string): string[][] {
  const limpio = texto.replace(/^﻿/, "");
  const primera = limpio.slice(0, limpio.indexOf("\n") === -1 ? undefined : limpio.indexOf("\n"));
  const separador = (primera.match(/;/g)?.length ?? 0) >= (primera.match(/,/g)?.length ?? 0) ? ";" : ",";

  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let entreComillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (entreComillas) {
      if (c === '"') {
        if (limpio[i + 1] === '"') {
          campo += '"';
          i++;
        } else entreComillas = false;
      } else campo += c;
      continue;
    }
    if (c === '"') entreComillas = true;
    else if (c === separador) {
      fila.push(campo);
      campo = "";
    } else if (c === "\n") {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else if (c !== "\r") campo += c;
  }
  if (campo !== "" || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas;
}

interface EntradaZip {
  metodo: number;
  comprimido: number;
  original: number;
  desplazamiento: number;
}

function u16(b: Uint8Array, i: number): number {
  return b[i] | (b[i + 1] << 8);
}
function u32(b: Uint8Array, i: number): number {
  return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
}

/** El índice del ZIP: nombre de cada archivo y dónde está. */
function indiceZip(b: Uint8Array): Map<string, EntradaZip> {
  // El final del directorio central está en los últimos 22 bytes, o antes si
  // el ZIP trae comentario (hasta 64 KB).
  let fin = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65_535); i--) {
    if (u32(b, i) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin === -1) throw new ErrorDeHoja("El archivo no parece un Excel (.xlsx) válido.");

  const total = u16(b, fin + 10);
  let p = u32(b, fin + 16);
  const nombres = new TextDecoder("utf-8");
  const indice = new Map<string, EntradaZip>();

  for (let n = 0; n < total; n++) {
    if (p + 46 > b.length || u32(b, p) !== 0x02014b50) {
      throw new ErrorDeHoja("El archivo de Excel está dañado.");
    }
    const largoNombre = u16(b, p + 28);
    const largoExtra = u16(b, p + 30);
    const largoComentario = u16(b, p + 32);
    const comprimido = u32(b, p + 20);
    const original = u32(b, p + 24);
    if (comprimido === 0xffffffff || original === 0xffffffff) {
      throw new ErrorDeHoja("El archivo es demasiado grande para leerlo aquí.");
    }
    indice.set(nombres.decode(b.subarray(p + 46, p + 46 + largoNombre)), {
      metodo: u16(b, p + 10),
      comprimido,
      original,
      desplazamiento: u32(b, p + 42),
    });
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
  return indice;
}

/** Descomprime con `DecompressionStream`, cortando si se pasa del máximo. */
async function inflar(datos: Uint8Array): Promise<Uint8Array> {
  const flujo = new Blob([datos as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const lector = flujo.getReader();
  const trozos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.length;
    if (total > MAXIMO_DESCOMPRIMIDO) {
      await lector.cancel();
      throw new ErrorDeHoja("El archivo es demasiado grande para leerlo aquí.");
    }
    trozos.push(value);
  }
  const salida = new Uint8Array(total);
  let i = 0;
  for (const t of trozos) {
    salida.set(t, i);
    i += t.length;
  }
  return salida;
}

async function archivoDelZip(b: Uint8Array, indice: Map<string, EntradaZip>, nombre: string): Promise<string | null> {
  const e = indice.get(nombre);
  if (!e) return null;
  if (e.original > MAXIMO_DESCOMPRIMIDO) {
    throw new ErrorDeHoja("El archivo es demasiado grande para leerlo aquí.");
  }
  if (u32(b, e.desplazamiento) !== 0x04034b50) throw new ErrorDeHoja("El archivo de Excel está dañado.");
  // Los tamaños del encabezado local pueden venir en cero (bit 3); los
  // buenos son los del directorio central. El nombre y el extra, en cambio,
  // pueden diferir del central: se leen de aquí.
  const inicio = e.desplazamiento + 30 + u16(b, e.desplazamiento + 26) + u16(b, e.desplazamiento + 28);
  const datos = b.subarray(inicio, inicio + e.comprimido);
  const crudo = e.metodo === 0 ? datos : e.metodo === 8 ? await inflar(datos) : null;
  if (!crudo) throw new ErrorDeHoja("El archivo usa una compresión que no sabemos leer. Guárdalo de nuevo como .xlsx.");
  return new TextDecoder("utf-8").decode(crudo);
}

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function desescapar(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : "";
    }
    return ENTIDADES[e.toLowerCase()] ?? "";
  });
}

function atributos(texto: string): Record<string, string> {
  const r: Record<string, string> = {};
  for (const m of texto.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) {
    // Sin el prefijo de espacio de nombres: `r:id` y `id` se leen igual.
    r[m[1].includes(":") && m[1] !== "r:id" ? m[1].split(":")[1] : m[1]] = desescapar(m[2]);
  }
  return r;
}

/** El texto de un `<si>` o un `<is>`: todos sus `<t>`, sin la fonética (`<rPh>`). */
function textoDe(xml: string): string {
  const sinFonetica = xml.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, "");
  let t = "";
  for (const m of sinFonetica.matchAll(/<(?:\w+:)?t\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?t>)/g)) {
    t += desescapar(m[1] ?? "");
  }
  return t;
}

/** `B12` → 1 (la columna, desde cero). */
function columnaDe(ref: string): number {
  let n = 0;
  for (const c of ref.toUpperCase()) {
    if (c < "A" || c > "Z") break;
    n = n * 26 + (c.charCodeAt(0) - 64);
  }
  return n - 1;
}

/** Un número de Excel como lo escribiría una persona: sin `0.30000000000000004`. */
function numeroLegible(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return String(Math.round(n * 1e6) / 1e6);
}

async function leerXlsx(b: Uint8Array): Promise<Hoja[]> {
  const indice = indiceZip(b);
  const libro = await archivoDelZip(b, indice, "xl/workbook.xml");
  const relaciones = await archivoDelZip(b, indice, "xl/_rels/workbook.xml.rels");
  if (!libro || !relaciones) throw new ErrorDeHoja("El archivo no parece un Excel (.xlsx) válido.");

  const destinos = new Map<string, string>();
  for (const m of relaciones.matchAll(/<(?:\w+:)?Relationship\b([^>]*)\/?>/g)) {
    const a = atributos(m[1]);
    if (a.Id && a.Target) {
      const objetivo = a.Target.startsWith("/") ? a.Target.slice(1) : `xl/${a.Target}`;
      destinos.set(a.Id, objetivo.replace(/\/\.\//g, "/"));
    }
  }

  const compartidas: string[] = [];
  const textos = await archivoDelZip(b, indice, "xl/sharedStrings.xml");
  if (textos) {
    for (const m of textos.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>|<(?:\w+:)?si\b[^>]*\/>/g)) {
      compartidas.push(textoDe(m[1] ?? ""));
    }
  }

  const hojas: Hoja[] = [];
  for (const m of libro.matchAll(/<(?:\w+:)?sheet\b([^>]*)\/?>/g)) {
    const a = atributos(m[1]);
    const ruta = destinos.get(a["r:id"] ?? a.id ?? "");
    if (!ruta) continue;
    const xml = await archivoDelZip(b, indice, ruta);
    if (xml === null) continue;
    hojas.push({ nombre: a.name ?? `Hoja ${hojas.length + 1}`, filas: filasDeHoja(xml, compartidas) });
  }
  if (hojas.length === 0) throw new ErrorDeHoja("El archivo de Excel no tiene ninguna hoja que leer.");
  return hojas;
}

function filasDeHoja(xml: string, compartidas: string[]): string[][] {
  const filas: string[][] = [];
  let siguienteFila = 0;
  for (const fila of xml.matchAll(/<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
    const a = atributos(fila[1]);
    const numero = a.r ? Number(a.r) - 1 : siguienteFila;
    siguienteFila = numero + 1;
    const celdas: string[] = [];
    let siguienteColumna = 0;
    for (const c of (fila[2] ?? "").matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const ac = atributos(c[1]);
      const col = ac.r ? columnaDe(ac.r) : siguienteColumna;
      siguienteColumna = col + 1;
      const cuerpo = c[2] ?? "";
      const v = cuerpo.match(/<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/)?.[1];
      let valor = "";
      switch (ac.t) {
        case "s":
          valor = compartidas[Number(v)] ?? "";
          break;
        case "inlineStr":
          valor = textoDe(cuerpo);
          break;
        case "str":
          valor = desescapar(v ?? "");
          break;
        case "b":
          valor = v === "1" ? "Sí" : "No";
          break;
        case "e":
          valor = "";
          break;
        default:
          valor = v === undefined ? "" : numeroLegible(desescapar(v));
      }
      while (celdas.length < col) celdas.push("");
      celdas[col] = valor;
    }
    while (filas.length < numero) filas.push([]);
    filas[numero] = celdas;
  }
  return filas;
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

/** Estilos de celda disponibles al escribir (índice en `cellXfs`). */
export const ESTILO = {
  normal: 0,
  encabezado: 1,
  obligatorio: 2,
  nota: 3,
  titulo: 4,
  negrita: 5,
} as const;

export interface CeldaEscrita {
  v: string | number;
  s?: number;
}

export interface ValidacionDeLista {
  /** Columna, desde cero. */
  columna: number;
  /** Primera y última fila a las que aplica, desde uno (Excel). */
  desde: number;
  hasta: number;
  /** Un rango de otra hoja: `Listas!$A$2:$A$9`. */
  rango: string;
  /** Qué decir si escriben otra cosa. */
  aviso: string;
}

export interface HojaEscrita {
  nombre: string;
  anchos: number[];
  filas: CeldaEscrita[][];
  /** Fija la primera fila al desplazarse. */
  fijarEncabezado?: boolean;
  validaciones?: ValidacionDeLista[];
  oculta?: boolean;
}

const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c >>> 0;
  }
  return tabla;
})();

function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of datos) c = TABLA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Un ZIP **sin comprimir** (método 0).
 *
 * Una plantilla pesa decenas de kilobytes, así que comprimirla no gana nada y
 * obligaría a hacer asíncrona toda la escritura. Excel, LibreOffice y Google
 * Sheets abren igual un ZIP almacenado que uno comprimido. Fecha fija
 * (1980-01-01) por lo mismo que en `scripts/exportar-excel.mts`: dos plantillas
 * iguales son idénticas byte a byte.
 */
function crearZip(entradas: { nombre: string; contenido: Uint8Array }[]): Uint8Array {
  const codificador = new TextEncoder();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let desplazamiento = 0;

  for (const e of entradas) {
    const nombre = codificador.encode(e.nombre);
    const crc = crc32(e.contenido);
    const local = new Uint8Array(30);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0x0800, true); // nombres en UTF-8
    dv.setUint16(8, 0, true); // almacenado
    dv.setUint16(12, 33, true); // 1980-01-01
    dv.setUint32(14, crc, true);
    dv.setUint32(18, e.contenido.length, true);
    dv.setUint32(22, e.contenido.length, true);
    dv.setUint16(26, nombre.length, true);
    partes.push(local, nombre, e.contenido);

    const dir = new Uint8Array(46);
    const dc = new DataView(dir.buffer);
    dc.setUint32(0, 0x02014b50, true);
    dc.setUint16(4, 20, true);
    dc.setUint16(6, 20, true);
    dc.setUint16(8, 0x0800, true);
    dc.setUint16(10, 0, true);
    dc.setUint16(14, 33, true);
    dc.setUint32(16, crc, true);
    dc.setUint32(20, e.contenido.length, true);
    dc.setUint32(24, e.contenido.length, true);
    dc.setUint16(28, nombre.length, true);
    dc.setUint32(42, desplazamiento, true);
    central.push(dir, nombre);

    desplazamiento += 30 + nombre.length + e.contenido.length;
  }

  const tamCentral = central.reduce((n, p) => n + p.length, 0);
  const fin = new Uint8Array(22);
  const df = new DataView(fin.buffer);
  df.setUint32(0, 0x06054b50, true);
  df.setUint16(8, entradas.length, true);
  df.setUint16(10, entradas.length, true);
  df.setUint32(12, tamCentral, true);
  df.setUint32(16, desplazamiento, true);

  const todo = [...partes, ...central, fin];
  const salida = new Uint8Array(todo.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of todo) {
    salida.set(p, i);
    i += p.length;
  }
  return salida;
}

/**
 * Escapa para XML y descarta los caracteres de control: Excel no avisa de uno,
 * rechaza el libro entero como dañado (ver `scripts/exportar-excel.mts`).
 */
function xml(texto: string): string {
  let limpio = "";
  for (const c of texto) {
    const codigo = c.codePointAt(0) ?? 0;
    if (codigo >= 32 || c === "\n" || c === "\t") limpio += c;
  }
  return limpio.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function letraDeColumna(indice: number): string {
  let n = indice + 1;
  let letras = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    letras = String.fromCharCode(65 + resto) + letras;
    n = Math.floor((n - 1) / 26);
  }
  return letras;
}

function hojaXml(h: HojaEscrita): string {
  const filas = h.filas
    .map((fila, f) => {
      const celdas = fila
        .map((celda, c) => {
          const ref = `${letraDeColumna(c)}${f + 1}`;
          const estilo = celda.s ? ` s="${celda.s}"` : "";
          if (typeof celda.v === "number") return `<c r="${ref}"${estilo}><v>${celda.v}</v></c>`;
          if (celda.v === "") return estilo ? `<c r="${ref}"${estilo}/>` : "";
          return `<c r="${ref}"${estilo} t="inlineStr"><is><t xml:space="preserve">${xml(celda.v)}</t></is></c>`;
        })
        .join("");
      return `<row r="${f + 1}">${celdas}</row>`;
    })
    .join("");
  const columnas = h.anchos
    .map((a, i) => `<col min="${i + 1}" max="${i + 1}" width="${a}" customWidth="1"/>`)
    .join("");
  const vista = h.fijarEncabezado
    ? `<sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/></sheetView>`
    : `<sheetView workbookViewId="0"/>`;
  const validaciones = h.validaciones?.length
    ? `<dataValidations count="${h.validaciones.length}">${h.validaciones
        .map(
          (v) =>
            `<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorStyle="warning" ` +
            `errorTitle="Revisa este valor" error="${xml(v.aviso)}" ` +
            `sqref="${letraDeColumna(v.columna)}${v.desde}:${letraDeColumna(v.columna)}${v.hasta}">` +
            `<formula1>${xml(v.rango)}</formula1></dataValidation>`,
        )
        .join("")}</dataValidations>`
    : "";
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews>${vista}</sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    (columnas ? `<cols>${columnas}</cols>` : "") +
    `<sheetData>${filas}</sheetData>` +
    validaciones +
    `</worksheet>`
  );
}

const ESTILOS_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<fonts count="5">` +
  `<font><sz val="11"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>` +
  `<font><i/><sz val="10"/><color rgb="FF55655C"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="14"/><color rgb="FF1B5B3D"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="11"/><name val="Calibri"/></font>` +
  `</fonts>` +
  `<fills count="4">` +
  `<fill><patternFill patternType="none"/></fill>` +
  `<fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FF1B5B3D"/><bgColor indexed="64"/></patternFill></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FF8A4B2A"/><bgColor indexed="64"/></patternFill></fill>` +
  `</fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="6">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>` +
  `<xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>` +
  `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` +
  `<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

/** Arma el `.xlsx` completo. La primera hoja es la que se abre. */
export function escribirLibro(hojas: HojaEscrita[]): Uint8Array {
  const t = (s: string) => new TextEncoder().encode(s);
  const tipos =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    hojas
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join("") +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `</Types>`;
  const raiz =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;
  const relaciones =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    hojas
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join("") +
    `<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;
  const libro =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
    hojas
      .map(
        (h, i) =>
          `<sheet name="${xml(h.nombre.slice(0, 31))}" sheetId="${i + 1}"${h.oculta ? ` state="hidden"` : ""} r:id="rId${i + 1}"/>`,
      )
      .join("") +
    `</sheets></workbook>`;

  return crearZip([
    { nombre: "[Content_Types].xml", contenido: t(tipos) },
    { nombre: "_rels/.rels", contenido: t(raiz) },
    { nombre: "xl/workbook.xml", contenido: t(libro) },
    { nombre: "xl/_rels/workbook.xml.rels", contenido: t(relaciones) },
    { nombre: "xl/styles.xml", contenido: t(ESTILOS_XML) },
    ...hojas.map((h, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, contenido: t(hojaXml(h)) })),
  ]);
}

/** Para comparar encabezados y valores escritos a mano: sin tildes, sin mayúsculas, sin signos. */
export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
