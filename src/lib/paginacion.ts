/**
 * Paginación por número de página en la URL (`?pagina=3`), como los filtros:
 * cada página es una URL compartible, el botón atrás funciona y no hay estado
 * de cliente (invariante 19 de `dominio-regenera`).
 *
 * Tres cosas que hacen que una paginación esté bien y no solo «funcione»:
 *
 * 1. **Orden total.** Si dos filas empatan en el orden pedido, Postgres puede
 *    devolverlas en cualquier orden en cada consulta, y la misma oferta sale en
 *    la página 2 y en la 3 mientras otra no sale en ninguna. Toda consulta
 *    paginada termina en un desempate único (`id`). Ver `searchListings`.
 * 2. **Totales de la base, no de la página.** Un «por cobrar» sumado sobre las
 *    25 órdenes visibles miente desde la orden 26.
 * 3. **Una página que ya no existe** (se borraron filas, o alguien escribió
 *    `?pagina=999`) lleva a la última, no a una lista vacía sin explicación.
 */

export interface Pagina<T> {
  filas: T[];
  /** Cuántas filas hay en total con estos filtros, no solo en esta página. */
  total: number;
  /** 1 en adelante. */
  pagina: number;
  porPagina: number;
  /** Al menos 1, aunque no haya filas: la página 1 vacía existe. */
  paginas: number;
}

/** El número de página de un `searchParams`. Cualquier cosa rara es la 1. */
export function leerPagina(v: string | string[] | undefined): number {
  const s = Array.isArray(v) ? v[0] : v;
  if (!s || !/^\d{1,6}$/.test(s)) return 1;
  return Math.max(1, Number(s));
}

/** Desde y hasta, inclusivos y desde 0, como los pide `.range()` de PostgREST. */
export function rango(pagina: number, porPagina: number): [number, number] {
  const desde = (pagina - 1) * porPagina;
  return [desde, desde + porPagina - 1];
}

export function cuantasPaginas(total: number, porPagina: number): number {
  return Math.max(1, Math.ceil(total / porPagina));
}

/**
 * Los números que se pintan en la barra: siempre la primera, la última y dos a
 * cada lado de la actual; donde se saltan páginas, `null` (los «…»).
 * `1 … 4 5 [6] 7 8 … 20`. Con pocas páginas, todas.
 */
export function numerosDePagina(actual: number, paginas: number): (number | null)[] {
  const visibles = new Set([1, paginas]);
  for (let n = actual - 2; n <= actual + 2; n++) {
    if (n >= 1 && n <= paginas) visibles.add(n);
  }
  const orden = [...visibles].sort((a, b) => a - b);
  const salida: (number | null)[] = [];
  orden.forEach((n, i) => {
    const anterior = orden[i - 1];
    // Un hueco de una sola página se muestra con su número, no con «…»: el
    // «…» ocuparía lo mismo y escondería un enlace.
    if (anterior !== undefined && n - anterior === 2) salida.push(anterior + 1);
    else if (anterior !== undefined && n - anterior > 2) salida.push(null);
    salida.push(n);
  });
  return salida;
}

/**
 * La URL de una página conservando los demás parámetros. La página 1 no lleva
 * `pagina`: así `/catalogo` y `/catalogo?pagina=1` no son dos URLs distintas.
 */
export function urlDePagina(
  ruta: string,
  params: Record<string, string | string[] | undefined>,
  pagina: number,
): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k === "pagina" || v === undefined) continue;
    for (const valor of Array.isArray(v) ? v : [v]) if (valor !== "") u.append(k, valor);
  }
  if (pagina > 1) u.set("pagina", String(pagina));
  const q = u.toString();
  return q ? `${ruta}?${q}` : ruta;
}
