/**
 * El ciclo después de pagar: despachar, entregar, reseñar. Invariantes 22 y 23.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { baseNueva, comoUsuario, comprar, crearEmpresa, crearOferta, crearUsuario, falla, moverOrden, type Sql } from "./arnes";

let sql: Sql;
let cerrar: () => Promise<void>;
beforeAll(async () => ({ sql, cerrar } = await baseNueva()));
afterAll(() => cerrar());

async function itemDe(orden: string) {
  return (await sql.query(`select id from order_items where order_id = $1`, [orden])).rows[0].id as string;
}

const llamar = (uid: string | null, q: string, params: unknown[]) =>
  comoUsuario(sql, uid, async (s) => (await s.query(q, params)).rows[0], { confirmar: true });

describe("despacho y entrega", () => {
  it("el ciclo entero de un producto: despachar con guía, recibir, cerrar", async () => {
    const vendedor = await crearUsuario(sql);
    const comprador = await crearUsuario(sql);
    const empresa = await crearEmpresa(sql, { miembro: vendedor });
    const oferta = await crearOferta(sql, empresa, { despacho: "transportadora", envioCop: 9_000 });
    const orden = await comprar(sql, comprador, [{ listing_id: oferta, qty: 1 }]);
    const item = await itemDe(orden.id);

    // Sin pagar no se despacha.
    const antes = await falla(llamar(vendedor, `select despachar_item($1, 'Aveonline', 'G-1')`, [item]));
    expect(antes?.message).toBe("orden-no-despachable");

    await moverOrden(sql, orden.id, "pending_payment", "paid");
    const sinGuia = await falla(llamar(vendedor, `select despachar_item($1, 'Aveonline', null)`, [item]));
    expect(sinGuia?.message).toBe("falta-guia");

    const d = await llamar(vendedor, `select despachar_item($1, 'Aveonline', 'G-1') r`, [item]);
    expect(d.r).toMatchObject({ cambiado: true, estado: "despachado" });
    const otraVez = await llamar(vendedor, `select despachar_item($1, 'Aveonline', 'G-1') r`, [item]);
    expect(otraVez.r).toMatchObject({ cambiado: false });

    const e = await llamar(comprador, `select confirmar_entrega($1) r`, [item]);
    expect(e.r).toMatchObject({ cambiado: true, orden_completada: true });
    const { rows } = await sql.query(`select status from orders where id = $1`, [orden.id]);
    expect(rows[0].status).toBe("fulfilled");
  });

  it("otra empresa no despacha lo que no vendió", async () => {
    const comprador = await crearUsuario(sql);
    const oferta = await crearOferta(sql, await crearEmpresa(sql));
    const orden = await comprar(sql, comprador, [{ listing_id: oferta, qty: 1 }]);
    await moverOrden(sql, orden.id, "pending_payment", "paid");

    const intruso = await crearUsuario(sql);
    await crearEmpresa(sql, { miembro: intruso });
    const e = await falla(llamar(intruso, `select despachar_item($1, null, null)`, [await itemDe(orden.id)]));
    expect(e?.message).toBe("item-ajeno");
  });
});

describe("reseñas", () => {
  it("solo quien compró, y cuando ya recibió", async () => {
    const comprador = await crearUsuario(sql);
    const vendedor = await crearUsuario(sql);
    const oferta = await crearOferta(sql, await crearEmpresa(sql, { miembro: vendedor }));
    const orden = await comprar(sql, comprador, [{ listing_id: oferta, qty: 1 }]);
    const item = await itemDe(orden.id);
    await moverOrden(sql, orden.id, "pending_payment", "paid");

    const pronto = await falla(llamar(comprador, `select calificar($1, 5, 'Excelente')`, [item]));
    expect(pronto?.message).toBe("todavia-no");

    await llamar(comprador, `select confirmar_entrega($1)`, [item]);
    const otro = await falla(llamar(await crearUsuario(sql), `select calificar($1, 1, 'Malo')`, [item]));
    expect(otro?.message).toBe("item-ajeno");

    const r = await llamar(comprador, `select calificar($1, 5, 'Excelente') r`, [item]);
    expect(r.r).toMatchObject({ nueva: true });
    // Corregirla edita la misma, no crea otra.
    const r2 = await llamar(comprador, `select calificar($1, 4, 'Muy bueno') r`, [item]);
    expect(r2.r).toMatchObject({ id: r.r.id, nueva: false });
  });

  // Hallazgo de las pruebas de gemelos (2026-10-12, 0015 punto 6): con un
  // pedido pagado de algo sin envío ni fecha, `puede_resenar()` daba NULL, y
  // `if not NULL` no lanza. Se podía reseñar un servicio recién pagado.
  it("un servicio pagado pero sin cumplir no se reseña", async () => {
    const comprador = await crearUsuario(sql);
    const servicio = await crearOferta(sql, await crearEmpresa(sql), { kind: "service" });
    const orden = await comprar(sql, comprador, [{ listing_id: servicio, qty: 1 }]);
    await moverOrden(sql, orden.id, "pending_payment", "paid");

    const e = await falla(llamar(comprador, `select calificar($1, 5, '')`, [await itemDe(orden.id)]));
    expect(e?.message).toBe("todavia-no");

    await moverOrden(sql, orden.id, "paid", "fulfilled");
    await expect(llamar(comprador, `select calificar($1, 5, '')`, [await itemDe(orden.id)])).resolves.toBeDefined();
  });

  it("una reseña oculta no la ve nadie más que su autor y el equipo", async () => {
    const comprador = await crearUsuario(sql);
    const servicio = await crearOferta(sql, await crearEmpresa(sql), { kind: "service" });
    const orden = await comprar(sql, comprador, [{ listing_id: servicio, qty: 1 }]);
    await moverOrden(sql, orden.id, "pending_payment", "paid");
    await moverOrden(sql, orden.id, "paid", "fulfilled");
    await llamar(comprador, `select calificar($1, 1, 'No vino nadie')`, [await itemDe(orden.id)]);
    await sql.query(`update reviews set oculta = true where listing_id = $1`, [servicio]);

    const cuenta = (uid: string | null) =>
      comoUsuario(sql, uid, async (s) => (await s.query(`select count(*)::int n from reviews where listing_id = $1`, [servicio])).rows[0].n);
    expect(await cuenta(null)).toBe(0);
    expect(await cuenta(await crearUsuario(sql))).toBe(0);
    expect(await cuenta(comprador)).toBe(1);
    expect(await cuenta(await crearUsuario(sql, { admin: true }))).toBe(1);
  });
});
