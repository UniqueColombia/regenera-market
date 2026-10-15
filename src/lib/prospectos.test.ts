import { describe, expect, it } from "vitest";
import { correoDeCampana } from "./correo/plantillas";
import type { Hoja } from "./hoja-de-calculo";
import { enlaceDeWhatsApp, leerPlanillaDeProspectos, limpiarCorreo, numeroDeWhatsApp, rellenar } from "./prospectos";

/** Una hoja con los títulos del Excel que genera `scripts/exportar-excel.mts`. */
const DEL_PROSPECTOR: Hoja = {
  nombre: "Hoteles y Eco Lodges",
  filas: [
    ["Razón social", "NIT", "Sitio web", "Correo", "Teléfono", "Ciudad", "Departamento", "Encaje", "Notas"],
    ["CACAO DE LA SIERRA SAS", "900123456", "https://cacao.test", "Ventas@Cacao.test", "", "Santa Marta", "Magdalena", "alto", ""],
    ["SIN CONTACTO LTDA", "900000001", "", "", "", "Bogotá", "Bogotá D.C.", "medio", ""],
    ["DESCARTADA SAS", "900000002", "", "x@descartada.test", "", "Cali", "Valle del Cauca", "descartar", ""],
    ["CACAO DE LA SIERRA SAS", "900123456", "", "otra@cacao.test", "", "", "", "alto", "repetida por NIT"],
    ["CAFÉ DEL HUILA", "", "", "", "310 555 1234", "Pitalito", "Huila", "bajo", ""],
  ],
};
const RESUMEN: Hoja = { nombre: "Resumen", filas: [["Vertical", "Prospectos"], ["Hoteles", "5"]] };

describe("leerPlanillaDeProspectos", () => {
  it("lee el Excel del prospector, salta el resumen, los descartados, los sin contacto y los repetidos", () => {
    const r = leerPlanillaDeProspectos([RESUMEN, DEL_PROSPECTOR], {
      incluirDescartados: false,
      incluirSinContacto: false,
      fuente: "Planilla prueba.xlsx",
    });
    expect(r.hojas).toEqual(["Hoteles y Eco Lodges"]);
    expect(r.filas.map((f) => f.nombre)).toEqual(["CACAO DE LA SIERRA SAS", "CAFÉ DEL HUILA"]);
    expect(r.filas[0]).toMatchObject({ correo: "ventas@cacao.test", nit: "900123456", encaje: "alto", fuente: "Planilla prueba.xlsx" });
    expect(r.descartadas).toBe(1);
    expect(r.sinContacto).toBe(1);
  });

  it("incluye descartados y sin contacto si se pide", () => {
    const r = leerPlanillaDeProspectos([DEL_PROSPECTOR], {
      incluirDescartados: true,
      incluirSinContacto: true,
      fuente: "x",
    });
    expect(r.filas).toHaveLength(4);
  });
});

describe("contacto", () => {
  it("limpia correos y se queda con el primero de una celda con varios", () => {
    expect(limpiarCorreo(" mailto:Hola@Empresa.co ; otro@x.co")).toBe("hola@empresa.co");
    expect(limpiarCorreo("no tiene")).toBeUndefined();
  });

  it("arma el número de WhatsApp solo para celulares", () => {
    expect(numeroDeWhatsApp("310 555 1234")).toBe("573105551234");
    expect(numeroDeWhatsApp("+57 310-555-1234")).toBe("573105551234");
    expect(numeroDeWhatsApp("(601) 555 1234")).toBeUndefined();
    const enlace = enlaceDeWhatsApp({ nombre: "Café del Huila", telefono: "3105551234", token: "abc" }, "https://seregenera.test");
    expect(enlace).toMatch(/^https:\/\/wa\.me\/573105551234\?text=/);
    expect(decodeURIComponent(enlace!)).toContain("https://seregenera.test/vender?invitacion=abc");
  });

  it("rellena {empresa} y {ciudad}", () => {
    expect(rellenar("Hola {empresa}, de {ciudad}", { nombre: "Cacao", ciudad: "Santa Marta" })).toBe("Hola Cacao, de Santa Marta");
  });
});

describe("correoDeCampana", () => {
  const base = {
    para: "ventas@cacao.test",
    empresa: "Cacao <la> Sierra",
    asunto: "Te invitamos",
    cuerpo: "Hola, equipo:\n\nPrimer párrafo.\n\nSegundo.",
    token: "11111111-2222-4333-8444-555555555555",
    responderA: "contacto@seregenera.test",
  };

  it("la invitación lleva el botón de alta, la baja visible y las cabeceras de baja", () => {
    const m = correoDeCampana({ ...base, tipo: "invitacion" });
    expect(m.html).toContain(`/vender?invitacion=${base.token}`);
    expect(m.html).toContain(`/baja?t=${base.token}`);
    expect(m.html).toContain("Cacao &lt;la&gt; Sierra");
    expect(m.html).not.toContain("<la>");
    expect(m.texto).toContain(`/baja?t=${base.token}`);
    expect(m.cabeceras?.["List-Unsubscribe"]).toContain(`/api/baja?t=${base.token}`);
    expect(m.cabeceras?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(m.responderA).toBe(base.responderA);
  });

  it("la noticia no lleva el botón de alta, pero sí la baja", () => {
    const m = correoDeCampana({ ...base, tipo: "noticia" });
    expect(m.html).not.toContain("/vender?invitacion=");
    expect(m.html).toContain(`/baja?t=${base.token}`);
  });
});
