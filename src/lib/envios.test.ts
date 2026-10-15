import { describe, expect, it } from "vitest";
import { condicionesDeEnvio, envioDeLinea, mismoDepartamento } from "./envios";
import { money } from "./format";

describe("envioDeLinea (0017)", () => {
  const envio = { costoCop: 10_000, costoLocalCop: 6_000, adicionalCop: 2_000 };

  it("cobra la local si el destino es el departamento de origen, más cada unidad adicional", () => {
    expect(envioDeLinea(envio, "Magdalena", 1, "Magdalena")).toBe(6_000);
    expect(envioDeLinea(envio, "Magdalena", 3, "Magdalena")).toBe(10_000);
  });

  it("cobra la nacional a cualquier otro destino, y también sin destino todavía", () => {
    expect(envioDeLinea(envio, "Magdalena", 3, "Antioquia")).toBe(14_000);
    expect(envioDeLinea(envio, "Magdalena", 1)).toBe(10_000);
  });

  it("sin departamento de origen no hay tarifa local", () => {
    expect(envioDeLinea(envio, undefined, 1, "Magdalena")).toBe(10_000);
  });

  it("un producto de antes de la 0017 cobra lo mismo con una unidad que con cien", () => {
    expect(envioDeLinea({ costoCop: 17_000 }, "Magdalena", 1, "Magdalena")).toBe(17_000);
    expect(envioDeLinea({ costoCop: 17_000 }, "Magdalena", 100, "Antioquia")).toBe(17_000);
  });

  it("sin tarifa declarada no cobra nada, y gratis es gratis", () => {
    expect(envioDeLinea(undefined, "Magdalena", 5, "Magdalena")).toBe(0);
    expect(envioDeLinea({ costoCop: 0 }, "Magdalena", 5, "Antioquia")).toBe(0);
  });

  it("compara departamentos sin tildes ni mayúsculas", () => {
    expect(mismoDepartamento("Bogotá D.C.", " bogota d.c. ")).toBe(true);
    expect(mismoDepartamento("Nariño", "Narino")).toBe(true);
    expect(mismoDepartamento("Nariño", "")).toBe(false);
    expect(mismoDepartamento(undefined, "Nariño")).toBe(false);
  });
});

describe("condicionesDeEnvio", () => {
  it("dice la local y lo que suma cada unidad", () => {
    const c = condicionesDeEnvio({ costoCop: 10_000, costoLocalCop: 6_000, adicionalCop: 2_000 }, "Magdalena", money);
    expect(c).toHaveLength(2);
    expect(c[0]).toContain("dentro de Magdalena");
    expect(c[1]).toContain("cada unidad adicional");
  });

  it("no dice nada de más si solo hay tarifa nacional", () => {
    expect(condicionesDeEnvio({ costoCop: 10_000 }, "Magdalena", money)).toEqual([]);
  });
});
