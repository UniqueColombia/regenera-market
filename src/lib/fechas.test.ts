import { describe, expect, it } from "vitest";
import { esFecha, revisarPlan, sumarDias } from "./fechas";

const HOY = "2026-10-22";

describe("esFecha y sumarDias", () => {
  it("acepta solo días que existen, en AAAA-MM-DD", () => {
    expect(esFecha("2026-10-22")).toBe(true);
    expect(esFecha("2028-02-29")).toBe(true);
    expect(esFecha("2026-02-30")).toBe(false);
    expect(esFecha("22/10/2026")).toBe(false);
    expect(esFecha("")).toBe(false);
    expect(esFecha(20261022)).toBe(false);
  });

  it("suma días cruzando meses y años", () => {
    expect(sumarDias("2026-10-31", 1)).toBe("2026-11-01");
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(sumarDias(HOY, 0)).toBe(HOY);
  });
});

describe("revisarPlan", () => {
  it("quien reserva elige el día: no lleva fechas", () => {
    expect(revisarPlan({ modo: "cliente" }, HOY)).toEqual({ ok: true, plan: { modo: "cliente" } });
  });

  it("fechas fijas: convierte el cupo escrito en número", () => {
    const r = revisarPlan(
      { modo: "proveedor", fechas: [{ date: HOY, total: "12" }, { date: "2026-11-05", total: 8 }] },
      HOY,
    );
    expect(r).toEqual({
      ok: true,
      plan: { modo: "proveedor", fechas: [{ date: HOY, total: 12 }, { date: "2026-11-05", total: 8 }] },
    });
  });

  it("rechaza fechas pasadas, repetidas, vacías o a más de dos años", () => {
    const r = revisarPlan(
      {
        modo: "proveedor",
        fechas: [
          { date: "2026-10-21", total: 5 },
          { date: "2026-11-05", total: 5 },
          { date: "2026-11-05", total: 6 },
          { date: "", total: 5 },
          { date: "2028-12-01", total: 5 },
        ],
      },
      HOY,
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errores).toHaveLength(4);
  });

  it("el cupo es un entero entre 1 y 10.000", () => {
    for (const total of [0, -1, 2.5, "", "diez", 10_001]) {
      expect(revisarPlan({ modo: "proveedor", fechas: [{ date: HOY, total }] }, HOY).ok).toBe(false);
    }
  });

  it("fechas fijas sin ninguna fecha no se guardan", () => {
    const r = revisarPlan({ modo: "proveedor", fechas: [] }, HOY);
    expect(r).toEqual({ ok: false, errores: [expect.stringContaining("al menos una fecha")] });
  });

  it("un plan que no se puede leer no se guarda", () => {
    expect(revisarPlan({ modo: "otro" }, HOY).ok).toBe(false);
    expect(revisarPlan(null, HOY).ok).toBe(false);
  });
});
