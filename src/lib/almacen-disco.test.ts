import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AlmacenDisco, leerImagen } from "./almacen-disco";

let carpeta: string;
let almacen: AlmacenDisco;
const EMPRESA = "11111111-2222-4333-8444-555555555555";

beforeAll(async () => {
  carpeta = await mkdtemp(join(tmpdir(), "almacen-"));
  almacen = new AlmacenDisco(carpeta);
});
afterAll(() => rm(carpeta, { recursive: true, force: true }));

const FIRMA: Record<string, number[]> = {
  "image/webp": [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};
/** Una «foto» de mentira: la firma de su formato y un texto para reconocerla. */
const foto = (texto: string, tipo = "image/webp") => new Blob([new Uint8Array(FIRMA[tipo]), texto], { type: tipo });
/** El texto de una foto WebP de mentira (detrás de sus 12 bytes de firma). */
const textoDe = (cuerpo?: Uint8Array) => new TextDecoder().decode(cuerpo?.subarray(12));

/** `/archivos/logos/<dueño>/<versión>/<archivo>` → los cuatro pedazos que recibe la ruta. */
const pedazos = (url: string) => url.replace(/^\/archivos\//, "").split("/");

describe("AlmacenDisco", () => {
  it("guarda, devuelve una URL con la versión en la ruta y la sirve igual", async () => {
    const r = await almacen.guardar("logos", EMPRESA, foto("logo-1"), "image/webp");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.url).toMatch(new RegExp(`^/archivos/logos/${EMPRESA}/[a-z0-9]+/imagen\\.webp$`));
    const leida = await leerImagen(carpeta, pedazos(r.url));
    expect(leida?.tipo).toBe("image/webp");
    expect(textoDe(leida?.cuerpo)).toBe("logo-1");
  });

  it("subir otra foto reemplaza el archivo y cambia la URL", async () => {
    const a = await almacen.guardar("logos", EMPRESA, foto("vieja"), "image/webp", "portada");
    await new Promise((r) => setTimeout(r, 5));
    const b = await almacen.guardar("logos", EMPRESA, foto("nueva"), "image/webp", "portada");
    if (!a.ok || !b.ok) throw new Error("no guardó");
    expect(a.url).not.toBe(b.url);
    expect(textoDe((await leerImagen(carpeta, pedazos(b.url)))?.cuerpo)).toBe("nueva");
    // La URL vieja ya no sirve nada: su versión no es la del archivo.
    expect(await leerImagen(carpeta, pedazos(a.url))).toBeUndefined();
    // Sin temporales a medio escribir.
    expect((await readdir(join(carpeta, "logos", EMPRESA))).filter((n) => n.endsWith(".tmp"))).toEqual([]);
  });

  it("una versión inventada es un 404, aunque el archivo exista", async () => {
    const r = await almacen.guardar("logos", EMPRESA, foto("v"), "image/webp", "oferta-version");
    if (!r.ok) throw new Error("no guardó");
    const [bucket, duenio, , archivo] = pedazos(r.url);
    expect(await leerImagen(carpeta, [bucket, duenio, "zzzz1", archivo])).toBeUndefined();
    expect(await leerImagen(carpeta, pedazos(r.url))).toBeDefined();
  });

  it("quitar una pieza borra sus archivos; cambiar de formato no deja el anterior", async () => {
    const jpg = await almacen.guardar("avatares", EMPRESA, foto("j", "image/jpeg"), "image/jpeg", "portada");
    const webp = await almacen.guardar("avatares", EMPRESA, foto("w"), "image/webp", "portada");
    if (!jpg.ok || !webp.ok) throw new Error("no guardó");
    expect((await readdir(join(carpeta, "avatares", EMPRESA))).filter((n) => n.startsWith("portada."))).toEqual(["portada.webp"]);
    await almacen.borrarPieza("avatares", EMPRESA, "portada");
    expect(await leerImagen(carpeta, pedazos(webp.url))).toBeUndefined();
    await expect(almacen.borrarPieza("avatares", EMPRESA, "portada")).resolves.toBeUndefined();
  });

  it("la extensión sale del tipo", async () => {
    const r = await almacen.guardar("avatares", EMPRESA, foto("x", "image/jpeg"), "image/jpeg");
    expect(r.ok && r.url.endsWith("/imagen.jpg")).toBe(true);
  });

  it("no guarda lo que no es del tipo que dice ser", async () => {
    const html = new Blob(["<script>alert(1)</script>"], { type: "image/png" });
    expect((await almacen.guardar("avatares", EMPRESA, html, "image/png")).ok).toBe(false);
    expect((await almacen.guardar("avatares", EMPRESA, foto("x", "image/png"), "image/webp")).ok).toBe(false);
  });

  it("no escribe fuera de su carpeta", async () => {
    for (const duenio of ["../fuera", "..", "no-es-uuid", `${EMPRESA}/../../x`]) {
      expect((await almacen.guardar("logos", duenio, foto("x"), "image/webp")).ok).toBe(false);
    }
    // @ts-expect-error: un bucket que no existe
    expect((await almacen.guardar("../secretos", EMPRESA, foto("x"), "image/webp")).ok).toBe(false);
    expect((await almacen.guardar("logos", EMPRESA, foto("x"), "image/webp", "oferta-../../x")).ok).toBe(false);
  });

  it("no sirve nada que no haya podido escribir", async () => {
    const malas = [
      ["logos", EMPRESA, "v1"],
      ["logos", EMPRESA, "v1", "../../../package.json"],
      ["logos", "..", "v1", "imagen.webp"],
      ["otro", EMPRESA, "v1", "imagen.webp"],
      ["logos", EMPRESA, "..", "imagen.webp"],
      ["logos", EMPRESA, "v1", "imagen.svg"],
      ["logos", EMPRESA, "v1", "no-existe.webp"],
    ];
    for (const ruta of malas) expect(await leerImagen(carpeta, ruta)).toBeUndefined();
  });

  it("borrar la carpeta de un dueño se lleva sus fotos, y no lanza si no existe", async () => {
    const r = await almacen.guardar("logos", EMPRESA, foto("x"), "image/webp", "oferta-abc");
    if (!r.ok) throw new Error("no guardó");
    await almacen.borrarCarpeta("logos", EMPRESA);
    expect(await leerImagen(carpeta, pedazos(r.url))).toBeUndefined();
    await expect(almacen.borrarCarpeta("logos", EMPRESA)).resolves.toBeUndefined();
    await expect(almacen.borrarCarpeta("logos", "..")).resolves.toBeUndefined();
  });
});
