const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/** "$ 45.000" — sin decimales, que en COP solo estorban. */
export function money(cop: number): string {
  return COP.format(cop);
}

const NUM = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });

export function num(n: number): string {
  return NUM.format(n);
}

const DATE = new Intl.DateTimeFormat("es-CO", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

/**
 * El día de una fecha, forzado al mediodía UTC para que el cambio de zona
 * horaria no lo corra.
 *
 * Acepta "2026-09-05" y también la marca de tiempo entera que devuelve Postgres
 * ("2026-09-05T14:22:10.123+00:00"): se queda con los diez primeros caracteres.
 * Antes solo aceptaba lo primero, y con lo segundo armaba una cadena imposible.
 * En el navegador eso pintaba «Invalid Date»; en el servidor
 * `Intl.DateTimeFormat.format()` lanza `RangeError` y tumba la página entera —
 * así cayó `/admin/comunidad`. Recortar en cada llamada ya había fallado una vez;
 * aquí no se puede olvidar.
 */
function mediodia(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`);
}

/** Recibe "2026-09-05" (o la marca de tiempo entera) y devuelve "vie, 5 sept". */
export function shortDate(iso: string): string {
  return DATE.format(mediodia(iso));
}

const LONG_DATE = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** Recibe "2026-09-05" (o la marca de tiempo entera) y devuelve "5 de septiembre de 2026". */
export function longDate(iso: string): string {
  return LONG_DATE.format(mediodia(iso));
}

/** "4 días" en vez de "96 horas". */
export function duration(hours: number): string {
  if (hours >= 24) {
    const days = Math.round(hours / 24);
    return `${days} ${days === 1 ? "día" : "días"}`;
  }
  return `${hours} ${hours === 1 ? "hora" : "horas"}`;
}
