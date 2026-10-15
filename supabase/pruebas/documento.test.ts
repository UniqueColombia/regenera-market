/**
 * La 0022: un documento tributario, una empresa.
 *
 * Lo que se comprueba es que nadie escape de su historia cambiando de empresa:
 * ni cerrando y reabriendo, ni dando de alta otra con el mismo NIT desde otra
 * cuenta.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  baseNueva,
  comoUsuario,
  comprar,
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

/** Un NIT válido de nueve dígitos con su DV correcto, distinto en cada llamada. */
let siguiente = 900_100_000;
async function nitNuevo(): Promise<{ base: string; dv: number }> {
  const base = String(siguiente++);
  const { rows } = await sql.query(`select dv_nit($1) as dv`, [base]);
  return { base, dv: rows[0].dv };
}

const postular = (uid: string | null, nit: string, nombre = "Empresa de Prueba SAS") =>
  comoUsuario(
    sql,
    uid,
    async (s) =>
      (
        await s.query(
          `select postular_proveedor(_name => $1, _contact_name => 'Ana Prueba', _email => $2, _phone => '3001234567',
             _country => 'Colombia', _department => 'Antioquia', _city => 'Medellín',
             _description => 'Vendemos productos de limpieza ecológica para hoteles y hostales del país.',
             _tax_id => $3) as r`,
          [nombre, `${Math.random().toString(36).slice(2, 8)}@empresa.test`, nit],
        )
      ).rows[0].r,
    { confirmar: true },
  );

const cerrarEmpresa = (uid: string, empresa: string) =>
  comoUsuario(sql, uid, async (s) => (await s.query(`select cerrar_mi_empresa($1) as r`, [empresa])).rows[0].r, {
    confirmar: true,
  });

/** Le da una venta terminada a la empresa, para que al cerrarla se conserve. */
async function conUnaVenta(empresa: string) {
  const oferta = await crearOferta(sql, empresa, { kind: "service" });
  const orden = await comprar(sql, await crearUsuario(sql), [{ listing_id: oferta, qty: 1 }]);
  await moverOrden(sql, orden.id, "pending_payment", "paid");
  await moverOrden(sql, orden.id, "paid", "fulfilled");
  return { oferta, orden };
}

describe("clave_tributaria", () => {
  it("un NIT colombiano es el mismo con puntos, con guion, con el DV pegado o sin él", async () => {
    const { base, dv } = await nitNuevo();
    const formas = [base, `${base}-${dv}`, `${base.slice(0, 3)}.${base.slice(3, 6)}.${base.slice(6)}-${dv}`, `${base}${dv}`];
    const { rows } = await sql.query(
      `select distinct clave_tributaria('Colombia', f) as c from unnest($1::text[]) f`,
      [formas],
    );
    expect(rows).toEqual([{ c: `colombia:${base}` }]);
  });

  it("no le recorta el último dígito a una cédula de diez dígitos", async () => {
    const { rows } = await sql.query(`select clave_tributaria('Colombia', '1012345678') as c`);
    // Empieza por 1 y tiene diez dígitos: es una cédula, no un NIT con DV.
    expect(rows[0].c).toBe("colombia:1012345678");
  });

  it("fuera de Colombia quita los signos y nada más; sin país, Colombia; vacío, nada", async () => {
    const { rows } = await sql.query(
      `select clave_tributaria('Chile', '12.345.678-k') as chile, clave_tributaria('Perú', '20-123456789') as peru,
              clave_tributaria(null, '900123456') as sin_pais, clave_tributaria('Colombia', ' - ') as vacio`,
    );
    expect(rows[0]).toEqual({
      chile: "chile:12345678K",
      peru: "peru:20123456789",
      sin_pais: "colombia:900123456",
      vacio: null,
    });
  });
});

