import type { PoolConnection } from "mysql2/promise";
import { TABLAS, type Tabla } from "../modelo";
import { enTransaccion, escribir, filas } from "./contexto";
import { aErrorPostgrest, errorDePolitica } from "./errores";
import { aSql, columnaSql, columnasDe, filtroDeOperador, leerLogico, type Filtro } from "./filtros";
import { COLUMNAS_DE_VISITANTE, filtroDeLectura, reglasDeEscritura } from "./rls";
import { leerSeleccion, type Elemento } from "./seleccion";
import { ErrorPg, type Actor, type ErrorPostgrest, type Respuesta } from "./tipos";
import { deEntrada, filaDeSalida } from "./valores";

/**
 * `supabase.from(tabla)…` contra MariaDB: lo que hace PostgREST con una
 * petición, con las mismas reglas.
 *
 * - **Una petición, una transacción**, con la identidad de quien pide
 *   (`contexto.ts`). Si algo falla a la mitad, no queda nada a medias.
 * - **Leer** aplica las políticas de la tabla y, a cada relación anidada
 *   (`providers(name)`), las de la suya: PostgREST tampoco deja ver por una
 *   relación lo que la tabla no deja ver.
 * - **Escribir** sigue la tabla de Postgres: un `update` o un `delete` solo toca
 *   filas que pasan el `using` de su política *y* el de lectura (porque filtra
 *   por columnas); lo que queda tiene que pasar el `with check`; y si se pide
 *   de vuelta (`.select()`), tiene que poder leerse.
 * - **Los vacíos se ordenan como en Postgres**: al final en `asc`, al principio
 *   en `desc`. MariaDB lo hace al revés.
 *
 * Lo que no está aquí es porque la app no lo usa (búsqueda de texto, agregados
 * en el `select`, `csv()`); pedirlo es un error explícito, no otra respuesta.
 */

/** Las vistas no tienen llaves en el catálogo; PostgREST las infiere de su tabla base. */
const BASE_DE_VISTA: Record<string, string> = { listings_publicos: "listings" };

interface Orden {
  columna: string;
  ascendente: boolean;
  nulosPrimero?: boolean;
  relacion?: string;
}

interface Relacion {
  muchosAUno: boolean;
  colPadre: string;
  colHija: string;
}

type Operacion = "select" | "insert" | "update" | "upsert" | "delete";
type Fila = Record<string, unknown>;

function tabla(nombre: string): Tabla {
  const t = TABLAS[nombre];
  if (!t) throw new ErrorPg(`Could not find the table 'public.${nombre}' in the schema cache`, { code: "PGRST205" });
  return t;
}

function exigirColumna(nombre: string, columna: string): void {
  if (!tabla(nombre).columnas[columna]) {
    throw new ErrorPg(`column ${nombre}.${columna} does not exist`, { code: "42703" });
  }
}

function relacionEntre(padre: string, hija: string, pista: string | null): Relacion {
  const p = BASE_DE_VISTA[padre] ?? padre;
  const h = BASE_DE_VISTA[hija] ?? hija;
  const candidatas: (Relacion & { nombre: string })[] = [
    ...tabla(p).fks
      .filter((f) => f.tabla === h)
      .map((f) => ({ muchosAUno: true, colPadre: f.columnas[0], colHija: f.referencias[0], nombre: f.nombre })),
    ...tabla(h).fks
      .filter((f) => f.tabla === p)
      .map((f) => ({ muchosAUno: false, colPadre: f.referencias[0], colHija: f.columnas[0], nombre: f.nombre })),
  ].filter((c) => !pista || c.nombre === pista || c.colPadre === pista || c.colHija === pista);
  if (candidatas.length === 1) return candidatas[0];
  if (candidatas.length === 0) {
    throw new ErrorPg(`Could not find a relationship between '${padre}' and '${hija}' in the schema cache`, { code: "PGRST200" });
  }
  throw new ErrorPg(`Could not embed because more than one relationship was found for '${padre}' and '${hija}'`, { code: "PGRST201" });
}

