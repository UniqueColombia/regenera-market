import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined }) }));

const { PASE_CLAVE, PASE_RECUPERACION, paseValido, sellarPase } = await import("./pase");

const SECRETO = "un-secreto-de-prueba-largo";
const AHORA = 1_800_000_000;

describe("pases firmados", () => {
  const pase = sellarPase(PASE_CLAVE, "Ana@Ejemplo.com", AHORA + 600, SECRETO);

  it("vale para el mismo correo, sin importar mayúsculas", () => {
    expect(paseValido(pase, PASE_CLAVE, "ana@ejemplo.com", SECRETO, AHORA)).toBe(true);
  });

  it("no vale para otro correo, otro tipo, vencido o con otro secreto", () => {
    expect(paseValido(pase, PASE_CLAVE, "beto@ejemplo.com", SECRETO, AHORA)).toBe(false);
    expect(paseValido(pase, PASE_RECUPERACION, "ana@ejemplo.com", SECRETO, AHORA)).toBe(false);
    expect(paseValido(pase, PASE_CLAVE, "ana@ejemplo.com", SECRETO, AHORA + 601)).toBe(false);
    expect(paseValido(pase, PASE_CLAVE, "ana@ejemplo.com", "otro-secreto-cualquiera", AHORA)).toBe(false);
  });

  it("no se puede alargar ni fabricar sin el secreto", () => {
    const [t, s, , f] = pase.split(".");
    expect(paseValido(`${t}.${s}.${AHORA + 99_999}.${f}`, PASE_CLAVE, "ana@ejemplo.com", SECRETO, AHORA)).toBe(false);
    expect(paseValido(`${t}.${s}.${AHORA + 600}`, PASE_CLAVE, "ana@ejemplo.com", SECRETO, AHORA)).toBe(false);
    expect(paseValido(undefined, PASE_CLAVE, "ana@ejemplo.com", SECRETO, AHORA)).toBe(false);
  });
});
