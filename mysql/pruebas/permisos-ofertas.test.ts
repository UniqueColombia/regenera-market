/**
 * Los permisos de una oferta en MariaDB, probados **con el rol equivocado**,
 * como `supabase/pruebas/permisos.test.ts`: una regla se valida demostrando que
 * niega, no que permite (skill `supabase-schema`).
 *
 *   npm run test:mysql
 *
 * Trabaja sobre la base de pruebas de Hostinger con datos inventados (empresas
 * `prueba-…`) que borra al terminar; el espejo del catálogo no se toca.
 * `preparar.ts` vuelve a aplicar el esquema antes, así que prueba lo que está en
 * el repositorio y no lo que quedó en la base.
 */
import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nuevaBaseMysql } from "../../src/lib/mysql/conexion";
import { comoUsuario, escribirOfertaMysql, leerOferta, VISITANTE, type Actor } from "../../src/lib/mysql/ofertas";
import type { BaseMysql } from "../../src/lib/mysql/esquema";

const HAY_MYSQL = Boolean(process.env.MYSQL_HOST && process.env.MYSQL_PASSWORD);
const SERVICIO: Actor = { id: null, rol: "servicio" };

let db: Kysely<BaseMysql>;
const empresas: string[] = [];
const usuarios: string[] = [];

/** Una persona con sesión. Con `admin`, además, el rol. */
async function crearUsuario(opciones: { admin?: boolean } = {}): Promise<Actor> {
  const id = crypto.randomUUID();
  usuarios.push(id);
  await comoUsuario(db, SERVICIO, async (t) => {
    await t.insertInto("usuarios").values({ id, email: `${id}@pruebas.invalid`, clave: null, metadatos: "{}" }).execute();
    if (opciones.admin) await t.insertInto("user_roles").values({ user_id: id, role: "admin" }).execute();
  });
  return { id, rol: "authenticated" };
}

async function crearEmpresa(opciones: { miembro?: Actor; verificada?: boolean } = {}): Promise<string> {
  const id = crypto.randomUUID();
  empresas.push(id);
  await comoUsuario(db, SERVICIO, async (t) => {
    await t
      .insertInto("providers")
      .values({
        id,
        slug: `prueba-${id}`,
        name: "Empresa de prueba",
        status: "approved",
        sustainability_score: 0,
        tier: "semilla",
        sustainability_verified_at: opciones.verificada ? "2026-10-01 00:00:00.000000" : null,
      } as never)
      .execute();
    if (opciones.miembro?.id) {
      await t.insertInto("provider_members").values({ provider_id: id, user_id: opciones.miembro.id }).execute();
    }
  });
  return id;
}

/** Lo mínimo que exige `listings`. */
function filaMinima(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const marca = crypto.randomUUID().slice(0, 8);
  return {
    slug: `prueba-${marca}`,
    kind: "product",
    title: `Oferta de prueba ${marca}`,
    category: "agua",
    price_cop: 10000,
    status: "draft",
    ...extra,
  };
}

/** Una oferta puesta por el servicio (sin pasar por los permisos), como hace el arnés de Postgres. */
async function crearOferta(empresa: string, extra: Record<string, unknown> = {}): Promise<string> {
  const r = await escribirOfertaMysql(db, SERVICIO, {
    tipo: "crear",
    fila: { ...filaMinima({ status: "approved" }), ...extra, provider_id: empresa },
  });
  if (!r.ok) throw new Error(`crearOferta: ${r.mensaje}`);
  return r.id;
}

async function leer(id: string) {
  return comoUsuario(db, SERVICIO, (t) =>
    t.selectFrom("listings").select(["status", "featured", "provider_id", "version", "title"]).where("id", "=", id).executeTakeFirstOrThrow(),
  );
}

