/**
 * Cuánto es un peso en dólares, para mostrar al lado de un precio como dato
 * de referencia. **Nunca toca un precio, un total ni un cobro**: todo se cobra
 * y se guarda en COP (invariante 5 de `dominio-regenera`). Decisión de Jesús,
 * 2026-10-12: «mantengamos COP mostrando un aprox en dólares, como una
 * información extra; no influye en nada».
 *
 * Mismo patrón que `payments.ts` (skill `nueva-integracion`): el resto del
 * código pide una `Cotizacion` y no sabe de dónde sale. Sale de la **TRM**
 * (Tasa Representativa del Mercado), la tasa oficial que certifica la
 * Superintendencia Financiera de Colombia, por dos caminos oficiales y sin
 * credenciales, en este orden:
 *
 * 1. el conjunto de datos abiertos en datos.gov.co (JSON);
 * 2. el servicio web de la propia Superintendencia (SOAP).
 *
 * **Por qué dos.** El primer despliegue usaba solo datos.gov.co: respondía desde
 * aquí y no desde producción, sin registros a la vista para saber por qué. La
 * hipótesis más probable es que Socrata, el servidor de datos.gov.co, limite
 * las peticiones sin token desde IPs compartidas como las de Vercel. Con una
 * segunda fuente de otro servidor, una caída o un límite de una no deja la
 * ficha sin dato. Cada fallo se registra con su motivo (`console.warn`) para
 * que se vea en los logs de Vercel.
 *
 * **Si las dos fallan, no se muestra nada.** Un dato de cortesía no puede
 * tumbar una ficha ni retrasarla: cada llamada tiene tiempo límite y nunca
 * lanza. El resultado se recuerda en memoria del servidor (seis horas si salió
 * bien; diez minutos si falló, para no esperar a una fuente caída en cada
 * visita). No se usa la caché de `fetch` de Next: guardaría también una
 * respuesta de error durante seis horas.
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

const FUENTE = "TRM de la Superintendencia Financiera de Colombia";
const LIMITE_MS = 3_000;

/** Una TRM fuera de rango es un dato roto, no una cotización. */
function cotizacion(valor: number, desde: string): Cotizacion | undefined {
  if (!Number.isFinite(valor) || valor < 500 || valor > 50_000) return undefined;
  return { copPorUsd: valor, vigenteDesde: desde.slice(0, 10), fuente: FUENTE };
}

class TrmDatosAbiertos implements FuenteDeCambio {
  readonly nombre = "datos.gov.co";

  async cotizacionUsd(): Promise<Cotizacion | undefined> {
    const r = await fetch(
      "https://www.datos.gov.co/resource/32sa-8pi3.json?$order=vigenciadesde%20DESC&$limit=1",
      { signal: AbortSignal.timeout(LIMITE_MS), cache: "no-store" },
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const [fila] = (await r.json()) as { valor?: string; unidad?: string; vigenciadesde?: string }[];
    if (fila?.unidad !== "COP") throw new Error("respuesta sin TRM");
    return cotizacion(Number(fila.valor), String(fila.vigenciadesde));
  }
}

class TrmServicioWeb implements FuenteDeCambio {
  readonly nombre = "superfinanciera.gov.co";

  async cotizacionUsd(): Promise<Cotizacion | undefined> {
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
    const r = await fetch(
      "https://www.superfinanciera.gov.co/SuperfinancieraWebServiceTRM/TCRMServicesWebService/TCRMServicesWebService",
      {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '""' },
        body:
          '<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ' +
          'xmlns:act="http://action.trm.services.generic.action.superfinanciera.nexura.sc.com.co/"><soapenv:Body>' +
          `<act:queryTCRM><tcrmQueryAssociatedDate>${hoy}</tcrmQueryAssociatedDate></act:queryTCRM>` +
          "</soapenv:Body></soapenv:Envelope>",
        signal: AbortSignal.timeout(LIMITE_MS),
        cache: "no-store",
      },
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const xml = await r.text();
    // Una respuesta de cuatro etiquetas no justifica un parser de XML.
    const leer = (etiqueta: string) => xml.match(new RegExp(`<${etiqueta}>([^<]*)</${etiqueta}>`))?.[1];
    if (leer("success") !== "true" || leer("unit") !== "COP") throw new Error("respuesta sin TRM");
    return cotizacion(Number(leer("value")), leer("validityFrom") ?? hoy);
  }
}

/** Prueba las fuentes en orden y se queda con la primera que dé un dato válido. */
class FuenteEnCadena implements FuenteDeCambio {
  readonly nombre: string;
  private readonly fuentes: FuenteDeCambio[];
  constructor(fuentes: FuenteDeCambio[]) {
    this.fuentes = fuentes;
    this.nombre = fuentes.map((f) => f.nombre).join(" → ");
  }

  async cotizacionUsd(): Promise<Cotizacion | undefined> {
    for (const f of this.fuentes) {
      try {
        const c = await f.cotizacionUsd();
        if (c) return c;
        console.warn(`[tipo-de-cambio] ${f.nombre}: TRM fuera de rango`);
      } catch (e) {
        console.warn(`[tipo-de-cambio] ${f.nombre} no respondió: ${(e as Error).message}`);
      }
    }
    return undefined;
  }
}

/** La última respuesta, por instancia del servidor. */
let recordada: { cotizacion: Cotizacion | undefined; hasta: number } | undefined;
const VIGENCIA_OK_MS = 6 * 60 * 60 * 1000;
const VIGENCIA_FALLO_MS = 10 * 60 * 1000;

class FuenteRecordada implements FuenteDeCambio {
  readonly nombre: string;
  private readonly fuente: FuenteDeCambio;
  constructor(fuente: FuenteDeCambio) {
    this.fuente = fuente;
    this.nombre = fuente.nombre;
  }

  async cotizacionUsd(): Promise<Cotizacion | undefined> {
    if (recordada && recordada.hasta > Date.now()) return recordada.cotizacion;
    const c = await this.fuente.cotizacionUsd();
    recordada = { cotizacion: c, hasta: Date.now() + (c ? VIGENCIA_OK_MS : VIGENCIA_FALLO_MS) };
    return c;
  }
}

export function getFuenteDeCambio(): FuenteDeCambio {
  return new FuenteRecordada(new FuenteEnCadena([new TrmDatosAbiertos(), new TrmServicioWeb()]));
}

/** Para las pruebas: que cada caso empiece sin nada recordado. */
export function olvidarCotizacion(): void {
  recordada = undefined;
}
