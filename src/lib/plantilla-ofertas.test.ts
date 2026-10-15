import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { escribirLibro, leerCsv, leerLibro } from "./hoja-de-calculo";
import { CamposOfertaEmpresa, reglasDeOferta } from "./ofertas";
import { COLUMNAS, coincideConTitulo, convertirFila, leerPlanillaDeOfertas, plantillaDeOfertas } from "./plantilla-ofertas";

/** Vuelve a empaquetar un ZIP almacenado con deflate, como lo guarda Excel. */
function comprimir(zip: Uint8Array): Uint8Array {
  const b = Buffer.from(zip);
  const fin = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const total = b.readUInt16LE(fin + 10);
  let p = b.readUInt32LE(fin + 16);
  const entradas: { nombre: Buffer; datos: Buffer; crc: number }[] = [];
  for (let n = 0; n < total; n++) {
    const largo = b.readUInt16LE(p + 28);
    const nombre = b.subarray(p + 46, p + 46 + largo);
    const local = b.readUInt32LE(p + 42);
    const tam = b.readUInt32LE(p + 20);
    const inicio = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    entradas.push({ nombre, datos: b.subarray(inicio, inicio + tam), crc: b.readUInt32LE(p + 16) });
    p += 46 + largo + b.readUInt16LE(p + 30) + b.readUInt16LE(p + 32);
  }
  const partes: Buffer[] = [];
  const central: Buffer[] = [];
  let desp = 0;
  for (const e of entradas) {
    const comp = deflateRawSync(e.datos);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(8, 8);
    h.writeUInt32LE(e.crc, 14);
    h.writeUInt32LE(comp.length, 18);
    h.writeUInt32LE(e.datos.length, 22);
    h.writeUInt16LE(e.nombre.length, 26);
    partes.push(h, e.nombre, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(8, 10);
    c.writeUInt32LE(e.crc, 16);
    c.writeUInt32LE(comp.length, 20);
    c.writeUInt32LE(e.datos.length, 24);
    c.writeUInt16LE(e.nombre.length, 28);
    c.writeUInt32LE(desp, 42);
    central.push(c, e.nombre);
    desp += 30 + e.nombre.length + comp.length;
  }
  const dir = Buffer.concat(central);
  const f = Buffer.alloc(22);
  f.writeUInt32LE(0x06054b50, 0);
  f.writeUInt16LE(entradas.length, 8);
  f.writeUInt16LE(entradas.length, 10);
  f.writeUInt32LE(dir.length, 12);
  f.writeUInt32LE(desp, 16);
  return new Uint8Array(Buffer.concat([...partes, dir, f]));
}

describe("la plantilla de ofertas", () => {
  it("se lee de vuelta: cuatro hojas y los títulos de todas las columnas", async () => {
    const hojas = await leerLibro(plantillaDeOfertas());
    expect(hojas.map((h) => h.nombre)).toEqual(["Ofertas", "Instrucciones", "Ejemplo", "Listas"]);
    expect(hojas[0].filas[0]).toEqual(COLUMNAS.map((c) => c.titulo));
  });

  it("también se lee comprimida, como la guarda Excel", async () => {
    const hojas = await leerLibro(comprimir(plantillaDeOfertas()));
    expect(hojas[0].filas[0][1]).toBe("Título");
  });

  it("los tres ejemplos son ofertas válidas para una empresa", async () => {
    const hojas = await leerLibro(plantillaDeOfertas());
    const ejemplo = hojas.find((h) => h.nombre === "Ejemplo")!;
    // El lector salta la hoja «Ejemplo» a propósito; se renombra para leerla.
    const leida = leerPlanillaDeOfertas([{ ...ejemplo, nombre: "Ofertas" }]);
    if ("error" in leida) throw new Error(leida.error);
    expect(leida.filas).toHaveLength(3);
    for (const fila of leida.filas) {
      const c = convertirFila(fila.valores);
      expect(c.errores, `fila ${fila.numero}`).toEqual({});
      const r = CamposOfertaEmpresa.safeParse({ ...c.datos, images: "" });
      expect(r.success, `fila ${fila.numero}: ${JSON.stringify(r.error?.issues)}`).toBe(true);
      if (r.success) expect(reglasDeOferta(r.data, { logistica: true, zonas: true })).toEqual({});
    }
  });

  it("una empresa puede publicar sin contar su impacto ambiental", async () => {
    const hojas = await leerLibro(plantillaDeOfertas());
    const ejemplo = hojas.find((h) => h.nombre === "Ejemplo")!;
    const leida = leerPlanillaDeOfertas([{ ...ejemplo, nombre: "Ofertas" }]);
    if ("error" in leida) throw new Error(leida.error);
    for (const fila of leida.filas) {
      const c = convertirFila({ ...fila.valores, aporteAmbiental: "", consecuenciaAmbiental: "" });
      const r = CamposOfertaEmpresa.safeParse({ ...c.datos, images: "" });
      expect(r.success, `fila ${fila.numero}: ${JSON.stringify(r.error?.issues)}`).toBe(true);
    }
    // Ninguna de las dos columnas se marca como obligatoria en la plantilla.
    for (const clave of ["aporteAmbiental", "consecuenciaAmbiental"]) {
      expect(COLUMNAS.find((c) => c.clave === clave)?.obligatoria).toBe("no");
    }
  });

  it("reconoce las columnas por su título aunque cambien de orden o falten", async () => {
    const libro = escribirLibro([
      {
        nombre: "Mis productos",
        anchos: [],
        filas: [
          [{ v: "PRECIO" }, { v: "titulo" }, { v: "Tipo" }, { v: "Categoria" }, { v: "Notas internas" }],
          [{ v: "20.000" }, { v: "Jabón de café" }, { v: "producto" }, { v: "habitación y hospitalidad" }, { v: "x" }],
          [],
        ],
      },
    ]);
    const leida = leerPlanillaDeOfertas(await leerLibro(libro));
    if ("error" in leida) throw new Error(leida.error);
    expect(leida.desconocidas).toEqual(["Notas internas"]);
    expect(leida.filas).toHaveLength(1);
    const c = convertirFila(leida.filas[0].valores);
    expect(c.datos).toMatchObject({ kind: "product", category: "habitacion", priceCop: "20.000", title: "Jabón de café" });
  });

  it("dice qué no reconoce, sin inventar", () => {
    const c = convertirFila({ kind: "Artesanía", category: "Joyería", department: "Texas", verticals: "Hoteles; Cruceros" });
    expect(Object.keys(c.errores).sort()).toEqual(["category", "department", "kind", "verticals"]);
  });

  it("traduce sí/no, listas con punto y coma y decimales con coma", () => {
    const c = convertirFila({
      kind: "Experiencia",
      quoteOnly: "Sí",
      includes: "Guía; refrigerio ;seguro",
      durationHours: "2,5",
      verticals: "Hoteles; Agencias y Operadores",
      fotos: "a.jpg; B.JPG",
    });
    expect(c.datos.quoteOnly).toBe(true);
    expect(c.datos.includes).toBe("Guía\nrefrigerio\nseguro");
    expect(c.datos.durationHours).toBe("2.5");
    expect(c.datos.verticals).toEqual(["hoteles", "agencias"]);
    expect(c.fotos).toEqual(["a.jpg", "B.JPG"]);
  });

  it("rechaza un enlace de foto que no es una imagen directa", () => {
    expect(convertirFila({ fotos: "https://drive.google.com/file/d/abc/view" }).errores.fotos).toBeDefined();
    expect(convertirFila({ fotos: "https://ejemplo.com/cacao.jpg" }).errores.fotos).toBeUndefined();
  });
});

describe("coincideConTitulo", () => {
  const titulo = "Cacao Arhuaco 72 % (100 g)";

  it("une la foto que se llama como la oferta, con o sin número", () => {
    expect(coincideConTitulo("Cacao Arhuaco 72 % (100 g).jpg", titulo)).toBe(true);
    expect(coincideConTitulo("cacao-arhuaco-72-100-g.JPG", titulo)).toBe(true);
    expect(coincideConTitulo("cacao-arhuaco-72-100-g-2.png", titulo)).toBe(true);
    expect(coincideConTitulo("C:\\fotos\\Cacao Arhuaco 72 100 g_3.webp", titulo)).toBe(true);
  });

  it("ignora tildes y mayúsculas", () => {
    expect(coincideConTitulo("CAMINATA-A-LA-CASCADA.jpg", "Caminata a la cascada")).toBe(true);
    expect(coincideConTitulo("diagnostico-de-agua.jpg", "Diagnóstico de agua")).toBe(true);
  });

  it("no une una foto que solo menciona parte del título ni la de otra oferta", () => {
    expect(coincideConTitulo("cacao.jpg", titulo)).toBe(false);
    expect(coincideConTitulo("cacao-arhuaco-72-100-g-etiqueta.jpg", titulo)).toBe(false);
    expect(coincideConTitulo("cacao-arhuaco-72-100-g-2000.jpg", titulo)).toBe(false);
    expect(coincideConTitulo("cacao.jpg", "")).toBe(false);
  });
});

describe("leerCsv", () => {
  it("adivina el separador y respeta comillas y saltos de línea", () => {
    expect(leerCsv('﻿Tipo;Título\nProducto;"Café; molido"\n')).toEqual([
      ["Tipo", "Título"],
      ["Producto", "Café; molido"],
    ]);
    expect(leerCsv('Tipo,Título\r\nServicio,"Dos\nlíneas"')).toEqual([
      ["Tipo", "Título"],
      ["Servicio", "Dos\nlíneas"],
    ]);
  });
});
