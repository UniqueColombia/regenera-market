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

const foto = (texto: string, tipo = "image/webp") => new Blob([texto], { type: tipo });

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
    expect(new TextDecoder().decode(leida?.cuerpo)).toBe("logo-1");
  });

  it("subir otra foto reemplaza el archivo y cambia la URL", async () => {
    const a = await almacen.guardar("logos", EMPRESA, foto("vieja"), "image/webp", "portada");
    await new Promise((r) => setTimeout(r, 5));
    const b = await almacen.guardar("logos", EMPRESA, foto("nueva"), "image/webp", "portada");
    if (!a.ok || !b.ok) throw new Error("no guardó");
    expect(a.url).not.toBe(b.url);
    const leida = await leerImagen(carpeta, pedazos(a.url));
    expect(new TextDecoder().decode(leida?.cuerpo)).toBe("nueva");
    // Sin temporales a medio escribir.
    expect((await readdir(join(carpeta, "logos", EMPRESA))).filter((n) => n.endsWith(".tmp"))).toEqual([]);
  });

  it("la extensión sale del tipo", async () => {
    const r = await almacen.guardar("avatares", EMPRESA, foto("x", "image/jpeg"), "image/jpeg");
    expect(r.ok && r.url.endsWith("/imagen.jpg")).toBe(true);
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