const coalesce = (expr: string) => `coalesce((${expr}), false)`;

export class Consulta<T = unknown> implements PromiseLike<Respuesta<T>> {
  private readonly nombre: string;
  private readonly actor: () => Promise<Actor>;
  private op: Operacion = "select";
  private seleccion: string | undefined;
  private devolver = false;
  private conteo = false;
  private soloConteo = false;
  private filtros: Filtro[] = [];
  private filtrosDeRelacion = new Map<string, Filtro[]>();
  private ordenes: Orden[] = [];
  private limite?: number;
  private limitesDeRelacion = new Map<string, number>();
  private desde?: number;
  private hasta?: number;
  private unica: "single" | "maybe" | null = null;
  private valores: Fila[] = [];
  private enConflicto?: string[];
  private ignorarDuplicados = false;

  constructor(nombre: string, actor: () => Promise<Actor>) {
    this.nombre = nombre;
    this.actor = actor;
  }

  // ---- lo que se pide -------------------------------------------------------

  select(columnas?: string, opciones?: { count?: "exact" | "planned" | "estimated"; head?: boolean }): this {
    this.seleccion = columnas;
    if (this.op !== "select") this.devolver = true;
    if (opciones?.count) this.conteo = true;
    if (opciones?.head) this.soloConteo = true;
    return this;
  }

  insert(valores: Fila | Fila[]): this {
    this.op = "insert";
    this.valores = Array.isArray(valores) ? valores : [valores];
    return this;
  }

  upsert(valores: Fila | Fila[], opciones?: { onConflict?: string; ignoreDuplicates?: boolean }): this {
    this.op = "upsert";
    this.valores = Array.isArray(valores) ? valores : [valores];
    this.enConflicto = opciones?.onConflict?.split(",").map((s) => s.trim());
    this.ignorarDuplicados = Boolean(opciones?.ignoreDuplicates);
    return this;
  }

  update(valores: Fila): this {
    this.op = "update";
    this.valores = [valores];
    return this;
  }

  delete(): this {
    this.op = "delete";
    return this;
  }

  // ---- filtros ---------------------------------------------------------------

  private agregar(f: Filtro): this {
    const columnas = columnasDe(f);
    const relacion = columnas[0]?.includes(".") ? columnas[0].slice(0, columnas[0].lastIndexOf(".")) : null;
    if (relacion && "columna" in f) {
      const lista = this.filtrosDeRelacion.get(relacion) ?? [];
      lista.push({ ...f, columna: f.columna.slice(relacion.length + 1) });
      this.filtrosDeRelacion.set(relacion, lista);
    } else this.filtros.push(f);
    return this;
  }

