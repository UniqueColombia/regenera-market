import { normalizar, type Hoja } from "./hoja-de-calculo";

/**
 * Lo que comparten la pantalla «Contactar proveedores», su importación y sus
 * correos. Módulo neutral: lo usan el navegador (leer la planilla, armar el
 * WhatsApp) y el servidor (validar y mandar).
 *
 * Un prospecto es **una empresa** que todavía no está en Seregenera, con los
 * datos de contacto que ella misma publica (su sitio web) o que están en un
 * registro público (RUES). No hay nombres de personas: la invitación va a la
 * empresa. Viven en la base (migración 0018), nunca en el repositorio — ver la
 * cabecera de esa migración.
 */

export type EstadoProspecto = "nuevo" | "invitado" | "interesado" | "descartado";
export type Encaje = "alto" | "medio" | "bajo" | "descartar";
export type TipoCampana = "invitacion" | "noticia";

export const ESTADOS: Record<EstadoProspecto, { texto: string; clase: string }> = {
  nuevo: { texto: "Sin contactar", clase: "bg-sand text-muted ring-hairline" },
  invitado: { texto: "Invitado", clase: "bg-brand-50 text-brand-700 ring-brand-200" },
  interesado: { texto: "Interesado", clase: "bg-clay-100 text-clay-700 ring-clay-300/60" },
  descartado: { texto: "Descartado", clase: "bg-sand text-muted ring-hairline line-through" },
};

export const ENCAJES: Record<Encaje, string> = {
  alto: "Alto",
  medio: "Medio",
  bajo: "Bajo",
  descartar: "Descartar",
};

export interface Prospecto {
  id: string;
  nombre: string;
  nit?: string;
  correo?: string;
  telefono?: string;
  sitioWeb?: string;
  instagram?: string;
  ciudad?: string;
  departamento?: string;
  categoria?: string;
  encaje?: Encaje;
  fuente?: string;
  notas?: string;
  estado: EstadoProspecto;
  token: string;
  bajaAt?: string;
  ultimoEnvioAt?: string;
  /** Correos de campaña que le llegaron. */
  envios: number;
  /** Si ya hay una empresa en Seregenera con su correo o su NIT. Se calcula, no se guarda. */
  registrada?: { slug: string; nombre: string };
  createdAt: string;
}

/** Lo que llega de una planilla: los campos de la tabla, como texto. */
export interface ProspectoNuevo {
  nombre: string;
  nit?: string;
  correo?: string;
  telefono?: string;
  sitioWeb?: string;
  instagram?: string;
  ciudad?: string;
  departamento?: string;
  categoria?: string;
  encaje?: Encaje;
  fuente?: string;
  notas?: string;
}

// ---------------------------------------------------------------------------
// Leer una planilla de prospectos
// ---------------------------------------------------------------------------

/**
 * Cómo se puede llamar cada columna. Incluye los títulos del Excel que
 * genera `scripts/exportar-excel.mts` (el del prospector), para que ese archivo
 * se suba tal cual.
 */
const ALIAS: Record<keyof ProspectoNuevo, string[]> = {
  nombre: ["razon social", "nombre", "empresa", "nombre comercial", "proveedor", "nombre de la empresa"],
  nit: ["nit", "documento", "nit o documento", "identificacion tributaria"],
  correo: ["correo", "email", "e mail", "correo electronico", "mail"],
  telefono: ["telefono", "celular", "whatsapp", "telefono o whatsapp", "movil"],
  sitioWeb: ["sitio web", "web", "pagina web", "url", "sitio"],
  instagram: ["instagram"],
  ciudad: ["ciudad", "municipio", "ciudad o municipio"],
  departamento: ["departamento", "region"],
  categoria: ["vertical", "categoria", "perfil necesidad", "perfiles", "giro", "que vende"],
  encaje: ["encaje"],
  fuente: ["fuente", "origen del dato"],
  notas: ["notas", "observaciones", "comentarios"],
};

