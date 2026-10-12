/**
 * `crear_orden()` y lo que pasa después con el stock: el corazón del dinero.
 * Invariantes 3, 4, 7, 10, 10b y 10c de `dominio-regenera`.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { baseNueva, comoUsuario, comprar, crearEmpresa, crearOferta, crearUsuario, falla, moverOrden, type Sql } from "./arnes";

let sql: Sql;
let cerrar: () => Promise<void>;
beforeAll(async () => ({ sql, cerrar } = await baseNueva()));
afterAll(() => cerrar());

const stock = async (oferta: string) =>
  (await sql.query(`select stock from listings where id = $1`, [oferta])).rows[0].stock as number | null;

describe("crear_orden: totales", () => {
  it("cobra precio de lista más envío; la comisión sale del vendedor y no del envío", async () => {
    const comprador = await crearUsuario(sql);
    const empresa = await crearEmpresa(sql, { tier: "semilla" });
    const oferta = await crearOferta(sql, empresa, { priceCop: 20_000, envioCop: 8_000 });

    const r = await comprar(sql, comprador, [{ listing_id: oferta, qty: 3 }]);
    const { rows } = await sql.query(
      `select subtotal_cop, envio_total_cop, total_cop, commission_total_cop from orders where id = $1`,
      [r.id],
    );
    // Envío una vez por línea, no por unidad: tres jabones van en una caja.
    expect(rows[0]).toEqual({ subtotal_cop: 60_000, envio_total_cop: 8_000, total_cop: 68_000, commission_total_cop: 7_200 });
  });

  it("aplica el mayorista solo desde el umbral, por línea", async () => {
    const comprador = await crearUsuario(sql);
    const empresa = await crearEmpresa(sql);
    const oferta = await crearOferta(sql, empresa, { priceCop: 10_000, wholesalePriceCop: 8_000, wholesaleMinQty: 10 });

    const bajo = await comprar(sql, comprador, [{ listing_id: oferta, qty: 9 }]);
    const umbral = await comprar(sql, comprador, [{ listing_id: oferta, qty: 10 }]);
    const precio = async (orden: string) =>
      (await sql.query(`select unit_price_cop from order_items where order_id = $1`, [orden])).rows[0].unit_price_cop;
    expect(await precio(bajo.id)).toBe(10_000);
    expect(await precio(umbral.id)).toBe(8_000);
  });

  it("deja fuera de todo total lo que es solo cotización", async () => {
    const comprador = await crearUsuario(sql);
    const empresa = await crearEmpresa(sql);
    const normal = await crearOferta(sql, empresa, { priceCop: 5_000 });
    const cotizar = await crearOferta(sql, empresa, { priceCop: 999_999, quoteOnly: true });

    const r = await comprar(sql, comprador, [
      { listing_id: normal, qty: 1 },
      { listing_id: cotizar, qty: 1 },
    ]);
    expect(r.total_cop).toBe(5_000);
    const { rows } = await sql.query(`select count(*)::int n from order_items where order_id = $1`, [r.id]);
    expect(rows[0].n).toBe(1);
  });

  it("cobra la comisión del nivel del proveedor", async () => {
    const comprador = await crearUsuario(sql);
    const tasas: Record<string, number> = {};
    for (const tier of ["semilla", "raiz", "bosque"] as const) {
      const oferta = await crearOferta(sql, await crearEmpresa(sql, { tier }), { priceCop: 100_000 });
      const r = await comprar(sql, comprador, [{ listing_id: oferta, qty: 1 }]);
      const { rows } = await sql.query(`select commission_rate from order_items where order_id = $1`, [r.id]);
      tasas[tier] = Number(rows[0].commission_rate);
    }
    expect(tasas).toEqual({ semilla: 0.12, raiz: 0.1, bosque: 0.08 });
  });

  it("no compra una oferta que no está aprobada", async () => {
    const comprador = await crearUsuario(sql);
    const oferta = await crearOferta(sql, await crearEmpresa(sql), { status: "pending_review" });
    const e = await falla(comprar(sql, comprador, [{ listing_id: oferta, qty: 1 }]));
    expect(e?.message).toBe("nada-comprable");
  });

  it("pide el destino solo si hay algo físico", async () => {
    const comprador = await crearUsuario(sql);
    const empresa = await crearEmpresa(sql);
    const producto = await crearOferta(sql, empresa);
    const servicio = await crearOferta(sql, empresa, { kind: "service" });

    const e = await falla(comprar(sql, comprador, [{ listing_id: producto, qty: 1 }], { destino: null }));
    expect(e?.message).toBe("falta-destino");
    await expect(comprar(sql, comprador, [{ listing_id: servicio, qty: 1 }], { destino: null })).resolves.toBeDefined();
  });

  it("exige sesión", async () => {
    const oferta = await crearOferta(sql, await crearEmpresa(sql));
    const e = await falla(
      comoUsuario(sql, null, (s) =>
        s.query(`select crear_orden($1, $2::jsonb, 'Nadie', '3001234567')`, [
          randomUUID(),
          JSON.stringify([{ listing_id: oferta, qty: 1 }]),
        ]),
      ),
    );
    // Desde la 0015 ni siquiera llega a la función: `anon` no tiene permiso.
    expect(e?.code).toBe("42501");
  });
});

describe("crear_orden: idempotencia y stock", () => {
  it("el mismo intento devuelve la misma orden y descuenta una vez", async () => {
    const comprador = await crearUsuario(sql);
    const oferta = await crearOferta(sql, await crearEmpresa(sql), { stock: 5 });
    const id = randomUUID();

    const a = await comprar(sql, comprador, [{ listing_id: oferta, qty: 2 }], { id });
    const b = await comprar(sql, comprador, [{ listing_id: oferta, qty: 2 }], { id });
    expect(b).toMatchObject({ reference: a.reference, repetida: true });
    expect(await stock(oferta)).toBe(3);
  });

  it("la llave de otro comprador no devuelve su orden", async () => {
    const oferta = await crearOferta(sql, await crearEmpresa(sql));
    const id = randomUUID();
    await comprar(sql, await crearUsuario(sql), [{ listing_id: oferta, qty: 1 }], { id });
    const e = await falla(comprar(sql, await crearUsuario(sql), [{ listing_id: oferta, qty: 1 }], { id }));
    expect(e?.message).toBe("clave-ajena");
  });

  it("sin stock suficiente falla entera, sin descontar nada", async () => {
    const comprador = await crearUsuario(sql);
    const empresa = await crearEmpresa(sql);
    const hay = await crearOferta(sql, empresa, { stock: 10 });
    const poco = await crearOferta(sql, empresa, { stock: 1 });

    const e = await falla(
      comprar(sql, comprador, [
        { listing_id: hay, qty: 3 },
        { listing_id: poco, qty: 2 },
      ]),
    );
    expect(e?.message).toBe("sin-stock");
    expect(await stock(hay)).toBe(10);
    expect(await stock(poco)).toBe(1);
  });

  it("cancelar devuelve el stock una sola vez; reabrir lo vuelve a reservar", async () => {
    const comprador = await crearUsuario(sql);
    const oferta = await crearOferta(sql, await crearEmpresa(sql), { stock: 4 });
    const r = await comprar(sql, comprador, [{ listing_id: oferta, qty: 3 }]);
    expect(await stock(oferta)).toBe(1);

    expect(await moverOrden(sql, r.id, "pending_payment", "cancelled")).toBe(true);
    expect(await stock(oferta)).toBe(4);
    // Repetir la cancelación no encuentra la fila: no devuelve dos veces.
    expect(await moverOrden(sql, r.id, "pending_payment", "cancelled")).toBe(false);
    expect(await stock(oferta)).toBe(4);

    expect(await moverOrden(sql, r.id, "cancelled", "pending_payment")).toBe(true);
    expect(await stock(oferta)).toBe(1);
  });

  it("reabrir falla si mientras tanto se vendió lo que había", async () => {
    const oferta = await crearOferta(sql, await crearEmpresa(sql), { stock: 2 });
    const r = await comprar(sql, await crearUsuario(sql), [{ listing_id: oferta, qty: 2 }]);
    await moverOrden(sql, r.id, "pending_payment", "cancelled");
    await comprar(sql, await crearUsuario(sql), [{ listing_id: oferta, qty: 1 }]);

    const e = await falla(moverOrden(sql, r.id, "cancelled", "pending_payment"));
    expect(e?.message).toBe("sin-stock");
  });
});

describe("transiciones de estado", () => {
  it("rechaza un salto que no está en TRANSICIONES", async () => {
    const oferta = await crearOferta(sql, await crearEmpresa(sql));
    const r = await comprar(sql, await crearUsuario(sql), [{ listing_id: oferta, qty: 1 }]);
    const e = await falla(moverOrden(sql, r.id, "pending_payment", "fulfilled"));
    expect(e).not.toBeNull();
  });
});

describe("vencer_pedidos_sin_pago", () => {
  it("cancela lo viejo sin pagar, devuelve el stock y no toca lo reciente", async () => {
    const oferta = await crearOferta(sql, await crearEmpresa(sql), { stock: 10 });
    const viejo = await comprar(sql, await crearUsuario(sql), [{ listing_id: oferta, qty: 4 }]);
    const nuevo = await comprar(sql, await crearUsuario(sql), [{ listing_id: oferta, qty: 1 }]);
    await sql.query(`update orders set created_at = now() - interval '73 hours' where id = $1`, [viejo.id]);

    // Como el cron: superusuario, sin claims.
    await sql.query(`select vencer_pedidos_sin_pago()`);
    const estado = async (id: string) => (await sql.query(`select status from orders where id = $1`, [id])).rows[0].status;
    expect(await estado(viejo.id)).toBe("cancelled");
    expect(await estado(nuevo.id)).toBe("pending_payment");
    expect(await stock(oferta)).toBe(9);
  });

  // El hallazgo de la revisión del 2026-10-12 (0015, punto 1).
  it("un anónimo no puede dispararlo, ni con sesión quien no es admin", async () => {
    const anon = await falla(comoUsuario(sql, null, (s) => s.query(`select vencer_pedidos_sin_pago(24)`)));
    expect(anon?.code).toBe("42501");
    const persona = await falla(comoUsuario(sql, await crearUsuario(sql), (s) => s.query(`select vencer_pedidos_sin_pago(24)`)));
    expect(persona?.message).toBe("solo-admin");
  });

  it("un administrador sí, y nunca por debajo de 24 horas", async () => {
    const admin = await crearUsuario(sql, { admin: true });
    const oferta = await crearOferta(sql, await crearEmpresa(sql));
    const r = await comprar(sql, await crearUsuario(sql), [{ listing_id: oferta, qty: 1 }]);
    await sql.query(`update orders set created_at = now() - interval '2 hours' where id = $1`, [r.id]);
    const n = await comoUsuario(sql, admin, async (s) => (await s.query(`select vencer_pedidos_sin_pago(1) n`)).rows[0].n, {
      confirmar: true,
    });
    expect(n).toBe(0);
  });
});