  eq(columna: string, valor: unknown): this {
    return this.agregar({ columna, op: "eq", valor });
  }
  neq(columna: string, valor: unknown): this {
    return this.agregar({ columna, op: "neq", valor });
  }
  gt(columna: string, valor: unknown): this {
    return this.agregar({ columna, op: "gt", valor });
  }
  gte(columna: string, valor: unknown): this {
    return this.agregar({ columna, op: "gte", valor });
  }
  lt(columna: string, valor: unknown): this {
    return this.agregar({ columna, op: "lt", valor });
  }
  lte(columna: string, valor: unknown): this {
    return this.agregar({ columna, op: "lte", valor });
  }
  like(columna: string, patron: string): this {
    return this.agregar({ columna, op: "like", valor: patron });
  }
  ilike(columna: string, patron: string): this {
    return this.agregar({ columna, op: "ilike", valor: patron });
  }
  is(columna: string, valor: null | boolean): this {
    return this.agregar({ columna, op: "is", valor });
  }
  in(columna: string, valores: readonly unknown[]): this {
    return this.agregar({ columna, op: "in", valor: [...valores] });
  }
  contains(columna: string, valor: unknown): this {
    return this.agregar({ columna, op: "cs", valor });
  }
  containedBy(columna: string, valor: unknown): this {
    return this.agregar({ columna, op: "cd", valor });
  }
  overlaps(columna: string, valor: unknown): this {
    return this.agregar({ columna, op: "ov", valor });
  }
  match(criterio: Record<string, unknown>): this {
    for (const [c, v] of Object.entries(criterio)) this.eq(c, v);
    return this;
  }
  not(columna: string, op: string, valor: unknown): this {
    return this.agregar(filtroDeOperador(columna, op, valor, true));
  }
  filter(columna: string, op: string, valor: unknown): this {
    return this.agregar(filtroDeOperador(columna, op, valor));
  }
  or(texto: string, opciones?: { referencedTable?: string; foreignTable?: string }): this {
    const relacion = opciones?.referencedTable ?? opciones?.foreignTable;
    const arbol = leerLogico(texto, "or");
    if (relacion) {
      const lista = this.filtrosDeRelacion.get(relacion) ?? [];
      lista.push(arbol);
      this.filtrosDeRelacion.set(relacion, lista);
    } else this.filtros.push(arbol);
    return this;
  }

  // ---- forma del resultado ----------------------------------------------------

  order(columna: string, opciones?: { ascending?: boolean; nullsFirst?: boolean; referencedTable?: string; foreignTable?: string }): this {
    this.ordenes.push({
      columna,
      ascendente: opciones?.ascending ?? true,
      nulosPrimero: opciones?.nullsFirst,
      relacion: opciones?.referencedTable ?? opciones?.foreignTable,
    });
    return this;
  }
  limit(n: number, opciones?: { referencedTable?: string; foreignTable?: string }): this {
    const relacion = opciones?.referencedTable ?? opciones?.foreignTable;
    if (relacion) this.limitesDeRelacion.set(relacion, n);
    else this.limite = n;
    return this;
  }
  range(desde: number, hasta: number): this {
    this.desde = desde;
    this.hasta = hasta;
    return this;
  }
  single(): this {
    this.unica = "single";
    return this;
  }
  maybeSingle(): this {
    this.unica = "maybe";
    return this;
  }
  returns<U>(): Consulta<U> {
    return this as unknown as Consulta<U>;
  }
  abortSignal(): this {
    return this;
  }

  // ---- ejecución ---------------------------------------------------------------

  then<A = Respuesta<T>, B = never>(
    bien?: ((r: Respuesta<T>) => A | PromiseLike<A>) | null,
    mal?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.ejecutar().then(bien, mal);
  }

  private async ejecutar(): Promise<Respuesta<T>> {
    try {
      const actor = await this.actor();
      tabla(this.nombre);
      const { data, count } = await enTransaccion(
        actor,
        (con) => (this.op === "select" ? this.leer(con, actor) : this.escribirEn(con, actor)),
        { soloLectura: this.op === "select" },
      );
      return { data: this.darForma(data) as T, error: null, count, status: 200, statusText: "OK" };
    } catch (e) {
      const error: ErrorPostgrest =
        (e as { postgrest?: ErrorPostgrest }).postgrest ??
        aErrorPostgrest(e, { tabla: this.nombre, pista: (e as { pista?: string | null }).pista ?? null });
      return { data: null, error, count: null, status: 400, statusText: "Bad Request" };
    }
  }

  /** `single()` y `maybeSingle()`, con el error de PostgREST. */
  private darForma(data: Fila[] | null): unknown {
    if (!this.unica || data === null) return data;
    if (data.length === 1) return data[0];
    if (data.length === 0 && this.unica === "maybe") return null;
    throw Object.assign(new Error("PGRST116"), {
      postgrest: {
        code: "PGRST116",
        message: "JSON object requested, multiple (or no) rows returned",
        details: `The result contains ${data.length} rows`,
        hint: null,
      },
    });
  }

