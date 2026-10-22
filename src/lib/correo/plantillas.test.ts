import { describe, expect, it } from "vitest";
import { correoPedidoPagadoProveedor, correoPedidoRecibido } from "./plantillas";

describe("la fecha de una experiencia en los correos del pedido", () => {
  it("la empresa ve para qué día es cada reserva", () => {
    const m = correoPedidoPagadoProveedor({
      nombre: "Lucía Gómez",
      correo: "lucia@ejemplo.com",
      empresa: "Eco Hotel",
      referencia: "SR-261022-AB12",
      lineas: [
        { titulo: "Tour de naturaleza", qty: 4, fecha: "2026-11-05" },
        { titulo: "Kit de bienvenida", qty: 2 },
      ],
    });
    expect(m.texto).toContain("4 × Tour de naturaleza · para el 5 de noviembre de 2026");
    expect(m.texto).toContain("2 × Kit de bienvenida\n");
    expect(m.html).toContain("para el 5 de noviembre de 2026");
  });

  it("sin experiencias, el correo de la empresa sigue igual", () => {
    const m = correoPedidoPagadoProveedor({
      nombre: "Lucía",
      correo: "lucia@ejemplo.com",
      empresa: "Eco Hotel",
      referencia: "SR-261022-AB12",
      lineas: [{ titulo: "Kit de bienvenida", qty: 2 }],
    });
    expect(m.texto).not.toContain("para el");
    expect(m.texto).toContain("Qué despachar:");
  });

  it("quien reserva también ve el día en su respaldo", () => {
    const m = correoPedidoRecibido({
      nombre: "Ana",
      correo: "ana@ejemplo.com",
      referencia: "SR-261022-AB12",
      totalCop: 200000,
      lineas: [{ titulo: "Tour de naturaleza", qty: 4, fecha: "2026-11-05" }],
    });
    expect(m.texto).toContain("4 × Tour de naturaleza · el 5 de noviembre de 2026");
  });
});
