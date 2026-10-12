/**
 * RLS y permisos, probados con el rol equivocado: una política se valida
 * demostrando que niega, no que permite (skill `supabase-schema`).
 *
 * Cada caso entra como la aplicación, con la clave anon o la sesión de una
 * persona (`comoUsuario()`), nunca como superusuario.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { baseNueva, comoUsuario, comprar, crearEmpresa, crearOferta, crearUsuario, falla, type Sql } from "./arnes";

let sql: Sql;
let cerrar: () => Promise<void>;
beforeAll(async () => ({ sql, cerrar } = await baseNueva()));
afterAll(() => cerrar());

const filas = (uid: string | null, q: string, p: unknown[] = []) =>
  comoUsuario(sql, uid, async (s) => (await s.query(q, p)).rows);

describe("órdenes", () => {
  it("un comprador ve las suyas y no las de otro", async () => {
    const oferta = await crearOferta(sql, await crearEmpresa(sql));
    const ana = await crearUsuario(sql);
    const beto = await crearUsuario(sql);
    const deAna = await comprar(sql, ana, [{ listing_id: oferta, qty: 1 }]);

    expect(await filas(ana, `select id from orders where id = $1`, [deAna.id])).toHaveLength(1);
    expect(await filas(beto, `select id from orders where id = $1`, [deAna.id])).toHaveLength(0);
    expect(await filas(beto, `select id from order_items where order_id = $1`, [deAna.id])).toHaveLength(0);
    expect(await filas(null, `select id from orders`)).toHaveLength(0);
  });

  it("una empresa ve los ítems que vendió, no los de otra en la misma orden", async () => {
    const vendeA = await crearUsuario(sql);
    const vendeB = await crearUsuario(sql);
    const a = await crearOferta(sql, await crearEmpresa(sql, { miembro: vendeA }));
    const b = await crearOferta(sql, await crearEmpresa(sql, { miembro: vendeB }));
    const orden = await comprar(sql, await crearUsuario(sql), [
      { listing_id: a, qty: 1 },
      { listing_id: b, qty: 1 },
    ]);

    const itemsA = await filas(vendeA, `select listing_id from order_items where order_id = $1`, [orden.id]);
    expect(itemsA.map((i) => i.listing_id)).toEqual([a]);
    const ajena = await crearUsuario(sql);
    await crearEmpresa(sql, { miembro: ajena });
    expect(await filas(ajena, `select id from orders where id = $1`, [orden.id])).toHaveLength(0);
  });

  it("nadie crea una orden con un insert directo ni se la marca como pagada", async () => {
    const yo = await crearUsuario(sql);
    const insertar = await falla(
      comoUsuario(sql, yo, (s) =>
        s.query(`insert into orders (reference, buyer_id, buyer_email, buyer_name, total_cop, status)
                 values ('SR-FALSA', $1, 'x@x', 'Yo', 1, 'paid')`, [yo]),
      ),
    );
    expect(insertar).not.toBeNull();

    const oferta = await crearOferta(sql, await crearEmpresa(sql));
    const mia = await comprar(sql, yo, [{ listing_id: oferta, qty: 1 }]);
    await comoUsuario(sql, yo, (s) => s.query(`update orders set status = 'paid' where id = $1`, [mia.id]), { confirmar: true }).catch(() => {});
    const { rows } = await sql.query(`select status from orders where id = $1`, [mia.id]);
    expect(rows[0].status).toBe("pending_payment");
  });
});

describe("catálogo", () => {
  it("un visitante ve lo aprobado y nada en revisión ni en borrador", async () => {
    const empresa = await crearEmpresa(sql);
    const aprobada = await crearOferta(sql, empresa);
    const enRevision = await crearOferta(sql, empresa, { status: "pending_review" });
    const borrador = await crearOferta(sql, empresa, { status: "draft" });

    const ids = (await filas(null, `select id from listings where id = any($1)`, [[aprobada, enRevision, borrador]])).map((r) => r.id);
    expect(ids).toEqual([aprobada]);
  });

  it("una empresa no se publica sola ni se marca destacada", async () => {
    const yo = await crearUsuario(sql);
    const oferta = await crearOferta(sql, await crearEmpresa(sql, { miembro: yo }), { status: "draft" });
    await comoUsuario(sql, yo, (s) => s.query(`update listings set status = 'approved', featured = true where id = $1`, [oferta]), {
      confirmar: true,
    }).catch(() => {});
    const { rows } = await sql.query(`select status, featured from listings where id = $1`, [oferta]);
    expect(rows[0].status).not.toBe("approved");
    expect(rows[0].featured).toBe(false);
  });
});

describe("roles", () => {
  it("nadie se da el rol de administrador a sí mismo", async () => {
    const yo = await crearUsuario(sql);
    await comoUsuario(sql, yo, (s) => s.query(`insert into user_roles (user_id, role) values ($1, 'admin')`, [yo]), {
      confirmar: true,
    }).catch(() => {});
    const { rows } = await sql.query(`select count(*)::int n from user_roles where user_id = $1 and role = 'admin'`, [yo]);
    expect(rows[0].n).toBe(0);
  });

  it("el último administrador no puede quedarse sin rol", async () => {
    await sql.query(`delete from user_roles where role = 'admin'`);
    const unico = await crearUsuario(sql, { admin: true });
    const e = await falla(sql.query(`delete from user_roles where user_id = $1 and role = 'admin'`, [unico]));
    expect(e).not.toBeNull();
  });
});

describe("reseñas (0015, punto 3)", () => {
  it("un visitante lee la reseña pero no quién la escribió por dentro", async () => {
    const leer = await falla(filas(null, `select author_id from reviews limit 1`));
    expect(leer?.code).toBe("42501");
    await expect(filas(null, `select id, rating, body, autor_nombre from reviews where not oculta limit 1`)).resolves.toBeDefined();
    await expect(filas(null, `select promedio, cantidad from calificaciones_oferta limit 1`)).resolves.toBeDefined();
  });
});