  // ---- leer --------------------------------------------------------------------

  private columnasDe(nombre: string, elementos: Elemento[]): string[] {
    const t = tabla(nombre);
    const columnas = new Set<string>();
    for (const e of elementos) {
      if (e.tipo === "todo") Object.keys(t.columnas).forEach((c) => columnas.add(c));
      if (e.tipo === "columna") {
        exigirColumna(nombre, e.nombre);
        columnas.add(e.nombre);
      }
    }
    return [...columnas];
  }

  /** Las columnas de unión que necesitan las relaciones anidadas (se quitan al final). */
  private columnasDeUnion(nombre: string, elementos: Elemento[]): string[] {
    return elementos.flatMap((e) => (e.tipo === "relacion" ? [relacionEntre(nombre, e.tabla, e.pista).colPadre] : []));
  }

  private exigirPermisosDeColumna(nombre: string, actor: Actor, columnas: string[]): void {
    const permitidas = actor.rol === "anon" ? COLUMNAS_DE_VISITANTE[nombre] : undefined;
    if (permitidas && columnas.some((c) => !permitidas.includes(c))) {
      throw new ErrorPg(`permission denied for table ${nombre}`, { code: "42501" });
    }
  }

  /** `where` de la tabla principal: filtros, política de lectura y las relaciones `!inner`. */
  private condiciones(actor: Actor, elementos: Elemento[], params: unknown[], extra?: string): string {
    const partes = this.filtros.map((f) => aSql(f, this.nombre, params));
    const rls = filtroDeLectura(this.nombre, actor);
    if (rls) partes.push(coalesce(rls));
    for (const e of elementos) {
      if (e.tipo !== "relacion" || !e.interna) continue;
      const rel = relacionEntre(this.nombre, e.tabla, e.pista);
      const ref = `\`${e.tabla}\`.`;
      const dentro = [`${ref}${columnaSql(rel.colHija)} = \`${this.nombre}\`.${columnaSql(rel.colPadre)}`];
      for (const f of this.filtrosDeRelacion.get(e.alias) ?? []) dentro.push(aSql(f, e.tabla, params, ref));
      const rlsHija = filtroDeLectura(e.tabla, actor);
      if (rlsHija) dentro.push(coalesce(rlsHija));
      partes.push(`exists (select 1 from \`${e.tabla}\` where ${dentro.join(" and ")})`);
    }
    if (extra) partes.push(extra);
    return partes.length ? partes.join(" and ") : "true";
  }

  private ordenSql(ordenes: Orden[]): string {
    if (!ordenes.length) return "";
    return (
      " order by " +
      ordenes
        .map((o) => {
          const col = columnaSql(o.columna);
          const nulosPrimero = o.nulosPrimero ?? !o.ascendente;
          return `(${col} is null) ${nulosPrimero ? "desc" : "asc"}, ${col} ${o.ascendente ? "asc" : "desc"}`;
        })
        .join(", ")
    );
  }

