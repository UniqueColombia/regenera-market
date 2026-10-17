/**
 * Las cuentas propias (`src/lib/mysql/cuentas.ts`), probadas sobre todo
 * intentando romperlas: el código adivinado, vencido o usado dos veces, la
 * sesión vieja o robada de la tabla, dos verificaciones a la vez.
 *
 *   npm run test:mysql
 *
 * Cada prueba usa correos inventados (`…@pruebas.invalid`) y al terminar se
 * borran sus cuentas.
 */
import { createHash } from "node:crypto";
import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nuevaBaseMysql } from "../../src/lib/mysql/conexion";
import {
  abrirSesion,
  borrarCuenta,
  cambiarClave,
  CODIGOS_POR_HORA,
  cerrarOtrasSesiones,
  cerrarSesion,
  comprobarClave,
  crearCuenta,
  INTENTOS_POR_CODIGO,
  leerSesion,
  actualizarMetadatos,
  pedirCodigo,
  verificarCodigo,
} from "../../src/lib/mysql/cuentas";
import type { BaseMysql } from "../../src/lib/mysql/esquema";

const HAY_MYSQL = Boolean(process.env.MYSQL_HOST && process.env.MYSQL_PASSWORD);

let db: Kysely<BaseMysql>;
const creadas: string[] = [];

const correoNuevo = () => `prueba-${crypto.randomUUID().slice(0, 8)}@pruebas.invalid`;

async function cuenta(opciones: { clave?: string | null; confirmada?: boolean } = {}) {
  const email = correoNuevo();
  const r = await crearCuenta(db, { email, clave: opciones.clave === undefined ? "una clave larga de prueba" : opciones.clave });
  if (!r.ok) throw new Error("no se creó");
  creadas.push(r.usuarioId);
  if (opciones.confirmada) {
    await db.updateTable("usuarios").set({ correo_confirmado_at: sql`now(6)` }).where("id", "=", r.usuarioId).execute();
  }
  return { email, id: r.usuarioId };
}

/** Mueve en el tiempo lo que la prueba necesita viejo, sin esperar de verdad. */
async function envejecerCodigos(email: string, minutos: number) {
  await sql`update codigos set creado_at = creado_at - interval ${minutos} minute where email = ${email}`.execute(db);
}

