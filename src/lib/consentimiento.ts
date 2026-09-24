/**
 * El consentimiento de cookies: qué se guarda, dónde y cómo se lee.
 *
 * ## Por qué una cookie y no `localStorage`
 *
 * Porque la decisión la tiene que poder leer **el servidor**. Quien decide si
 * el código de medición se manda al navegador es el layout, en el servidor,
 * antes de pintar nada. Con `localStorage` el
 * script ya habría viajado y se apagaría después — que es la forma habitual de
 * incumplir un aviso de cookies sin querer: el consentimiento se pide y el
 * seguimiento ya ocurrió.
 *
 * Y tiene un segundo efecto que se nota: el layout sabe si hay decisión antes
 * de renderizar, así que el aviso **no parpadea** al cargar la página.
 *
 * ## Qué se mide, dicho sin adornos
 *
 * Desde la migración 0010 hay **una medición propia**: cada página vista se
 * guarda en `page_views` (ruta sin query, dominio de origen, tipo de aparato y
 * país), y un identificador aleatorio en la cookie `sgr_visitante` permite
 * contar visitantes distintos. No hay ninguna herramienta de terceros.
 *
 * Todo eso **solo ocurre si `medicion` es `true`**, y lo decide el servidor dos
 * veces: el layout no manda `<MedicionUso>` al navegador si no hay permiso, y
 * `/api/medicion` vuelve a leer esta cookie antes de guardar nada. Si alguien
 * fuerza la llamada sin permiso, no se registra.
 *
 * Las cookies de sesión y la del dispositivo de confianza siguen siendo las
 * necesarias: sin ellas no se puede entrar ni comprar, y para esas ninguna
 * normativa pide consentimiento previo.
 */

export const COOKIE_CONSENTIMIENTO = "sgr_cookies";

/** Un año. Pasado ese plazo se vuelve a preguntar, que es la práctica habitual. */
export const VIDA_CONSENTIMIENTO = 60 * 60 * 24 * 365;

/**
 * Sube cuando cambian las categorías o para qué se usan.
 *
 * Una decisión tomada sobre la versión anterior **no vale para la nueva**: si
 * mañana se agrega una categoría, quien dijo que sí en su día no dijo que sí a
 * esto. Subir el número vuelve a preguntar, que es lo correcto y también lo
 * único defendible si alguien lo revisa.
 */
export const VERSION_CONSENTIMIENTO = 2;

/*
 * Historial, para quien tenga que explicar por qué se volvió a preguntar:
 *
 * - 1 (2026-09-19): se preguntaba por una medición que todavía no existía.
 * - 2 (2026-09-24): la medición existe (migración 0010) y pone su propia
 *   cookie, `sgr_visitante`. Un «sí» a algo que no existía no vale como «sí» a
 *   algo concreto, así que todo el mundo vuelve a decidir.
 */

/**
 * El identificador aleatorio que permite contar visitantes distintos.
 *
 * Solo existe con `medicion: true`: lo pone `/api/medicion` y lo borra la misma
 * ruta cuando alguien retira el permiso. A la base llega su SHA-256, nunca el
 * valor, y no se cruza con la cuenta de nadie.
 */
export const COOKIE_VISITANTE = "sgr_visitante";

export interface Consentimiento {
  /**
   * Medición de uso: cuántas visitas, qué páginas, desde dónde. Agregado y sin
   * identificar a nadie.
   *
   * Las necesarias no están aquí porque no se consienten: sin ellas no se puede
   * mantener la sesión, y una casilla que no se puede desmarcar es teatro.
   */
  medicion: boolean;
  version: number;
  /** ISO. Es la prueba de cuándo se decidió; sin fecha, un consentimiento no se puede acreditar. */
  fecha: string;
}

export function nuevoConsentimiento(medicion: boolean): Consentimiento {
  return {
    medicion,
    version: VERSION_CONSENTIMIENTO,
    fecha: new Date().toISOString(),
  };
}

/**
 * Lee el valor crudo de la cookie.
 *
 * Devuelve `null` ante cualquier cosa rara —cookie ausente, JSON roto, versión
 * vieja— y eso significa «todavía no ha decidido», que es el estado seguro:
 * preguntar de más molesta; dar por consentido lo que nadie consintió, no.
 */
export function leerConsentimiento(valor: string | undefined): Consentimiento | null {
  if (!valor) return null;
  try {
    const datos = JSON.parse(decodeURIComponent(valor)) as Partial<Consentimiento>;
    if (datos.version !== VERSION_CONSENTIMIENTO) return null;
    if (typeof datos.medicion !== "boolean") return null;
    return {
      medicion: datos.medicion,
      version: datos.version,
      fecha: typeof datos.fecha === "string" ? datos.fecha : "",
    };
  } catch {
    return null;
  }
}

export function serializarConsentimiento(c: Consentimiento): string {
  return encodeURIComponent(JSON.stringify(c));
}

/**
 * Escribe la decisión desde el navegador.
 *
 * `SameSite=Lax` y sin `Secure` en desarrollo: un `Secure` sobre `http://` hace
 * que el navegador descarte la cookie en silencio, y el aviso reaparecería en
 * cada carga sin que nada falle de forma visible.
 */
export function guardarEnNavegador(c: Consentimiento): void {
  const seguro = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${COOKIE_CONSENTIMIENTO}=${serializarConsentimiento(c)}` +
    `; Path=/; Max-Age=${VIDA_CONSENTIMIENTO}; SameSite=Lax${seguro}`;
}

/**
 * El evento con el que el pie de página vuelve a abrir el aviso.
 *
 * Un evento del `window` y no un estado compartido porque el aviso y el enlace
 * del pie viven en dos árboles distintos, y montar un contexto que envuelva el
 * sitio entero para un botón que se pulsa una vez al año es caro para lo que
 * resuelve.
 */
export const EVENTO_ABRIR_COOKIES = "seregenera:cookies";
