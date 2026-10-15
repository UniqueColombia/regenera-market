/**
 * Herramientas de las pruebas de la base: crear una base limpia, entrar como
 * un usuario y sembrar lo mínimo para comprar.
 *
 * Cada archivo de prueba pide su propia base con `baseNueva()`. Es una copia
 * de la plantilla que armó `preparar-base.ts` (Supabase mínimo + todas las
 * migraciones), así que los archivos corren en paralelo sin pisarse y cada uno
 * empieza de cero.
 */
import { randomUUID } from "node:crypto";
import { Client, type ClientConfig } from "pg";
import { inject } from "vitest";

declare module "vitest" {
  export interface ProvidedContext {
    postgres: { host: string; port: number; user: string; password: string; plantilla: string };
  }
}

export type Sql = Client;

function config(database: string): ClientConfig {
  const { host, port, user, password } = inject("postgres");
  return { host, port, user, password, database };
}

/** Una base nueva, copia de la plantilla. Devuelve un cliente conectado como superusuario. */
export async function baseNueva(): Promise<{ sql: Sql; conectar: () => Promise<Sql>; cerrar: () => Promise<void> }> {
  const { plantilla } = inject("postgres");
  const nombre = `prueba_${randomUUID().replaceAll("-", "")}`;
  const admin = new Client(config("postgres"));
  await admin.connect();
  await admin.query(`create database ${nombre} template ${plantilla}`);
  await admin.end();

  const abiertos: Sql[] = [];
  const conectar = async () => {
    const c = new Client(config(nombre));
    await c.connect();
    abiertos.push(c);
    return c;
  };
  const sql = await conectar();
  return {
    sql,
    conectar,
    cerrar: async () => {
      await Promise.all(abiertos.map((c) => c.end().catch(() => {})));
      const a = new Client(config("postgres"));
      await a.connect();
      await a.query(`drop database if exists ${nombre} with (force)`);
      await a.end();
    },
  };
}

/**
 * Corre `fn` en una transacción con la identidad de `uid`, como lo haría la
 * aplicación a través de PostgREST: rol `authenticated` y los claims del JWT.
 * Con `uid = null`, entra como visitante (`anon`). Se deshace al final salvo
 * que `confirmar` sea true.
 */
export async function comoUsuario<T>(
  sql: Sql,
  uid: string | null,
  fn: (sql: Sql) => Promise<T>,
  { confirmar = false } = {},
): Promise<T> {
  const rol = uid ? "authenticated" : "anon";
  await sql.query("begin");
  try {
    await sql.query(`set local role ${rol}`);
    await sql.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(uid ? { sub: uid, role: rol } : { role: rol }),
    ]);
    const r = await fn(sql);
    await sql.query(confirmar ? "commit" : "rollback");
    return r;
  } catch (e) {
    await sql.query("rollback");
    throw e;
  }
}

/** Abre una transacción con identidad y la deja abierta: para pruebas de concurrencia. */
export async function abrirComo(sql: Sql, uid: string | null): Promise<void> {
  const rol = uid ? "authenticated" : "anon";
  await sql.query("begin");
  await sql.query(`set local role ${rol}`);
  await sql.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify(uid ? { sub: uid, role: rol } : { role: rol }),
  ]);
}

/** El código de error de Postgres de una promesa que debía fallar, o null si no falló. */
export async function falla(p: Promise<unknown>): Promise<{ code?: string; message: string } | null> {
  try {
    await p;
    return null;
  } catch (e) {
    const err = e as { code?: string; message: string };
    return { code: err.code, message: err.message };
  }
}

// ---------------------------------------------------------------------------
// Siembra. Escribe como superusuario: lo que se prueba es lo que viene después.
// ---------------------------------------------------------------------------

export async function crearUsuario(sql: Sql, { email, admin = false }: { email?: string; admin?: boolean } = {}) {
  const id = randomUUID();
  await sql.query(
    `insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at)
     values ($1, $2, '{"full_name":"Persona de Prueba"}', now())`,
    [id, email ?? `${id.slice(0, 8)}@prueba.test`],
  );
  if (admin) await sql.query(`insert into user_roles (user_id, role) values ($1, 'admin')`, [id]);
  return id;
}