describe.skipIf(!HAY_MYSQL)("cuentas propias en MariaDB", () => {
  beforeAll(() => {
    db = nuevaBaseMysql();
  });

  afterAll(async () => {
    if (!db) return;
    for (const id of creadas) await borrarCuenta(db, id);
    await db.destroy();
  }, 60_000);

  describe("crear y contraseña", () => {
    it("el correo se guarda normalizado y no se repite aunque cambien las mayúsculas", async () => {
      const email = correoNuevo();
      const r = await crearCuenta(db, { email: `  ${email.toUpperCase()} `, clave: "otra clave larga" });
      expect(r.ok).toBe(true);
      if (r.ok) creadas.push(r.usuarioId);
      const fila = await db.selectFrom("usuarios").select("email").where("email", "=", email).executeTakeFirst();
      expect(fila?.email).toBe(email);
      expect(await crearCuenta(db, { email, clave: "x" })).toMatchObject({ ok: false, motivo: "existe", confirmada: false });
    });

    it("la contraseña no se guarda: se guarda su scrypt, y cada cuenta con su sal", async () => {
      const a = await cuenta({ clave: "la misma clave" });
      const b = await cuenta({ clave: "la misma clave" });
      const filas = await db.selectFrom("usuarios").select(["id", "clave"]).where("id", "in", [a.id, b.id]).execute();
      for (const f of filas) {
        expect(f.clave).toMatch(/^scrypt\$32768\$8\$1\$/);
        expect(f.clave).not.toContain("la misma clave");
      }
      expect(filas[0].clave).not.toBe(filas[1].clave);
    });

    it("la contraseña correcta entra; una mala, un correo que no existe o una cuenta sin clave, no, y responden igual", async () => {
      const yo = await cuenta({ clave: "Árbol de café 2026" });
      expect(await comprobarClave(db, yo.email.toUpperCase(), "Árbol de café 2026")).toMatchObject({ ok: true, usuarioId: yo.id });
      // La «é» descompuesta (e + tilde) es la misma contraseña.
      expect(await comprobarClave(db, yo.email, "Árbol de café 2026".normalize("NFD"))).toMatchObject({ ok: true });
      expect(await comprobarClave(db, yo.email, "árbol de café 2026")).toEqual({ ok: false });
      expect(await comprobarClave(db, correoNuevo(), "Árbol de café 2026")).toEqual({ ok: false });
      const sinClave = await cuenta({ clave: null });
      expect(await comprobarClave(db, sinClave.email, "")).toEqual({ ok: false });
    });

    it("cambiar la contraseña invalida la vieja", async () => {
      const yo = await cuenta({ clave: "la vieja de siempre" });
      await cambiarClave(db, yo.id, "la nueva de ahora");
      expect((await comprobarClave(db, yo.email, "la vieja de siempre")).ok).toBe(false);
      expect((await comprobarClave(db, yo.email, "la nueva de ahora")).ok).toBe(true);
    });

    it("los metadatos se mezclan, no se reemplazan", async () => {
      const yo = await cuenta();
      await actualizarMetadatos(db, yo.id, { full_name: "Ana Pérez", telefono: "+57 300" });
      await actualizarMetadatos(db, yo.id, { bienvenida: true });
      const fila = await db.selectFrom("usuarios").select("metadatos").where("id", "=", yo.id).executeTakeFirstOrThrow();
      expect(fila.metadatos).toEqual({ full_name: "Ana Pérez", telefono: "+57 300", bienvenida: true });
    });
  });

  describe("códigos de seis dígitos", () => {
    it("un código bueno entra una sola vez y confirma el correo", async () => {
      const yo = await cuenta();
      const pedido = await pedirCodigo(db, yo.email, "registro");
      expect(pedido.ok).toBe(true);
      if (!pedido.ok) return;
      expect(pedido.codigo).toMatch(/^\d{6}$/);
      expect(await verificarCodigo(db, yo.email, pedido.codigo.replace(/(\d{3})/, "$1 "))).toMatchObject({
        ok: true,
        usuarioId: yo.id,
        proposito: "registro",
      });
      const fila = await db.selectFrom("usuarios").select("correo_confirmado_at").where("id", "=", yo.id).executeTakeFirstOrThrow();
      expect(fila.correo_confirmado_at).not.toBeNull();
      expect(await verificarCodigo(db, yo.email, pedido.codigo)).toMatchObject({ ok: false, motivo: "invalido" });
    });

    it("el código no se guarda en claro", async () => {
      const yo = await cuenta();
      const pedido = await pedirCodigo(db, yo.email, "acceso");
      if (!pedido.ok) throw new Error("no hubo código");
      const filas = await db.selectFrom("codigos").selectAll().where("email", "=", yo.email).execute();
      expect(JSON.stringify(filas)).not.toContain(pedido.codigo);
    });

    it(`después de ${INTENTOS_POR_CODIGO} intentos fallidos, ni el código bueno sirve`, async () => {
      const yo = await cuenta();
      const pedido = await pedirCodigo(db, yo.email, "acceso");
      if (!pedido.ok) throw new Error("no hubo código");
      const malo = pedido.codigo === "000000" ? "111111" : "000000";
      for (let i = 1; i < INTENTOS_POR_CODIGO; i++) {
        expect(await verificarCodigo(db, yo.email, malo)).toMatchObject({ ok: false, motivo: "invalido" });
      }
      expect(await verificarCodigo(db, yo.email, malo)).toMatchObject({ ok: false, motivo: "agotado" });
      expect(await verificarCodigo(db, yo.email, pedido.codigo)).toMatchObject({ ok: false, motivo: "agotado" });
    });

    it("un código vencido no sirve", async () => {
      const yo = await cuenta();
      const pedido = await pedirCodigo(db, yo.email, "acceso");
      if (!pedido.ok) throw new Error("no hubo código");
      await sql`update codigos set vence_at = now(6) - interval 1 second where email = ${yo.email}`.execute(db);
      expect(await verificarCodigo(db, yo.email, pedido.codigo)).toMatchObject({ ok: false, motivo: "vencido" });
    });

    it("solo vale el último código pedido", async () => {
      const yo = await cuenta();
      const primero = await pedirCodigo(db, yo.email, "acceso");
      await envejecerCodigos(yo.email, 2);
      const segundo = await pedirCodigo(db, yo.email, "acceso");
      if (!primero.ok || !segundo.ok) throw new Error("no hubo código");
      if (primero.codigo !== segundo.codigo) {
        expect((await verificarCodigo(db, yo.email, primero.codigo)).ok).toBe(false);
      }
      expect((await verificarCodigo(db, yo.email, segundo.codigo)).ok).toBe(true);
    });

    it("dos verificaciones a la vez con el código bueno: entra una sola", async () => {
      const yo = await cuenta();
      const pedido = await pedirCodigo(db, yo.email, "acceso");
      if (!pedido.ok) throw new Error("no hubo código");
      const resultados = await Promise.all([1, 2, 3].map(() => verificarCodigo(db, yo.email, pedido.codigo)));
      expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    });

    it(`hay que esperar entre un código y otro, y no más de ${CODIGOS_POR_HORA} por hora`, async () => {
      const yo = await cuenta();
      expect((await pedirCodigo(db, yo.email, "acceso")).ok).toBe(true);
      expect(await pedirCodigo(db, yo.email, "acceso")).toMatchObject({ ok: false, motivo: "espera" });
      for (let i = 1; i < CODIGOS_POR_HORA; i++) {
        await envejecerCodigos(yo.email, 2);
        expect((await pedirCodigo(db, yo.email, "acceso")).ok).toBe(true);
      }
      await envejecerCodigos(yo.email, 2);
      expect(await pedirCodigo(db, yo.email, "acceso")).toMatchObject({ ok: false, motivo: "demasiados" });
      // Pasada la hora, vuelve a poder.
      await envejecerCodigos(yo.email, 60);
      expect((await pedirCodigo(db, yo.email, "acceso")).ok).toBe(true);
    });

    it("no hay código para un correo sin cuenta, ni de registro para una cuenta ya confirmada", async () => {
      expect(await pedirCodigo(db, correoNuevo(), "acceso")).toEqual({ ok: false, motivo: "sin-cuenta" });
      const yo = await cuenta({ confirmada: true });
      expect(await pedirCodigo(db, yo.email, "registro")).toEqual({ ok: false, motivo: "ya-confirmada" });
      expect((await pedirCodigo(db, yo.email, "acceso")).ok).toBe(true);
    });
  });

  describe("sesiones", () => {
    it("abrir, leer y cerrar; el token no queda en la base", async () => {
      const yo = await cuenta({ confirmada: true });
      const token = await abrirSesion(db, yo.id, "Chrome en Windows");
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(await leerSesion(db, token)).toMatchObject({ id: yo.id, email: yo.email, tieneClave: true, confirmada: true });
      const filas = await db.selectFrom("sesiones").selectAll().where("usuario_id", "=", yo.id).execute();
      expect(JSON.stringify(filas)).not.toContain(token);
      expect(filas[0].token_hash).toBe(createHash("sha256").update(token).digest("hex"));
      await cerrarSesion(db, token);
      expect(await leerSesion(db, token)).toBeNull();
    });

    it("lo que no es un token ni se busca, y el hash robado de la tabla no sirve de token", async () => {
      const yo = await cuenta();
      const token = await abrirSesion(db, yo.id);
      const { token_hash } = await db.selectFrom("sesiones").select("token_hash").where("usuario_id", "=", yo.id).executeTakeFirstOrThrow();
      for (const malo of [undefined, "", "x", token.slice(0, -1), `${token}x`, token_hash, "' or 1=1 --"]) {
        expect(await leerSesion(db, malo)).toBeNull();
      }
    });

    it("se cierra tras 48 h sin uso y a los 30 días aunque se use, y la muerta se borra", async () => {
      const yo = await cuenta();
      const quieta = await abrirSesion(db, yo.id);
      const vieja = await abrirSesion(db, yo.id);
      const h = (t: string) => createHash("sha256").update(t).digest("hex");
      await sql`update sesiones set vista_at = now(6) - interval 49 hour where token_hash = ${h(quieta)}`.execute(db);
      await sql`update sesiones set creada_at = now(6) - interval 31 day where token_hash = ${h(vieja)}`.execute(db);
      expect(await leerSesion(db, quieta)).toBeNull();
      expect(await leerSesion(db, vieja)).toBeNull();
      const quedan = await db.selectFrom("sesiones").select("token_hash").where("usuario_id", "=", yo.id).execute();
      expect(quedan).toHaveLength(0);
    });

    it("la actividad se marca como mucho una vez por minuto", async () => {
      const yo = await cuenta();
      const token = await abrirSesion(db, yo.id);
      const h = createHash("sha256").update(token).digest("hex");
      const vista = async () =>
        (await db.selectFrom("sesiones").select("vista_at").where("token_hash", "=", h).executeTakeFirstOrThrow()).vista_at;
      const antes = await vista();
      await leerSesion(db, token);
      expect(await vista()).toBe(antes);
      await sql`update sesiones set vista_at = now(6) - interval 2 minute where token_hash = ${h}`.execute(db);
      const atrasada = await vista();
      await leerSesion(db, token);
      expect(await vista()).not.toBe(atrasada);
    });

    it("cerrar las otras sesiones deja abierta la actual", async () => {
      const yo = await cuenta();
      const aqui = await abrirSesion(db, yo.id);
      const alla = await abrirSesion(db, yo.id);
      await cerrarOtrasSesiones(db, yo.id, aqui);
      expect(await leerSesion(db, aqui)).not.toBeNull();
      expect(await leerSesion(db, alla)).toBeNull();
    });

    it("borrar la cuenta se lleva sus sesiones, sus códigos y sus roles", async () => {
      const yo = await cuenta();
      const token = await abrirSesion(db, yo.id);
      await pedirCodigo(db, yo.email, "acceso");
      // El de comprador lo puso la base al crear la cuenta (handle_new_user); este, a mano.
      await db.insertInto("user_roles").values({ user_id: yo.id, role: "provider" }).execute();
      await borrarCuenta(db, yo.id);
      expect(await leerSesion(db, token)).toBeNull();
      expect(await db.selectFrom("codigos").select("id").where("email", "=", yo.email).execute()).toHaveLength(0);
      expect(await db.selectFrom("user_roles").select("role").where("user_id", "=", yo.id).execute()).toHaveLength(0);
    });
  });
});
