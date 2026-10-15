/**
 * La 0021: cerrar la empresa y preparar la baja de una cuenta.
 *
 * Lo que se comprueba es lo que no puede fallar: que solo la dueña cierra, que
 * lo vendido se conserva, que con ventas en curso no se puede, que después se
 * puede crear otra empresa, y que una cuenta que se va no se lleva sus pedidos
 * pero sí devuelve lo que tenía reservado.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  baseNueva,
  comoUsuario,
  comprar,
  crearEmpresa,
  crearOferta,
  crearUsuario,
  falla,
  moverOrden,
  type Sql,
} from "./arnes";

let sql: Sql;
let cerrar: () => Promise<void>;
beforeAll(async () => ({ sql, cerrar } = await baseNueva()));
afterAll(() => cerrar());

/** Una empresa con `duena` como su dueña (con `is_owner`, como la deja `postular_proveedor()`). */
async function empresaDe(duena: string) {
  const id = await crearEmpresa(sql, { miembro: duena });
  await sql.query(`update provider_members set is_owner = true where provider_id = $1 and user_id = $2`, [id, duena]);
  await sql.query(`insert into user_roles (user_id, role) values ($1, 'provider') on conflict do nothing`, [duena]);
  return id;
}

const cerrarEmpresa = (uid: string, empresa: string) =>
  comoUsuario(sql, uid, async (s) => (await s.query(`select cerrar_mi_empresa($1) as r`, [empresa])).rows[0].r, {
    confirmar: true,
  });

const prepararBaja = (uid: string) =>
  comoUsuario(sql, uid, async (s) => (await s.query(`select preparar_baja_de_cuenta() as r`)).rows[0].r, {
    confirmar: true,
  });

describe("cerrar_mi_empresa", () => {
  it("solo la cierra su dueña", async () => {
    const duena = await crearUsuario(sql);
    const empresa = await empresaDe(duena);
    const otra = await crearUsuario(sql);
    await sql.query(`insert into provider_members (provider_id, user_id) values ($1, $2)`, [empresa, otra]);

    expect((await falla(cerrarEmpresa(otra, empresa)))?.message).toContain("no-es-duena");
    expect((await falla(cerrarEmpresa(await crearUsuario(sql), empresa)))?.message).toContain("no-es-duena");
    expect((await sql.query(`select 1 from providers where id = $1`, [empresa])).rowCount).toBe(1);
  });

  it("sin ventas, la borra entera con sus ofertas, y le quita el rol de proveedor", async () => {
    const duena = await crearUsuario(sql);
    const empresa = await empresaDe(duena);
    const oferta = await crearOferta(sql, empresa);

    expect(await cerrarEmpresa(duena, empresa)).toMatchObject({ resultado: "borrada" });
    expect((await sql.query(`select 1 from providers where id = $1`, [empresa])).rowCount).toBe(0);
    expect((await sql.query(`select 1 from listings where id = $1`, [oferta])).rowCount).toBe(0);
    expect((await sql.query(`select 1 from user_roles where user_id = $1 and role = 'provider'`, [duena])).rowCount).toBe(0);
  });

  it("con ventas terminadas, la cierra: sale del sitio y lo vendido se conserva", async () => {
    const duena = await crearUsuario(sql);
    const empresa = await empresaDe(duena);
    const oferta = await crearOferta(sql, empresa, { kind: "service" });
    const orden = await comprar(sql, await crearUsuario(sql), [{ listing_id: oferta, qty: 1 }]);
    await moverOrden(sql, orden.id, "pending_payment", "paid");
    await moverOrden(sql, orden.id, "paid", "fulfilled");

    expect(await cerrarEmpresa(duena, empresa)).toMatchObject({ resultado: "cerrada" });
    const { rows } = await sql.query(`select status, cerrada_at from providers where id = $1`, [empresa]);
    expect(rows[0].status).toBe("suspended");
    expect(rows[0].cerrada_at).not.toBeNull();
    expect((await sql.query(`select status from listings where id = $1`, [oferta])).rows[0].status).toBe("draft");
    expect((await sql.query(`select 1 from provider_members where provider_id = $1`, [empresa])).rowCount).toBe(0);
    expect((await sql.query(`select 1 from order_items where order_id = $1`, [orden.id])).rowCount).toBe(1);
    const visibles = await comoUsuario(sql, null, async (s) =>
      (await s.query(`select id from listings_publicos where provider_id = $1`, [empresa])).rows,
    );
    expect(visibles).toHaveLength(0);
  });

  it("con una solicitud de cotización abierta no se puede", async () => {
    const duena = await crearUsuario(sql);
    const empresa = await empresaDe(duena);
    const oferta = await crearOferta(sql, empresa, { kind: "service", quoteOnly: true });
    const { rows } = await sql.query(
      `insert into quotations (reference, buyer_email, buyer_name) values ('COT-PRUEBA-1', 'hotel@prueba.test', 'Hotel') returning id`,
    );
    await sql.query(
      `insert into quotation_items (quotation_id, listing_id, provider_id, title_snapshot, qty) values ($1, $2, $3, 'Asesoría', 1)`,
      [rows[0].id, oferta, empresa],
    );
    expect((await falla(cerrarEmpresa(duena, empresa)))?.message).toContain("solicitudes-abiertas");

    // Terminada, ya no estorba (y la empresa se cierra, no se borra: tiene historia).
    await sql.query(`update quotations set status = 'declined' where id = $1`, [rows[0].id]);
    expect(await cerrarEmpresa(duena, empresa)).toMatchObject({ resultado: "cerrada" });
  });

  it("con una venta en curso no se puede, y no cambia nada", async () => {
    const duena = await crearUsuario(sql);
    const empresa = await empresaDe(duena);
    const oferta = await crearOferta(sql, empresa, { kind: "service" });
    const orden = await comprar(sql, await crearUsuario(sql), [{ listing_id: oferta, qty: 1 }]);
    await moverOrden(sql, orden.id, "pending_payment", "paid");

    expect((await falla(cerrarEmpresa(duena, empresa)))?.message).toContain("ventas-en-curso");
    expect((await sql.query(`select status from providers where id = $1`, [empresa])).rows[0].status).toBe("approved");
    expect((await sql.query(`select 1 from provider_members where provider_id = $1`, [empresa])).rowCount).toBe(1);
  });

  it("después de cerrarla, la misma persona puede dar de alta otra", async () => {
    const duena = await crearUsuario(sql);
    const vieja = await empresaDe(duena);
    await cerrarEmpresa(duena, vieja);

    const r = await comoUsuario(
      sql,
      duena,
      async (s) =>
        (
          await s.query(
            `select postular_proveedor('Empresa Nueva SAS', 'Ana Prueba', 'nueva@empresa.test', '3001234567',
               'Colombia', 'Antioquia', 'Medellín', 'Vendemos productos de limpieza ecológica para hoteles y hostales.') as r`,
          )
        ).rows[0].r,
      { confirmar: true },
    );
    expect(r.activado).toBe(true);
    expect(r.provider_id).not.toBe(vieja);
  });
});

