import { cerrarMysql, getMysql, getPoolMysql } from "../../src/lib/mysql/conexion";
import { abrirSesion } from "../../src/lib/mysql/cuentas";
import { clienteDeServicio, clienteDeToken, clienteEfimero, type ClienteMysql } from "../../src/lib/mysql/postgrest/cliente";

/**
 * Lo que comparten las pruebas del modo MySQL: gente, empresas y ofertas
 * inventadas, creadas con la llave de servicio y borradas al terminar. Es el
 * `supabase/pruebas/arnes.ts` de Postgres, pero entrando **por la capa
 * compatible**, que es por donde entra la app: cada persona tiene una sesión de
 * verdad y consulta con su token.
 */

export const HAY_MYSQL = Boolean(process.env.MYSQL_HOST && process.env.MYSQL_PASSWORD);

export const servicio = (): ClienteMysql => clienteDeServicio();
export const visitante = (): ClienteMysql => clienteEfimero();

const usuarios: string[] = [];
const empresas: string[] = [];

export interface Persona {
  id: string;
  email: string;
  db: ClienteMysql;
}

function marca(): string {
  return crypto.randomUUID().slice(0, 8);
}

/** Lanza si la respuesta trae error: para preparar datos, donde un fallo no es lo que se prueba. */
export function sinError<T>(r: { data: T | null; error: { message: string } | null }, que: string): T {
  if (r.error) throw new Error(`${que}: ${r.error.message}`);
  return r.data as T;
}

export async function crearPersona(opciones: { admin?: boolean; nombre?: string } = {}): Promise<Persona> {
  const id = crypto.randomUUID();
  const email = `prueba-${marca()}@pruebas.invalid`;
  usuarios.push(id);
  const s = servicio();
  const db = getMysql();
  await db.insertInto("usuarios").values({ id, email, clave: null, metadatos: JSON.stringify({ full_name: opciones.nombre ?? "Persona De Prueba" }) }).execute();
  await db.updateTable("usuarios").set({ correo_confirmado_at: new Date().toISOString().replace("T", " ").replace("Z", "") }).where("id", "=", id).execute();
  if (opciones.admin) sinError(await s.from("user_roles").insert({ user_id: id, role: "admin" }), "rol admin");
  const token = await abrirSesion(db, id);
  return { id, email, db: clienteDeToken(token) };
}

export async function crearEmpresa(opciones: { miembro?: Persona; verificada?: boolean; puntos?: number; departamento?: string } = {}): Promise<string> {
  const id = crypto.randomUUID();
  empresas.push(id);
  const s = servicio();
  sinError(
    await s.from("providers").insert({
      id,
      slug: `prueba-${marca()}`,
      name: `Empresa de prueba ${marca()}`,
      department: opciones.departamento ?? "Boyacá",
      city: "Tunja",
      email: `empresa-${marca()}@pruebas.invalid`,
      status: "approved",
      experience_points: opciones.puntos ?? 0,
      sustainability_verified_at: opciones.verificada ? new Date().toISOString() : null,
    }),
    "empresa",
  );
  if (opciones.miembro) {
    sinError(await s.from("provider_members").insert({ provider_id: id, user_id: opciones.miembro.id, is_owner: true }), "miembro");
    await s.from("user_roles").upsert({ user_id: opciones.miembro.id, role: "provider" }, { onConflict: "user_id,role", ignoreDuplicates: true });
  }
  return id;
}

export async function crearOferta(empresa: string, extra: Record<string, unknown> = {}): Promise<{ id: string; slug: string; title: string }> {
  const s = servicio();
  const slug = `prueba-${marca()}`;
  const fila = {
    id: crypto.randomUUID(),
    slug,
    provider_id: empresa,
    kind: "product",
    title: `Oferta de prueba ${slug}`,
    category: "agua",
    price_cop: 10000,
    status: "approved",
    stock: null,
    ...extra,
  };
  sinError(await s.from("listings").insert(fila), "oferta");
  return { id: fila.id, slug, title: fila.title };
}

/** Borra todo lo que crearon las pruebas, en el orden que piden las llaves. */
export async function limpiar(): Promise<void> {
  const s = servicio();
  const pool = getPoolMysql().promise();
  if (usuarios.length) {
    const marcas = usuarios.map(() => "?").join(", ");
    await pool.query(`delete from orders where buyer_id in (${marcas})`, usuarios);
  }
  if (empresas.length) {
    const marcas = empresas.map(() => "?").join(", ");
    await pool.query(`delete from orders where id in (select order_id from order_items where provider_id in (${marcas}))`, empresas);
    await s.from("providers").delete().in("id", empresas);
  }
  if (usuarios.length) await getMysql().deleteFrom("usuarios").where("id", "in", usuarios).execute();
  usuarios.length = 0;
  empresas.length = 0;
}

/** Al final de cada archivo: sin esto, el pool deja vivo el proceso de vitest. */
export async function cerrarPool(): Promise<void> {
  await cerrarMysql();
}

/** Una columna de una fila, leída sin políticas. */
export async function leer(tabla: string, id: string, columnas = "*"): Promise<Record<string, unknown>> {
  const r = await servicio().from(tabla).select(columnas).eq("id", id).single();
  return sinError(r, `leer ${tabla}`) as Record<string, unknown>;
}
