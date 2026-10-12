/**
 * Nadie se beneficia a sí mismo (0016). Cada caso es un ataque que la
 * auditoría del 2026-10-12 reprodujo, escrito como lo haría una empresa por
 * PostgREST, y lo que tiene que pasar ahora.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { baseNueva, comoUsuario, comprar, crearEmpresa, crearOferta, crearUsuario, falla, moverOrden, type Sql } from "./arnes";

let sql: Sql;
let cerrar: () => Promise<void>;
beforeAll(async () => ({ sql, cerrar } = await baseNueva()));
afterAll(() => cerrar());

const como = (uid: string | null, q: string, p: unknown[] = []) =>
  comoUsuario(sql, uid, async (s) => (await s.query(q, p)).rows[0], { confirmar: true });

// Sin los de `oferta_publicada`: cada oferta aprobada que siembra la prueba da
// 10, y no es lo que se mide aquí.
const puntos = async (empresa: string) =>
  (
    await sql.query(
      `select p.experience_points - coalesce((select sum(puntos) from experience_events
          where provider_id = p.id and clave = 'oferta_publicada'), 0)::int as p
         from providers p where p.id = $1`,
      [empresa],
    )
  ).rows[0].p as number;

const itemDe = async (orden: string) =>
  (await sql.query(`select id from order_items where order_id = $1`, [orden])).rows[0].id as string;

/** Un pedido de un producto entregado en mano, ya pagado y entregado. */
async function ventaCumplida(empresa: string, comprador: string, precio = 600_000) {
  const oferta = await crearOferta(sql, empresa, { priceCop: precio, despacho: "vendedor" });
  const orden = await comprar(sql, comprador, [{ listing_id: oferta, qty: 1 }]);
  await moverOrden(sql, orden.id, "pending_payment", "paid");
  await como(comprador, `select confirmar_entrega($1)`, [await itemDe(orden.id)]);
  return { oferta, orden: orden.id, item: await itemDe(orden.id) };
}

describe("evaluación y certificaciones", () => {
  it("una empresa no se aprueba sola su evaluación", async () => {
    const yo = await crearUsuario(sql);
    const empresa = await crearEmpresa(sql, { miembro: yo });

    const directo = await falla(
      como(yo, `insert into sustainability_assessments (provider_id, score, status) values ($1, 100, 'approved')`, [empresa]),
    );
    expect(directo).not.toBeNull();

    // Por el camino legítimo (borrador → revisión) tampoco puede saltarse al equipo.
    await como(yo, `insert into sustainability_assessments (provider_id, score, status) values ($1, 100, 'draft')`, [empresa]);
    await como(yo, `update sustainability_assessments set status = 'approved' where provider_id = $1`, [empresa]).catch(() => {});

    const { rows } = await sql.query(
      `select sustainability_score, sustainability_verified_at from providers where id = $1`,
      [empresa],
    );
    expect(rows[0].sustainability_verified_at).toBeNull();
    expect(await puntos(empresa)).toBe(0);
  });

  it("el equipo sí la aprueba, y ahí llegan el sello y los puntos", async () => {
    const empresa = await crearEmpresa(sql);
    const admin = await crearUsuario(sql, { admin: true });
    await sql.query(`insert into sustainability_assessments (provider_id, score, status) values ($1, 70, 'pending_review')`, [empresa]);
    await como(admin, `update sustainability_assessments set status = 'approved' where provider_id = $1`, [empresa]);

    const { rows } = await sql.query(`select sustainability_score s from providers where id = $1`, [empresa]);
    expect(rows[0].s).toBe(70);
    expect(await puntos(empresa)).toBe(250);
  });

  it("una empresa no publica una certificación como verificada", async () => {
    const yo = await crearUsuario(sql);
    const empresa = await crearEmpresa(sql, { miembro: yo });
    const { rows: c } = await sql.query(`select code from certifications limit 1`);
    const codigo = c[0]?.code ?? (await sql.query(`insert into certifications (code, label, issuer) values ('prueba', 'Prueba', 'Nadie') returning code`)).rows[0].code;

    await como(yo, `insert into provider_certifications (provider_id, certification_code, verified_at) values ($1, $2, now())`, [
      empresa,
      codigo,
    ]).catch(() => {});
    const visibles = await comoUsuario(sql, null, async (s) =>
      (await s.query(`select count(*)::int n from provider_certifications where provider_id = $1`, [empresa])).rows[0].n,
    );
    expect(visibles).toBe(0);
  });
});

describe("compra propia", () => {
  it("una empresa no se compra a sí misma", async () => {
    const yo = await crearUsuario(sql);
    const oferta = await crearOferta(sql, await crearEmpresa(sql, { miembro: yo }));
    const e = await falla(comprar(sql, yo, [{ listing_id: oferta, qty: 1 }]));
    expect(e?.message).toBe("compra-propia");
  });

  it("ni reseña lo suyo aunque la compra sea de antes de la 0016", async () => {
    const yo = await crearUsuario(sql);
    const empresa = await crearEmpresa(sql);
    const { item } = await ventaCumplida(empresa, yo);
    // Se hace miembro después de comprar: como una compra propia anterior.
    await sql.query(`insert into provider_members (provider_id, user_id) values ($1, $2)`, [empresa, yo]);

    const e = await falla(como(yo, `select calificar($1, 5, 'Excelente')`, [item]));
    expect(e?.message).toBe("item-propio");
  });
});

