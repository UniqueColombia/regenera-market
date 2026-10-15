/**
 * La 0018: los prospectos solo los ve el equipo, una baja se respeta siempre y
 * un mismo correo de campaña no le llega dos veces a la misma empresa.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { baseNueva, comoUsuario, crearEmpresa, crearUsuario, falla, type Sql } from "./arnes";

let sql: Sql;
let cerrar: () => Promise<void>;
beforeAll(async () => ({ sql, cerrar } = await baseNueva()));
afterAll(() => cerrar());

const filas = (uid: string | null, q: string, p: unknown[] = []) =>
  comoUsuario(sql, uid, async (s) => (await s.query(q, p)).rows);

async function crearProspecto(correo = `${randomUUID().slice(0, 8)}@empresa.test`) {
  const { rows } = await sql.query(
    `insert into prospectos (nombre, correo, fuente) values ('Cacao de la Sierra', $1, 'sitio web')
     returning id, token`,
    [correo],
  );
  return rows[0] as { id: string; token: string };
}

describe("prospectos", () => {
  it("solo los lee y los escribe un administrador", async () => {
    await crearProspecto();
    const admin = await crearUsuario(sql, { admin: true });
    const persona = await crearUsuario(sql);
    const empresa = await crearUsuario(sql);
    await crearEmpresa(sql, { miembro: empresa });

    expect((await filas(admin, `select id from prospectos`)).length).toBeGreaterThan(0);
    expect(await filas(persona, `select id from prospectos`)).toHaveLength(0);
    expect(await filas(empresa, `select id from prospectos`)).toHaveLength(0);
    expect(await filas(null, `select id from prospectos`)).toHaveLength(0);

    const e = await falla(
      comoUsuario(sql, persona, (s) => s.query(`insert into prospectos (nombre) values ('Intrusa SAS')`)),
    );
    expect(e?.code).toBe("42501");
    expect(await filas(admin, `insert into prospectos (nombre) values ('Café del Huila') returning id`)).toHaveLength(1);
  });

  it("no repite una empresa por correo, sin importar mayúsculas", async () => {
    await crearProspecto("ventas@cacao.test");
    const e = await falla(sql.query(`insert into prospectos (nombre, correo) values ('Otra', 'VENTAS@cacao.test')`));
    expect(e?.code).toBe("23505");
  });

  it("cualquiera con el token se da de baja, y la baja no se deshace desde el panel", async () => {
    const p = await crearProspecto();
    const admin = await crearUsuario(sql, { admin: true });

    const [r] = await filas(null, `select baja_de_prospecto($1) as nombre`, [p.token]);
    expect(r.nombre).toBe("Cacao de la Sierra");
    await comoUsuario(sql, null, (s) => s.query(`select baja_de_prospecto($1)`, [p.token]), { confirmar: true });

    await comoUsuario(sql, admin, (s) => s.query(`update prospectos set baja_at = null where id = $1`, [p.id]), {
      confirmar: true,
    });
    const { rows } = await sql.query(`select baja_at from prospectos where id = $1`, [p.id]);
    expect(rows[0].baja_at).not.toBeNull();

    const [nada] = await filas(null, `select baja_de_prospecto($1) as nombre`, [randomUUID()]);
    expect(nada.nombre).toBeNull();
  });

  it("la invitación devuelve los datos de esa empresa y de ninguna otra", async () => {
    const p = await crearProspecto("hola@cafe.test");
    expect(await filas(null, `select correo from invitacion_de_prospecto($1)`, [p.token])).toEqual([
      { correo: "hola@cafe.test" },
    ]);
    expect(await filas(null, `select * from invitacion_de_prospecto($1)`, [randomUUID()])).toHaveLength(0);
  });

  it("un correo de campaña se registra una sola vez por empresa", async () => {
    const p = await crearProspecto();
    const admin = await crearUsuario(sql, { admin: true });
    const campana = randomUUID();
    await comoUsuario(
      sql,
      admin,
      async (s) => {
        await s.query(
          `insert into campanas (id, tipo, asunto, cuerpo) values ($1, 'invitacion', 'Te invitamos', 'Hola, te invitamos a vender.')`,
          [campana],
        );
        const primera = await s.query(
          `insert into envios_de_campana (campana_id, prospecto_id) values ($1, $2) on conflict do nothing`,
          [campana, p.id],
        );
        const segunda = await s.query(
          `insert into envios_de_campana (campana_id, prospecto_id) values ($1, $2) on conflict do nothing`,
          [campana, p.id],
        );
        expect([primera.rowCount, segunda.rowCount]).toEqual([1, 0]);
      },
      { confirmar: true },
    );
    expect(await filas(await crearUsuario(sql), `select * from envios_de_campana`)).toHaveLength(0);
  });
});
