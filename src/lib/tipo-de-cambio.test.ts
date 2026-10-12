import { afterEach, describe, expect, it, vi } from "vitest";
import { aproxUsd } from "./format";
import { getFuenteDeCambio } from "./tipo-de-cambio";

afterEach(() => vi.unstubAllGlobals());

const responder = (cuerpo: unknown, ok = true) =>
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok, json: async () => cuerpo })));

describe("aproxUsd", () => {
  it("centavos por debajo de cien dólares, enteros por encima", () => {
    expect(aproxUsd(20_000, 3194.44)).toMatch(/^≈ US\$\s6,26$/);
    expect(aproxUsd(1_250_000, 3194.44)).toMatch(/^≈ US\$\s391$/);
  });
});

describe("la TRM", () => {
  it("lee la cotización vigente", async () => {
    responder([{ valor: "3194.44", unidad: "COP", vigenciadesde: "2026-10-10T00:00:00.000" }]);
    await expect(getFuenteDeCambio().cotizacionUsd()).resolves.toEqual({
      copPorUsd: 3194.44,
      vigenteDesde: "2026-10-10",
      fuente: "TRM de la Superintendencia Financiera de Colombia",
    });
  });

  // Un dato de cortesía que falla no puede tumbar la ficha: nunca lanza.
  it("si algo sale mal, no hay cotización y no lanza", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const cuerpo of [[], [{ valor: "0", unidad: "COP" }], [{ valor: "3194", unidad: "USD" }], [{ valor: "abc", unidad: "COP" }], {}]) {
      responder(cuerpo);
      await expect(getFuenteDeCambio().cotizacionUsd()).resolves.toBeUndefined();
    }
    responder([], false);
    await expect(getFuenteDeCambio().cotizacionUsd()).resolves.toBeUndefined();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("sin red"); }));
    await expect(getFuenteDeCambio().cotizacionUsd()).resolves.toBeUndefined();
  });
});