  private async leer(
    con: PoolConnection,
    actor: Actor,
    extra?: { sql: string; params: unknown[] },
  ): Promise<{ data: Fila[] | null; count: number | null }> {
    const elementos = leerSeleccion(this.seleccion);
    const columnas = this.columnasDe(this.nombre, elementos);
    const union = this.columnasDeUnion(this.nombre, elementos).filter((c) => !columnas.includes(c));
    this.exigirPermisosDeColumna(this.nombre, actor, [...columnas, ...this.filtros.flatMap(columnasDe)]);

    const params: unknown[] = [];
    const where = this.condiciones(actor, elementos, params, extra?.sql);
    params.push(...(extra?.params ?? []));

    let count: number | null = null;
    if (this.conteo) {
      const [{ n }] = await filas<{ n: number }>(con, `select count(*) as n from \`${this.nombre}\` where ${where}`, params);
      count = Number(n);
    }
    if (this.soloConteo) return { data: null, count };
    if (this.conteo && this.desde !== undefined && this.desde > 0 && this.desde >= (count ?? 0)) {
      throw Object.assign(new Error("PGRST103"), {
        postgrest: {
          code: "PGRST103",
          message: "Requested range not satisfiable",
          details: `An offset of ${this.desde} was requested, but there are only ${count} rows.`,
          hint: null,
        },
      });
    }

    const cols = [...columnas, ...union];
    let sql = `select ${cols.length ? cols.map(columnaSql).join(", ") : "1 as `_`"} from \`${this.nombre}\` where ${where}`;
    sql += this.ordenSql(this.ordenes.filter((o) => !o.relacion));
    if (this.desde !== undefined && this.hasta !== undefined) {
      sql += ` limit ${Math.max(0, this.hasta - this.desde + 1)} offset ${this.desde}`;
    } else if (this.limite !== undefined) sql += ` limit ${this.limite}`;

    const crudas = (await filas(con, sql, params)).map((f) => filaDeSalida(this.nombre, f));
    await this.resolverRelaciones(con, actor, this.nombre, crudas, elementos, "");
    return { data: crudas.map((f) => this.proyectar(this.nombre, f, elementos)), count };
  }

  private proyectar(nombre: string, fila: Fila, elementos: Elemento[]): Fila {
    const salida: Fila = {};
    for (const e of elementos) {
      if (e.tipo === "todo") for (const c of Object.keys(tabla(nombre).columnas)) salida[c] = fila[c];
      else if (e.tipo === "columna") salida[e.alias] = fila[e.nombre];
      else if (e.tipo === "relacion") salida[e.alias] = fila[`__rel_${e.alias}`];
    }
    return salida;
  }

  private async resolverRelaciones(
    con: PoolConnection,
    actor: Actor,
    padre: string,
    filasPadre: Fila[],
    elementos: Elemento[],
    ruta: string,
  ): Promise<void> {
    for (const e of elementos) {
      if (e.tipo !== "relacion") continue;
      const rel = relacionEntre(padre, e.tabla, e.pista);
      const rutaHija = ruta ? `${ruta}.${e.alias}` : e.alias;
      const claves = [...new Set(filasPadre.map((f) => f[rel.colPadre]).filter((v) => v !== null && v !== undefined))];
      const vacio = () => (rel.muchosAUno ? null : e.elementos.some((x) => x.tipo === "conteo") ? [{ count: 0 }] : []);
      if (!claves.length) {
        for (const f of filasPadre) f[`__rel_${e.alias}`] = vacio();
        continue;
      }
      const params: unknown[] = [];
      const partes = [`${columnaSql(rel.colHija)} in (${claves.map((c) => (params.push(c), "?")).join(", ")})`];
      for (const f of this.filtrosDeRelacion.get(rutaHija) ?? []) partes.push(aSql(f, e.tabla, params));
      const rls = filtroDeLectura(e.tabla, actor);
      if (rls) partes.push(coalesce(rls));

      if (e.elementos.length === 1 && e.elementos[0].tipo === "conteo") {
        const alias = e.elementos[0].alias;
        const conteos = await filas<{ k: unknown; n: number }>(
          con,
          `select ${columnaSql(rel.colHija)} as k, count(*) as n from \`${e.tabla}\` where ${partes.join(" and ")} group by ${columnaSql(rel.colHija)}`,
          params,
        );
        const porClave = new Map(conteos.map((c) => [c.k, Number(c.n)]));
        for (const f of filasPadre) f[`__rel_${e.alias}`] = [{ [alias]: porClave.get(f[rel.colPadre]) ?? 0 }];
        continue;
      }

      const columnas = this.columnasDe(e.tabla, e.elementos);
      this.exigirPermisosDeColumna(e.tabla, actor, columnas);
      const union = [rel.colHija, ...this.columnasDeUnion(e.tabla, e.elementos)].filter((c) => !columnas.includes(c));
      const cols = [...new Set([...columnas, ...union])];
      const sql =
        `select ${cols.map(columnaSql).join(", ")} from \`${e.tabla}\` where ${partes.join(" and ")}` +
        this.ordenSql(this.ordenes.filter((o) => o.relacion === rutaHija || o.relacion === e.tabla));
      const hijas = (await filas(con, sql, params)).map((f) => filaDeSalida(e.tabla, f));
      await this.resolverRelaciones(con, actor, e.tabla, hijas, e.elementos, rutaHija);

      const grupos = new Map<unknown, Fila[]>();
      for (const h of hijas) {
        const k = h[rel.colHija];
        const lista = grupos.get(k) ?? [];
        lista.push(this.proyectar(e.tabla, h, e.elementos));
        grupos.set(k, lista);
      }
      const limite = this.limitesDeRelacion.get(rutaHija) ?? this.limitesDeRelacion.get(e.tabla);
      for (const f of filasPadre) {
        const grupo = grupos.get(f[rel.colPadre]) ?? [];
        f[`__rel_${e.alias}`] = rel.muchosAUno ? grupo[0] ?? null : limite !== undefined ? grupo.slice(0, limite) : grupo;
      }
    }
  }

