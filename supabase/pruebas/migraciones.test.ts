/**
 * Las migraciones, como conjunto. Que se apliquen en orden ya lo comprobó
 * `preparar-base.ts` (si no, no llega a correr ningún archivo); aquí va lo que
 * se rompe sin hacer ruido.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { baseNueva, type Sql } from "./arnes";
import { migraciones } from "./preparar-base";

let sql: Sql;
let cerrar: () => Promise<void>;
beforeAll(async () => ({ sql, cerrar } = await baseNueva()));
afterAll(() => cerrar());

describe("migraciones", () => {
  it("van numeradas sin huecos ni repetidos", () => {
    const numeros = migraciones().map((m) => Number(m.nombre.slice(0, 4)));
    expect(numeros).toEqual(numeros.map((_, i) => i + 1));
  });

  // Supabase guarda en el SQL Editor lo que se pegó, y la regla de la casa es
  // que se puede volver a pegar sin miedo. Vale para la última: es la única
  // que alguien podría estar reaplicando.
  it("la última se puede aplicar dos veces seguidas", async () => {
    const ultima = migraciones().at(-1)!;
    sql.on("notice", () => {});
    await expect(sql.query(ultima.sql)).resolves.toBeDefined();
  });

  it("toda tabla de public tiene RLS activo", async () => {
    const { rows } = await sql.query(`
      select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
      order by 1`);
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  // Una función `security definer` sin `search_path` fijo se puede secuestrar
  // creando un objeto con el mismo nombre en un esquema que vaya antes.
  it("toda función security definer de public fija su search_path", async () => {
    const { rows } = await sql.query(`
      select p.proname from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
      order by 1`);
    expect(rows.map((r) => r.proname)).toEqual([]);
  });

  // Supabase concede `execute` a `anon` sobre toda función nueva de public
  // (`alter default privileges`), y `revoke … from public` no la quita: hay
  // que nombrar el rol. Una función que escribe y que un anónimo puede llamar
  // es un botón abierto a internet con la clave pública. Esta lista es la de
  // funciones `security definer` que anon puede ejecutar; una nueva que
  // aparezca aquí hay que justificarla o revocarla.
  //
  // Las funciones de trigger no cuentan: Postgres no deja llamarlas fuera de un
  // trigger.
  it("anon solo ejecuta las funciones security definer previstas", async () => {
    const { rows } = await sql.query(`
      select p.proname from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef and p.prokind = 'f'
        and p.prorettype <> 'trigger'::regtype
        and has_function_privilege('anon', p.oid, 'execute')
      order by 1`);
    expect(rows.map((r) => r.proname)).toEqual([
      // Las llama la aplicación sin sesión.
      "avatares_publicos",
      // Las evalúan las políticas de lectura pública y de storage: una
      // política corre con los permisos de quien consulta.
      "carpeta_es_de_mi_empresa",
      "carpeta_es_mia",
      "has_role",
      "is_admin",
      "manages_order",
      "manages_provider",
      "manages_quotation",
      "owns_order",
      "owns_quotation",
      // Las llama la aplicación sin sesión.
      "postular_proveedor",
      "registrar_visita",
    ]);
  });

  // Una vista corre con los permisos de quien la creó y se salta la RLS de
  // las tablas que lee, salvo `security_invoker` (ver 0003). Una vista sin él
  // es una fuga silenciosa: muestra a un anónimo lo que la tabla le niega.
  it("toda vista respeta la RLS de sus tablas (security_invoker)", async () => {
    const { rows } = await sql.query(`
      select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v'
        and not coalesce(c.reloptions @> array['security_invoker=true'], false)
      order by 1`);
    expect(rows.map((r) => r.relname)).toEqual([]);
  });
});