export interface PlanillaDeProspectos {
  filas: ProspectoNuevo[];
  /** Cuántas se saltaron y por qué, para decirlo antes de importar. */
  descartadas: number;
  sinContacto: number;
  hojas: string[];
}

const ENCAJE_VALIDO = new Set<Encaje>(["alto", "medio", "bajo", "descartar"]);

/**
 * Junta los prospectos de todas las hojas que tengan una columna de nombre y
 * alguna de contacto. El Excel del prospector trae una hoja por vertical y
 * otras de resumen: las de resumen no tienen esas columnas y se saltan solas.
 *
 * Se deduplica por NIT y por correo **dentro de la planilla**; contra la base
 * lo hace la acción de importar.
 */
export function leerPlanillaDeProspectos(
  hojas: Hoja[],
  opciones: { incluirDescartados: boolean; incluirSinContacto: boolean; fuente: string },
): PlanillaDeProspectos {
  const vistos = new Set<string>();
  const filas: ProspectoNuevo[] = [];
  const hojasUsadas: string[] = [];
  let descartadas = 0;
  let sinContacto = 0;

  for (const hoja of hojas) {
    let mapa: Map<number, keyof ProspectoNuevo> | null = null;
    let inicio = 0;
    for (let f = 0; f < Math.min(10, hoja.filas.length) && !mapa; f++) {
      const m = new Map<number, keyof ProspectoNuevo>();
      hoja.filas[f].forEach((titulo, i) => {
        const t = normalizar(titulo);
        const campo = (Object.keys(ALIAS) as (keyof ProspectoNuevo)[]).find((k) => ALIAS[k].includes(t));
        if (campo && ![...m.values()].includes(campo)) m.set(i, campo);
      });
      const campos = new Set(m.values());
      if (campos.has("nombre") && (campos.has("correo") || campos.has("telefono") || campos.has("sitioWeb") || campos.has("nit"))) {
        mapa = m;
        inicio = f + 1;
      }
    }
    if (!mapa) continue;
    hojasUsadas.push(hoja.nombre);

    for (const fila of hoja.filas.slice(inicio)) {
      const p: Partial<Record<keyof ProspectoNuevo, string>> = {};
      for (const [i, campo] of mapa) {
        const v = (fila[i] ?? "").trim();
        if (v) p[campo] = v;
      }
      if (!p.nombre) continue;

      const encaje = normalizar(p.encaje ?? "") as Encaje;
      if (encaje === "descartar" && !opciones.incluirDescartados) {
        descartadas++;
        continue;
      }
      const correo = limpiarCorreo(p.correo);
      if (!correo && !p.telefono && !opciones.incluirSinContacto) {
        sinContacto++;
        continue;
      }
      const nit = p.nit?.replace(/[^\d-]/g, "") || undefined;
      const clave = nit ? `nit:${nit}` : correo ? `correo:${correo}` : `nombre:${normalizar(p.nombre)}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);

      filas.push({
        nombre: p.nombre.slice(0, 200),
        nit,
        correo,
        telefono: p.telefono?.slice(0, 40),
        sitioWeb: p.sitioWeb?.slice(0, 300),
        instagram: p.instagram?.slice(0, 300),
        ciudad: p.ciudad?.slice(0, 80),
        departamento: p.departamento?.slice(0, 80),
        categoria: p.categoria?.slice(0, 200),
        encaje: ENCAJE_VALIDO.has(encaje) ? encaje : undefined,
        fuente: (p.fuente || opciones.fuente).slice(0, 300),
        notas: p.notas?.slice(0, 2000),
      });
    }
  }
  return { filas, descartadas, sinContacto, hojas: hojasUsadas };
}

/** Un correo que se pueda usar, o nada. Una celda con dos correos se queda con el primero. */
export function limpiarCorreo(v: string | undefined): string | undefined {
  const primero = (v ?? "").split(/[\s;,/]+/).find((s) => s.includes("@"));
  if (!primero) return undefined;
  const c = primero.trim().toLowerCase().replace(/^mailto:/, "");
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c) && c.length <= 200 ? c : undefined;
}

// ---------------------------------------------------------------------------
// Los mensajes
// ---------------------------------------------------------------------------

/**
 * Los textos con los que se abre el editor. Se pueden cambiar antes de mandar;
 * `{empresa}` y `{ciudad}` se reemplazan por los de cada destinatario.
 *
 * El enlace para publicar y el de baja no van aquí: los pone la plantilla del
 * correo, para que nadie los borre sin querer al editar el texto.
 */
export const TEXTOS: Record<TipoCampana, { asunto: string; cuerpo: string }> = {
  invitacion: {
    asunto: "{empresa}, te invitamos a vender en Seregenera",
    cuerpo: [
      "Hola, equipo de {empresa}:",
      "",
      "Somos Seregenera, un marketplace donde hoteles, hostales, restaurantes y operadores turísticos compran productos, experiencias y servicios a proveedores que cuidan el territorio donde trabajan.",
      "",
      "Conocimos lo que hacen y creemos que es justo lo que buscan nuestros compradores. Te invitamos a publicar tu catálogo: publicar es gratis y solo pagas una comisión cuando vendes.",
      "",
      "Darte de alta toma unos minutos, y si tienes tus productos en Excel, Word o PDF, contéstanos este correo con el archivo y te ayudamos a cargarlos.",
    ].join("\n"),
  },
  noticia: {
    asunto: "Novedades de Seregenera",
    cuerpo: ["Hola, equipo de {empresa}:", "", ""].join("\n"),
  },
};

/** Reemplaza `{empresa}` y `{ciudad}`. Lo demás entre llaves se queda como está. */
export function rellenar(texto: string, p: { nombre: string; ciudad?: string }): string {
  return texto.replace(/\{empresa\}/gi, p.nombre).replace(/\{ciudad\}/gi, p.ciudad || "tu ciudad");
}

/**
 * El número para `wa.me`: con indicativo y sin signos. Un celular colombiano
 * de diez dígitos (empieza por 3) recibe el 57 delante; un fijo no tiene
 * WhatsApp y no devuelve nada, en vez de un enlace que abre un chat vacío.
 */
export function numeroDeWhatsApp(telefono: string | undefined): string | undefined {
  const d = (telefono ?? "").replace(/\D/g, "");
  if (/^3\d{9}$/.test(d)) return `57${d}`;
  if (/^573\d{9}$/.test(d)) return d;
  return undefined;
}

/**
 * El enlace de WhatsApp con la invitación escrita, para mandarla a mano.
 *
 * **A mano y uno por uno, a propósito.** WhatsApp prohíbe los envíos
 * automatizados desde una cuenta normal y bloquea el número que lo intenta; el
 * camino masivo sería la API de WhatsApp Business, que es de pago y exige
 * plantillas aprobadas. Esto abre el chat con el texto puesto y la persona del
 * equipo decide si lo manda.
 */
export function enlaceDeWhatsApp(p: Pick<Prospecto, "nombre" | "telefono" | "token">, sitio: string): string | undefined {
  const numero = numeroDeWhatsApp(p.telefono);
  if (!numero) return undefined;
  const texto =
    `Hola, equipo de ${p.nombre}. Te escribimos de Seregenera, un marketplace donde hoteles y operadores turísticos ` +
    `compran a proveedores que cuidan el territorio. Nos gustaría que publiques tus productos con nosotros: ` +
    `publicar es gratis y solo pagas comisión cuando vendes. Puedes darte de alta aquí: ${sitio}/vender?invitacion=${p.token}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

/** Cuántos correos de campaña salen como máximo en un día. */
export const TOPE_DIARIO = 300;
/** Cuántos se mandan por llamada a la acción: lo que cabe holgado en el tiempo de una función. */
export const POR_LOTE = 10;
