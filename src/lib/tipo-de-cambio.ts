/**
 * Cuánto es un peso en dólares, para mostrar al lado de un precio como dato
 * de referencia. **Nunca toca un precio, un total ni un cobro**: todo se cobra
 * y se guarda en COP (invariante 5 de `dominio-regenera`). Decisión de Jesús,
 * 2026-10-12: «mantengamos COP mostrando un aprox en dólares, como una
 * información extra; no influye en nada».
 *
 * Mismo patrón que `payments.ts` (skill `nueva-integracion`): el resto del
 * código pide una `Cotizacion` y no sabe de dónde sale. Hoy sale de la **TRM**
 * (Tasa Representativa del Mercado), la tasa oficial que certifica la
 * Superintendencia Financiera de Colombia y publica en datos.gov.co. No pide
 * credenciales.
 *
 * **Si la fuente no responde, no se muestra nada.** Un dato de cortesía que
 * falla no puede tumbar una ficha ni retrasarla: la llamada tiene tiempo
 * límite, no lanza nunca, y Next la guarda en caché unas horas (la TRM cambia
 * una vez por día hábil).
 */

export interface Cotizacion {
  /** Pesos colombianos por un dólar. */
  copPorUsd: number;
  /** Desde qué día rige, AAAA-MM-DD. */
  vigenteDesde: string;
  /** Quién la publica, para decirlo en pantalla. */
  fuente: string;
}

export interface FuenteDeCambio {
  readonly nombre: string;
  cotizacionUsd(): Promise<Cotizacion | undefined>;
}

/** Conjunto de datos «Tasa de Cambio Representativa del Mercado - Histórico». */
const TRM_URL =
  "https://www.datos.gov.co/resource/32sa-8pi3.json?$order=vigenciadesde%20DESC&$limit=1";

class TrmSuperfinanciera implements FuenteDeCambio {
  readonly nombre = "TRM";

  async cotizacionUsd(): Promise<Cotizacion | undefined> {
    try {
      const r = await fetch(TRM_URL, {
        signal: AbortSignal.timeout(3_000),
        next: { revalidate: 60 * 60 * 6 },
      });
      if (!r.ok) return undefined;
      const [fila] = (await r.json()) as { valor?: string; unidad?: string; vigenciadesde?: string }[];
      const valor = Number(fila?.valor);
      // Una TRM fuera de rango es un dato roto, no una cotización: mejor no
      // mostrar nada que mostrar «≈ US$ 0».
      if (fila?.unidad !== "COP" || !Number.isFinite(valor) || valor < 500 || valor > 50_000) {
        return undefined;
      }
      return {
        copPorUsd: valor,
        vigenteDesde: String(fila.vigenciadesde).slice(0, 10),
        fuente: "TRM de la Superintendencia Financiera de Colombia",
      };
    } catch (e) {
      console.warn("[tipo-de-cambio] la TRM no respondió:", (e as Error).message);
      return undefined;
    }
  }
}

export function getFuenteDeCambio(): FuenteDeCambio {
  return new TrmSuperfinanciera();
}
