import type { Tier } from "./types";

/**
 * Niveles de proveedor por experiencia acumulada.
 *
 * ## Qué cambió, y por qué
 *
 * Hasta aquí el nivel de un proveedor salía de la **evaluación de
 * sostenibilidad**: llenaba un cuestionario, un administrador lo aprobaba y el
 * trigger `sync_provider_score()` le escribía `tier`. Mientras no lo aprobaran,
 * el proveedor era `unverified` y no aparecía en ningún filtro.
 *
 * Eso convertía a Seregenera en un portero: nadie entraba al catálogo hasta que
 * alguien del equipo revisara. Ninguna plataforma viva funciona así, y el coste
 * no es solo la espera — es que el equipo se vuelve el cuello de botella de su
 * propio crecimiento.
 *
 * **Ahora el nivel se gana con actividad.** Todo el que se registra entra como
 * Semilla y puede publicar el mismo día. Publicar, vender, entregar, recibir
 * buenas reseñas y —sí— aprobar la evaluación de sostenibilidad suman puntos de
 * experiencia, y los puntos mueven el nivel.
 *
 * ## Lo que NO cambió, y conviene que no cambie
 *
 * **La evaluación de sostenibilidad sigue existiendo y sigue pesando más que
 * nada.** Es el evento que más puntos da con diferencia (ver `EXPERIENCIA`), y
 * es lo único que otorga el distintivo de «evaluación verificada», que es una
 * cosa distinta del nivel. Un proveedor puede llegar a Bosque vendiendo mucho
 * sin haberla pasado: tendrá el nivel y no tendrá el sello, y las dos cosas se
 * muestran por separado a propósito.
 *
 * Las invariantes 13, 14 y 15 de `dominio-regenera` siguen en pie tal cual: el
 * puntaje de sostenibilidad lo escribe un trigger, es auditable punto por punto
 * y las certificaciones tienen tope. Lo que cambió es **qué mueve el `tier`**,
 * no quién escribe el puntaje.
 *
 * ## Por qué los puntos no bajan
 *
 * Un sistema que resta por inactividad castiga al taller pequeño que produce por
 * temporada —justo a quien esta plataforma existe para incluir— y obliga a
 * explicar en la ficha por qué un proveedor «bajó de nivel», que es una
 * conversación que nadie quiere tener con un cliente suyo delante. El nivel sube
 * y se queda. Si algún día hace falta distinguir «activo» de «lo fue», eso es
 * otra señal, no este número.
 */

/**
 * Los tres niveles, de menor a mayor.
 *
 * **Son tres y no cinco a propósito.** `Tier` es un `enum` de Postgres
 * (`supabase/migrations/0001_init.sql`), y agregar un valor a un enum es una
 * migración con una trampa: Postgres no deja *usar* el valor nuevo en la misma
 * transacción en que se agrega, así que haría falta partirlo en dos archivos de
 * migración. Se puede y está explicado en `docs/NIVELES.md`; no se hizo porque
 * tres escalones con una diferencia real de comisión comunican mejor que cinco
 * casi iguales.
 *
 * `unverified` queda como valor muerto: existe en la base por compatibilidad con
 * las filas viejas, y `nivelParaPuntos()` nunca lo devuelve. Todo proveedor
 * nuevo nace en Semilla.
 */
export const NIVELES = [
  {
    id: "semilla",
    label: "Semilla",
    /** Puntos de experiencia a partir de los cuales se tiene este nivel. */
    minPuntos: 0,
    /** Comisión que retiene Seregenera sobre cada venta cerrada. */
    comision: 0.12,
    resumen: "Acabas de llegar. Publica y empieza a vender.",
    beneficios: [
      "Publicar ofertas sin límite y sin costo",
      "Ficha pública con tu impacto por unidad",
      "Cobro por transferencia con seguimiento de la orden",
    ],
  },
  {
    id: "raiz",
    label: "Raíz",
    minPuntos: 600,
    comision: 0.1,
    resumen: "Ya tienes recorrido: entregas cumplidas y perfil completo.",
    beneficios: [
      "Dos puntos menos de comisión en cada venta",
      "Prioridad sobre Semilla en el orden del catálogo",
      "Tu ficha entra en la lista de proveedores destacados",
    ],
  },
  {
    id: "bosque",
    label: "Bosque",
    minPuntos: 2500,
    comision: 0.08,
    resumen: "Referente del marketplace, con historial largo y verificable.",
    beneficios: [
      "Cuatro puntos menos de comisión que al empezar",
      "Aparición en la portada y en los envíos a compradores",
      "Acompañamiento directo del equipo para cerrar cuentas grandes",
    ],
  },
] as const satisfies readonly {
  id: Exclude<Tier, "unverified">;
  label: string;
  minPuntos: number;
  comision: number;
  resumen: string;
  beneficios: readonly string[];
}[];

