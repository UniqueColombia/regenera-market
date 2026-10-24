import { describe, expect, it } from "vitest";
import { leerLibro } from "./hoja-de-calculo";
import { plantillaDeProspectos } from "./plantilla-prospectos";
import { leerPlanillaDeProspectos } from "./prospectos";

describe("plantillaDeProspectos", () => {
  it("el importador la reconoce, y solo lee la hoja «Prospectos»", async () => {
    const hojas = await leerLibro(plantillaDeProspectos());
    const r = leerPlanillaDeProspectos(hojas, { incluirDescartados: true, incluirSinContacto: true, fuente: "prueba" });
    // En blanco no hay filas, pero la hoja se reconoce: los títulos están en
    // `ALIAS`. «Instrucciones» y «Listas» no deben leerse como prospectos.
    expect(r.hojas).toEqual(["Prospectos"]);
    expect(r.filas).toEqual([]);
  });
});