  // ---- escribir ----------------------------------------------------------------

  private pkDe(): string[] {
    return tabla(this.nombre).pk;
  }

  /** `(a, b) in ((?, ?), …)` para un conjunto de llaves, simples o compuestas. */
  private porLlaves(llaves: unknown[][], params: unknown[]): string {
    const pk = this.pkDe();
    if (!llaves.length) return "false";
    const cols = pk.length === 1 ? columnaSql(pk[0]) : `(${pk.map(columnaSql).join(", ")})`;
    const valores = llaves.map((l) => {
      params.push(...l);
      return pk.length === 1 ? "?" : `(${l.map(() => "?").join(", ")})`;
    });
    return `${cols} in (${valores.join(", ")})`;
  }

  private completar(fila: Fila, actor: Actor): Fila {
    const t = tabla(this.nombre);
    const salida: Fila = { ...fila };
    for (const [c, def] of Object.entries(t.columnas)) {
      if (salida[c] !== undefined) continue;
      if (def.uuidPorDefecto) salida[c] = crypto.randomUUID();
      if (def.defectoUsuario) salida[c] = actor.id;
    }
    for (const c of Object.keys(salida)) {
      exigirColumna(this.nombre, c);
      if (t.columnas[c].generada) throw new ErrorPg(`cannot insert a non-DEFAULT value into column "${c}"`, { code: "428C9" });
    }
    return salida;
  }

  /** El `using` sobre filas que ya existen: ¿pasan todas? */
  private async comprobar(con: PoolConnection, expr: string | null, llaves: unknown[][]): Promise<void> {
    if (expr === null || !llaves.length) return;
    const params: unknown[] = [];
    const sql = `select count(*) as n from \`${this.nombre}\` where ${this.porLlaves(llaves, params)} and not ${coalesce(expr)}`;
    const [{ n }] = await filas<{ n: number }>(con, sql, params);
    if (Number(n) > 0) throw Object.assign(new Error("42501"), { postgrest: errorDePolitica(this.nombre) });
  }