export type Nivel = (typeof NIVELES)[number];
export type NivelId = Nivel["id"];

/** El nivel con el que arranca todo proveedor nuevo. */
export const NIVEL_INICIAL: NivelId = "semilla";

/** La comisión de quien todavía no tiene nivel asignado. La más alta, nunca la más baja. */
export const COMISION_BASE = NIVELES[0].comision;

/**
 * Comisión que le toca a cada nivel.
 *
 * `unverified` cobra lo mismo que Semilla y no menos: **ante la duda, la tasa
 * alta.** Si un fallo de lectura devolviera un nivel desconocido, cobrar de
 * menos es plata que se pierde sin que ningún error lo diga.
 */
export const COMISION_POR_NIVEL: Record<Tier, number> = {
  unverified: COMISION_BASE,
  semilla: NIVELES[0].comision,
  raiz: NIVELES[1].comision,
  bosque: NIVELES[2].comision,
};

export function comisionPara(tier: Tier | undefined): number {
  return tier ? COMISION_POR_NIVEL[tier] : COMISION_BASE;
}

/** 0.12 → "12". Para el texto, que nunca debe decir "12.000000000000002 %". */
export function comisionEnPorcentaje(tasa: number): string {
  const pct = tasa * 100;
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(1).replace(".", ",");
}

/**
 * Qué nivel corresponde a una cantidad de puntos.
 *
 * Recorre de mayor a menor y devuelve el primero que se alcanza, que es lo que
 * hace que agregar un nivel intermedio sea cambiar la tabla de arriba y nada
 * más.
 */
export function nivelParaPuntos(puntos: number): NivelId {
  for (let i = NIVELES.length - 1; i >= 0; i--) {
    if (puntos >= NIVELES[i].minPuntos) return NIVELES[i].id;
  }
  return NIVEL_INICIAL;
}

export function nivelPorId(id: Tier): Nivel | undefined {
  return NIVELES.find((n) => n.id === id);
}

/**
 * Este nivel y todos los de arriba.
 *
 * Es la invariante 16 de `dominio-regenera` escrita una sola vez: quien filtra
 * el catálogo por Raíz también quiere ver Bosque. Devuelve ids para meterlos en
 * un `in (...)` de PostgREST.
 *
 * Un `tier` desconocido —`unverified`, o algo que entre de una fila vieja—
 * devuelve la lista entera: mejor enseñar de más en un filtro que dejar al
 * usuario con una página vacía que no explica por qué.
 */
export function nivelesDesde(desde: Tier): NivelId[] {
  const indice = NIVELES.findIndex((n) => n.id === desde);
  if (indice < 0) return NIVELES.map((n) => n.id);
  return NIVELES.slice(indice).map((n) => n.id);
}

export interface Progreso {
  nivel: Nivel;
  /** El siguiente nivel, o `null` si ya está en el más alto. */
  siguiente: Nivel | null;
  puntos: number;
  /** Cuántos puntos faltan para el siguiente. 0 cuando no hay siguiente. */
  faltan: number;
  /** 0-100. En el nivel máximo vale 100. */
  porcentaje: number;
}

/**
 * Dónde está un proveedor dentro de su nivel.
 *
 * El porcentaje se mide **dentro del tramo**, no sobre el total: alguien con 600
 * puntos acaba de entrar a Raíz y su barra empieza de cero otra vez. Medirlo
 * sobre el total daría una barra que casi no se mueve durante meses, que es la
 * forma más rápida de que nadie vuelva a mirarla.
 */
export function progresoDe(puntos: number): Progreso {
  const valor = Math.max(0, Math.floor(puntos || 0));
  const id = nivelParaPuntos(valor);
  const indice = NIVELES.findIndex((n) => n.id === id);
  const nivel = NIVELES[indice];
  const siguiente = NIVELES[indice + 1] ?? null;

  if (!siguiente) {
    return { nivel, siguiente: null, puntos: valor, faltan: 0, porcentaje: 100 };
  }

  const tramo = siguiente.minPuntos - nivel.minPuntos;
  const avance = valor - nivel.minPuntos;

  return {
    nivel,
    siguiente,
    puntos: valor,
    faltan: siguiente.minPuntos - valor,
    porcentaje: Math.min(100, Math.round((avance / tramo) * 100)),
  };
}

