/**
 * Dos operaciones a la vez sobre lo mismo, con dos conexiones de verdad.
 * Invariantes 10, 10c, 24, 25 y 27.
 *
 * El patrón: la sesión A hace su parte y deja la transacción abierta (tiene el
 * candado); B intenta lo mismo y tiene que quedarse esperando; A confirma; B
 * despierta y ve lo que dejó A. Si B no esperara, o al despertar no viera el
 * cambio, la protección no existe.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { abrirComo, baseNueva, comprar, crearEmpresa, crearOferta, crearUsuario, DESTINO, falla, type Linea, type Sql } from "./arnes";

let sql: Sql;
let conectar: () => Promise<Sql>;
let cerrar: () => Promise<void>;
beforeAll(async () => ({ sql, conectar, cerrar } = await baseNueva()));
afterAll(() => cerrar());

const crearOrden = (s: Sql, id: string, lineas: Linea[]) =>
  s.query(
    `select crear_orden($1, $2::jsonb, 'Persona de Prueba', '3001234567',
       _departamento => $3, _ciudad => $4, _direccion => $5) as r`,
    [id, JSON.stringify(lineas), DESTINO.departamento, DESTINO.ciudad, DESTINO.direccion],
  );

/** Si la promesa sigue pendiente después de un rato, está esperando un candado. */
async function sigueEsperando(p: Promise<unknown>, ms = 400) {
  const espera = Symbol();
  const r = await Promise.race([p.then(() => "terminó", () => "terminó"), new Promise((ok) => setTimeout(() => ok(espera), ms))]);
  return r === espera;
}

describe("concurrencia", () => {
  it("dos compradores por la última unidad: uno compra, el otro recibe «sin stock»", async () => {
    const oferta = await crearOferta(sql, await crearEmpresa(sql), { stock: 1 });
    const [a, b] = [await conectar(), await conectar()];
    await abrirComo(a, await crearUsuario(sql));
    await abrirComo(b, await crearUsuario(sql));

    await crearOrden(a, randomUUID(), [{ listing_id: oferta, qty: 1 }]);
    const deB = falla(crearOrden(b, randomUUID(), [{ listing_id: oferta, qty: 1 }]));
    expect(await sigueEsperando(deB)).toBe(true);

    await a.query("commit");
    expect((await deB)?.message).toBe("sin-stock");
    await b.query("rollback");

    const { rows } = await sql.query(`select stock from listings where id = $1`, [oferta]);
    expect(rows[0].stock).toBe(0);
  });

  it("el mismo pedido enviado dos veces a la vez crea una sola orden", async () => {
    const oferta = await crearOferta(sql, await crearEmpresa(sql), { stock: 10 });
    const comprador = await crearUsuario(sql);
    const id = randomUUID();
    const [a, b] = [await conectar(), await conectar()];
    await abrirComo(a, comprador);
    await abrirComo(b, comprador);

    await crearOrden(a, id, [{ listing_id: oferta, qty: 2 }]);
    const deB = crearOrden(b, id, [{ listing_id: oferta, qty: 2 }]);
    expect(await sigueEsperando(deB)).toBe(true);
    await a.query("commit");
    expect((await deB).rows[0].r).toMatchObject({ repetida: true });
    await b.query("commit");

    const { rows } = await sql.query(
      `select (select count(*)::int from orders where buyer_id = $1) n, (select stock from listings where id = $2) stock`,
      [comprador, oferta],
    );
    expect(rows[0]).toEqual({ n: 1, stock: 8 });
  });

  it("pago contra cancelación: gana el primero y el stock no se devuelve de más", async () => {
    const oferta = await crearOferta(sql, await crearEmpresa(sql), { stock: 5 });
    const orden = await comprar(sql, await crearUsuario(sql), [{ listing_id: oferta, qty: 2 }]);
    const [a, b] = [await conectar(), await conectar()];
    await a.query("begin");
    await b.query("begin");

    await a.query(`update orders set status = 'paid' where id = $1 and status = 'pending_payment'`, [orden.id]);
    const cancelar = b.query(`update orders set status = 'cancelled' where id = $1 and status = 'pending_payment'`, [orden.id]);
    expect(await sigueEsperando(cancelar)).toBe(true);
    await a.query("commit");
    expect((await cancelar).rowCount).toBe(0);
    await b.query("commit");

    const { rows } = await sql.query(
      `select (select status from orders where id = $1) status, (select stock from listings where id = $2) stock`,
      [orden.id, oferta],
    );
    expect(rows[0]).toEqual({ status: "paid", stock: 3 });
  });

  it("dos administradores que se quitan el rol mutuamente: queda uno", async () => {
    await sql.query(`delete from user_roles where role = 'admin'`);
    const uno = await crearUsuario(sql, { admin: true });
    const dos = await crearUsuario(sql, { admin: true });
    const [a, b] = [await conectar(), await conectar()];
    await a.query("begin");
    await b.query("begin");

    await a.query(`delete from user_roles where user_id = $1 and role = 'admin'`, [dos]);
    const deB = falla(b.query(`delete from user_roles where user_id = $1 and role = 'admin'`, [uno]));
    await a.query("commit");
    await deB;
    await b.query("rollback").catch(() => {});

    const { rows } = await sql.query(`select count(*)::int n from user_roles where role = 'admin'`);
    expect(rows[0].n).toBe(1);
  });
});
