/**
 * Las políticas RLS y los triggers de protección del modo MySQL, probados como
 * `supabase/pruebas/permisos.test.ts`: **con el rol equivocado**. Una regla se
 * valida demostrando que niega, no que permite (skill `supabase-schema`).
 *
 * Todo entra por la capa compatible (`src/lib/mysql/postgrest/`), con sesiones
 * de verdad: es el camino de la app.
 *
 *   npm run test:mysql
 */
import { afterAll, describe, expect, it } from "vitest";
import { cerrarPool, crearEmpresa, crearOferta, crearPersona, HAY_MYSQL, leer, limpiar, servicio, visitante } from "./arnes";

describe.skipIf(!HAY_MYSQL)("permisos en el modo MySQL", () => {
  afterAll(async () => {
    await limpiar();
    await cerrarPool();
  }, 120_000);

  describe("catálogo", () => {
    it("un visitante ve lo aprobado y nada en revisión ni en borrador", async () => {
      const empresa = await crearEmpresa();
      const aprobada = await crearOferta(empresa);
      const enRevision = await crearOferta(empresa, { status: "pending_review" });
      const borrador = await crearOferta(empresa, { status: "draft" });
      const { data } = await visitante().from("listings").select("id").in("id", [aprobada.id, enRevision.id, borrador.id]);
      expect((data as { id: string }[]).map((r) => r.id)).toEqual([aprobada.id]);
    });

    it("quien gestiona la empresa ve sus borradores; otra persona no", async () => {
      const yo = await crearPersona();
      const empresa = await crearEmpresa({ miembro: yo });
      const borrador = await crearOferta(empresa, { status: "draft" });
      expect((await yo.db.from("listings").select("id").eq("id", borrador.id)).data).toHaveLength(1);
      const otra = await crearPersona();
      expect((await otra.db.from("listings").select("id").eq("id", borrador.id)).data).toHaveLength(0);
    });

    it("un visitante no crea ofertas", async () => {
      const empresa = await crearEmpresa();
      const r = await visitante().from("listings").insert({ slug: `x-${crypto.randomUUID()}`, provider_id: empresa, kind: "product", title: "X", category: "agua", price_cop: 1 });
      expect(r.error?.code).toBe("42501");
    });

    it("nadie crea ofertas para una empresa que no gestiona", async () => {
      const ajena = await crearEmpresa({ miembro: await crearPersona() });
      const yo = await crearPersona();
      const r = await yo.db.from("listings").insert({ slug: `x-${crypto.randomUUID()}`, provider_id: ajena, kind: "product", title: "X", category: "agua", price_cop: 1 });
      expect(r.error?.code).toBe("42501");
    });

    it("quien gestiona crea, pero en revisión y sin destacar aunque pida otra cosa", async () => {
      const yo = await crearPersona();
      const empresa = await crearEmpresa({ miembro: yo });
      const r = await yo.db
        .from("listings")
        .insert({ slug: `x-${crypto.randomUUID()}`, provider_id: empresa, kind: "product", title: "Mía", category: "agua", price_cop: 1, status: "approved", featured: true })
        .select("id, status, featured, version")
        .single();
      expect(r.error).toBeNull();
      expect(r.data).toMatchObject({ status: "pending_review", featured: false, version: 1 });
    });

    it("una empresa no se publica sola, no se destaca ni muda su oferta a otra empresa", async () => {
      const yo = await crearPersona();
      const mia = await crearEmpresa({ miembro: yo });
      const otra = await crearEmpresa({ miembro: yo });
      const oferta = await crearOferta(mia, { status: "draft" });
      const r = await yo.db.from("listings").update({ status: "approved", featured: true, provider_id: otra }).eq("id", oferta.id).select("id");
      expect(r.error).toBeNull();
      expect(await leer("listings", oferta.id, "status, featured, provider_id")).toMatchObject({ status: "draft", featured: false, provider_id: mia });
    });

    it("editar algo publicado lo devuelve a revisión; el stock solo, no; y la versión sube", async () => {
      const yo = await crearPersona();
      const empresa = await crearEmpresa({ miembro: yo });
      const soloStock = await crearOferta(empresa);
      await yo.db.from("listings").update({ stock: 7 }).eq("id", soloStock.id);
      expect(await leer("listings", soloStock.id, "status, version")).toMatchObject({ status: "approved", version: 2 });
      const conTexto = await crearOferta(empresa);
      await yo.db.from("listings").update({ title: "Otro título" }).eq("id", conTexto.id);
      expect((await leer("listings", conTexto.id, "status")).status).toBe("pending_review");
      const conArreglo = await crearOferta(empresa, { images: ["/img/a.webp"] });
      await yo.db.from("listings").update({ images: ["/img/b.webp"] }).eq("id", conArreglo.id);
      expect((await leer("listings", conArreglo.id, "status")).status).toBe("pending_review");
      const mismoArreglo = await crearOferta(empresa, { images: ["/img/a.webp"] });
      await yo.db.from("listings").update({ images: ["/img/a.webp"], stock: 3 }).eq("id", mismoArreglo.id);
      expect((await leer("listings", mismoArreglo.id, "status")).status).toBe("approved");
    });

    it("una edición sobre una versión vieja no toca nada", async () => {
      const yo = await crearPersona();
      const oferta = await crearOferta(await crearEmpresa({ miembro: yo }), { status: "draft" });
      expect((await yo.db.from("listings").update({ title: "v2" }).eq("id", oferta.id).eq("version", 1).select("id")).data).toHaveLength(1);
      expect((await yo.db.from("listings").update({ title: "pisando" }).eq("id", oferta.id).eq("version", 1).select("id")).data).toHaveLength(0);
      expect((await leer("listings", oferta.id, "title")).title).toBe("v2");
    });

    it("nadie edita la oferta de una empresa que no gestiona (cero filas, como en Postgres)", async () => {
      const oferta = await crearOferta(await crearEmpresa({ miembro: await crearPersona() }));
      const intruso = await crearPersona();
      const r = await intruso.db.from("listings").update({ title: "Mía ahora" }).eq("id", oferta.id).select("id");
      expect(r.error).toBeNull();
      expect(r.data).toHaveLength(0);
      expect((await leer("listings", oferta.id, "title")).title).not.toBe("Mía ahora");
    });

    it("consultoría exige el sello verificado", async () => {
      const yo = await crearPersona();
      const sinSello = await crearEmpresa({ miembro: yo });
      const r = await yo.db.from("listings").insert({ slug: `x-${crypto.randomUUID()}`, provider_id: sinSello, kind: "service", title: "C", category: "consultoria", price_cop: 1 });
      expect(r.error?.message).toContain("categoria-avanzada");
      const otra = await crearPersona();
      const conSello = await crearEmpresa({ miembro: otra, verificada: true });
      const bien = await otra.db.from("listings").insert({ slug: `x-${crypto.randomUUID()}`, provider_id: conSello, kind: "service", title: "C", category: "consultoria", price_cop: 1 });
      expect(bien.error).toBeNull();
    });

    it("un administrador sí publica y destaca", async () => {
      const admin = await crearPersona({ admin: true });
      const oferta = await crearOferta(await crearEmpresa(), { status: "pending_review" });
      await admin.db.from("listings").update({ status: "approved", featured: true }).eq("id", oferta.id);
      expect(await leer("listings", oferta.id, "status, featured")).toMatchObject({ status: "approved", featured: true });
    });
  });

  describe("empresas", () => {
    it("una empresa no se sube puntos, nivel, sello ni estado", async () => {
      const yo = await crearPersona();
      const empresa = await crearEmpresa({ miembro: yo });
      await yo.db.from("providers").update({ experience_points: 9999, tier: "bosque", sustainability_score: 100, status: "approved", tagline: "Nueva frase de la empresa" }).eq("id", empresa);
      expect(await leer("providers", empresa, "experience_points, tier, sustainability_score, tagline")).toMatchObject({
        experience_points: 0, tier: "semilla", sustainability_score: 0, tagline: "Nueva frase de la empresa",
      });
    });

    it("más giros de los que permite el nivel, no", async () => {
      const yo = await crearPersona();
      const empresa = await crearEmpresa({ miembro: yo });
      const r = await yo.db.from("providers").update({ giros: ["alojamiento", "restaurante", "tours"] }).eq("id", empresa);
      expect(r.error?.message).toBe("giros-limite");
      expect(r.error?.hint).toContain("semilla");
      const invalido = await servicio().from("providers").update({ giros: ["no-existe"] }).eq("id", empresa);
      expect(invalido.error?.code).toBe("23514");
    });

    it("una empresa sube su certificación, pero no se la verifica sola (la política mira la fila ya pasada por el trigger)", async () => {
      const yo = await crearPersona();
      const empresa = await crearEmpresa({ miembro: yo });
      const r = await yo.db
        .from("provider_certifications")
        .insert({ provider_id: empresa, certification_code: "b-corp", verified_at: new Date().toISOString() })
        .select("verified_at")
        .single();
      expect(r.error).toBeNull();
      expect(r.data).toEqual({ verified_at: null });
    });

    it("el nivel sale de los puntos", async () => {
      const empresa = await crearEmpresa({ puntos: 700 });
      expect((await leer("providers", empresa, "tier")).tier).toBe("raiz");
    });
  });

  describe("roles", () => {
    it("nadie se da el rol de administrador a sí mismo", async () => {
      const yo = await crearPersona();
      const r = await yo.db.from("user_roles").insert({ user_id: yo.id, role: "admin" });
      expect(r.error?.code).toBe("42501");
      const { count } = await servicio().from("user_roles").select("role", { count: "exact", head: true }).eq("user_id", yo.id).eq("role", "admin");
      expect(count).toBe(0);
    });

    it("cada quien ve sus roles y no los de otro", async () => {
      const yo = await crearPersona();
      const otro = await crearPersona();
      expect((await yo.db.from("user_roles").select("role").eq("user_id", otro.id)).data).toHaveLength(0);
      expect((await yo.db.from("user_roles").select("role").eq("user_id", yo.id)).data).toEqual([{ role: "buyer" }]);
    });
  });

  describe("pedidos", () => {
    it("nadie crea un pedido con un insert directo", async () => {
      const yo = await crearPersona();
      const r = await yo.db.from("orders").insert({ reference: `SR-FALSA-${crypto.randomUUID().slice(0, 4)}`, buyer_id: yo.id, buyer_email: "x@x", buyer_name: "Yo", total_cop: 1, status: "paid" });
      expect(r.error?.code).toBe("42501");
    });
  });

  describe("reseñas", () => {
    it("un visitante lee la reseña pero no quién la escribió", async () => {
      const r = await visitante().from("reviews").select("author_id").limit(1);
      expect(r.error?.code).toBe("42501");
      expect((await visitante().from("reviews").select("id, rating, body, autor_nombre").limit(1)).error).toBeNull();
      expect((await visitante().from("calificaciones_oferta").select("promedio, cantidad").limit(1)).error).toBeNull();
    });
  });

  describe("lo que no se ve en la pantalla", () => {
    it("la identidad no se queda pegada a la conexión del pool", async () => {
      const admin = await crearPersona({ admin: true });
      const empresa = await crearEmpresa();
      const borrador = await crearOferta(empresa, { status: "draft" });
      expect((await admin.db.from("listings").select("id").eq("id", borrador.id)).data).toHaveLength(1);
      // Muchas veces seguidas: alguna toma la conexión que usó el admin.
      for (let i = 0; i < 10; i++) {
        expect((await visitante().from("listings").select("id").eq("id", borrador.id)).data).toHaveLength(0);
      }
    });

    it("una tabla con RLS y sin política para la orden niega todo", async () => {
      const yo = await crearPersona();
      expect((await yo.db.from("community_post_log").select("author_id")).data).toEqual([]);
      expect((await yo.db.from("page_views").select("id").limit(1)).data).toEqual([]);
    });

    it("un texto demasiado largo se rechaza, no se recorta (modo estricto)", async () => {
      const yo = await crearPersona();
      const empresa = await crearEmpresa({ miembro: yo });
      const r = await yo.db.from("listings").insert({ slug: "x".repeat(300), provider_id: empresa, kind: "product", title: "X", category: "agua", price_cop: 1 });
      expect(r.error?.code).toBe("22001");
    });

    it("el trigger compara todas las columnas de listings salvo las que no son contenido", async () => {
      const { getPoolMysql } = await import("../../src/lib/mysql/conexion");
      const pool = getPoolMysql().promise();
      const [cols] = await pool.query("select column_name as c from information_schema.columns where table_schema = database() and table_name = 'listings'");
      const [[{ cuerpo }]] = (await pool.query(
        "select action_statement as cuerpo from information_schema.triggers where trigger_schema = database() and trigger_name = 'listings_antes_de_cambiar'",
      )) as unknown as [[{ cuerpo: string }]];
      const fuera = new Set(["status", "featured", "stock", "version", "busqueda", "impacto"]);
      const faltan = (cols as { c: string }[]).map((x) => x.c).filter((c) => !fuera.has(c) && !cuerpo.includes(`new.${c} <=> old.${c}`) && !cuerpo.includes(`igual_json(new.${c}, old.${c})`));
      expect(faltan).toEqual([]);
    });
  });
});
