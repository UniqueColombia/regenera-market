const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/** "$ 45.000" — sin decimales, que en COP solo estorban. */
export function money(cop: number): string {
  return COP.format(cop);
}

const MILES = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0, useGrouping: "always" });

/** "20.000" — el número con punto de miles, sin símbolo. Para mostrar dentro de un campo. */
export function miles(n: number): string {
  return MILES.format(n);
}

/**
 * Lee pesos de lo que escribió una persona. `null` si está vacío, `NaN` si no
 * se puede leer sin adivinar.
 *
 * En Colombia «20.000» son veinte mil, y así lo escribe todo el mundo. Un
 * `<input type="number">` lo leía como el decimal 20,000 y la oferta salía
 * publicada a $20 sin que nada avisara (revisión del 2026-10-12). Como en COP no
 * hay centavos, un punto o una coma **con grupos de tres cifras** solo puede ser
 * separador de miles, y se acepta. Cualquier otra cosa con punto o coma
 * («20.5», «1,50») es ambigua: se rechaza en vez de interpretarla.
 *
 * El símbolo, los espacios y «COP» se ignoran, para que se pueda pegar un
 * precio copiado de otra página.
 */
export function pesosDesdeTexto(texto: string | null | undefined): number | null {
  const limpio = (texto ?? "").replace(/cop|\$|\s/gi, "");
  if (limpio === "") return null;
  if (/^\d+$/.test(limpio)) return Number(limpio);
  if (/^\d{1,3}(\.\d{3})+$/.test(limpio) || /^\d{1,3}(,\d{3})+$/.test(limpio)) {
    return Number(limpio.replace(/[.,]/g, ""));
  }
  return Number.NaN;
}

const USD_CENTAVOS = new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", maximumFractionDigits: 2, minimumFractionDigits: 2 });
const USD_ENTERO = new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/**
 * «≈ US$ 6,26»: un monto en pesos pasado a dólares con la tasa que se le dé.
 * Solo para mostrar (ver `src/lib/tipo-de-cambio.ts`): nada se cobra en
 * dólares. Con centavos por debajo de cien dólares, sin ellos por encima: en
 * una cifra aproximada, «US$ 1.234,57» aparenta una precisión que no tiene.
 */
export function aproxUsd(cop: number, copPorUsd: number): string {
  const usd = cop / copPorUsd;
  return `≈ ${(usd < 100 ? USD_CENTAVOS : USD_ENTERO).format(usd)}`;
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
/**
 * El tamaño de grupo de una experiencia, con lo que haya: «4 a 12 personas»,
 * «desde 4 personas», «hasta 12 personas». `undefined` si no hay ninguno de
 * los dos, para que quien lo pinta no muestre una etiqueta vacía.
 */
export function grupoDePersonas(min?: number, max?: number): string | undefined {
  const personas = (n: number) => `${n} ${n === 1 ? "persona" : "personas"}`;
  if (min && max && max > min) return `${min} a ${personas(max)}`;
  if (min && max) return personas(max);
  if (min) return `Desde ${personas(min)}`;
  if (max) return `Hasta ${personas(max)}`;
  return undefined;
}

export function duration(hours: number): string {
  if (hours >= 24) {
    const days = Math.round(hours / 24);
    return `${days} ${days === 1 ? "día" : "días"}`;
  }
  return `${hours} ${hours === 1 ? "hora" : "horas"}`;
}
