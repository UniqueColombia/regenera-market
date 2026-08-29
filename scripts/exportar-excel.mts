#!/usr/bin/env node
/**
 * Exporta los CSV del prospector a un libro de Excel categorizado.
 *
 * Toma todo lo que haya en `.claude/prospectos/`, deduplica por NIT —un mismo
 * proveedor aparece en varios perfiles y eso es información, no ruido— y escribe
 * un `.xlsx` en `outputs/` con una hoja por vertical, un resumen y un
 * diccionario.
 *
 * Escribe el XLSX a mano, sin dependencias. Un `.xlsx` es un ZIP de XML y Node
 * ya trae `zlib`: meter una librería de 5 MB al `package.json` de la aplicación
 * para un script que corre a mano cuesta más de lo que ahorra, y arrastra a
 * producción una dependencia que producción no usa.
 *
 * Uso:
 *   node scripts/prospectar.mts --perfil <slug>      # una o varias veces
 *   node scripts/exportar-excel.mts
 *   node scripts/exportar-excel.mts --entrada .claude/prospectos --salida outputs
 */

import { deflateRawSync } from "node:zlib";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// ZIP mínimo
// ---------------------------------------------------------------------------

const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c >>> 0;
  }
  return tabla;
})();

function crc32(datos: Buffer): number {
  let c = 0xffffffff;
  for (const byte of datos) c = TABLA_CRC[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface EntradaZip {
  nombre: string;
  contenido: Buffer;
}

/**
 * Arma el ZIP a mano: cabecera local por entrada, directorio central y EOCD.
 *
 * Todo con fecha fija (1980-01-01, el cero del formato). Un ZIP con la hora de
 * generación cambia byte a byte en cada corrida aunque el contenido sea
 * idéntico, y eso hace imposible comparar dos exportaciones.
 */
function crearZip(entradas: EntradaZip[]): Buffer {
  const locales: Buffer[] = [];
  const central: Buffer[] = [];
  let desplazamiento = 0;

  for (const entrada of entradas) {
    const nombre = Buffer.from(entrada.nombre, "utf8");
    const comprimido = deflateRawSync(entrada.contenido, { level: 9 });
    const crc = crc32(entrada.contenido);

    const cabecera = Buffer.alloc(30);
    cabecera.writeUInt32LE(0x04034b50, 0);
    cabecera.writeUInt16LE(20, 4); // versión necesaria
    cabecera.writeUInt16LE(0x0800, 6); // nombre en UTF-8
    cabecera.writeUInt16LE(8, 8); // método deflate
    cabecera.writeUInt16LE(0, 10); // hora
    cabecera.writeUInt16LE(33, 12); // fecha: 1980-01-01
    cabecera.writeUInt32LE(crc, 14);
    cabecera.writeUInt32LE(comprimido.length, 18);
    cabecera.writeUInt32LE(entrada.contenido.length, 22);
    cabecera.writeUInt16LE(nombre.length, 26);
    cabecera.writeUInt16LE(0, 28);
    locales.push(cabecera, nombre, comprimido);

    const directorio = Buffer.alloc(46);
    directorio.writeUInt32LE(0x02014b50, 0);
    directorio.writeUInt16LE(20, 4); // versión con la que se creó
    directorio.writeUInt16LE(20, 6);
    directorio.writeUInt16LE(0x0800, 8);
    directorio.writeUInt16LE(8, 10);
    directorio.writeUInt16LE(0, 12);
    directorio.writeUInt16LE(33, 14);
    directorio.writeUInt32LE(crc, 16);
    directorio.writeUInt32LE(comprimido.length, 20);
    directorio.writeUInt32LE(entrada.contenido.length, 24);
    directorio.writeUInt16LE(nombre.length, 28);
    directorio.writeUInt32LE(0, 38); // atributos externos
    directorio.writeUInt32LE(desplazamiento, 42);
    central.push(directorio, nombre);

    desplazamiento += cabecera.length + nombre.length + comprimido.length;
  }

  const cuerpo = Buffer.concat(locales);
  const indice = Buffer.concat(central);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(entradas.length, 8);
  fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(indice.length, 12);
  fin.writeUInt32LE(cuerpo.length, 16);

  return Buffer.concat([cuerpo, indice, fin]);
}

// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------

/**
 * Escapa para XML y descarta los caracteres de control.
 *
 * Excel no avisa de un carácter de control: rechaza el libro entero como
 * dañado. Se filtran por código y no con una expresión regular porque una clase
 * de caracteres con literales de control deja el archivo fuente ilegible —y
 * `grep` lo trata como binario.
 */
function xml(texto: string): string {
  let limpio = "";
  for (const c of texto) {
    const codigo = c.codePointAt(0) ?? 0;
    if (codigo >= 32 || c === "\n" || c === "\t") limpio += c;
  }
  return limpio
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function columna(indice: number): string {
  let n = indice + 1;
  let letras = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    letras = String.fromCharCode(65 + resto) + letras;
    n = Math.floor((n - 1) / 26);
  }
  return letras;
}

/** Estilos declarados en `styles.xml`, por índice en `cellXfs`. */
const ESTILO = {
  normal: 0,
  encabezado: 1,
  texto: 2,
  puntajeAlto: 3,
  puntajeMedio: 4,
  puntajeBajo: 5,
  negrita: 6,
  enlace: 7,
  nota: 8,
  titulo: 9,
} as const;

type Celda = { v: string | number; s?: number };

interface Hoja {
  nombre: string;
  /** Ancho de cada columna, en caracteres. */
  anchos: number[];
  filas: Celda[][];
  /** Fija la primera fila y activa el filtro automático sobre la cabecera. */
  filtrar: boolean;
}

function hojaXml(hoja: Hoja): string {
  const filas = hoja.filas
    .map((fila, f) => {
      const celdas = fila
        .map((celda, c) => {
          const ref = `${columna(c)}${f + 1}`;
          const estilo = celda.s === undefined ? "" : ` s="${celda.s}"`;
          if (typeof celda.v === "number") {
            return `<c r="${ref}"${estilo}><v>${celda.v}</v></c>`;
          }
          if (celda.v === "") return `<c r="${ref}"${estilo}/>`;
          return `<c r="${ref}"${estilo} t="inlineStr"><is><t xml:space="preserve">${xml(
            celda.v,
          )}</t></is></c>`;
        })
        .join("");
      return `<row r="${f + 1}">${celdas}</row>`;
    })
    .join("");

  const columnas = hoja.anchos
    .map((ancho, i) => `<col min="${i + 1}" max="${i + 1}" width="${ancho}" customWidth="1"/>`)
    .join("");

  const ultima = `${columna(Math.max(0, hoja.anchos.length - 1))}${hoja.filas.length}`;
  const vista = hoja.filtrar
    ? `<sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/></sheetView>`
    : `<sheetView workbookViewId="0" showGridLines="0"/>`;
  const filtro = hoja.filtrar ? `<autoFilter ref="A1:${ultima}"/>` : "";

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<dimension ref="A1:${ultima}"/>` +
    `<sheetViews>${vista}</sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    `<cols>${columnas}</cols>` +
    `<sheetData>${filas}</sheetData>` +
    filtro +
    `</worksheet>`
  );
}

const ESTILOS_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<fonts count="6">` +
  `<font><sz val="11"/><color theme="1"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="11"/><color theme="1"/><name val="Calibri"/></font>` +
  `<font><sz val="10"/><color rgb="FF1155CC"/><u/><name val="Calibri"/></font>` +
  `<font><i/><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="14"/><color rgb="FF14532D"/><name val="Calibri"/></font>` +
  `</fonts>` +
  `<fills count="6">` +
  `<fill><patternFill patternType="none"/></fill>` +
  `<fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FF14532D"/><bgColor indexed="64"/></patternFill></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFBBF7D0"/><bgColor indexed="64"/></patternFill></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFFEF08A"/><bgColor indexed="64"/></patternFill></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F6"/><bgColor indexed="64"/></patternFill></fill>` +
  `</fills>` +
  `<borders count="2">` +
  `<border><left/><right/><top/><bottom/><diagonal/></border>` +
  `<border><left/><right/><top/><bottom style="thin"><color rgb="FFE5E7EB"/></bottom><diagonal/></border>` +
  `</borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="10">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` +
  `<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>` +
  `<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>` +
  `<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>` +
  `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `<xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>` +
  `<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` +
  `<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

function construirLibro(hojas: Hoja[]): Buffer {
  const rel = (i: number) => `rId${i + 1}`;
  const idEstilos = `rId${hojas.length + 1}`;

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
          `<Relationship Id="${rel(i)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join("") +
    `<Relationship Id="${idEstilos}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  const libro =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
    hojas
      .map(
        (h, i) =>
          `<sheet name="${xml(h.nombre.slice(0, 31))}" sheetId="${i + 1}" r:id="${rel(i)}"/>`,
      )
      .join("") +
    `</sheets></workbook>`;

  const texto = (s: string) => Buffer.from(s, "utf8");

  return crearZip([
    { nombre: "[Content_Types].xml", contenido: texto(tipos) },
    { nombre: "_rels/.rels", contenido: texto(raiz) },
    { nombre: "xl/workbook.xml", contenido: texto(libro) },
    { nombre: "xl/_rels/workbook.xml.rels", contenido: texto(relaciones) },
    { nombre: "xl/styles.xml", contenido: texto(ESTILOS_XML) },
    ...hojas.map((h, i) => ({
      nombre: `xl/worksheets/sheet${i + 1}.xml`,
      contenido: texto(hojaXml(h)),
    })),
  ]);
}

// ---------------------------------------------------------------------------
// Lectura de los CSV del prospector
// ---------------------------------------------------------------------------

/** Parser de CSV con `;`, comillas dobles y saltos de línea dentro del campo. */
function leerCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let entreComillas = false;

  const limpio = texto.replace(/^﻿/, "");

  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i]!;
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
    else if (c === ";") {
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
  return filas.filter((f) => f.some((v) => v !== ""));
}

type Prospecto = Record<string, string>;

const VERTICALES = ["hoteles", "hostales", "restaurantes", "transporte", "agencias"] as const;
const ETIQUETA_VERTICAL: Record<string, string> = {
  hoteles: "Hoteles y Eco Lodges",
  hostales: "Hostales y Glampings",
  restaurantes: "Restaurantes y Cafés",
  transporte: "Transporte Turístico",
  agencias: "Agencias y Operadores",
};

/**
 * Une los CSV y deduplica por NIT.
 *
 * Un proveedor que aparece en varios perfiles no es un duplicado: es un
 * proveedor que sirve a varias verticales, y eso lo hace **más** interesante,
 * no menos. Se fusionan las columnas `perfiles` y `verticales` y se conserva el
 * puntaje más alto.
 */
function cargar(directorio: string): Prospecto[] {
  const porClave = new Map<string, Prospecto>();

  for (const archivo of readdirSync(directorio).filter((f) => f.endsWith(".csv"))) {
    const filas = leerCsv(readFileSync(join(directorio, archivo), "utf8"));
    const cabecera = filas[0];
    if (!cabecera) continue;

    for (const fila of filas.slice(1)) {
      const registro: Prospecto = Object.fromEntries(cabecera.map((h, i) => [h, fila[i] ?? ""]));
      const clave = registro.nit || `${registro.camara_comercio}-${registro.matricula}`;
      const previo = porClave.get(clave);

      if (!previo) {
        porClave.set(clave, registro);
        continue;
      }

      const unir = (campo: string) =>
        [...new Set(`${previo[campo] ?? ""} ${registro[campo] ?? ""}`.split(/\s+/).filter(Boolean))]
          .sort()
          .join(" ");

      previo.perfiles = unir("perfiles");
      previo.verticales = unir("verticales");
      previo.puntaje = String(Math.max(Number(previo.puntaje), Number(registro.puntaje)));
    }
  }

  return [...porClave.values()].sort(
    (a, b) =>
      Number(b.puntaje) - Number(a.puntaje) ||
      (a.razon_social ?? "").localeCompare(b.razon_social ?? ""),
  );
}

// ---------------------------------------------------------------------------
// Hojas
// ---------------------------------------------------------------------------

interface Columna {
  clave: string;
  titulo: string;
  ancho: number;
}

const COLUMNAS: Columna[] = [
  { clave: "razon_social", titulo: "Razón social", ancho: 46 },
  { clave: "sigla", titulo: "Sigla", ancho: 16 },
  { clave: "puntaje", titulo: "Puntaje", ancho: 9 },
  { clave: "verticales", titulo: "Vertical", ancho: 22 },
  { clave: "perfiles", titulo: "Perfil / necesidad", ancho: 30 },
  { clave: "ciiu_descripcion", titulo: "Actividad económica (CIIU)", ancho: 42 },
  { clave: "ciiu_principal", titulo: "CIIU", ancho: 7 },
  { clave: "camara_comercio", titulo: "Cámara de comercio", ancho: 20 },
  { clave: "organizacion_juridica", titulo: "Forma jurídica", ancho: 26 },
  { clave: "nit", titulo: "NIT", ancho: 13 },
  { clave: "matricula", titulo: "Matrícula", ancho: 13 },
  { clave: "anio_matricula", titulo: "Año matrícula", ancho: 10 },
  { clave: "ultimo_ano_renovado", titulo: "Última renovación", ancho: 11 },
  { clave: "motivos", titulo: "Por qué puntúa así", ancho: 54 },
  { clave: "vende_en_mercadolibre", titulo: "MercadoLibre", ancho: 11 },
  { clave: "buscar_web", titulo: "Buscar en la web", ancho: 18 },
  { clave: "buscar_instagram", titulo: "Buscar Instagram", ancho: 18 },
  { clave: "sitio_web", titulo: "Sitio web", ancho: 26 },
  { clave: "instagram", titulo: "Instagram", ancho: 22 },
  { clave: "correo", titulo: "Correo", ancho: 26 },
  { clave: "telefono", titulo: "Teléfono", ancho: 16 },
  { clave: "ciudad", titulo: "Ciudad", ancho: 18 },
  { clave: "departamento", titulo: "Departamento", ancho: 18 },
  { clave: "encaje", titulo: "Encaje", ancho: 12 },
  { clave: "notas", titulo: "Notas", ancho: 40 },
];

/**
 * Bandas calibradas contra la distribución real, no contra el 0-100 nominal.
 *
 * Sin la señal de MercadoLibre el techo práctico del puntaje es 87, no 100:
 * ningún candidato puede sumar los 20 puntos de presencia comercial. Sobre
 * 2.826 prospectos la mediana es 63 y solo 5 pasan de 80, así que cortar en 80
 * pintaba de verde a cinco empresas y de gris a todo lo demás — un semáforo que
 * no informa. Con 72 la banda alta queda en el 5% superior, que es una lista de
 * llamadas de una semana.
 */
function estiloPuntaje(puntaje: number): number {
  if (puntaje >= 72) return ESTILO.puntajeAlto;
  if (puntaje >= 63) return ESTILO.puntajeMedio;
  return ESTILO.puntajeBajo;
}

function hojaDeProspectos(nombre: string, registros: Prospecto[]): Hoja {
  const filas: Celda[][] = [
    COLUMNAS.map((c) => ({ v: c.titulo, s: ESTILO.encabezado })),
  ];

  for (const r of registros) {
    filas.push(
      COLUMNAS.map((c) => {
        const valor = r[c.clave] ?? "";
        if (c.clave === "puntaje") {
          const n = Number(valor);
          return { v: n, s: estiloPuntaje(n) };
        }
        if (c.clave === "verticales") {
          const etiquetas = valor
            .split(/\s+/)
            .filter(Boolean)
            .map((v) => ETIQUETA_VERTICAL[v] ?? v)
            .join(", ");
          return { v: etiquetas, s: ESTILO.texto };
        }
        if (c.clave.startsWith("buscar_")) {
          return { v: valor ? "buscar →" : "", s: ESTILO.enlace };
        }
        return { v: valor, s: ESTILO.texto };
      }),
    );
  }

  return { nombre, anchos: COLUMNAS.map((c) => c.ancho), filas, filtrar: true };
}

function contar(registros: Prospecto[], campo: string): Map<string, number> {
  const cuenta = new Map<string, number>();
  for (const r of registros) {
    for (const valor of (r[campo] ?? "").split(/\s+/).filter(Boolean)) {
      cuenta.set(valor, (cuenta.get(valor) ?? 0) + 1);
    }
  }
  return cuenta;
}

function hojaResumen(registros: Prospecto[], fecha: string): Hoja {
  const filas: Celda[][] = [];
  const linea = (...celdas: Celda[]) => filas.push(celdas);
  const titulo = (t: string) => {
    linea({ v: "" });
    linea({ v: t, s: ESTILO.titulo });
  };

  linea({ v: "Prospectos de proveedores — Seregenera", s: ESTILO.titulo });
  linea({
    v: `Generado el ${fecha} desde el RUES (registro mercantil, dato abierto de las 57 cámaras de comercio).`,
    s: ESTILO.nota,
  });
  linea({
    v: "El puntaje mide prospectabilidad, NO sostenibilidad. Un puntaje alto significa «vale la pena llamarlos», nunca «son un proveedor verificado». Ver la hoja Diccionario.",
    s: ESTILO.nota,
  });

  titulo("Totales");
  linea({ v: "Prospectos únicos (deduplicados por NIT)", s: ESTILO.texto }, { v: registros.length });
  const conNit = registros.filter((r) => r.nit).length;
  linea({ v: "Con NIT (facturables sin más trámite)", s: ESTILO.texto }, { v: conNit });
  linea(
    { v: "Sirven a más de una vertical", s: ESTILO.texto },
    { v: registros.filter((r) => (r.verticales ?? "").split(/\s+/).filter(Boolean).length > 1).length },
  );

  titulo("Por vertical");
  linea(
    { v: "Vertical", s: ESTILO.encabezado },
    { v: "Prospectos", s: ESTILO.encabezado },
    { v: "Prioridad alta", s: ESTILO.encabezado },
  );
  const porVertical = contar(registros, "verticales");
  for (const v of VERTICALES) {
    const altos = registros.filter(
      (r) => (r.verticales ?? "").includes(v) && Number(r.puntaje) >= 72,
    ).length;
    linea(
      { v: ETIQUETA_VERTICAL[v] ?? v, s: ESTILO.texto },
      { v: porVertical.get(v) ?? 0 },
      { v: altos },
    );
  }

  titulo("Por perfil (necesidad concreta de la vertical)");
  linea({ v: "Perfil", s: ESTILO.encabezado }, { v: "Prospectos", s: ESTILO.encabezado });
  for (const [perfil, n] of [...contar(registros, "perfiles")].sort((a, b) => b[1] - a[1])) {
    linea({ v: perfil, s: ESTILO.texto }, { v: n });
  }

  titulo("Por banda de puntaje");
  linea({ v: "Banda", s: ESTILO.encabezado }, { v: "Prospectos", s: ESTILO.encabezado });
  const bandas: [string, (n: number) => boolean][] = [
    ["72 o más · prioridad alta", (n) => n >= 72],
    ["63 a 71 · prioridad media", (n) => n >= 63 && n < 72],
    ["55 a 62 · revisar si sobra tiempo", (n) => n < 63],
  ];
  for (const [etiqueta, prueba] of bandas) {
    linea(
      { v: etiqueta, s: ESTILO.texto },
      { v: registros.filter((r) => prueba(Number(r.puntaje))).length },
    );
  }

  titulo("Por cámara de comercio (las 20 primeras)");
  linea({ v: "Cámara", s: ESTILO.encabezado }, { v: "Prospectos", s: ESTILO.encabezado });
  const porCamara = new Map<string, number>();
  for (const r of registros) {
    const c = r.camara_comercio ?? "";
    if (c) porCamara.set(c, (porCamara.get(c) ?? 0) + 1);
  }
  for (const [camara, n] of [...porCamara].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    linea({ v: camara, s: ESTILO.texto }, { v: n });
  }

  titulo("Por forma jurídica");
  linea({ v: "Forma", s: ESTILO.encabezado }, { v: "Prospectos", s: ESTILO.encabezado });
  const porForma = new Map<string, number>();
  for (const r of registros) {
    const f = r.organizacion_juridica ?? "";
    if (f) porForma.set(f, (porForma.get(f) ?? 0) + 1);
  }
  for (const [forma, n] of [...porForma].sort((a, b) => b[1] - a[1])) {
    linea({ v: forma, s: ESTILO.texto }, { v: n });
  }

  return { nombre: "Resumen", anchos: [56, 14, 14], filas, filtrar: false };
}

function hojaDiccionario(): Hoja {
  const filas: Celda[][] = [];
  const linea = (a: string, b = "", estilo: number = ESTILO.texto) =>
    filas.push([{ v: a, s: estilo }, { v: b, s: estilo }]);

  linea("Cómo leer este libro", "", ESTILO.titulo);
  linea(
    "Origen",
    "RUES — registro mercantil de las 57 cámaras de comercio, publicado como dato abierto en datos.gov.co (dataset c82u-588k). Solo empresas con matrícula ACTIVA y renovada.",
  );
  linea(
    "Qué NO es",
    "No es una lista de proveedores verificados ni contactados. Es el embudo de entrada: candidatos que valen una llamada.",
  );
  linea(
    "No es el universo",
    "Cada perfil aporta solo sus mejores candidatos, no todas las empresas que cumplen el filtro. El RUES tiene decenas de miles por perfil; esto es la cima del ranking. Que alguien no aparezca no significa que no exista.",
  );
  linea(
    "Columnas vacías",
    "Sitio web, Instagram, correo, teléfono, ciudad, departamento, encaje y notas se llenan al enriquecer, una por una. Vacío significa «todavía no se investigó», nunca «no existe».",
  );

  linea("");
  linea("Qué significa el puntaje", "", ESTILO.titulo);
  linea(
    "Mide prospectabilidad",
    "Qué tan probable es que valga la pena contactarlos. NO mide sostenibilidad: el nivel Semilla / Raíz / Bosque lo calcula el motor de la plataforma sobre evidencia que un administrador revisó.",
  );
  linea(
    "Cuidado con los altos",
    "El puntaje premia que el nombre contenga «eco», «bio» o «natural»: eso es posicionamiento, no práctica. Una empresa puede llamarse BIONATURAL y vender suplementos importados. Espera descartar una parte de los puntajes altos al revisarlos.",
  );

  linea("");
  linea("Pesos", "", ESTILO.titulo);
  const pesos: [string, string][] = [
    ["Renovó el año en curso", "20 — la señal más fiable de que está operando"],
    ["Renovó el año anterior", "12"],
    ["Nombre con carga sostenible", "12 por término, tope 30 — señal de marketing"],
    ["CIIU principal específico", "15 — es su negocio, no una actividad lateral"],
    ["CIIU principal «n.c.p.» (cajón de sastre)", "6 — el código no describe el negocio"],
    ["CIIU solo secundario", "5"],
    ["Asociativa o sin ánimo de lucro", "10 — encaja con los rasgos de impacto social"],
    ["Sociedad constituida (SAS, Ltda, SA)", "8"],
    ["Persona natural", "4"],
    ["10 o más años de operación", "12"],
    ["3 o más años", "8"],
    ["Vende en MercadoLibre", "20 — operación comercial montada y reputación pública"],
  ];
  for (const [señal, peso] of pesos) linea(señal, peso);

  linea("");
  linea("Bandas de color de la columna Puntaje", "", ESTILO.titulo);
  filas.push([{ v: "72 o más", s: ESTILO.puntajeAlto }, { v: "Prioridad alta — el 5% superior", s: ESTILO.texto }]);
  filas.push([{ v: "63 a 71", s: ESTILO.puntajeMedio }, { v: "Prioridad media", s: ESTILO.texto }]);
  filas.push([{ v: "55 a 62", s: ESTILO.puntajeBajo }, { v: "Revisar si sobra tiempo", s: ESTILO.texto }]);
  linea(
    "Por qué el corte no está en 80",
    "El puntaje es sobre 100, pero sin credenciales de MercadoLibre nadie puede sumar los 20 puntos de presencia comercial: el techo real es 87. La mediana de este lote es 63. Cortar en 80 dejaría cinco empresas en verde y todo lo demás en gris.",
  );

  linea("");
  linea("Límites de uso", "", ESTILO.titulo);
  linea(
    "Datos personales",
    "Son empresas y personas identificables. No se publican, no se suben a servicios de terceros y no se versionan en el repositorio, que es público.",
  );
  linea(
    "LinkedIn",
    "No se usa. Sus términos prohíben la extracción automatizada aunque el dato sea público, y hay condena judicial (hiQ Labs v. LinkedIn). Una persona puede abrir un perfil en su navegador; el repositorio no lo automatiza.",
  );
  linea(
    "Instagram y Facebook",
    "No se automatizan. La búsqueda de páginas de Facebook está deprecada y la de Instagram exige conocer de antemano el usuario. Se registra la URL de un perfil que aparezca públicamente, nada más.",
  );
  linea(
    "Contacto",
    "Este libro no contacta a nadie. El primer correo lo escribe una persona, con su nombre y su criterio.",
  );

  return { nombre: "Diccionario", anchos: [42, 96], filas, filtrar: false };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function bandera(nombre: string, porDefecto: string): string {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? porDefecto : (process.argv[i + 1] ?? porDefecto);
}

function main(): void {
  const entrada = bandera("entrada", join(".claude", "prospectos"));
  const directorioSalida = bandera("salida", "outputs");
  const fecha = new Date().toISOString().slice(0, 10);

  const registros = cargar(entrada);
  if (registros.length === 0) {
    console.error(
      `No hay CSV en ${entrada}. Corre primero: node scripts/prospectar.mts --perfil <slug>`,
    );
    process.exitCode = 1;
    return;
  }

  const hojas: Hoja[] = [hojaResumen(registros, fecha)];

  for (const v of VERTICALES) {
    const suyos = registros.filter((r) => (r.verticales ?? "").split(/\s+/).includes(v));
    if (suyos.length > 0) {
      hojas.push(hojaDeProspectos(ETIQUETA_VERTICAL[v] ?? v, suyos));
    }
  }

  hojas.push(hojaDeProspectos("Todos", registros));
  hojas.push(hojaDiccionario());

  mkdirSync(directorioSalida, { recursive: true });
  const salida = join(directorioSalida, `prospectos-proveedores-${fecha}.xlsx`);
  writeFileSync(salida, construirLibro(hojas));

  process.stderr.write(
    `${registros.length} prospectos únicos en ${hojas.length} hojas.\n`,
  );
  console.log(salida);
}

main();
