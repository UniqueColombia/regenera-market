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

/** Recibe "2026-09-05" y devuelve "vie, 5 sept". */
export function shortDate(iso: string): string {
  // Se fuerza el mediodía UTC para que el cambio de zona horaria no corra el día.
  return DATE.format(new Date(`${iso}T12:00:00Z`));
}

const LONG_DATE = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function longDate(iso: string): string {
  return LONG_DATE.format(new Date(`${iso}T12:00:00Z`));
}

/** "4 días" en vez de "96 horas". */
export function duration(hours: number): string {
  if (hours >= 24) {
    const days = Math.round(hours / 24);
    return `${days} ${days === 1 ? "día" : "días"}`;
  }
  return `${hours} ${hours === 1 ? "hora" : "horas"}`;
}