  /**
   * Escribe como Postgres comprueba el `with check`: **sobre la fila tal como
   * va a quedar** (ya pasada por los triggers `before`) **pero antes de que
   * exista**. El orden importa. Si se comprobara después, la política de
   * `user_roles` —`is_admin()`, que lee `user_roles`— vería el rol de admin que
   * alguien se acaba de insertar a sí mismo, y lo dejaría pasar. Si se comprobara
   * con los valores que manda el cliente, una certificación con `verified_at`
   * (que el trigger anula) se rechazaría cuando en Postgres entra.
   *
   * Así que: se escribe dentro de un savepoint, se lee cómo quedó, se deshace, se
   * evalúa la política sobre esas filas como tabla derivada (con el nombre de la
   * tabla, para que la expresión las encuentre) y, si pasa, se escribe de verdad.
   */
  private async escribirComprobando(con: PoolConnection, comprobando: string | null, escritura: () => Promise<unknown[][]>): Promise<unknown[][]> {
    if (comprobando === null) return escritura();
    await con.query("savepoint rls");
    const llaves = await escritura();
    let propuestas: Fila[] = [];
    if (llaves.length) {
      const params: unknown[] = [];
      propuestas = await filas(con, `select * from \`${this.nombre}\` where ${this.porLlaves(llaves, params)}`, params);
    }
    await con.query("rollback to savepoint rls");
    if (propuestas.length) {
      const t = tabla(this.nombre);
      const columnas = Object.keys(t.columnas);
      const params: unknown[] = [];
      const derivada = propuestas
        .map((f) => `select ${columnas.map((c) => (params.push(deEntrada(t.columnas[c].tipo, f[c])), `? as ${columnaSql(c)}`)).join(", ")}`)
        .join(" union all ");
      const [{ n }] = await filas<{ n: number }>(con, `select count(*) as n from (${derivada}) as \`${this.nombre}\` where not ${coalesce(comprobando)}`, params);
      if (Number(n) > 0) throw Object.assign(new Error("42501"), { postgrest: errorDePolitica(this.nombre) });
    }
    return escritura();
  }

  private async insertarFila(con: PoolConnection, fila: Fila): Promise<unknown[]> {
    const columnas = Object.keys(fila);
    const params = columnas.map((c) => deEntrada(tabla(this.nombre).columnas[c].tipo, fila[c]));
    const sql = columnas.length
      ? `insert into \`${this.nombre}\` (${columnas.map(columnaSql).join(", ")}) values (${columnas.map(() => "?").join(", ")})`
      : `insert into \`${this.nombre}\` () values ()`;
    const { id } = await escribir(con, sql, params);
    return this.pkDe().map((c) => (fila[c] !== undefined ? fila[c] : id));
  }

  private async actualizarPorLlaves(con: PoolConnection, cambios: Fila, llaves: unknown[][]): Promise<void> {
    const t = tabla(this.nombre);
    const columnas = Object.keys(cambios);
    if (!columnas.length || !llaves.length) return;
    for (const c of columnas) {
      exigirColumna(this.nombre, c);
      if (t.columnas[c].generada) throw new ErrorPg(`column "${c}" can only be updated to DEFAULT`, { code: "428C9" });
    }
    const params = columnas.map((c) => deEntrada(t.columnas[c].tipo, cambios[c]));
    const where = this.porLlaves(llaves, params);
    await escribir(con, `update \`${this.nombre}\` set ${columnas.map((c) => `${columnaSql(c)} = ?`).join(", ")} where ${where}`, params);
  }

  /** Las filas que un update o un delete puede tocar: filtros, política de lectura y la de la orden. */
  private async objetivo(con: PoolConnection, actor: Actor, usando: string | null): Promise<unknown[][]> {
    const pk = this.pkDe();
    const params: unknown[] = [];
    const partes = this.filtros.map((f) => aSql(f, this.nombre, params));
    const lectura = filtroDeLectura(this.nombre, actor);
    if (lectura) partes.push(coalesce(lectura));
    if (usando) partes.push(coalesce(usando));
    const sql = `select ${pk.map(columnaSql).join(", ")} from \`${this.nombre}\` where ${partes.length ? partes.join(" and ") : "true"} for update`;
    return (await filas(con, sql, params)).map((f) => pk.map((c) => f[c]));
  }