export type Nivel = "semilla" | "raiz" | "bosque";

// El nivel no se escribe: lo deriva de los puntos `providers_tier_por_experiencia`
// (0006). Se siembran los puntos justos del umbral de cada nivel.
const PUNTOS_DE: Record<Nivel, number> = { semilla: 0, raiz: 600, bosque: 2500 };

/** Una empresa aprobada, con `miembro` como su gestor si se pasa. */
export async function crearEmpresa(sql: Sql, { tier = "semilla" as Nivel, miembro }: { tier?: Nivel; miembro?: string } = {}) {
  const id = randomUUID();
  await sql.query(
    `insert into providers (id, slug, name, department, city, email, status, experience_points)
     values ($1, $2, 'Empresa de Prueba', 'Antioquia', 'Medellín', 'empresa@prueba.test', 'approved', $3)`,
    [id, `empresa-${id.slice(0, 8)}`, PUNTOS_DE[tier]],
  );
  if (miembro) {
    await sql.query(`insert into provider_members (provider_id, user_id) values ($1, $2)`, [id, miembro]);
  }
  return id;
}

export interface OfertaPrueba {
  kind?: "product" | "experience" | "service";
  priceCop?: number;
  wholesalePriceCop?: number | null;
  wholesaleMinQty?: number | null;
  stock?: number | null;
  quoteOnly?: boolean;
  envioCop?: number | null;
  despacho?: "vendedor" | "transportadora" | null;
  status?: string;
  /** Desde la 0017. */
  envioLocalCop?: number | null;
  envioAdicionalCop?: number | null;
  department?: string | null;
}

/** Una oferta aprobada de `empresa`. Por defecto, un producto de $20.000 sin stock limitado. */
export async function crearOferta(sql: Sql, empresa: string, o: OfertaPrueba = {}) {
  const id = randomUUID();
  const kind = o.kind ?? "product";
  await sql.query(
    `insert into listings (id, slug, provider_id, kind, title, category, price_cop,
       wholesale_price_cop, wholesale_min_qty, stock, quote_only, envio_cop, despacho, status,
       envio_local_cop, envio_adicional_cop, department)
     values ($1, $2, $3, $4, 'Oferta de prueba', 'hogar', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      id,
      `oferta-${id.slice(0, 8)}`,
      empresa,
      kind,
      o.priceCop ?? 20_000,
      o.wholesalePriceCop ?? null,
      o.wholesaleMinQty ?? null,
      o.stock ?? null,
      o.quoteOnly ?? false,
      o.envioCop ?? null,
      o.despacho ?? (kind === "product" ? "vendedor" : null),
      o.status ?? "approved",
      o.envioLocalCop ?? null,
      o.envioAdicionalCop ?? null,
      o.department ?? null,
    ],
  );
  return id;
}

export interface Linea {
  listing_id: string;
  qty: number;
  date?: string;
}

export const DESTINO = { departamento: "Antioquia", ciudad: "Medellín", direccion: "Calle 10 # 20-30" };

/** Llama a `crear_orden()` como `comprador`, con todos los datos de contacto y destino. */
export async function comprar(
  sql: Sql,
  comprador: string,
  lineas: Linea[],
  { id = randomUUID(), destino = DESTINO as Partial<typeof DESTINO> | null } = {},
) {
  return comoUsuario(
    sql,
    comprador,
    async (s) => {
      const { rows } = await s.query(
        `select crear_orden($1, $2::jsonb, 'Persona de Prueba', '3001234567',
           _departamento => $3, _ciudad => $4, _direccion => $5) as r`,
        [id, JSON.stringify(lineas), destino?.departamento ?? null, destino?.ciudad ?? null, destino?.direccion ?? null],
      );
      return { id, ...(rows[0].r as { reference: string; repetida: boolean; total_cop?: number; envio_cop?: number }) };
    },
    { confirmar: true },
  );
}

/** Mueve el estado de una orden como lo hace el panel: con el estado de origen en el `where`. */
export async function moverOrden(sql: Sql, orden: string, desde: string, hasta: string) {
  const { rowCount } = await sql.query(`update orders set status = $3 where id = $1 and status = $2`, [orden, desde, hasta]);
  return rowCount === 1;
}
