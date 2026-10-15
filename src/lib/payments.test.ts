import { createHash, createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getGateway } from "./payments";
import type { Order } from "./types";

const orden = {
  reference: "SR-261014-AB12",
  totalCop: 39400,
  buyerEmail: "compra@hotel.test",
  buyerName: "Hotel de Prueba",
} as Order;

afterEach(() => vi.unstubAllEnvs());

function conBold({ pruebas = false } = {}) {
  vi.stubEnv("BOLD_LLAVE_IDENTIDAD", "llave-identidad");
  vi.stubEnv("BOLD_LLAVE_SECRETA", "kgfq2nN0o52XqnuXZWIN2F");
  vi.stubEnv("BOLD_MODO_PRUEBAS", pruebas ? "1" : "");
  vi.stubEnv("VERCEL_ENV", "preview");
}

/** Lo que manda BOLD al webhook, según su documentación. */
function aviso(tipo = "SALE_APPROVED", total = 39400) {
  return JSON.stringify({
    id: "evento-1",
    type: tipo,
    subject: "CNPVI70CQC0EY",
    data: {
      payment_id: "CNPVI70CQC0EY",
      amount: { total, currency: "COP" },
      metadata: { reference: orden.reference },
      payment_method: "CARD_WEB",
    },
  });
}

const firmar = (cuerpo: string, clave: string) =>
  createHmac("sha256", clave).update(Buffer.from(cuerpo).toString("base64")).digest("hex");

describe("sin llaves de pasarela", () => {
  it("solo hay pago manual, y sin datos de cuenta se dice a quién escribir", async () => {
    vi.stubEnv("BOLD_LLAVE_IDENTIDAD", "");
    const intento = await getGateway().createIntent(orden);
    expect(intento.provider).toBe("manual");
    expect(intento.enLinea).toBeUndefined();
    expect(intento.manual.pasos.join(" ")).toContain("te mandamos los datos");
  });

  it("con llave Bre-B y cuenta, las dos aparecen con la referencia", async () => {
    vi.stubEnv("BOLD_LLAVE_IDENTIDAD", "");
    vi.stubEnv("PAGO_LLAVE_BREB", "@seregenera");
    vi.stubEnv("PAGO_NUMERO_CUENTA", "123-456789-00");
    vi.stubEnv("PAGO_BANCO", "Banco de Prueba");
    const { manual } = await getGateway().createIntent(orden);
    expect(manual.datos.map((d) => d.etiqueta)).toEqual(["Valor", "Referencia", "Llave Bre-B", "Cuenta", "Titular"]);
    expect(manual.datos[0].copiar).toBe("39400");
    expect(manual.pasos.join(" ")).toContain(orden.reference);
  });
});

describe("BOLD", () => {
  it("firma el cobro como dice su documentación: sha256 de referencia, monto, divisa y llave secreta", async () => {
    conBold();
    const { enLinea, provider } = await getGateway().createIntent(orden);
    expect(provider).toBe("bold");
    const esperada = createHash("sha256").update(`${orden.reference}39400COPkgfq2nN0o52XqnuXZWIN2F`).digest("hex");
    expect(enLinea?.atributos["data-integrity-signature"]).toBe(esperada);
    expect(enLinea?.atributos["data-amount"]).toBe("39400");
    expect(enLinea?.atributos["data-order-id"]).toBe(orden.reference);
    // La llave secreta no viaja al navegador por ningún atributo.
    expect(JSON.stringify(enLinea)).not.toContain("kgfq2nN0o52XqnuXZWIN2F");
  });

  it("por debajo de su mínimo (1.000 COP) solo ofrece el pago manual", async () => {
    conBold();
    const intento = await getGateway().createIntent({ ...orden, totalCop: 900 });
    expect(intento.enLinea).toBeUndefined();
  });

  it("acepta un aviso firmado con la llave secreta sobre el cuerpo en Base64", () => {
    conBold();
    const cuerpo = aviso();
    const n = getGateway().leerNotificacion(cuerpo, new Headers({ "x-bold-signature": firmar(cuerpo, "kgfq2nN0o52XqnuXZWIN2F") }));
    expect(n).toEqual({
      evento: "aprobado",
      referencia: orden.reference,
      transaccion: "CNPVI70CQC0EY",
      montoCop: 39400,
      metodo: "CARD_WEB",
    });
  });

  it("rechaza un aviso sin firma, con otra firma o con el cuerpo cambiado", () => {
    conBold();
    const cuerpo = aviso();
    const pasarela = getGateway();
    expect(pasarela.leerNotificacion(cuerpo, new Headers())).toBeNull();
    expect(pasarela.leerNotificacion(cuerpo, new Headers({ "x-bold-signature": firmar(cuerpo, "otra") }))).toBeNull();
    const firma = firmar(cuerpo, "kgfq2nN0o52XqnuXZWIN2F");
    expect(pasarela.leerNotificacion(aviso("SALE_APPROVED", 1000), new Headers({ "x-bold-signature": firma }))).toBeNull();
    // Firmado con la llave vacía (la de pruebas) no vale fuera de pruebas.
    expect(pasarela.leerNotificacion(cuerpo, new Headers({ "x-bold-signature": firmar(cuerpo, "") }))).toBeNull();
  });

  it("en modo de pruebas verifica con la llave vacía, pero nunca en Production", () => {
    conBold({ pruebas: true });
    const cuerpo = aviso();
    const conVacia = new Headers({ "x-bold-signature": firmar(cuerpo, "") });
    expect(getGateway().leerNotificacion(cuerpo, conVacia)).not.toBeNull();
    vi.stubEnv("VERCEL_ENV", "production");
    expect(getGateway().leerNotificacion(cuerpo, conVacia)).toBeNull();
  });
});
