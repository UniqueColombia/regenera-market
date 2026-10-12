import { describe, expect, it } from "vitest";
import { grupoDePersonas, miles, pesosDesdeTexto } from "./format";

describe("pesosDesdeTexto", () => {
  it("lee los números como los escribe la gente en Colombia", () => {
    expect(pesosDesdeTexto("20000")).toBe(20_000);
    expect(pesosDesdeTexto("20.000")).toBe(20_000);
    expect(pesosDesdeTexto("1.250.000")).toBe(1_250_000);
    expect(pesosDesdeTexto("20,000")).toBe(20_000);
    expect(pesosDesdeTexto("$ 20.000 COP")).toBe(20_000);
    expect(pesosDesdeTexto("0")).toBe(0);
  });

  // El fallo de la revisión del 2026-10-12: «20.000» se guardaba como 20.
  it("nunca lee «20.000» como veinte", () => {
    expect(pesosDesdeTexto("20.000")).not.toBe(20);
  });

  it("rechaza lo que solo se podría adivinar", () => {
    for (const t of ["20.5", "1,50", "20.00", "2.0000", "abc", "-5", "20.000,50", "1.000.00"]) {
      expect(pesosDesdeTexto(t), t).toBeNaN();
    }
  });

  it("vacío es null, no cero", () => {
    expect(pesosDesdeTexto("")).toBeNull();
    expect(pesosDesdeTexto("   ")).toBeNull();
    expect(pesosDesdeTexto(null)).toBeNull();
    expect(pesosDesdeTexto(undefined)).toBeNull();
  });

  it("lee lo que muestra miles()", () => {
    for (const n of [0, 7, 999, 1_000, 20_000, 1_250_000, 987_654_321]) {
      expect(pesosDesdeTexto(miles(n))).toBe(n);
    }
  });
});

describe("miles", () => {
  it("agrupa con punto, también los de cuatro cifras", () => {
    expect(miles(20_000)).toBe("20.000");
    expect(miles(1_000)).toBe("1.000");
    expect(miles(999)).toBe("999");
  });
});

describe("grupoDePersonas", () => {
  it("dice lo que hay y nada más", () => {
    expect(grupoDePersonas(4, 12)).toBe("4 a 12 personas");
    expect(grupoDePersonas(4, 4)).toBe("4 personas");
    expect(grupoDePersonas(4)).toBe("Desde 4 personas");
    expect(grupoDePersonas(undefined, 1)).toBe("Hasta 1 persona");
    expect(grupoDePersonas()).toBeUndefined();
  });
});