  private async devolverFilas(con: PoolConnection, actor: Actor, llaves: unknown[][]): Promise<Fila[]> {
    const params: unknown[] = [];
    const extra = this.porLlaves(llaves, params);
    const lector = new Consulta(this.nombre, this.actor);
    lector.seleccion = this.seleccion;
    const { data } = await lector.leer(con, actor, { sql: extra, params });
    return data ?? [];
  }

  private async escribirEn(con: PoolConnection, actor: Actor): Promise<{ data: Fila[] | null; count: number | null }> {
    const pk = this.pkDe();
    if (!pk.length && actor.rol !== "service_role") {
      // Sin llave no hay cómo comprobar la política; en este esquema, esas tablas niegan todo.
      throw Object.assign(new Error("42501"), { postgrest: errorDePolitica(this.nombre) });
    }
    let llaves: unknown[][] = [];
    let previas: Fila[] = [];

    if (this.op === "insert") {
      const { comprobando } = reglasDeEscritura(this.nombre, actor, "INSERT");
      const completas = this.valores.map((v) => this.completar(v, actor));
      llaves = await this.escribirComprobando(con, comprobando, async () => {
        const hechas: unknown[][] = [];
        for (const fila of completas) hechas.push(await this.insertarFila(con, fila));
        return hechas;
      });
    } else if (this.op === "upsert") {
      const insertar = reglasDeEscritura(this.nombre, actor, "INSERT");
      const cambiar = reglasDeEscritura(this.nombre, actor, "UPDATE");
      const conflicto = this.enConflicto ?? pk;
      for (const v of this.valores) {
        const fila = this.completar(v, actor);
        const params: unknown[] = [];
        const donde = conflicto
          .map((c) => {
            params.push(deEntrada(tabla(this.nombre).columnas[c]?.tipo, fila[c]));
            return `${columnaSql(c)} = ?`;
          })
          .join(" and ");
        const [existente] = await filas(con, `select ${pk.map(columnaSql).join(", ")} from \`${this.nombre}\` where ${donde} for update`, params);
        if (!existente) {
          llaves.push(...(await this.escribirComprobando(con, insertar.comprobando, async () => [await this.insertarFila(con, fila)])));
          continue;
        }
        if (this.ignorarDuplicados) continue;
        const llave = pk.map((c) => existente[c]);
        await this.comprobar(con, cambiar.usando, [llave]);
        const cambios = Object.fromEntries(Object.entries(fila).filter(([c]) => !conflicto.includes(c) && v[c] !== undefined));
        await this.escribirComprobando(con, cambiar.comprobando, async () => {
          await this.actualizarPorLlaves(con, cambios, [llave]);
          return [llave];
        });
        llaves.push(llave);
      }
    } else if (this.op === "update") {
      const { usando, comprobando } = reglasDeEscritura(this.nombre, actor, "UPDATE");
      const objetivo = await this.objetivo(con, actor, usando);
      llaves = await this.escribirComprobando(con, comprobando, async () => {
        await this.actualizarPorLlaves(con, this.valores[0] ?? {}, objetivo);
        return objetivo;
      });
    } else {
      const { usando } = reglasDeEscritura(this.nombre, actor, "DELETE");
      llaves = await this.objetivo(con, actor, usando);
      if (this.devolver) previas = await this.devolverFilas(con, actor, llaves);
      if (llaves.length) {
        const params: unknown[] = [];
        await escribir(con, `delete from \`${this.nombre}\` where ${this.porLlaves(llaves, params)}`, params);
      }
    }

    if (!this.devolver) return { data: null, count: this.conteo ? llaves.length : null };
    if (this.op === "delete") return { data: previas, count: this.conteo ? previas.length : null };
    const devueltas = await this.devolverFilas(con, actor, llaves);
    // Lo escrito tiene que poder leerse si se pide de vuelta: si no, Postgres falla.
    if (devueltas.length < llaves.length) throw Object.assign(new Error("42501"), { postgrest: errorDePolitica(this.nombre) });
    return { data: devueltas, count: this.conteo ? devueltas.length : null };
  }
}