describe("dar de alta con un documento que ya existe", () => {
  it("la misma persona que la cerró la reabre tal como estaba, con sus reseñas y sus puntos", async () => {
    const duena = await crearUsuario(sql);
    const { base, dv } = await nitNuevo();
    const alta = await postular(duena, base);
    const { orden, oferta } = await conUnaVenta(alta.provider_id);
    const { rows: items } = await sql.query(`select id from order_items where order_id = $1`, [orden.id]);
    await sql.query(
      `insert into reviews (listing_id, order_item_id, author_id, rating, body, autor_nombre)
       values ($1, $2, (select buyer_id from orders where id = $3), 1, 'Llegó tarde y mal empacado.', 'Cliente C.')`,
      [oferta, items[0].id, orden.id],
    );
    await sql.query(`update providers set experience_points = 700 where id = $1`, [alta.provider_id]);

    expect(await cerrarEmpresa(duena, alta.provider_id)).toMatchObject({ resultado: "cerrada" });
    const otra = await postular(duena, `${base}-${dv}`, "Otro Nombre Nuevo SAS");

    expect(otra).toMatchObject({ activado: true, reactivada: true, provider_id: alta.provider_id });
    const { rows } = await sql.query(
      `select status, cerrada_at, name, experience_points, tier from providers where id = $1`,
      [alta.provider_id],
    );
    expect(rows[0]).toMatchObject({ status: "approved", cerrada_at: null, name: "Empresa de Prueba SAS", experience_points: 700 });
    expect((await sql.query(`select 1 from reviews where listing_id = $1`, [oferta])).rowCount).toBe(1);
    expect(
      (await sql.query(`select is_owner from provider_members where provider_id = $1 and user_id = $2`, [alta.provider_id, duena]))
        .rows[0].is_owner,
    ).toBe(true);
    expect((await sql.query(`select count(*)::int as n from providers where clave_tributaria = $1`, [`colombia:${base}`])).rows[0].n).toBe(1);
  });

  it("otra persona con el NIT de una empresa cerrada no la reabre: queda en revisión del equipo", async () => {
    const duena = await crearUsuario(sql);
    const { base } = await nitNuevo();
    const alta = await postular(duena, base);
    await conUnaVenta(alta.provider_id);
    await cerrarEmpresa(duena, alta.provider_id);

    const intrusa = await crearUsuario(sql);
    const r = await postular(intrusa, base);
    expect(r).toMatchObject({ activado: false, motivo: "documento-existente" });
    expect((await sql.query(`select status from providers where id = $1`, [alta.provider_id])).rows[0].status).toBe("suspended");
    expect((await sql.query(`select 1 from provider_members where user_id = $1`, [intrusa])).rowCount).toBe(0);
    const { rows } = await sql.query(`select status, reviewer_notes from provider_applications where id = $1`, [r.application_id]);
    expect(rows[0].status).toBe("pending_review");
    expect(rows[0].reviewer_notes).toContain("Mismo documento");
  });

  it("una segunda cuenta con el NIT de una empresa activa no crea otra", async () => {
    const { base } = await nitNuevo();
    const primera = await postular(await crearUsuario(sql), base);
    const segunda = await postular(await crearUsuario(sql), base);
    expect(primera.activado).toBe(true);
    expect(segunda).toMatchObject({ activado: false, motivo: "documento-existente" });
    expect((await sql.query(`select count(*)::int as n from providers where clave_tributaria = $1`, [`colombia:${base}`])).rows[0].n).toBe(1);
  });

  it("un NIT nuevo sigue dando de alta en el acto", async () => {
    const { base } = await nitNuevo();
    expect(await postular(await crearUsuario(sql), base)).toMatchObject({ activado: true, reactivada: false });
  });
});

describe("el equipo", () => {
  it("al aprobar la solicitud de otra persona, reabre la empresa cerrada con ella como dueña", async () => {
    const duena = await crearUsuario(sql);
    const { base } = await nitNuevo();
    const alta = await postular(duena, base);
    await conUnaVenta(alta.provider_id);
    await cerrarEmpresa(duena, alta.provider_id);
    const nueva = await crearUsuario(sql);
    const pendiente = await postular(nueva, base);

    const admin = await crearUsuario(sql, { admin: true });
    const r = await comoUsuario(
      sql,
      admin,
      async (s) => (await s.query(`select aprobar_postulacion($1) as r`, [pendiente.application_id])).rows[0].r,
      { confirmar: true },
    );
    expect(r).toMatchObject({ reactivada: true, provider_id: alta.provider_id });
    expect((await sql.query(`select status from providers where id = $1`, [alta.provider_id])).rows[0].status).toBe("approved");
    expect((await sql.query(`select 1 from provider_members where provider_id = $1 and user_id = $2 and is_owner`, [alta.provider_id, nueva])).rowCount).toBe(1);
  });

  it("no crea otra empresa si la del mismo NIT está activa", async () => {
    const { base } = await nitNuevo();
    await postular(await crearUsuario(sql), base);
    const pendiente = await postular(await crearUsuario(sql), base);
    const admin = await crearUsuario(sql, { admin: true });
    const e = await falla(
      comoUsuario(sql, admin, (s) => s.query(`select aprobar_postulacion($1)`, [pendiente.application_id])),
    );
    expect(e?.message).toContain("documento-existente");
  });

  it("no puede aprobar desde el panel una empresa que cerró su dueña", async () => {
    const duena = await crearUsuario(sql);
    const { base } = await nitNuevo();
    const alta = await postular(duena, base);
    await conUnaVenta(alta.provider_id);
    await cerrarEmpresa(duena, alta.provider_id);

    const admin = await crearUsuario(sql, { admin: true });
    const e = await falla(
      comoUsuario(sql, admin, (s) => s.query(`update providers set status = 'approved' where id = $1`, [alta.provider_id])),
    );
    expect(e?.message).toContain("empresa-cerrada");
  });
});
