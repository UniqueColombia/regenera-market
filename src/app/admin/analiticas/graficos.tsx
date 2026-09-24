import type { FilaAnalitica } from "@/lib/repo";
import { num, shortDate } from "@/lib/format";

/**
 * Las dos piezas de dibujo del panel de analíticas.
 *
 * Servidor, las dos: no tienen estado ni manejadores. La pista al pasar el
 * puntero es el `title` nativo de cada barra, que no necesita JavaScript, y la
 * cifra exacta está además en una tabla para quien no pueda o no quiera leer un
 * gráfico.
 *
 * Un solo color —`brand-600`— porque cada gráfico tiene una sola serie. Un
 * color por barra diría que las barras son cosas distintas, y son lo mismo en
 * días distintos.
 */

/** Visitas por día: columnas finas pegadas a la línea base. */
export function GraficoDiario({
  dias,
}: {
  dias: { dia: string; visitas: number; visitantes: number }[];
}) {
  const maximo = Math.max(1, ...dias.map((d) => d.visitas));

  return (
    <figure>
      <div
        aria-hidden
        className="flex h-40 items-end gap-0.5 border-b border-hairline sm:gap-1"
      >
        {dias.map((d) => (
          <div
            key={d.dia}
            title={`${shortDate(d.dia)}: ${num(d.visitas)} visitas, ${num(d.visitantes)} visitantes`}
            // La columna entera recibe el puntero, no solo la barra: un día con
            // dos visitas tiene una barra de un píxel imposible de apuntar.
            className="group flex h-full min-w-0 flex-1 items-end"
          >
            <div
              className="w-full rounded-t-[4px] bg-brand-600 transition group-hover:bg-brand-800"
              style={{ height: d.visitas === 0 ? 0 : `max(2px, ${(d.visitas / maximo) * 100}%)` }}
            />
          </div>
        ))}
      </div>
      <div aria-hidden className="mt-1.5 flex justify-between text-xs text-muted">
        <span>{shortDate(dias[0].dia)}</span>
        <span>{shortDate(dias[dias.length - 1].dia)}</span>
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-medium text-brand-700">
          Ver las cifras día por día
        </summary>
        <table className="mt-3 w-full text-left tabular-nums">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-1 font-medium">Día</th>
              <th className="py-1 text-right font-medium">Visitas</th>
              <th className="py-1 text-right font-medium">Visitantes</th>
            </tr>
          </thead>
          <tbody>
            {dias.map((d) => (
              <tr key={d.dia} className="border-t border-hairline">
                <td className="py-1">{shortDate(d.dia)}</td>
                <td className="py-1 text-right">{num(d.visitas)}</td>
                <td className="py-1 text-right">{num(d.visitantes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/**
 * Un ranking: la etiqueta, una barra proporcional detrás y la cifra a la
 * derecha. Es tabla de verdad —se lee igual sin la barra— y la barra solo ayuda
 * a comparar de un vistazo.
 */
export function Ranking({
  titulo,
  filas,
  etiqueta,
  vacio,
}: {
  titulo: string;
  filas: FilaAnalitica[];
  etiqueta: (clave: string) => string;
  vacio: string;
}) {
  const maximo = Math.max(1, ...filas.map((f) => f.visitas));

  return (
    <section className="rounded-xl bg-white p-5 ring-1 ring-hairline">
      <h2 className="font-display text-lg text-ink">{titulo}</h2>
      {filas.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{vacio}</p>
      ) : (
        <table className="mt-3 w-full table-fixed text-sm tabular-nums">
          <thead className="sr-only">
            <tr>
              <th>{titulo}</th>
              <th>Visitas</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.clave}>
                <td className="relative py-1.5 pr-3">
                  <span
                    aria-hidden
                    className="absolute inset-y-1 left-0 rounded-r-[4px] bg-brand-100"
                    style={{ width: `${(f.visitas / maximo) * 100}%` }}
                  />
                  <span
                    className="relative block truncate px-2 text-ink"
                    title={etiqueta(f.clave)}
                  >
                    {etiqueta(f.clave)}
                  </span>
                </td>
                <td
                  className="w-20 py-1.5 text-right text-muted"
                  title={`${num(f.visitantes)} visitantes`}
                >
                  {num(f.visitas)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
