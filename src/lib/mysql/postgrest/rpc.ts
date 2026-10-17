import { createHash } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import { escribir, filas } from "./contexto";
import { ErrorPg, type Actor } from "./tipos";
import { instanteDeSalida } from "./valores";

/**
 * Las funciones de Postgres que la app llama con `supabase.rpc()`, traducidas
 * de plpgsql a TypeScript. Allá son `security definer`: aquí corren con el modo
 * definidor de `contexto.ts`, así que los triggers de `mysql/logica.sql` las
 * tratan como allá (no como a un cliente) y `auth_uid()` sigue siendo quien
 * llamó.
 *
 * **Cada una sigue a su original paso a paso**, con los mismos textos de error
 * (`sin-stock`, `compra-propia`…): la app elige el mensaje por ese texto. Donde
 * el orden de los pasos importa (el candado antes de mirar, el stock antes del
 * cupo) se respetó. La referencia es la definición viva de producción, no las
 * migraciones; cuando una de allá cambie, esta cambia en el mismo commit.
 *
 * Lo que la base sigue haciendo sola: descontar y devolver stock al cancelar,
 * validar las transiciones de un pedido, dar y quitar puntos. Eso está en los
 * triggers y aquí no se repite.
 */

interface Ctx {
  con: PoolConnection;
  actor: Actor;
}

type Args = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuid(valor: unknown): string {
  if (typeof valor !== "string" || !UUID.test(valor)) {
    throw new ErrorPg(`invalid input syntax for type uuid: "${String(valor)}"`, { code: "22P02" });
  }
  return valor.toLowerCase();
}

const q = <T = Record<string, unknown>>(c: Ctx, sql: string, p: unknown[] = []) => filas<T>(c.con, sql, p);
const w = (c: Ctx, sql: string, p: unknown[] = []) => escribir(c.con, sql, p);
const uno = async <T = Record<string, unknown>>(c: Ctx, sql: string, p: unknown[] = []) => (await q<T>(c, sql, p))[0];

async function esAdmin(c: Ctx): Promise<boolean> {
  return Boolean((await uno<{ a: boolean }>(c, "select is_admin() as a"))?.a);
}
async function gestiona(c: Ctx, proveedor: string | null): Promise<boolean> {
  if (!proveedor) return false;
  return Boolean((await uno<{ a: boolean }>(c, "select manages_provider(?) as a", [proveedor]))?.a);
}
async function esDuenoDeOrden(c: Ctx, orden: string): Promise<boolean> {
  return Boolean((await uno<{ a: boolean }>(c, "select owns_order(?) as a", [orden]))?.a);
}
async function candado(c: Ctx, nombre: string): Promise<void> {
  await w(c, "call candado(?)", [nombre.slice(0, 200)]);
}

/** `trim(coalesce(x, ''))`, y `nullif(…, '')`. */
const limpio = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const oNulo = (v: unknown, largo?: number) => {
  const s = limpio(v);
  return s === "" ? null : largo ? s.slice(0, largo) : s;
};