describe.skipIf(!HAY_MYSQL)("permisos de una oferta en MariaDB", () => {
  beforeAll(() => {
    db = nuevaBaseMysql();
  });

  afterAll(async () => {
    if (!db) return;
    await comoUsuario(db, SERVICIO, async (t) => {
      if (empresas.length) await t.deleteFrom("providers").where("id", "in", empresas).execute();
      // Con la cuenta se van sus roles y membresías (llaves foráneas).
      if (usuarios.length) await t.deleteFrom("usuarios").where("id", "in", usuarios).execute();
    });
    await db.destroy();
  }, 60_000);

  describe("crear", () => {
    it("un visitante no crea ofertas", async () => {
      const empresa = await crearEmpresa();
      const r = await escribirOfertaMysql(db, VISITANTE, { tipo: "crear", fila: { ...filaMinima(), provider_id: empresa } });
      expect(r).toMatchObject({ ok: false, motivo: "denegado" });
    });

    it("nadie crea ofertas para una empresa que no gestiona", async () => {
      const ajena = await crearEmpresa({ miembro: await crearUsuario() });
      const yo = await crearUsuario();
      await crearEmpresa({ miembro: yo });
      const r = await escribirOfertaMysql(db, yo, { tipo: "crear", fila: { ...filaMinima(), provider_id: ajena } });
      expect(r).toMatchObject({ ok: false, motivo: "denegado" });
    });

    it("quien gestiona la empresa crea, pero en revisión y sin destacar aunque pida otra cosa", async () => {
      const yo = await crearUsuario();
      const empresa = await crearEmpresa({ miembro: yo });
      const r = await escribirOfertaMysql(db, yo, {
        tipo: "crear",
        fila: { ...filaMinima({ status: "approved", featured: true }), provider_id: empresa },
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(await leer(r.id)).toMatchObject({ status: "pending_review", featured: false, version: 1 });
    });

    it("el mismo envío dos veces (misma clave) no crea dos ofertas", async () => {
      const yo = await crearUsuario();
      const empresa = await crearEmpresa({ miembro: yo });
      const clave = crypto.randomUUID();
      const fila = { ...filaMinima(), provider_id: empresa };
      const primera = await escribirOfertaMysql(db, yo, { tipo: "crear", clave, fila });
      const segunda = await escribirOfertaMysql(db, yo, { tipo: "crear", clave, fila });
      expect(primera).toMatchObject({ ok: true, id: clave, repetida: false });
      expect(segunda).toMatchObject({ ok: true, id: clave, repetida: true });
    });

    it("un slug que ya existe se rechaza como `slug`", async () => {
      const yo = await crearUsuario();
      const empresa = await crearEmpresa({ miembro: yo });
      const fila = { ...filaMinima(), provider_id: empresa };
      await escribirOfertaMysql(db, yo, { tipo: "crear", fila });
      const r = await escribirOfertaMysql(db, yo, { tipo: "crear", fila: { ...fila, title: "Otro título" } });
      expect(r).toMatchObject({ ok: false, motivo: "slug" });
    });

    it("consultoría exige el sello verificado", async () => {
      const yo = await crearUsuario();
      const sinSello = await crearEmpresa({ miembro: yo });
      const r = await escribirOfertaMysql(db, yo, {
        tipo: "crear",
        fila: { ...filaMinima({ category: "consultoria" }), provider_id: sinSello },
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.mensaje).toContain("categoria-avanzada");

      const otra = await crearUsuario();
      const conSello = await crearEmpresa({ miembro: otra, verificada: true });
      const bien = await escribirOfertaMysql(db, otra, {
        tipo: "crear",
        fila: { ...filaMinima({ category: "consultoria" }), provider_id: conSello },
      });
      expect(bien.ok).toBe(true);
    });
  });

  describe("editar", () => {
    it("una empresa no se publica sola ni se marca destacada", async () => {
      const yo = await crearUsuario();
      const oferta = await crearOferta(await crearEmpresa({ miembro: yo }), { status: "draft" });
      const r = await escribirOfertaMysql(db, yo, { tipo: "editar", id: oferta, version: null, fila: { status: "approved", featured: true } });
      expect(r.ok).toBe(true);
      expect(await leer(oferta)).toMatchObject({ status: "draft", featured: false });
    });

    it("una empresa no muda su oferta a otra empresa", async () => {
      const yo = await crearUsuario();
      const mia = await crearEmpresa({ miembro: yo });
      const otra = await crearEmpresa({ miembro: yo });
      const oferta = await crearOferta(mia);
      await escribirOfertaMysql(db, yo, { tipo: "editar", id: oferta, version: null, fila: { provider_id: otra } });
      expect((await leer(oferta)).provider_id).toBe(mia);
    });

    it("nadie edita la oferta de una empresa que no gestiona", async () => {
      const oferta = await crearOferta(await crearEmpresa({ miembro: await crearUsuario() }));
      const intruso = await crearUsuario();
      const r = await escribirOfertaMysql(db, intruso, { tipo: "editar", id: oferta, version: null, fila: { title: "Mía ahora" } });
      expect(r).toMatchObject({ ok: false, motivo: "denegado" });
      expect((await leer(oferta)).title).not.toBe("Mía ahora");
      const visitante = await escribirOfertaMysql(db, VISITANTE, { tipo: "editar", id: oferta, version: null, fila: { title: "x" } });
      expect(visitante).toMatchObject({ ok: false, motivo: "denegado" });
    });

    it("editar algo publicado lo devuelve a revisión; el stock solo, no", async () => {
      const yo = await crearUsuario();
      const empresa = await crearEmpresa({ miembro: yo });
      const soloStock = await crearOferta(empresa);
      await escribirOfertaMysql(db, yo, { tipo: "editar", id: soloStock, version: null, fila: { stock: 7, status: "approved" } });
      expect((await leer(soloStock)).status).toBe("approved");

      const conTexto = await crearOferta(empresa);
      await escribirOfertaMysql(db, yo, { tipo: "editar", id: conTexto, version: null, fila: { title: "Título nuevo", status: "approved" } });
      expect((await leer(conTexto)).status).toBe("pending_review");

      const conArreglo = await crearOferta(empresa);
      await escribirOfertaMysql(db, yo, { tipo: "editar", id: conArreglo, version: null, fila: { images: ["/img/nueva.webp"], status: "approved" } });
      expect((await leer(conArreglo)).status).toBe("pending_review");
    });

    it("retirar (a borrador) sí se puede", async () => {
      const yo = await crearUsuario();
      const oferta = await crearOferta(await crearEmpresa({ miembro: yo }));
      const r = await escribirOfertaMysql(db, yo, { tipo: "editar", id: oferta, version: null, fila: { status: "draft" } });
      expect(r.ok).toBe(true);
      expect((await leer(oferta)).status).toBe("draft");
    });

    it("la versión sube en cada cambio y una edición sobre una versión vieja no pisa nada", async () => {
      const yo = await crearUsuario();
      const oferta = await crearOferta(await crearEmpresa({ miembro: yo }), { status: "draft" });
      expect((await leer(oferta)).version).toBe(1);
      const primera = await escribirOfertaMysql(db, yo, { tipo: "editar", id: oferta, version: 1, fila: { title: "Versión dos" } });
      expect(primera.ok).toBe(true);
      expect((await leer(oferta)).version).toBe(2);
      const vieja = await escribirOfertaMysql(db, yo, { tipo: "editar", id: oferta, version: 1, fila: { title: "Pisando" } });
      expect(vieja).toMatchObject({ ok: false, motivo: "conflicto" });
      expect((await leer(oferta)).title).toBe("Versión dos");
    });

    it("un administrador sí publica y destaca", async () => {
      const admin = await crearUsuario({ admin: true });
      const oferta = await crearOferta(await crearEmpresa(), { status: "pending_review" });
      const r = await escribirOfertaMysql(db, admin, { tipo: "editar", id: oferta, version: null, fila: { status: "approved", featured: true } });
      expect(r.ok).toBe(true);
      expect(await leer(oferta)).toMatchObject({ status: "approved", featured: true });
    });
  });

  describe("leer", () => {
    it("un visitante ve lo aprobado y nada en revisión ni en borrador; quien gestiona ve las suyas", async () => {
      const yo = await crearUsuario();
      const empresa = await crearEmpresa({ miembro: yo });
      const aprobada = await crearOferta(empresa);
      const enRevision = await crearOferta(empresa, { status: "pending_review" });
      const borrador = await crearOferta(empresa, { status: "draft" });

      for (const id of [aprobada, enRevision, borrador]) {
        const puede = id === aprobada;
        expect(Boolean(await leerOferta(db, VISITANTE, id))).toBe(puede);
        expect(Boolean(await leerOferta(db, await crearUsuario(), id))).toBe(puede);
        expect(Boolean(await leerOferta(db, yo, id))).toBe(true);
      }
    });
  });

  describe("lo que no se ve en la pantalla", () => {
    it("la identidad no se queda pegada a la conexión del pool", async () => {
      const admin = await crearUsuario({ admin: true });
      await comoUsuario(db, admin, async () => {});
      // Muchas veces seguidas: con un pool de 5, alguna toma la conexión que usó el admin.
      for (let i = 0; i < 8; i++) {
        const { rows } = await sql<{ quien: string | null; admin: boolean }>`select @app_usuario as quien, es_admin() as admin`.execute(db);
        expect(rows[0]).toMatchObject({ quien: null, admin: false });
      }
    });

    it("una escritura que se olvidó de `comoUsuario()` se trata como de un visitante", async () => {
      const oferta = await crearOferta(await crearEmpresa());
      await expect(db.updateTable("listings").set({ title: "Sin identidad" }).where("id", "=", oferta).execute()).rejects.toThrow("denegado");
      expect((await leer(oferta)).title).not.toBe("Sin identidad");
    });

    it("un texto demasiado largo se rechaza, no se recorta (modo estricto)", async () => {
      const yo = await crearUsuario();
      const empresa = await crearEmpresa({ miembro: yo });
      const r = await escribirOfertaMysql(db, yo, { tipo: "crear", fila: { ...filaMinima({ slug: "x".repeat(201) }), provider_id: empresa } });
      expect(r).toMatchObject({ ok: false, motivo: "error" });
    });

    it("el trigger compara todas las columnas de `listings` salvo las que no son contenido", async () => {
      const columnas = await comoUsuario(db, SERVICIO, (t) =>
        t
          .selectFrom(sql`information_schema.columns`.as("c"))
          .select(sql<string>`column_name`.as("nombre"))
          .where(sql`table_schema`, "=", sql`database()`)
          .where(sql`table_name`, "=", "listings")
          .execute(),
      );
      const [{ cuerpo }] = await comoUsuario(db, SERVICIO, (t) =>
        t
          .selectFrom(sql`information_schema.triggers`.as("g"))
          .select(sql<string>`action_statement`.as("cuerpo"))
          .where(sql`trigger_schema`, "=", sql`database()`)
          .where(sql`trigger_name`, "=", "listings_proteger_cambio")
          .execute(),
      );
      const fuera = new Set(["status", "featured", "stock", "version", "provider_id", "busqueda", "impacto"]);
      const faltan = columnas
        .map((c) => c.nombre)
        .filter((n) => !fuera.has(n) && !cuerpo.includes(`new.${n} <=> old.${n}`));
      expect(faltan).toEqual([]);
    });
  });
});
