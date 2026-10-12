import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aproxUsd } from "./format";
import { getFuenteDeCambio, olvidarCotizacion } from "./tipo-de-cambio";

const JSON_OK = [{ valor: "3194.44", unidad: "COP", vigenciadesde: "2026-10-10T00:00:00.000" }];
const SOAP_OK =
  "<soap:Envelope><soap:Body><return><unit>COP</unit><validityFrom>2026-10-10T00:00:00-05:00</validityFrom>" +
  "<value>3194.44</value><success>true</success></return></soap:Body></soap:Envelope>";
const ESPERADA = {
  copPorUsd: 3194.44,
  vigenteDesde: "2026-10-10",
  fuente: "TRM de la Superintendencia Financiera de Colombia",
};

/** Simula las dos fuentes: `datos` responde a datos.gov.co, `soap` a la Superintendencia. */
function fuentes(datos: () => unknown, soap: () => unknown) {
  const f = vi.fn(async (url: string) => {
    const r = (url.includes("datos.gov.co") ? datos : soap)();
    if (r instanceof Error) throw r;
    return r;
  });
  vi.stubGlobal("fetch", f);
  return f;
}
const ok = (cuerpo: unknown) => () => ({
  ok: true,
  json: async () => cuerpo,
  text: async () => String(cuerpo),
});
const http = (status: number) => () => ({ ok: false, status });

beforeEach(() => {
  olvidarCotizacion();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("aproxUsd", () => {
  it("centavos por debajo de cien dólares, enteros por encima", () => {
    expect(aproxUsd(20_000, 3194.44)).toMatch(/^≈ US\$\s6,26$/);
    expect(aproxUsd(1_250_000, 3194.44)).toMatch(/^≈ US\$\s391$/);
  });
});

describe("la TRM", () => {
  it("la lee de datos.gov.co", async () => {
    fuentes(ok(JSON_OK), http(500));
    await expect(getFuenteDeCambio().cotizacionUsd()).resolves.toEqual(ESPERADA);
  });

  it("si datos.gov.co falla, la lee del servicio de la Superintendencia", async () => {
    for (const falla of [http(429), () => new Error("timeout"), ok([]), ok([{ valor: "0", unidad: "COP" }])]) {
      olvidarCotizacion();
      fuentes(falla, ok(SOAP_OK));
      await expect(getFuenteDeCambio().cotizacionUsd()).resolves.toEqual(ESPERADA);
    }
  });

  // Un dato de cortesía que falla no puede tumbar la ficha: nunca lanza.
  it("si las dos fallan, no hay cotización y no lanza", async () => {
    fuentes(http(503), () => new Error("sin red"));
    await expect(getFuenteDeCambio().cotizacionUsd()).resolves.toBeUndefined();
    olvidarCotizacion();
    fuentes(ok([{ valor: "3194", unidad: "USD" }]), ok("<success>false</success>"));
    await expect(getFuenteDeCambio().cotizacionUsd()).resolves.toBeUndefined();
  });

  it("recuerda el resultado: no vuelve a preguntar en cada visita", async () => {
    const f = fuentes(ok(JSON_OK), http(500));
    await getFuenteDeCambio().cotizacionUsd();
    await getFuenteDeCambio().cotizacionUsd();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("también recuerda un fallo, para no esperar a una fuente caída", async () => {
    const f = fuentes(http(503), http(503));
    await getFuenteDeCambio().cotizacionUsd();
    await getFuenteDeCambio().cotizacionUsd();
    expect(f).toHaveBeenCalledTimes(2);
  });
});