/** `lower(unaccent(x))`, gemela de `sin_tildes()` y de `normalize()` de `src/lib/repo.ts`. */
function sinTildes(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/** La fecha de hoy en Colombia (UTC-5, sin horario de verano). */
function hoyEnColombia(): string {
  return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

/** `comision_para_nivel()`. Es dinero: misma tabla que la función de Postgres. */
function comisionParaNivel(tier: string): number {
  return tier === "raiz" ? 0.1 : tier === "bosque" ? 0.08 : 0.12;
}

/** `envio_de_linea()` (0017): según el destino y las unidades. */
function envioDeLinea(nacional: number | null, local: number | null, adicional: number | null, origen: unknown, destino: unknown, qty: number): number {
  const mismoLugar = local !== null && limpio(origen) !== "" && sinTildes(limpio(origen)) === sinTildes(limpio(destino));
  const base = mismoLugar ? local : nacional;
  if (base === null) return 0;
  return base + (adicional ?? 0) * Math.max((qty ?? 1) - 1, 0);
}

/** `puede_resenar()`. */
function puedeResenar(estado: string, envio: string | null, fecha: string | null): boolean {
  if (!["paid", "in_progress", "fulfilled"].includes(estado)) return false;
  if (envio === "entregado") return true;
  return envio === null && (estado === "fulfilled" || (fecha !== null && fecha <= hoyEnColombia()));
}

/** `nombre_publico()`: «Ana María Pérez» → «Ana P.». */
function nombrePublico(completo: unknown): string {
  const partes = limpio(completo).split(/\s+/);
  if (!partes.length || partes[0] === "") return "Comprador verificado";
  const initcap = (s: string) => s.toLowerCase().replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
  const primero = initcap(partes[0]).slice(0, 40);
  if (partes.length === 1) return primero;
  return `${primero} ${partes[partes.length - 1].slice(0, 1).toUpperCase()}.`;
}

async function slugUnicoProveedor(c: Ctx, texto: unknown): Promise<string> {
  let base = sinTildes(typeof texto === "string" ? texto : "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  if (!base) base = "proveedor";
  let intento = base;
  for (let n = 2; await uno(c, "select 1 as x from providers where slug = ?", [intento]); n++) intento = `${base}-${n}`;
  return intento;
}

async function claveTributaria(c: Ctx, pais: unknown, documento: unknown): Promise<string | null> {
  return (await uno<{ k: string | null }>(c, "select clave_tributaria(?, ?) as k", [pais ?? null, documento ?? null]))?.k ?? null;
}

async function reactivarEmpresa(c: Ctx, proveedor: string, duena: string): Promise<string> {
  await w(c, "update providers set status = 'approved', cerrada_at = null, cerrada_por = null where id = ?", [proveedor]);
  const fila = await uno<{ slug: string }>(c, "select slug from providers where id = ?", [proveedor]);
  await w(c, "insert into provider_members (provider_id, user_id, is_owner) values (?, ?, true) on duplicate key update provider_id = provider_id", [proveedor, duena]);
  await w(c, "insert into user_roles (user_id, role) values (?, 'provider') on duplicate key update role = role", [duena]);
  return fila?.slug;
}

function primeraFrase(descripcion: unknown): string {
  return (typeof descripcion === "string" ? descripcion : "").split(". ")[0].slice(0, 140);
}

// ---------------------------------------------------------------------------

async function cerrarMiEmpresa(c: Ctx, proveedor: string): Promise<{ resultado: string; slug: string }> {
  const uid = c.actor.id;
  if (!uid) throw new ErrorPg("sin-sesion");
  if (!(await uno(c, "select 1 as x from provider_members where provider_id = ? and user_id = ? and is_owner", [proveedor, uid]))) {
    throw new ErrorPg("no-es-duena");
  }
  const { slug } = (await uno<{ slug: string }>(c, "select slug from providers where id = ? for update", [proveedor])) ?? { slug: null as unknown as string };
  if (await uno(c, `select 1 as x from order_items oi join orders o on o.id = oi.order_id
                     where oi.provider_id = ? and o.status in ('pending_payment', 'paid', 'in_progress') limit 1`, [proveedor])) {
    throw new ErrorPg("ventas-en-curso");
  }
  if (await uno(c, `select 1 as x from quotation_items qi join quotations q on q.id = qi.quotation_id
                     where qi.provider_id = ? and q.status not in ('accepted', 'declined', 'cancelled', 'expired') limit 1`, [proveedor])) {
    throw new ErrorPg("solicitudes-abiertas");
  }
  const conHistoria =
    Boolean(await uno(c, "select 1 as x from order_items where provider_id = ? limit 1", [proveedor])) ||
    Boolean(await uno(c, "select 1 as x from quotation_items where provider_id = ? limit 1", [proveedor]));
  if (!conHistoria) {
    await w(c, "delete from providers where id = ?", [proveedor]);
  } else {
    await w(c, "update listings set status = 'draft', featured = false where provider_id = ? and (status <> 'draft' or featured)", [proveedor]);
    await w(c, "update providers set status = 'suspended', cerrada_at = now(6), cerrada_por = ? where id = ?", [uid, proveedor]);
    await w(c, "delete from provider_members where provider_id = ?", [proveedor]);
  }
  if (!(await uno(c, "select 1 as x from provider_members where user_id = ? limit 1", [uid]))) {
    await w(c, "delete from user_roles where user_id = ? and role = 'provider'", [uid]);
  }
  return { resultado: conHistoria ? "cerrada" : "borrada", slug };
}

export const RPCS: Record<string, (c: Ctx, a: Args) => Promise<unknown>> = {
  async admin_analiticas(c, a) {
    if (!(await esAdmin(c))) throw new ErrorPg("solo-admin");
    const dias = Math.max(1, Math.min(Number(a._dias ?? 30) || 30, 365));
    const hoy = hoyEnColombia();
    const restar = (fecha: string, n: number) => new Date(Date.parse(`${fecha}T00:00:00Z`) - n * 86400000).toISOString().slice(0, 10);
    const desde = restar(hoy, dias - 1);
    const antes = restar(desde, dias);
    // Medianoche de Bogotá en UTC: las 05:00.
    const inicio = (fecha: string) => `${fecha} 05:00:00.000000`;
    const resumen = async (sqlDonde: string, p: unknown[]) =>
      uno<{ visitas: number; visitantes: number }>(c, `select count(*) as visitas, count(distinct visitor) as visitantes from page_views where ${sqlDonde}`, p);
    const ahora = await resumen("created_at >= ?", [inicio(desde)]);
    const previo = await resumen("created_at >= ? and created_at < ?", [inicio(antes), inicio(desde)]);
    const porDia = await q<{ dia: string; visitas: number; visitantes: number }>(
      c,
      `select date(created_at - interval 5 hour) as dia, count(*) as visitas, count(distinct visitor) as visitantes
         from page_views where created_at >= ? group by dia`,
      [inicio(desde)],
    );
    const mapa = new Map(porDia.map((d) => [String(d.dia).slice(0, 10), d]));
    const serie = [];
    for (let i = 0; i < dias; i++) {
      const dia = restar(hoy, dias - 1 - i);
      const d = mapa.get(dia);
      serie.push({ dia, visitas: Number(d?.visitas ?? 0), visitantes: Number(d?.visitantes ?? 0) });
    }
    const top = async (expr: string, limite: number | null) =>
      (
        await q<{ clave: string; visitas: number; visitantes: number }>(
          c,
          `select ${expr} as clave, count(*) as visitas, count(distinct visitor) as visitantes
             from page_views where created_at >= ? group by clave order by count(*) desc, clave${limite ? ` limit ${limite}` : ""}`,
          [inicio(desde)],
        )
      ).map((x) => ({ clave: x.clave, visitas: Number(x.visitas), visitantes: Number(x.visitantes) }));
    const contar = async (sql: string) => Number((await uno<{ n: number }>(c, sql, [inicio(desde)]))?.n ?? 0);
    return {
      dias,
      desde,
      hasta: hoy,
      visitas: Number(ahora.visitas),
      visitantes: Number(ahora.visitantes),
      visitas_antes: Number(previo.visitas),
      visitantes_antes: Number(previo.visitantes),
      por_dia: serie,
      paginas: await top("path", 10),
      origenes: await top("coalesce(referrer_host, '')", 8),
      dispositivos: (await top("device", null)).sort((x, y) => y.visitas - x.visitas),
      paises: await top("coalesce(country, '')", 8),
      negocio: {
        cuentas: await contar("select count(*) as n from usuarios where creado_at >= ?"),
        postulaciones: await contar("select count(*) as n from provider_applications where created_at >= ?"),
        ordenes: await contar("select count(*) as n from orders where created_at >= ?"),
        ordenes_cop: await contar("select coalesce(sum(total_cop), 0) as n from orders where created_at >= ? and status not in ('cancelled', 'refunded')"),
        publicaciones: await contar("select count(*) as n from community_posts where created_at >= ?"),
      },
    };
  },

  async admin_listar_usuarios(c) {
    if (!(await esAdmin(c))) return [];
    const usuarios = await q<{
      id: string; email: string; full_name: string; phone: string | null; roles: string[] | string | null;
      last_sign_in_at: string | null; email_confirmed_at: string | null; created_at: string;
    }>(
      c,
      `select u.id, u.email, coalesce(p.full_name, '') as full_name, p.phone,
              (select json_arrayagg(r.role order by r.role) from user_roles r where r.user_id = u.id) as roles,
              u.ultimo_acceso_at as last_sign_in_at, u.correo_confirmado_at as email_confirmed_at, u.creado_at as created_at
         from usuarios u left join profiles p on p.id = u.id
        order by u.creado_at desc`,
    );
    return usuarios.map((u) => ({
      ...u,
      roles: typeof u.roles === "string" ? JSON.parse(u.roles) : (u.roles ?? []),
      last_sign_in_at: u.last_sign_in_at && instanteDeSalida(u.last_sign_in_at),
      email_confirmed_at: u.email_confirmed_at && instanteDeSalida(u.email_confirmed_at),
      created_at: instanteDeSalida(u.created_at),
    }));
  },

  async admin_resumen_ordenes(c) {
    if (!(await esAdmin(c))) return [];
    const r = await q<{ status: string; cantidad: number; total_cop: number }>(
      c,
      "select status, count(*) as cantidad, coalesce(sum(total_cop), 0) as total_cop from orders group by status",
    );
    return r.map((x) => ({ status: x.status, cantidad: Number(x.cantidad), total_cop: Number(x.total_cop) }));
  },

  async aprobar_postulacion(c, a) {
    if (!(await esAdmin(c))) throw new ErrorPg("solo-admin");
    const id = uuid(a._id);
    const notas = oNulo(a._notas);
    const p = await uno<Record<string, string | null>>(c, "select * from provider_applications where id = ? for update", [id]);
    if (!p) throw new ErrorPg("no-existe");
    if (p.provider_id) {
      const prov = await uno<{ slug: string }>(c, "select slug from providers where id = ?", [p.provider_id]);
      return { repetida: true, provider_id: p.provider_id, slug: prov?.slug ?? null, sin_dueno: p.user_id === null };
    }
    const pais = p.country ?? "Colombia";
    const clave = await claveTributaria(c, pais, p.tax_id);
    if (clave) {
      await candado(c, `nit:${clave}`);
      const existente = await uno<{ id: string; slug: string; name: string; cerrada_at: string | null }>(
        c,
        "select id, slug, name, cerrada_at from providers where clave_tributaria = ? order by (cerrada_at is null) desc, created_at limit 1",
        [clave],
      );
      if (existente) {
        if (existente.cerrada_at === null) {
          throw new ErrorPg("documento-existente", { hint: `${existente.name} (/proveedor/${existente.slug})` });
        }
        if (p.user_id === null) {
          throw new ErrorPg("reabrir-sin-cuenta", { hint: `${existente.name} (/proveedor/${existente.slug})` });
        }
        const slug = await reactivarEmpresa(c, existente.id, p.user_id);
        await w(
          c,
          "update provider_applications set status = 'approved', provider_id = ?, reviewer_notes = ?, reviewed_by = ?, reviewed_at = now(6) where id = ?",
          [existente.id, notas, c.actor.id, id],
        );
        return { repetida: false, provider_id: existente.id, slug, sin_dueno: false, reactivada: true };
      }
    }
    const slug = await slugUnicoProveedor(c, p.name);
    const proveedor = crypto.randomUUID();
    await w(
      c,
      `insert into providers (id, slug, name, tagline, description, country, department, city, email, phone, website, tax_id, status)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')`,
      [proveedor, slug, p.name, primeraFrase(p.description), p.description, pais, p.department, p.city, p.email, p.phone, oNulo(p.website) ?? null, p.tax_id],
    );
    if (p.user_id) {
      await w(c, "insert into provider_members (provider_id, user_id, is_owner) values (?, ?, true) on duplicate key update provider_id = provider_id", [proveedor, p.user_id]);
      await w(c, "insert into user_roles (user_id, role) values (?, 'provider') on duplicate key update role = role", [p.user_id]);
    }
    await w(
      c,
      "update provider_applications set status = 'approved', provider_id = ?, reviewer_notes = ?, reviewed_by = ?, reviewed_at = now(6) where id = ?",
      [proveedor, notas, c.actor.id, id],
    );
    return { repetida: false, provider_id: proveedor, slug, sin_dueno: p.user_id === null };
  },

  async avatares_publicos(c, a) {
    const ids = (Array.isArray(a._ids) ? a._ids : []).filter((x): x is string => typeof x === "string" && UUID.test(x));
    if (!ids.length) return [];
    return q(c, `select id, avatar_url from profiles where id in (${ids.map(() => "?").join(", ")}) and avatar_url is not null`, ids);
  },

  async baja_de_prospecto(c, a) {
    const token = uuid(a._token);
    await w(c, "update prospectos set baja_at = coalesce(baja_at, now(6)) where token = ?", [token]);
    return (await uno<{ nombre: string }>(c, "select nombre from prospectos where token = ?", [token]))?.nombre ?? null;
  },

  async calificar(c, a) {
    const uid = c.actor.id;
    if (!uid) throw new ErrorPg("sin-sesion");
    const rating = a._rating === null || a._rating === undefined ? null : Number(a._rating);
    if (rating === null || !Number.isInteger(rating) || rating < 1 || rating > 5) throw new ErrorPg("calificacion-invalida");
    const itemId = uuid(a._order_item_id);
    const i = await uno<{ listing_id: string | null; provider_id: string | null; date: string | null; envio_estado: string | null; orden_estado: string; buyer_id: string | null }>(
      c,
      `select oi.listing_id, oi.provider_id, oi.date, oi.envio_estado, o.status as orden_estado, o.buyer_id
         from order_items oi join orders o on o.id = oi.order_id where oi.id = ?`,
      [itemId],
    );
    if (!i || i.buyer_id !== uid) throw new ErrorPg("item-ajeno");
    if (await gestiona(c, i.provider_id)) throw new ErrorPg("item-propio");
    if (!i.listing_id) throw new ErrorPg("oferta-retirada");
    if (!puedeResenar(i.orden_estado, i.envio_estado, i.date)) throw new ErrorPg("todavia-no");
    const perfil = await uno<{ full_name: string | null }>(c, "select full_name from profiles where id = ?", [uid]);
    const nombre = perfil ? nombrePublico(perfil.full_name) : "Comprador verificado";
    const cuerpo = limpio(a._comentario ?? "").slice(0, 2000);
    const previa = await uno<{ id: string; author_id: string }>(c, "select id, author_id from reviews where order_item_id = ? for update", [itemId]);
    if (previa) {
      if (previa.author_id !== uid) throw new ErrorPg("item-ajeno");
      await w(c, "update reviews set rating = ?, body = ?, autor_nombre = ?, updated_at = now(6) where id = ?", [rating, cuerpo, nombre, previa.id]);
      return { id: previa.id, nueva: false };
    }
    const id = crypto.randomUUID();
    await w(c, "insert into reviews (id, listing_id, author_id, order_item_id, rating, body, autor_nombre) values (?, ?, ?, ?, ?, ?, ?)", [
      id, i.listing_id, uid, itemId, rating, cuerpo, nombre,
    ]);
    return { id, nueva: true };
  },

  async cerrar_mi_empresa(c, a) {
    return cerrarMiEmpresa(c, uuid(a._provider_id));
  },

  async confirmar_entrega(c, a) {
    if (!c.actor.id) throw new ErrorPg("sin-sesion");
    const itemId = uuid(a._item_id);
    const item = await uno<{ order_id: string; provider_id: string | null }>(c, "select order_id, provider_id from order_items where id = ?", [itemId]);
    if (!item || !((await esDuenoDeOrden(c, item.order_id)) || (await gestiona(c, item.provider_id)) || (await esAdmin(c)))) {
      throw new ErrorPg("item-ajeno");
    }
    const orden = item.order_id;
    const { status: estado } = await uno<{ status: string }>(c, "select status from orders where id = ? for update", [orden]);
    const i = await uno<{ envio_estado: string | null; despacho: string | null }>(c, "select envio_estado, despacho from order_items where id = ? for update", [itemId]);
    if (i.envio_estado === null) throw new ErrorPg("sin-envio");
    if (i.envio_estado === "entregado") return { cambiado: false, orden_completada: false, orden_id: orden };
    if (!["paid", "in_progress"].includes(estado)) throw new ErrorPg("orden-no-despachable");
    if (i.despacho !== "vendedor" && !(await esDuenoDeOrden(c, orden)) && !(await esAdmin(c))) {
      throw new ErrorPg("entrega-del-comprador");
    }
    await w(c, "update order_items set envio_estado = 'entregado', entregado_at = now(6), despachado_at = coalesce(despachado_at, now(6)) where id = ?", [itemId]);
    let completa = false;
    if (!(await uno(c, "select 1 as x from order_items where order_id = ? and (envio_estado is null or envio_estado <> 'entregado') limit 1", [orden]))) {
      const r = await w(c, "update orders set status = 'fulfilled' where id = ? and status in ('paid', 'in_progress')", [orden]);
      completa = r.filas > 0;
    }
    return { cambiado: true, orden_completada: completa, orden_id: orden };
  },

  async crear_orden(c, a) {
    const uid = c.actor.id;
    if (!uid) throw new ErrorPg("sin-sesion");
    if (a._id === null || a._id === undefined) throw new ErrorPg("sin-clave");
    const id = uuid(a._id);
    await candado(c, `crear_orden:${uid}`);

    const previa = await uno<{ reference: string; buyer_id: string | null }>(c, "select reference, buyer_id from orders where id = ?", [id]);
    if (previa) {
      if (previa.buyer_id !== uid) throw new ErrorPg("clave-ajena");
      return { reference: previa.reference, repetida: true };
    }
    if (limpio(a._nombre).length < 3 || limpio(a._telefono).length < 7) throw new ErrorPg("contacto-incompleto");
    if (Number((await uno<{ n: number }>(c, "select count(*) as n from orders where buyer_id = ? and created_at > now(6) - interval 10 minute", [uid])).n) >= 5) {
      throw new ErrorPg("demasiados-pedidos");
    }
    if (Number((await uno<{ n: number }>(c, "select count(*) as n from orders where buyer_id = ? and status = 'pending_payment'", [uid])).n) >= 10) {
      throw new ErrorPg("demasiados-pendientes");
    }
    const lineas = a._lineas;
    if (!Array.isArray(lineas) || lineas.length === 0 || lineas.length > 50) throw new ErrorPg("cesta-invalida");

    const correo = (await uno<{ email: string }>(c, "select email from usuarios where id = ?", [uid]))?.email ?? "";
    let empresa: string | null;
    const proveedorComprador = a._provider_id ? uuid(a._provider_id) : null;
    if (proveedorComprador) {
      if (!(await uno(c, "select 1 as x from provider_members where provider_id = ? and user_id = ?", [proveedorComprador, uid]))) {
        throw new ErrorPg("empresa-ajena");
      }
      empresa = (await uno<{ name: string }>(c, "select name from providers where id = ?", [proveedorComprador]))?.name ?? null;
    } else {
      empresa = oNulo(a._empresa);
    }

    let referencia = "";
    const fecha = hoyEnColombia().replace(/-/g, "").slice(2);
    for (let intento = 0; ; intento++) {
      if (intento > 20) throw new ErrorPg("sin-referencia");
      referencia = `SR-${fecha}-${createHash("md5").update(crypto.randomUUID()).digest("hex").slice(0, 4).toUpperCase()}`;
      if (!(await uno(c, "select 1 as x from orders where reference = ?", [referencia]))) break;
    }

    const departamento = oNulo(a._departamento, 60);
    await w(
      c,
      `insert into orders (id, reference, buyer_id, buyer_email, buyer_name, buyer_company, buyer_phone, buyer_provider_id,
                           buyer_tax_id, status, notes, envio_departamento, envio_ciudad, envio_direccion, envio_indicaciones)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', ?, ?, ?, ?, ?)`,
      [
        id, referencia, uid, correo, limpio(a._nombre).slice(0, 160), empresa ? empresa.slice(0, 160) : null,
        limpio(a._telefono).slice(0, 40), proveedorComprador, oNulo(a._documento, 40), oNulo(a._notas, 1000),
        departamento, oNulo(a._ciudad, 80), oNulo(a._direccion, 200), oNulo(a._indicaciones, 300),
      ],
    );

    // 0016: por uuid, como `orders_liberar_reservas`. El texto del uuid en
    // minúsculas ordena igual que el uuid de Postgres.
    const ordenadas = [...lineas].sort((x, y) => {
      const lx = String((x as Args).listing_id ?? "").toLowerCase();
      const ly = String((y as Args).listing_id ?? "").toLowerCase();
      if (lx !== ly) return lx < ly ? -1 : 1;
      const dx = String((x as Args).date ?? "");
      const dy = String((y as Args).date ?? "");
      return dx < dy ? -1 : dx > dy ? 1 : 0;
    });

    let subtotal = 0;
    let comision = 0;
    let envioTotal = 0;
    let fisicos = 0;
    let items = 0;
    // Centésimas enteras: la suma de `round(x * qty, 2)` sin errores de coma flotante.
    let co2 = 0;
    let agua = 0;
    let residuos = 0;
    const centesimas = (v: unknown) => (v === null || v === undefined ? 0 : Math.round(Number(v) * 100));

    for (const linea of ordenadas as Args[]) {
      const qtyTexto = linea.qty === null || linea.qty === undefined || linea.qty === "" ? null : Number(linea.qty);
      if (qtyTexto === null || !Number.isInteger(qtyTexto) || qtyTexto < 1 || qtyTexto > 10000) throw new ErrorPg("cantidad-invalida");
      const qty = qtyTexto;
      const fechaLinea = linea.date ? String(linea.date).slice(0, 10) : null;
      if (typeof linea.listing_id !== "string" || !UUID.test(linea.listing_id)) {
        throw new ErrorPg(`invalid input syntax for type uuid: "${String(linea.listing_id)}"`, { code: "22P02" });
      }
      const l = await uno<Record<string, string | number | boolean | null>>(
        c,
        `select l.*, p.tier as proveedor_tier from listings l join providers p on p.id = l.provider_id
          where l.id = ? and l.status = 'approved' and p.status = 'approved'`,
        [linea.listing_id.toLowerCase()],
      );
      if (!l || l.quote_only) continue;
      if (await gestiona(c, l.provider_id as string)) throw new ErrorPg("compra-propia", { hint: l.title as string });

      let conStock = false;
      if (l.stock !== null) {
        const r = await w(c, "update listings set stock = stock - ? where id = ? and stock >= ?", [qty, l.id, qty]);
        if (r.filas === 0) throw new ErrorPg("sin-stock", { hint: l.title as string });
        conStock = true;
      }
      let conCupo = false;
      if (l.kind === "experience" && (await uno(c, "select 1 as x from listing_availability where listing_id = ? limit 1", [l.id]))) {
        if (!fechaLinea) throw new ErrorPg("falta-fecha", { hint: l.title as string });
        const r = await w(
          c,
          "update listing_availability set slots_taken = slots_taken + ? where listing_id = ? and `date` = ? and slots_taken + ? <= slots_total",
          [qty, l.id, fechaLinea, qty],
        );
        if (r.filas === 0) throw new ErrorPg("sin-cupo", { hint: l.title as string });
        conCupo = true;
      }

      const precio =
        l.wholesale_price_cop !== null && l.wholesale_min_qty !== null && qty >= Number(l.wholesale_min_qty)
          ? Number(l.wholesale_price_cop)
          : Number(l.price_cop);
      const sub = precio * qty;
      const tasa = comisionParaNivel(String(l.proveedor_tier));
      const com = Math.round(sub * tasa);
      const esProducto = l.kind === "product";
      const envio = esProducto
        ? envioDeLinea(
            l.envio_cop === null ? null : Number(l.envio_cop),
            l.envio_local_cop === null ? null : Number(l.envio_local_cop),
            l.envio_adicional_cop === null ? null : Number(l.envio_adicional_cop),
            l.department,
            a._departamento,
            qty,
          )
        : 0;
      if (esProducto) fisicos++;

      await w(
        c,
        `insert into order_items (id, order_id, listing_id, provider_id, title_snapshot, unit_price_cop, qty, date, commission_cop,
                                  commission_rate, envio_cop, despacho, transportadora, entrega_dias_min, entrega_dias_max,
                                  envio_estado, stock_descontado, cupo_descontado)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(), id, l.id, l.provider_id, l.title, precio, qty, fechaLinea, com, tasa, envio,
          esProducto ? l.despacho : null, esProducto ? l.transportadora : null,
          esProducto ? l.entrega_dias_min : null, esProducto ? l.entrega_dias_max : null,
          esProducto ? "pendiente" : null, conStock, conCupo,
        ],
      );
      subtotal += sub;
      comision += com;
      envioTotal += envio;
      co2 += centesimas(l.co2_kg_saved) * qty;
      agua += centesimas(l.water_liters_saved) * qty;
      residuos += centesimas(l.waste_kg_reduced) * qty;
      items++;
    }

    if (items === 0) throw new ErrorPg("nada-comprable");
    if (fisicos > 0 && (limpio(a._departamento).length < 3 || limpio(a._ciudad).length < 2 || limpio(a._direccion).length < 5)) {
      throw new ErrorPg("falta-destino");
    }
    const decimal = (cent: number) => (cent === 0 ? null : (cent / 100).toFixed(2));
    await w(
      c,
      `update orders set subtotal_cop = ?, commission_total_cop = ?, envio_total_cop = ?, total_cop = ?,
              co2_kg_saved = ?, water_liters_saved = ?, waste_kg_reduced = ?,
              envio_departamento = if(?, envio_departamento, null), envio_ciudad = if(?, envio_ciudad, null),
              envio_direccion = if(?, envio_direccion, null), envio_indicaciones = if(?, envio_indicaciones, null)
        where id = ?`,
      [subtotal, comision, envioTotal, subtotal + envioTotal, decimal(co2), decimal(agua), decimal(residuos),
        fisicos > 0, fisicos > 0, fisicos > 0, fisicos > 0, id],
    );
    return { reference: referencia, repetida: false, total_cop: subtotal + envioTotal, envio_cop: envioTotal };
  },

  async despachar_item(c, a) {
    if (!c.actor.id) throw new ErrorPg("sin-sesion");
    const itemId = uuid(a._item_id);
    const g = oNulo(typeof a._guia === "string" ? a._guia.trim().slice(0, 80) : a._guia);
    const t = oNulo(typeof a._transportadora === "string" ? a._transportadora.trim().slice(0, 60) : a._transportadora);
    const item = await uno<{ order_id: string; provider_id: string | null }>(c, "select order_id, provider_id from order_items where id = ?", [itemId]);
    if (!item || !((await gestiona(c, item.provider_id)) || (await esAdmin(c)))) throw new ErrorPg("item-ajeno");
    const orden = item.order_id;
    const { status: estado } = await uno<{ status: string }>(c, "select status from orders where id = ? for update", [orden]);
    const i = await uno<{ envio_estado: string | null; despacho: string | null; guia: string | null; transportadora: string | null }>(
      c, "select envio_estado, despacho, guia, transportadora from order_items where id = ? for update", [itemId],
    );
    if (i.envio_estado === null) throw new ErrorPg("sin-envio");
    if (i.envio_estado === "despachado" || i.envio_estado === "entregado") {
      if (i.envio_estado === "despachado" && ((g !== null && g !== i.guia) || (t !== null && t !== i.transportadora))) {
        await w(c, "update order_items set guia = coalesce(?, guia), transportadora = coalesce(?, transportadora) where id = ?", [g, t, itemId]);
      }
      return { cambiado: false, estado: i.envio_estado, orden_id: orden };
    }
    if (!["paid", "in_progress"].includes(estado)) throw new ErrorPg("orden-no-despachable");
    if (i.despacho === "transportadora" && g === null) throw new ErrorPg("falta-guia");
    await w(c, "update order_items set envio_estado = 'despachado', guia = ?, transportadora = coalesce(?, transportadora), despachado_at = now(6) where id = ?", [g, t, itemId]);
    await w(c, "update orders set status = 'in_progress' where id = ? and status = 'paid'", [orden]);
    return { cambiado: true, estado: "despachado", orden_id: orden };
  },

  async envios_de_hoy(c) {
    if (!(await esAdmin(c))) return 0;
    const hoy = hoyEnColombia();
    const r = await uno<{ n: number }>(c, "select count(*) as n from envios_de_campana where estado = 'enviado' and enviado_at >= ?", [`${hoy} 05:00:00.000000`]);
    return Number(r.n);
  },

  async invitacion_de_prospecto(c, a) {
    const token = uuid(a._token);
    return q(c, "select nombre, nit, correo, telefono, sitio_web, ciudad, departamento from prospectos where token = ? and estado <> 'descartado'", [token]);
  },

  async postular_proveedor(c, a) {
    const uid = c.actor.id;
    const correo = typeof a._email === "string" ? a._email : "";
    await candado(c, `postular:${uid ?? correo.trim().toLowerCase()}`);
    const previa = await uno<{ id: string; provider_id: string | null }>(
      c,
      `select id, provider_id from provider_applications
        where lower(email) = lower(?) and lower(name) = lower(?) and user_id <=> ? and created_at > now(6) - interval 10 minute
        order by created_at desc limit 1`,
      [correo, a._name ?? null, uid],
    );
    if (previa) {
      const slug = previa.provider_id ? (await uno<{ slug: string }>(c, "select slug from providers where id = ?", [previa.provider_id]))?.slug ?? null : null;
      return { application_id: previa.id, activado: previa.provider_id !== null, provider_id: previa.provider_id, provider_slug: slug, repetida: true };
    }
    if (!uid && Number((await uno<{ n: number }>(c, "select count(*) as n from provider_applications where lower(email) = lower(?) and user_id is null and created_at > now(6) - interval 1 day", [correo])).n) >= 3) {
      throw new ErrorPg("limite-postulaciones");
    }
    const aplicacion = crypto.randomUUID();
    const categorias = Array.isArray(a._categories) ? a._categories : [];
    await w(
      c,
      `insert into provider_applications (id, user_id, name, contact_name, email, phone, country, department, city, website, description,
                                          org_type, tax_id_kind, tax_id, categories, consent_at, status)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now(6), ?)`,
      [
        aplicacion, uid, a._name ?? null, a._contact_name ?? null, correo, a._phone ?? null, a._country ?? null, a._department ?? null,
        a._city ?? null, a._website === "" ? null : (a._website ?? null), a._description ?? null, a._org_type ?? null,
        a._tax_id_kind ?? null, a._tax_id ?? null, JSON.stringify(categorias), uid ? "approved" : "pending_review",
      ],
    );
    if (!uid) return { application_id: aplicacion, activado: false, motivo: "sin-sesion", repetida: false };

    let proveedor = (await uno<{ provider_id: string }>(c, "select provider_id from provider_members where user_id = ? and is_owner limit 1", [uid]))?.provider_id ?? null;
    let slug: string | null = null;
    let reactivada = false;
    if (!proveedor) {
      const clave = await claveTributaria(c, a._country, a._tax_id);
      if (clave) {
        await candado(c, `nit:${clave}`);
        const existente = await uno<{ id: string; slug: string; cerrada_at: string | null; cerrada_por: string | null }>(
          c,
          "select id, slug, cerrada_at, cerrada_por from providers where clave_tributaria = ? order by (cerrada_at is null) desc, created_at limit 1",
          [clave],
        );
        if (existente) {
          if (existente.cerrada_at !== null && existente.cerrada_por === uid) {
            slug = await reactivarEmpresa(c, existente.id, uid);
            proveedor = existente.id;
            reactivada = true;
          } else {
            const nombre = (await uno<{ name: string }>(c, "select name from providers where id = ?", [existente.id]))?.name;
            await w(c, "update provider_applications set status = 'pending_review', reviewer_notes = ? where id = ?", [
              `Mismo documento que la empresa «${nombre}» (/proveedor/${existente.slug}).`, aplicacion,
            ]);
            return { application_id: aplicacion, activado: false, motivo: "documento-existente", repetida: false };
          }
        }
      }
    }
    if (!proveedor) {
      slug = await slugUnicoProveedor(c, a._name);
      proveedor = crypto.randomUUID();
      await w(
        c,
        `insert into providers (id, slug, name, tagline, description, country, department, city, email, phone, website, tax_id, status)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')`,
        [proveedor, slug, a._name ?? null, primeraFrase(a._description), a._description ?? null, a._country ?? null, a._department ?? null,
          a._city ?? null, correo, a._phone ?? null, a._website === "" ? null : (a._website ?? null), a._tax_id ?? null],
      );
      await w(c, "insert into provider_members (provider_id, user_id, is_owner) values (?, ?, true) on duplicate key update provider_id = provider_id", [proveedor, uid]);
      await w(c, "insert into user_roles (user_id, role) values (?, 'provider') on duplicate key update role = role", [uid]);
    } else if (!reactivada) {
      slug = (await uno<{ slug: string }>(c, "select slug from providers where id = ?", [proveedor]))?.slug ?? null;
    }
    await w(c, "update provider_applications set provider_id = ? where id = ?", [proveedor, aplicacion]);
    return { application_id: aplicacion, activado: true, provider_id: proveedor, provider_slug: slug, reactivada, repetida: false };
  },

  async preparar_baja_de_cuenta(c) {
    const uid = c.actor.id;
    if (!uid) throw new ErrorPg("sin-sesion");
    if (await esAdmin(c)) throw new ErrorPg("es-admin");
    if (await uno(c, "select 1 as x from orders where buyer_id = ? and status in ('pending_payment', 'paid', 'in_progress') limit 1", [uid])) {
      throw new ErrorPg("pedidos-en-curso");
    }
    if (await uno(c, "select 1 as x from quotations where buyer_id = ? and status not in ('accepted', 'declined', 'cancelled', 'expired') limit 1", [uid])) {
      throw new ErrorPg("solicitudes-abiertas");
    }
    const solas = await q<{ provider_id: string }>(
      c,
      `select pm.provider_id from provider_members pm
        where pm.user_id = ? and pm.is_owner
          and not exists (select 1 from provider_members o where o.provider_id = pm.provider_id and o.user_id <> ?)
        order by pm.provider_id`,
      [uid, uid],
    );
    const borradas: string[] = [];
    let cerradas = 0;
    for (const { provider_id } of solas) {
      const r = await cerrarMiEmpresa(c, provider_id);
      if (r.resultado === "borrada") borradas.push(provider_id);
      else cerradas++;
    }
    await w(c, "update reviews set oculta = true where author_id = ? and not oculta", [uid]);
    return { empresas_borradas: borradas, empresas_cerradas: cerradas };
  },

  async registrar_visita(c, a) {
    const ruta = a._path;
    if (typeof ruta !== "string" || !ruta.startsWith("/") || ruta.length > 200) return null;
    if (typeof a._visitor !== "string" || !/^[0-9a-f]{64}$/.test(a._visitor)) return null;
    if (!["movil", "tableta", "escritorio"].includes(a._device as string)) return null;
    const origen = typeof a._referrer_host === "string" ? a._referrer_host.toLowerCase().slice(0, 100) : "";
    const pais = typeof a._country === "string" && /^[A-Z]{2}$/.test(a._country) ? a._country : null;
    await w(c, "insert into page_views (path, referrer_host, visitor, device, country) values (?, ?, ?, ?, ?)", [
      ruta, origen === "" ? null : origen, a._visitor, a._device, pais,
    ]);
    // La retención, sin cron: de vez en cuando se barre lo de más de trece meses.
    if (Math.random() < 0.002) await w(c, "delete from page_views where created_at < now(6) - interval 13 month");
    return null;
  },

  async vencer_pedidos_sin_pago(c, a) {
    // `auth.role() is not null and not is_admin()`: el cron de Postgres corre
    // sin rol; por PostgREST siempre hay uno (también la llave de servicio), así
    // que desde la app solo pasa un administrador.
    if (!(await esAdmin(c))) throw new ErrorPg("solo-admin");
    const horas = Math.max(Number(a._horas ?? 72) || 72, 24);
    const r = await w(
      c,
      `update orders set status = 'cancelled',
              notes = left(concat_ws('\n', notes, ?), 1000)
        where status = 'pending_payment' and created_at < now(6) - interval ? hour`,
      [`Cancelado solo: sin pago en ${horas} horas.`, horas],
    );
    return r.filas;
  },
};
