/**
 * La conexión que `enTransaccion` le pasa a la capa compatible
 * (`src/lib/mysql/postgrest/contexto.ts`), vista como la ve React en `next dev`.
 *
 * React guarda el valor de cada `await` del código propio y lo recorre para sus
 * herramientas. Si llega a una consulta de mysql2, le llama `then()`, y ese
 * `then()` imprime «…on the result of query that is not a promise…» y lanza.
 *
 *   npm run test:mysql
 */
import { afterAll, describe, expect, it } from "vitest";
import { enTransaccion } from "../../src/lib/mysql/postgrest/contexto";
import { VISITANTE } from "../../src/lib/mysql/postgrest/tipos";
import { cerrarPool, HAY_MYSQL } from "./arnes";

/**
 * La ruta al primer objeto con `then()`, recorriendo como `renderDebugModel` de
 * React: las propiedades propias que ve un `for…in` y el contenido de los
 * iterables.
 */
function rutaAUnThenable(valor: unknown, ruta = "con", vistos = new Set<object>()): string | null {
  if (valor === null || typeof valor !== "object" || vistos.has(valor)) return null;
  vistos.add(valor);
  if (typeof (valor as { then?: unknown }).then === "function") return ruta;
  if (typeof (valor as { [Symbol.iterator]?: unknown })[Symbol.iterator] === "function") {
    const elementos = Array.from(valor as Iterable<unknown>);
    for (let i = 0; i < elementos.length; i++) {
      const r = rutaAUnThenable(elementos[i], `${ruta}[${i}]`, vistos);
      if (r) return r;
    }
    return null;
  }
  for (const llave in valor) {
    if (!Object.hasOwn(valor, llave)) continue;
    const r = rutaAUnThenable((valor as Record<string, unknown>)[llave], `${ruta}.${llave}`, vistos);
    if (r) return r;
  }
  return null;
}

describe.skipIf(!HAY_MYSQL)("la conexión de enTransaccion", () => {
  afterAll(async () => {
    await cerrarPool();
  });

  it("no deja ver a React ninguna consulta de mysql2, ni con una en curso", async () => {
    const ruta = await enTransaccion(
      VISITANTE,
      async (con) => {
        const enCurso = con.query("select 1");
        const r = rutaAUnThenable(con);
        await enCurso;
        return r;
      },
      { soloLectura: true },
    );
    expect(ruta).toBeNull();
  });
});
