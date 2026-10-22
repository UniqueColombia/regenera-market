import { describe, expect, it } from "vitest";
import { busquedaSinCamposSensibles } from "./url-sensible";

describe("busquedaSinCamposSensibles", () => {
  it("quita la contraseña y el correo que la acompañaba (el caso del 2026-10-22)", () => {
    expect(busquedaSinCamposSensibles("?email=ana%40ejemplo.com&password=secreta")).toBe("");
  });

  it("conserva lo que no es sensible, como `volver`", () => {
    expect(busquedaSinCamposSensibles("?email=a%40b.co&password=x&volver=%2Fcuenta")).toBe("?volver=%2Fcuenta");
  });

  it("cubre el registro, el cambio de clave, la baja y el código", () => {
    expect(busquedaSinCamposSensibles("?nombre=Ana&apellido=P&email=a&password=x&password2=x&acepto=on")).toBe("");
    expect(busquedaSinCamposSensibles("?actual=x&password=y&password2=y")).toBe("");
    expect(busquedaSinCamposSensibles("?clave=x&entiendo=on")).toBe("?entiendo=on");
    expect(busquedaSinCamposSensibles("?email=a&token=123456")).toBe("");
    expect(busquedaSinCamposSensibles("?PASSWORD=x")).toBe("");
  });

  it("cubre los datos personales de la cesta y de /vender", () => {
    expect(busquedaSinCamposSensibles("?name=Ana&phone=300&documento=123&direccion=Calle%201&ciudad=Tunja")).toBe("");
    expect(busquedaSinCamposSensibles("?taxId=900&contactName=Ana&email=a")).toBe("");
  });

  it("sin campos sensibles no toca nada, ni siquiera un correo suelto", () => {
    expect(busquedaSinCamposSensibles("")).toBeNull();
    expect(busquedaSinCamposSensibles("?q=cacao&tipo=experience")).toBeNull();
    expect(busquedaSinCamposSensibles("?email=a%40b.co")).toBeNull();
    expect(busquedaSinCamposSensibles("?token_hash=abc&type=email")).toBeNull();
  });
});