describe("preparar_baja_de_cuenta", () => {
  it("un administrador no puede darse de baja así", async () => {
    const admin = await crearUsuario(sql, { admin: true });
    expect((await falla(prepararBaja(admin)))?.message).toContain("es-admin");
  });

  it("con un pedido pendiente (sin pagar, pagado o en preparación) no se puede", async () => {
    const comprador = await crearUsuario(sql);
    const oferta = await crearOferta(sql, await crearEmpresa(sql), { kind: "service" });
    const orden = await comprar(sql, comprador, [{ listing_id: oferta, qty: 1 }]);
    expect((await falla(prepararBaja(comprador)))?.message).toContain("pedidos-en-curso");
    await moverOrden(sql, orden.id, "pending_payment", "paid");
    expect((await falla(prepararBaja(comprador)))?.message).toContain("pedidos-en-curso");
    await moverOrden(sql, orden.id, "paid", "in_progress");
    expect((await falla(prepararBaja(comprador)))?.message).toContain("pedidos-en-curso");
    // Nada cambió: el pedido sigue en curso.
    expect((await sql.query(`select status from orders where id = $1`, [orden.id])).rows[0].status).toBe("in_progress");
  });

  it("con una cotización suya abierta no se puede", async () => {
    const comprador = await crearUsuario(sql);
    await sql.query(
      `insert into quotations (reference, buyer_id, buyer_email, buyer_name) values ('COT-PRUEBA-2', $1, 'yo@prueba.test', 'Yo')`,
      [comprador],
    );
    expect((await falla(prepararBaja(comprador)))?.message).toContain("solicitudes-abiertas");
  });

  it("con todo terminado se puede, y al borrar la cuenta los pedidos se quedan", async () => {
    const comprador = await crearUsuario(sql);
    const oferta = await crearOferta(sql, await crearEmpresa(sql), { kind: "service" });
    const orden = await comprar(sql, comprador, [{ listing_id: oferta, qty: 1 }]);
    await moverOrden(sql, orden.id, "pending_payment", "paid");
    await moverOrden(sql, orden.id, "paid", "fulfilled");

    await prepararBaja(comprador);

    // Lo que hace después la aplicación con la API de administración.
    await sql.query(`delete from auth.users where id = $1`, [comprador]);
    const { rows } = await sql.query(`select buyer_id, buyer_email from orders where id = $1`, [orden.id]);
    expect(rows[0].buyer_id).toBeNull();
    expect(rows[0].buyer_email).not.toBe("");
  });

  it("oculta sus reseñas, y cierra la empresa de la que es la única persona", async () => {
    const persona = await crearUsuario(sql);
    const suya = await empresaDe(persona);

    // Una reseña suya de una compra cumplida a otra empresa.
    const ajena = await crearOferta(sql, await crearEmpresa(sql), { kind: "service" });
    const orden = await comprar(sql, persona, [{ listing_id: ajena, qty: 1 }]);
    await moverOrden(sql, orden.id, "pending_payment", "paid");
    await moverOrden(sql, orden.id, "paid", "fulfilled");
    const { rows: items } = await sql.query(`select id from order_items where order_id = $1`, [orden.id]);
    await sql.query(
      `insert into reviews (listing_id, order_item_id, author_id, rating, body, autor_nombre)
       values ($1, $2, $3, 5, 'Muy bueno, llegó a tiempo.', 'Persona P.')`,
      [ajena, items[0].id, persona],
    );

    const r = await prepararBaja(persona);
    expect(r.empresas_borradas).toEqual([suya]);
    expect((await sql.query(`select oculta from reviews where author_id = $1`, [persona])).rows[0].oculta).toBe(true);
    expect((await sql.query(`select 1 from providers where id = $1`, [suya])).rowCount).toBe(0);
  });
});
