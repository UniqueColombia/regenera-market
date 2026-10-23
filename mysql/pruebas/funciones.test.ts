/**
 * El resto de las funciones de Postgres (`src/lib/mysql/postgrest/rpc.ts`) y la
 * comunidad, en el modo MySQL. La referencia son las pruebas de
 * `supabase/pruebas/` (`documento`, `baja`, `prospectos`, `autobeneficio`).
 *
 *   npm run test:mysql
 */
import { afterAll, describe, expect, it } from "vitest";
import { getPoolMysql } from "../../src/lib/mysql/conexion";
import { cerrarPool, crearEmpresa, crearOferta, crearPersona, HAY_MYSQL, leer, limpiar, servicio, sinError, visitante } from "./arnes";

const POSTULACION = {
  _contact_name: "Ana Contacto", _phone: "3001234567", _country: "Colombia", _department: "Boyacá",
  _city: "Tunja", _description: "Hacemos cosas buenas para el planeta. Y otras más.", _categories: ["agua"],
};
const nit = () => `9${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;

describe.skipIf(!HAY_MYSQL)("funciones y comunidad en el modo MySQL", () => {
  const empresasCreadas: string[] = [];
  afterAll(async () => {
    if (empresasCreadas.length) await servicio().from("providers").delete().in("id", empresasCreadas);
    await limpiar();
    await cerrarPool();
  }, 180_000);

  describe("postularse y la empresa", () => {
    it("con sesión, la postulación activa la empresa con su dueña y el rol de proveedor", async () => {
      const ana = await crearPersona();
      const r = await ana.db.rpc("postular_proveedor", { ...POSTULACION, _name: `Ecológica ${crypto.randomUUID().slice(0, 6)}`, _email: ana.email, _tax_id: nit() });
      expect(r.error).toBeNull();
      const p = r.data as { activado: boolean; provider_id: string; provider_slug: string };
      empresasCreadas.push(p.provider_id);
      expect(p.activado).toBe(true);
      expect(p.provider_slug).toMatch(/^ecologica-/);
      const empresa = await leer("providers", p.provider_id, "status, tagline");
      expect(empresa).toMatchObject({ status: "approved", tagline: "Hacemos cosas buenas para el planeta" });
      expect((await ana.db.from("user_roles").select("role").eq("role", "provider")).data).toHaveLength(1);
      expect((await ana.db.from("provider_members").select("is_owner").eq("provider_id", p.provider_id)).data).toEqual([{ is_owner: true }]);
    });

    it("un documento, una empresa: otra persona con el mismo NIT queda en revisión", async () => {
      const documento = nit();
      const ana = await crearPersona();
      const primera = await ana.db.rpc("postular_proveedor", { ...POSTULACION, _name: "Primera SAS", _email: ana.email, _tax_id: documento });
      empresasCreadas.push((primera.data as { provider_id: string }).provider_id);
      const beto = await crearPersona();
      // El mismo NIT escrito distinto (con puntos y DV) es el mismo documento.
      const segunda = await beto.db.rpc("postular_proveedor", { ...POSTULACION, _name: "Segunda SAS", _email: beto.email, _tax_id: `${documento.slice(0, 3)}.${documento.slice(3, 6)}.${documento.slice(6)}` });
      expect(segunda.data).toMatchObject({ activado: false, motivo: "documento-existente" });
    });

    it("sin sesión, la postulación espera revisión, y el equipo la aprueba", async () => {
      const r = await visitante().rpc("postular_proveedor", { ...POSTULACION, _name: `Sin cuenta ${crypto.randomUUID().slice(0, 6)}`, _email: "sin-cuenta@pruebas.invalid", _tax_id: nit() });
      const p = r.data as { application_id: string; activado: boolean; motivo: string };
      expect(p).toMatchObject({ activado: false, motivo: "sin-sesion" });
      expect((await (await crearPersona()).db.rpc("aprobar_postulacion", { _id: p.application_id })).error?.message).toBe("solo-admin");
      const admin = await crearPersona({ admin: true });
      const ok = await admin.db.rpc("aprobar_postulacion", { _id: p.application_id, _notas: "  Bien  " });
      const aprobada = ok.data as { provider_id: string; sin_dueno: boolean };
      empresasCreadas.push(aprobada.provider_id);
      expect(aprobada.sin_dueno).toBe(true);
      expect(await leer("provider_applications", p.application_id, "status, reviewer_notes")).toEqual({ status: "approved", reviewer_notes: "Bien" });
      await servicio().from("provider_applications").delete().eq("id", p.application_id);
    });

    it("cerrar la empresa: sin ventas se borra entera; la dueña pierde el rol", async () => {
      const ana = await crearPersona();
      const empresa = await crearEmpresa({ miembro: ana });
      await crearOferta(empresa);
      expect((await (await crearPersona()).db.rpc("cerrar_mi_empresa", { _provider_id: empresa })).error?.message).toBe("no-es-duena");
      const r = await ana.db.rpc("cerrar_mi_empresa", { _provider_id: empresa });
      expect(r.data).toMatchObject({ resultado: "borrada" });
      expect((await servicio().from("providers").select("id").eq("id", empresa)).data).toHaveLength(0);
      expect((await ana.db.from("user_roles").select("role").eq("role", "provider")).data).toHaveLength(0);
    });

    it("darse de baja: un administrador no; alguien con un pedido en curso tampoco", async () => {
      expect((await (await crearPersona({ admin: true })).db.rpc("preparar_baja_de_cuenta")).error?.message).toBe("es-admin");
      const ana = await crearPersona();
      const oferta = await crearOferta(await crearEmpresa());
      await ana.db.rpc("crear_orden", { _id: crypto.randomUUID(), _lineas: [{ listing_id: oferta.id, qty: 1 }], _nombre: "Ana Pérez", _telefono: "3001234567", _departamento: "Boyacá", _ciudad: "Tunja", _direccion: "Calle 1 # 2-3" });
      expect((await ana.db.rpc("preparar_baja_de_cuenta")).error?.message).toBe("pedidos-en-curso");
      const libre = await crearPersona();
      expect((await libre.db.rpc("preparar_baja_de_cuenta")).data).toEqual({ empresas_borradas: [], empresas_cerradas: 0 });
    });
  });

  describe("prospectos, visitas y panel", () => {
    it("un token que no es un uuid es el error de Postgres; uno bueno da la invitación y la baja", async () => {
      expect((await visitante().rpc("invitacion_de_prospecto", { _token: "no-es-uuid" })).error?.code).toBe("22P02");
      const token = crypto.randomUUID();
      const p = sinError(await servicio().from("prospectos").insert({ nombre: "Prospecto de prueba", correo: `p-${token.slice(0, 6)}@pruebas.invalid`, token }).select("id").single(), "prospecto") as { id: string };
      expect((await visitante().rpc("invitacion_de_prospecto", { _token: token })).data).toEqual([expect.objectContaining({ nombre: "Prospecto de prueba" })]);
      expect((await visitante().rpc("baja_de_prospecto", { _token: token })).data).toBe("Prospecto de prueba");
      expect((await leer("prospectos", p.id, "baja_at")).baja_at).not.toBeNull();
      await servicio().from("prospectos").delete().eq("id", p.id);
    });

    it("una visita se registra (lo que no tiene forma, no) y el panel la cuenta", async () => {
      const visitor = "a".repeat(64);
      const ruta = `/prueba-${crypto.randomUUID().slice(0, 6)}`;
      expect((await visitante().rpc("registrar_visita", { _path: ruta, _referrer_host: "Ejemplo.COM", _visitor: visitor, _device: "movil", _country: "CO" })).error).toBeNull();
      await visitante().rpc("registrar_visita", { _path: "sin-barra", _referrer_host: null, _visitor: visitor, _device: "movil", _country: null });
      const pool = getPoolMysql().promise();
      const [filas] = await pool.query("select referrer_host, country from page_views where path = ?", [ruta]);
      expect(filas).toEqual([{ referrer_host: "ejemplo.com", country: "CO" }]);
      expect((await (await crearPersona()).db.rpc("admin_analiticas", { _dias: 7 })).error?.message).toBe("solo-admin");
      const admin = await crearPersona({ admin: true });
      const a = (await admin.db.rpc("admin_analiticas", { _dias: 7 })).data as {
        dias: number; hasta: string; por_dia: { dia: string; visitas: number }[]; paginas: { clave: string; visitas: number }[];
      };
      expect(a.dias).toBe(7);
      expect(a.por_dia).toHaveLength(7);
      // La de hoy cuenta (hoy en Colombia: el último día de la serie).
      expect(a.por_dia.at(-1)).toMatchObject({ dia: a.hasta });
      expect(a.por_dia.at(-1)!.visitas).toBeGreaterThanOrEqual(1);
      // Las diez más vistas, de más a menos (con 567 visitas copiadas, la de prueba no tiene por qué estar).
      expect(a.paginas.length).toBeLessThanOrEqual(10);
      expect(a.paginas.map((p) => p.visitas)).toEqual([...a.paginas.map((p) => p.visitas)].sort((x, y) => y - x));
      await pool.query("delete from page_views where path = ?", [ruta]);
    });

    it("las del panel solo responden a un administrador", async () => {
      const yo = await crearPersona();
      expect((await yo.db.rpc("admin_listar_usuarios")).data).toEqual([]);
      expect((await yo.db.rpc("admin_resumen_ordenes")).data).toEqual([]);
      expect((await yo.db.rpc("envios_de_hoy")).data).toBe(0);
      expect((await yo.db.rpc("vencer_pedidos_sin_pago", { _horas: 72 })).error?.message).toBe("solo-admin");
      const admin = await crearPersona({ admin: true });
      const usuarios = (await admin.db.rpc("admin_listar_usuarios")).data as { id: string; roles: string[] }[];
      expect(usuarios.find((u) => u.id === admin.id)?.roles).toEqual(["buyer", "admin"]);
      expect(typeof (await admin.db.rpc("vencer_pedidos_sin_pago", { _horas: 72 })).data).toBe("number");
    });

    it("una función que no existe es PGRST202", async () => {
      expect((await visitante().rpc("no_existe")).error?.code).toBe("PGRST202");
    });
  });

  describe("comunidad", () => {
    it("publicar, con el nombre de la persona; reaccionar suma; y el ritmo frena la segunda seguida", async () => {
      const ana = await crearPersona({ nombre: "Ana Comunidad" });
      const r = await ana.db
        .from("community_posts")
        .insert({ author_id: ana.id, title: "Una buena práctica", body: "x".repeat(90), topic: "practica", status: "approved", reaction_count: 99 })
        .select("id, author_name, reaction_count")
        .single();
      expect(r.error).toBeNull();
      const post = r.data as { id: string; author_name: string; reaction_count: number };
      // El contador no lo trae quien publica (desde el 2026-10-22; antes nacía con 99).
      expect(post).toMatchObject({ author_name: "Ana Comunidad", reaction_count: 0 });
      const otra = await ana.db.from("community_posts").insert({ author_id: ana.id, title: "Otra práctica", body: "y".repeat(90), topic: "practica" });
      expect(otra.error?.message).toBe("limite-ritmo");

      const beto = await crearPersona();
      expect((await beto.db.from("community_reactions").insert({ post_id: post.id, user_id: beto.id, kind: "megusta" })).error).toBeNull();
      expect((await beto.db.from("community_reactions").insert({ post_id: post.id, user_id: ana.id, kind: "idea" })).error?.code).toBe("42501");
      expect(await leer("community_posts", post.id, "reaction_count, reaction_counts")).toEqual({ reaction_count: 1, reaction_counts: { megusta: 1 } });
      // Nadie se edita el contador.
      await ana.db.from("community_posts").update({ reaction_count: 500, title: "Una buena práctica, editada" }).eq("id", post.id);
      const editada = await leer("community_posts", post.id, "reaction_count, title, edited_at");
      expect(editada).toMatchObject({ reaction_count: 1, title: "Una buena práctica, editada" });
      expect(editada.edited_at).not.toBeNull();
      await servicio().from("community_posts").delete().eq("id", post.id);
    });

    it("una publicación de empresa da puntos y borrarla los quita", async () => {
      const ana = await crearPersona();
      const empresa = await crearEmpresa({ miembro: ana, documentoVerificado: true });
      const base = Number((await leer("providers", empresa, "experience_points")).experience_points);
      const r = await ana.db.from("community_posts").insert({ author_id: ana.id, provider_id: empresa, title: "Lo que hacemos", body: "z".repeat(90) }).select("id").single();
      expect(Number((await leer("providers", empresa, "experience_points")).experience_points)).toBe(base + 10);
      await ana.db.from("community_posts").delete().eq("id", (r.data as { id: string }).id);
      expect(Number((await leer("providers", empresa, "experience_points")).experience_points)).toBe(base);
    });

    it("firmar como empresa exige su documento verificado (2026-10-22)", async () => {
      const ana = await crearPersona();
      const empresa = await crearEmpresa({ miembro: ana });
      const r = await ana.db.from("community_posts").insert({ author_id: ana.id, provider_id: empresa, title: "Hablo por ellos", body: "z".repeat(90) });
      expect(r.error?.message).toBe("empresa-sin-verificar");
    });
  });

  describe("verificación del documento de una empresa (2026-10-22)", () => {
    it("solo la pone el equipo, se pierde al cambiar el documento y nadie la trae al crear", async () => {
      const ana = await crearPersona();
      const empresa = await crearEmpresa({ miembro: ana });
      await ana.db.from("providers").update({ documento_verificado_at: new Date().toISOString() }).eq("id", empresa);
      expect((await leer("providers", empresa, "documento_verificado_at")).documento_verificado_at).toBeNull();

      const admin = await crearPersona({ admin: true });
      expect((await admin.db.from("providers").update({ documento_verificado_at: new Date().toISOString(), tax_id: "900123456" }).eq("id", empresa)).error).toBeNull();
      expect((await leer("providers", empresa, "documento_verificado_at")).documento_verificado_at).not.toBeNull();
      await ana.db.from("providers").update({ tax_id: "900999999" }).eq("id", empresa);
      expect((await leer("providers", empresa, "documento_verificado_at")).documento_verificado_at).toBeNull();
    });
  });
});
