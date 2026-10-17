import { describe, expect, it } from "vitest";
import { rutaPropia } from "./ruta-propia";

describe("rutaPropia", () => {
  it("deja pasar las rutas del sitio, con su consulta y su ancla", () => {
    expect(rutaPropia("/carrito")).toBe("/carrito");
    expect(rutaPropia("/oferta/coco-pacifico?x=1#fotos")).toBe("/oferta/coco-pacifico?x=1#fotos");
    expect(rutaPropia("/orden/SG-1234")).toBe("/orden/SG-1234");
  });

  it("rechaza lo que el navegador llevaría a otro dominio", () => {
    for (const malo of [
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "/\t/evil.com",
      "/\n/evil.com",
      "\\\\evil.com",
      "javascript:alert(1)",
      "evil.com",
    ]) {
      expect(rutaPropia(malo), JSON.stringify(malo)).toBeNull();
    }
  });

  it("sin valor, null", () => {
    expect(rutaPropia(undefined)).toBeNull();
    expect(rutaPropia(null)).toBeNull();
    expect(rutaPropia("")).toBeNull();
  });
});