describe("entrega", () => {
  it("lo que va por transportadora no lo cierra el vendedor; lo que lleva en mano, sí", async () => {
    const vendedor = await crearUsuario(sql);
    const comprador = await crearUsuario(sql);
    const empresa = await crearEmpresa(sql, { miembro: vendedor });

    const paquete = await crearOferta(sql, empresa, { despacho: "transportadora" });
    const p = await comprar(sql, comprador, [{ listing_id: paquete, qty: 1 }]);
    await moverOrden(sql, p.id, "pending_payment", "paid");
    await como(vendedor, `select despachar_item($1, 'Aveonline', 'G-9')`, [await itemDe(p.id)]);
    const e = await falla(como(vendedor, `select confirmar_entrega($1)`, [await itemDe(p.id)]));
    expect(e?.message).toBe("entrega-del-comprador");
    await expect(como(comprador, `select confirmar_entrega($1)`, [await itemDe(p.id)])).resolves.toBeDefined();

    const enMano = await crearOferta(sql, empresa, { despacho: "vendedor" });
    const m = await comprar(sql, comprador, [{ listing_id: enMano, qty: 1 }]);
    await moverOrden(sql, m.id, "pending_payment", "paid");
    await expect(como(vendedor, `select confirmar_entrega($1)`, [await itemDe(m.id)])).resolves.toBeDefined();
  });
});

describe("devolver una venta", () => {
  it("quita todos sus puntos y saca la reseña del promedio", async () => {
    const comprador = await crearUsuario(sql);
    const empresa = await crearEmpresa(sql);
    const { oferta, orden, item } = await ventaCumplida(empresa, comprador);
    await como(comprador, `select calificar($1, 5, 'Excelente')`, [item]);
    // 120 primera venta + 40 entregada + 10 de volumen + 30 reseña.
    expect(await puntos(empresa)).toBe(200);

    await moverOrden(sql, orden, "fulfilled", "refunded");
    expect(await puntos(empresa)).toBe(0);
    const { rows } = await sql.query(`select count(*)::int n from calificaciones_oferta where listing_id = $1`, [oferta]);
    expect(rows[0].n).toBe(0);
  });

  it("primera_venta se queda si hay otra venta cumplida", async () => {
    const empresa = await crearEmpresa(sql);
    await ventaCumplida(empresa, await crearUsuario(sql), 1_000);
    const { orden } = await ventaCumplida(empresa, await crearUsuario(sql), 1_000);
    expect(await puntos(empresa)).toBe(120 + 40 + 40);
    await moverOrden(sql, orden, "fulfilled", "refunded");
    expect(await puntos(empresa)).toBe(120 + 40);
  });
});

describe("reseñas moderadas", () => {
  it("ocultar o bajar una reseña le quita los puntos; mostrarla otra vez se los devuelve", async () => {
    const comprador = await crearUsuario(sql);
    const empresa = await crearEmpresa(sql);
    const { item } = await ventaCumplida(empresa, comprador, 1_000);
    const antes = await puntos(empresa);
    const { id } = (await como(comprador, `select calificar($1, 5, '') r`, [item])).r;
    expect(await puntos(empresa)).toBe(antes + 30);

    await sql.query(`update reviews set oculta = true where id = $1`, [id]);
    expect(await puntos(empresa)).toBe(antes);
    await sql.query(`update reviews set oculta = false where id = $1`, [id]);
    expect(await puntos(empresa)).toBe(antes + 30);

    await como(comprador, `select calificar($1, 1, 'Al final no')`, [item]);
    expect(await puntos(empresa)).toBe(antes);
  });
});

describe("Comunidad", () => {
  it("despublicar una publicación le quita sus puntos", async () => {
    const yo = await crearUsuario(sql);
    const empresa = await crearEmpresa(sql, { miembro: yo });
    const { rows } = await sql.query(
      `insert into community_posts (author_id, provider_id, title, body, status)
       values ($1, $2, 'Cómo compostamos', 'Una historia larga sobre cómo compostamos los residuos de la cocina del hotel durante todo un año entero.', 'approved') returning id`,
      [yo, empresa],
    );
    expect(await puntos(empresa)).toBe(10);
    // Como el equipo: `community_proteger_derivados` solo deja cambiar el estado a un admin.
    await como(await crearUsuario(sql, { admin: true }), `update community_posts set status = 'suspended' where id = $1`, [rows[0].id]);
    expect(await puntos(empresa)).toBe(0);
  });
});

describe("resumen del panel de órdenes", () => {
  it("cuenta y suma todas las órdenes por estado, y solo para el equipo", async () => {
    await sql.query(`delete from orders`);
    const oferta = await crearOferta(sql, await crearEmpresa(sql), { kind: "service", priceCop: 1_000 });
    for (let i = 0; i < 3; i++) await comprar(sql, await crearUsuario(sql), [{ listing_id: oferta, qty: 1 }]);

    const admin = await crearUsuario(sql, { admin: true });
    const filas = await comoUsuario(sql, admin, async (s) => (await s.query(`select * from admin_resumen_ordenes()`)).rows);
    expect(filas).toEqual([{ status: "pending_payment", cantidad: 3, total_cop: "3000" }]);

    const ajeno = await comoUsuario(sql, await crearUsuario(sql), async (s) => (await s.query(`select * from admin_resumen_ordenes()`)).rows);
    expect(ajeno).toEqual([]);
  });
});