/**
 * Qué da puntos y cuántos.
 *
 * **Esta tabla tiene un gemelo en Postgres.** Los puntos los otorga la función
 * `otorgar_experiencia()` de `supabase/migrations/0006_*.sql`, y los valores de
 * allá son los que mandan: aquí están para poder *explicárselos* al proveedor en
 * pantalla sin una consulta extra. Si cambias uno, cambia los dos — si divergen,
 * la pantalla promete puntos que la base no da, y el proveedor lo va a notar
 * antes que nosotros.
 *
 * No se calculan en la aplicación a propósito. Un evento de experiencia nace de
 * un hecho de la base (una orden entregada, una reseña guardada) y tiene que
 * apuntarse en la misma transacción que ese hecho, o se pierde el día que algo
 * falle a mitad.
 *
 * ## Por qué estos números y no los del principio
 *
 * Los de la 0006 eran demasiado generosos y se notó en cuanto existió la
 * Comunidad: publicar daba 30 puntos **sin tope**, así que nueve entradas en una
 * tarde, más el perfil y diez ofertas, llegaban a los 600 de Raíz sin haberle
 * vendido nada a nadie. Raíz son dos puntos menos de comisión: el agujero no era
 * de reputación, era de dinero.
 *
 * La migración 0011 los recortó con un criterio: **lo que se hace solo vale
 * menos; lo que exige que otro te compre vale más.** Publicar, escribir y llenar
 * el perfil son cosas que un proveedor hace sin que nadie participe. Vender,
 * entregar y que te reseñen, no.
 *
 * Los umbrales (600 y 2.500) no se tocaron, y **los puntos ya otorgados no se
 * recalcularon**: quien ganó 30 por una publicación de agosto los ganó. Lo que
 * cambió es lo que vale un evento de aquí en adelante.
 */
export const EXPERIENCIA = [
  {
    clave: "perfil_completo",
    puntos: 40,
    titulo: "Completar tu perfil",
    detalle: "Logo, descripción, ubicación y datos de contacto.",
    repetible: false,
  },
  {
    clave: "oferta_publicada",
    puntos: 10,
    titulo: "Publicar una oferta",
    detalle: "Hasta 5 al mes, para que el puntaje mida catálogo y no volumen de ruido.",
    repetible: true,
  },
  {
    clave: "primera_venta",
    puntos: 120,
    titulo: "Tu primera venta",
    detalle: "Una sola vez, y es el salto más grande al principio.",
    repetible: false,
  },
  {
    clave: "venta_entregada",
    puntos: 40,
    titulo: "Entregar un pedido",
    detalle: "Se cuenta cuando la orden queda como entregada, no cuando se paga.",
    repetible: true,
  },
  {
    clave: "volumen_vendido",
    puntos: 10,
    titulo: "Por cada $500.000 entregados",
    detalle: "Reconoce el tamaño de lo vendido sin que dependa solo de él.",
    repetible: true,
  },
  {
    clave: "resena_positiva",
    puntos: 30,
    titulo: "Recibir una reseña de 4 o 5 estrellas",
    detalle: "Solo de quien te compró de verdad: la reseña la escribe el comprador.",
    repetible: true,
  },
  {
    clave: "cotizacion_respondida",
    puntos: 5,
    titulo: "Responder una cotización",
    detalle: "Hasta 10 al mes. Responder rápido es lo que cierra las cuentas corporativas.",
    repetible: true,
  },
  {
    clave: "evaluacion_aprobada",
    puntos: 250,
    titulo: "Aprobar la evaluación de sostenibilidad",
    detalle:
      "El evento que más suma, y el único que además te da el sello de evaluación verificada.",
    repetible: false,
  },
  {
    clave: "certificacion_verificada",
    puntos: 80,
    titulo: "Certificación verificada",
    detalle: "Hasta tres. El tope es a propósito: un taller sin plata para certificarse tiene que poder llegar arriba igual.",
    repetible: true,
  },
  // Los dos de la Comunidad. Estuvieron un tiempo definidos aquí y en
  // `otorgar_experiencia()` sin que existiera dónde publicar, y `/niveles` los
  // ocultaba con una lista `AUN_NO` para no prometer puntos por algo que no se
  // podía hacer. La sección existe desde la migración 0007 (`/comunidad`), así
  // que la lista se fue y estos dos se muestran como el resto.
  //
  // **Solo suman cuando la publicación se firma con la empresa.** Una entrada a
  // título personal no tiene a quién darle puntos, y no debe: el nivel mide qué
  // tan activa es la empresa. Lo impone el trigger `community_posts_experiencia`.
  {
    clave: "articulo_publicado",
    puntos: 10,
    titulo: "Publicar en la Comunidad",
    detalle: "Hasta 4 al mes. Un consejo, una noticia o una práctica que le sirva a otro.",
    repetible: true,
  },
  {
    clave: "articulo_destacado",
    puntos: 50,
    titulo: "Que destaquemos tu artículo",
    detalle: "Lo elige el equipo entre lo publicado en la Comunidad.",
    repetible: true,
  },
] as const;

export type ClaveExperiencia = (typeof EXPERIENCIA)[number]["clave"];

export function eventoExperiencia(clave: ClaveExperiencia) {
  return EXPERIENCIA.find((e) => e.clave === clave)!;
}
