/**
 * La 0019: un pago en línea se anota una vez por transacción, lo lee quien
 * compró y el equipo, y nadie lo escribe desde una sesión.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { baseNueva, comoUsuario, comprar, crearEmpresa, crearOferta, crearUsuario, falla, type Sql } from "./arnes";

let sql: Sql;
let cerrar: () => Promise<void>;
beforeAll(async () => ({ sql, cerrar } = await baseNueva()));
afterAll(() => cerrar());

const filas = (uid: string | null, q: string, p: unknown[] = []) =>
  comoUsuario(sql, uid, async (s) => (await s.query(q, p)).rows);

describe("pagos", () => {
  it("lo ve quien compró y el equipo; nadie lo escribe desde una sesión; una transacción se anota una vez", async () => {
    const comprador = await crearUsuario(sql);
    const otro = await crearUsuario(sql);
    const admin = await crearUsuario(sql, { admin: true });
    const oferta = await crearOferta(sql, await crearEmpresa(sql), { kind: "service" });
    const orden = await comprar(sql, comprador, [{ listing_id: oferta, qty: 1 }]);

    // Lo que hace el webhook, con la clave de servicio (aquí, superusuario).
    const anotar = () =>
      sql.query(
        `insert into pagos (order_id, pasarela, transaccion, estado, monto_cop, metodo)
         values ($1, 'bold', 'CNPVI70CQC0EY', 'aprobado', 20000, 'CARD_WEB')
         on conflict (pasarela, transaccion, estado) do nothing`,
        [orden.id],
      );
    expect((await anotar()).rowCount).toBe(1);
    expect((await anotar()).rowCount).toBe(0);

    expect(await filas(comprador, `select transaccion from pagos where order_id = $1`, [orden.id])).toHaveLength(1);
    expect(await filas(admin, `select transaccion from pagos where order_id = $1`, [orden.id])).toHaveLength(1);
    expect(await filas(otro, `select transaccion from pagos`)).toHaveLength(0);
    expect(await filas(null, `select transaccion from pagos`)).toHaveLength(0);

    const e = await falla(
      comoUsuario(sql, comprador, (s) =>
        s.query(
          `insert into pagos (order_id, pasarela, transaccion, estado, monto_cop) values ($1, 'bold', 'falsa', 'aprobado', 1)`,
          [orden.id],
        ),
      ),
    );
    expect(e?.code).toBe("42501");
  });
});
