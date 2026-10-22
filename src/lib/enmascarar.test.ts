import { describe, expect, it } from "vitest";
import { enmascarar, sinCorreos } from "./enmascarar";

describe("enmascarar y sinCorreos", () => {
  it("deja los dos primeros caracteres y el dominio", () => {
    expect(enmascarar("ana.perez@ejemplo.com")).toBe("an***@ejemplo.com");
    expect(enmascarar("sin-arroba")).toBe("***");
  });

  it("enmascara cada dirección de un error de SMTP o de la base", () => {
    expect(sinCorreos("550 <ana@x.com>: Recipient address rejected")).toBe("550 <an***@x.com>: Recipient address rejected");
    expect(sinCorreos("Duplicate entry 'beto@y.co' for key 'usuarios.email'")).toBe(
      "Duplicate entry 'be***@y.co' for key 'usuarios.email'",
    );
    expect(sinCorreos("sin direcciones")).toBe("sin direcciones");
  });
});
