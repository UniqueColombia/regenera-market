#!/usr/bin/env node
/**
 * Prospector de proveedores — capa determinista.
 *
 * Construye el universo de candidatos a proveedor de Seregenera a partir del
 * registro mercantil colombiano, lo puntúa con señales duras y lo deja en un
 * CSV. NO decide si un candidato sirve: eso lo hace el subagente
 * `prospector-proveedores`, que toma este CSV y lo enriquece con juicio.
 *
 * La división es deliberada. Aquí solo entra lo que se puede verificar sin
 * opinar: existe, está activa, renovó este año, su actividad económica es la
 * que buscamos. Todo lo que exige leer un sitio web y decidir si "esto encaja
 * con hoteles" vive en el subagente, porque un script que adivina intención
 * produce basura con apariencia de dato.
 *
 * Fuentes y por qué estas:
 *
 * - RUES vía datos.gov.co (dataset `c82u-588k`, Socrata). Es el registro
 *   mercantil de las 57 cámaras de comercio, publicado como dato abierto. Sin
 *   token, sin cuota, legal. Verificado el 2026-08-28: responde 200 y su
 *   `rowsUpdatedAt` era de agosto de 2026.
 * - MercadoLibre, opcional. Desde 2024 ya no hay acceso anónimo: `/sites/MCO/
 *   search` responde 403 sin token. Requiere una app propia (gratis) y
 *   `client_credentials`. Sin credenciales, este paso se salta.
 *
 * Lo que NO se usa, y no por olvido:
 *
 * - LinkedIn: la API está cerrada desde 2015 y sus términos prohíben la
 *   extracción automatizada aunque el dato sea público. No se toca.
 * - Facebook: la Page Search API está deprecada; solo se accede a páginas
 *   propias. No sirve para descubrir.
 * - Instagram: `business_discovery` exige conocer de antemano el @usuario, así
 *   que enriquece pero no descubre. Por eso el CSV trae una columna con la
 *   búsqueda ya armada, para que la resuelva el subagente y no un scraper.
 *
 * Uso:
 *   node scripts/prospectar.mts --listar-perfiles
 *   node scripts/prospectar.mts --perfil amenities-ecologicos
 *   node scripts/prospectar.mts --vertical restaurantes --camara BOGOTA
 *   node scripts/prospectar.mts --ciiu 2023,2029 --desde 2025 --limite 300
 *   node scripts/prospectar.mts --listar-camaras
 *
 * Requiere Node >= 22.18 (ejecuta TypeScript sin compilar). No tiene
 * dependencias: solo `fetch` y `node:fs`.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// Catálogo CIIU
// ---------------------------------------------------------------------------

/**
 * Descripciones CIIU Rev. 4 A.C. Copiadas literalmente de datos abiertos
 * oficiales (datasets `wed5-aysq` y `3vbk-w3sc` de datos.gov.co), no escritas
 * de memoria: un código mal etiquetado aquí manda al agente a prospectar la
 * industria equivocada durante una tarde entera.
 */
const CIIU: Record<string, string> = {
  "0113": "Cultivo de hortalizas, raíces y tubérculos",
  "0121": "Cultivo de frutas tropicales y subtropicales",
  "0127": "Cultivo de plantas con las que se preparan bebidas",
  "0161": "Actividades de apoyo a la agricultura",
  "0210": "Silvicultura y otras actividades forestales",
  "1030": "Elaboración de aceites y grasas de origen vegetal y animal",
  "1062": "Descafeinado, tostión y molienda del café",
  "1063": "Otros derivados del café",
  "1089": "Elaboración de otros productos alimenticios n.c.p.",
  "1311": "Preparación e hilatura de fibras textiles",
  "1410": "Confección de prendas de vestir, excepto prendas de piel",
  "1630": "Fabricación de partes y piezas de madera, de carpintería y ebanistería para la construcción",
  "1690":
    "Fabricación de otros productos de madera; fabricación de artículos de corcho, cestería y espartería",
  "1702":
    "Fabricación de papel y cartón ondulado (corrugado); fabricación de envases, empaques y de embalajes de papel y cartón",
  "2023":
    "Fabricación de jabones y detergentes, preparados para limpiar y pulir; perfumes y preparados de tocador",
  "2029": "Fabricación de otros productos químicos n.c.p.",
  "2100":
    "Fabricación de productos farmacéuticos, sustancias químicas medicinales y productos botánicos de uso farmacéutico",
  "2229": "Fabricación de artículos de plástico n.c.p.",
  "2393": "Fabricación de otros productos de cerámica y porcelana",
  "2599": "Fabricación de otros productos elaborados de metal n.c.p.",
  "2740": "Fabricación de equipos eléctricos de iluminación",
  "3110": "Fabricación de muebles",
  "3210": "Fabricación de joyas, bisutería y artículos conexos",
  "3290": "Otras industrias manufactureras n.c.p.",
  "3511": "Generación de energía eléctrica",
  "3811": "Recolección de desechos no peligrosos",
  "3830": "Recuperación de materiales",
  "3900": "Actividades de saneamiento ambiental y otros servicios de gestión de desechos",
  "4321": "Instalaciones eléctricas",
  "4620": "Comercio al por mayor de materias primas agropecuarias; animales vivos",
  "4631": "Comercio al por mayor de productos alimenticios",
  "4641":
    "Comercio al por mayor de productos textiles, productos confeccionados para uso doméstico",
  "4644": "Comercio al por mayor de aparatos y equipo de uso doméstico",
  "4645":
    "Comercio al por mayor de productos farmacéuticos, medicinales, cosméticos y de tocador",
  "4649": "Comercio al por mayor de otros utensilios domésticos n.c.p.",
  "4663":
    "Comercio al por mayor de materiales de construcción, artículos de ferretería, pinturas, productos de vidrio, equipo y materiales de fontanería y calefacción",
  "4762": "Comercio al por menor de artículos deportivos, en establecimientos especializados",
  "7020": "Actividades de consultoría de gestión",
  "7110":
    "Actividades de arquitectura e ingeniería y otras actividades conexas de consultoría técnica",
  "7310": "Publicidad",
  "7490": "Otras actividades profesionales, científicas y técnicas n.c.p.",
  "7912": "Actividades de operadores turísticos",
  "8560": "Actividades de apoyo a la educación",
  "9499": "Actividades de otras asociaciones n.c.p.",
};

// ---------------------------------------------------------------------------
// Perfiles de prospección
// ---------------------------------------------------------------------------

type Vertical = "hoteles" | "hostales" | "restaurantes" | "transporte" | "agencias";

interface Perfil {
  /** Subcategoría de `src/lib/taxonomy.ts`. El CSV se ata a la taxonomía real. */
  slug: string;
  vertical: Vertical;
  label: string;
  /** Códigos CIIU que se consultan como actividad principal o secundaria. */
  ciiu: string[];
  /** Términos con los que se busca señal comercial en MercadoLibre. */
  consultas: string[];
}

/**
 * Un perfil = una necesidad concreta de una vertical, traducida a códigos CIIU.
 * Los slugs son los de `VERTICALS[].subcategories` en `src/lib/taxonomy.ts`: si
 * allá se renombra una subcategoría, aquí hay que renombrarla igual, porque el
 * CSV alimenta el onboarding y el onboarding llena esa taxonomía.
 */
const PERFILES: Perfil[] = [
  {
    slug: "amenities-ecologicos",
    vertical: "hoteles",
    label: "Amenities ecológicos",
    ciiu: ["2023", "2100", "4645"],
    consultas: ["jabón artesanal", "amenities hotel biodegradable", "shampoo sólido"],
  },
  {
    slug: "aseo-verde",
    vertical: "hoteles",
    label: "Aseo verde",
    ciiu: ["2023", "2029", "4649"],
    consultas: ["detergente biodegradable", "limpiador ecológico"],
  },
  {
    slug: "decoracion-sostenible",
    vertical: "hoteles",
    label: "Decoración sostenible",
    ciiu: ["1690", "2393", "3290", "3210"],
    consultas: ["artesanía colombiana", "decoración fibra natural"],
  },
  {
    slug: "energia-eficiencia",
    vertical: "hoteles",
    label: "Energía y eficiencia",
    ciiu: ["2740", "3511", "4321"],
    consultas: ["panel solar", "iluminación LED ahorro"],
  },
  {
    slug: "kits-bienvenida",
    vertical: "hostales",
    label: "Kits de bienvenida",
    ciiu: ["1410", "1311", "3290", "1702"],
    consultas: ["kit viajero ecológico", "termo reutilizable"],
  },
  {
    slug: "camping-ecologico",
    vertical: "hostales",
    label: "Camping ecológico",
    ciiu: ["1410", "3290", "4762"],
    consultas: ["equipo camping ecológico", "hamaca artesanal"],
  },
  {
    slug: "energia-solar",
    vertical: "hostales",
    label: "Energía solar",
    ciiu: ["2740", "3511", "4321"],
    consultas: ["kit solar autónomo", "lámpara solar"],
  },
  {
    slug: "mobiliario-natural",
    vertical: "hostales",
    label: "Mobiliario natural",
    ciiu: ["1630", "1690", "3110"],
    consultas: ["mueble madera certificada", "mobiliario guadua"],
  },
  {
    slug: "insumos-organicos",
    vertical: "restaurantes",
    label: "Insumos orgánicos",
    ciiu: ["0113", "0121", "0127", "1030", "1062", "1063", "1089", "4620", "4631"],
    consultas: ["café orgánico origen", "panela orgánica", "cacao orgánico"],
  },
  {
    slug: "cocina-sostenible",
    vertical: "restaurantes",
    label: "Cocina sostenible",
    ciiu: ["2599", "1690", "4644", "4649"],
    consultas: ["utensilios cocina bambú", "menaje biodegradable"],
  },
  {
    slug: "limpieza-ecologica",
    vertical: "restaurantes",
    label: "Limpieza ecológica",
    ciiu: ["2023", "2029", "4649"],
    consultas: ["desengrasante biodegradable", "limpieza cocina ecológico"],
  },
  {
    slug: "huertas-urbanas",
    vertical: "restaurantes",
    label: "Huertas urbanas",
    ciiu: ["0113", "0161", "0210", "7490"],
    consultas: ["huerta urbana kit", "compostaje doméstico"],
  },
  {
    slug: "mantenimiento-verde",
    vertical: "transporte",
    label: "Mantenimiento verde",
    ciiu: ["2029", "3811", "3830", "3900", "4663"],
    consultas: ["lubricante biodegradable", "lavado en seco vehículos"],
  },
  {
    slug: "eficiencia-energetica",
    vertical: "transporte",
    label: "Eficiencia energética",
    ciiu: ["2740", "3511", "4321"],
    consultas: ["cargador vehículo eléctrico", "eficiencia energética flota"],
  },
  {
    slug: "branding-sostenible",
    vertical: "transporte",
    label: "Branding sostenible",
    ciiu: ["1702", "3290", "7310"],
    consultas: ["material publicitario reciclado", "vinilo ecológico"],
  },
  {
    slug: "formacion",
    vertical: "transporte",
    label: "Formación",
    ciiu: ["7020", "7490", "8560"],
    consultas: ["capacitación turismo sostenible"],
  },
  {
    slug: "merchandising-eco",
    vertical: "agencias",
    label: "Merchandising eco",
    ciiu: ["1410", "1311", "3210", "3290", "4641"],
    consultas: ["souvenir ecológico", "morral reciclado", "camiseta algodón orgánico"],
  },
  {
    slug: "material-pop",
    vertical: "agencias",
    label: "Material POP",
    ciiu: ["1702", "3290", "7310"],
    consultas: ["papel semilla", "material POP reciclado"],
  },
  {
    slug: "experiencias-regenerativas",
    vertical: "agencias",
    label: "Experiencias regenerativas",
    ciiu: ["0210", "7912", "9499"],
    consultas: ["avistamiento de aves", "turismo comunitario"],
  },
  {
    slug: "consultoria",
    vertical: "agencias",
    label: "Consultoría",
    ciiu: ["7020", "7110", "7490"],
    consultas: ["consultoría ambiental", "huella de carbono empresa"],
  },
];

/**
 * Términos que, en la razón social o la sigla, sugieren que la empresa ya se
 * posiciona como sostenible. Es señal débil a propósito: hay empresas verdes
 * con nombre neutro y empresas convencionales con nombre verde. Suma, no
 * decide, y por eso el tope es bajo.
 */
const SENALES_VERDES = [
  "eco",
  "verde",
  "organic",
  "natural",
  "sosteni",
  "bio",
  "ambient",
  "recicl",
  "artesan",
  "ancestral",
  "nativ",
  "selva",
  "bosque",
  "tierra",
  "semilla",
  "permacultura",
  "compost",
  "solar",
  "huerta",
  "campesin",
  "regenera",
];

/** Nombres que delatan una empresa que no está operando. Se descartan. */
const EXCLUIR_EN_NOMBRE = ["EN LIQUIDACION", "EN REORGANIZACION", "EN REESTRUCTURACION"];

// ---------------------------------------------------------------------------
// Fuente 1: RUES vía datos.gov.co
// ---------------------------------------------------------------------------

const RUES_URL = "https://www.datos.gov.co/resource/c82u-588k.json";

/** Solo las columnas que se usan. El dataset tiene 36 y pesa. */
interface RegistroRues {
  razon_social?: string;
  sigla?: string;
  nit?: string;
  matricula?: string;
  camara_comercio?: string;
  codigo_camara?: string;
  organizacion_juridica?: string;
  cod_ciiu_act_econ_pri?: string;
  cod_ciiu_act_econ_sec?: string;
  fecha_matricula?: string;
  ultimo_ano_renovado?: string;
  representante_legal?: string;
}

const COLUMNAS_RUES = [
  "razon_social",
  "sigla",
  "nit",
  "matricula",
  "camara_comercio",
  "codigo_camara",
  "organizacion_juridica",
  "cod_ciiu_act_econ_pri",
  "cod_ciiu_act_econ_sec",
  "fecha_matricula",
  "ultimo_ano_renovado",
  "representante_legal",
].join(",");

function comillasSoql(valor: string): string {
  // SoQL escapa la comilla simple duplicándola.
  return `'${valor.replace(/'/g, "''")}'`;
}

function condicionesRues(ciiu: string[], camaras: string[], desdeAnio: number): string {
  const lista = ciiu.map(comillasSoql).join(",");
  const condiciones = [
    "estado_matricula='ACTIVA'",
    `(cod_ciiu_act_econ_pri IN (${lista}) OR cod_ciiu_act_econ_sec IN (${lista}))`,
    `ultimo_ano_renovado >= ${comillasSoql(String(desdeAnio))}`,
  ];
  if (camaras.length > 0) {
    condiciones.push(`camara_comercio IN (${camaras.map(comillasSoql).join(",")})`);
  }
  return condiciones.join(" AND ");
}

/** Cuántas empresas cumplen el filtro. Una sola consulta, antes de traer nada. */
async function contarRues(where: string): Promise<number> {
  const url = new URL(RUES_URL);
  url.searchParams.set("$select", "count(1)");
  url.searchParams.set("$where", where);
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) {
    throw new Error(`RUES respondió ${res.status} al contar: ${(await res.text()).slice(0, 300)}`);
  }
  const filas = (await res.json()) as { count_1?: string }[];
  return Number(filas[0]?.count_1 ?? "0");
}

/**
 * Trae el universo completo, no una muestra.
 *
 * La primera versión traía 1.000 filas ordenadas por razón social y puntuaba
 * eso. Estaba mal y el resultado lo delataba: para "amenities en Bogotá" el
 * filtro devuelve 6.440 empresas, así que las 1.000 primeras eran todas de la A
 * a la C y el ranking premiaba haberse llamado "BIO algo" en vez de ser buen
 * candidato. Traer 18.000 filas cuesta 5,8 MB y cuatro segundos; el sesgo
 * costaba proveedores que nunca íbamos a ver.
 *
 * Se ordena por `matricula` porque la paginación de Socrata necesita un orden
 * estable y la matrícula es única; cualquier orden semántico volvería a sesgar
 * si el cupo se queda corto.
 */
async function consultarRues(where: string, cupo: number): Promise<RegistroRues[]> {
  const filas: RegistroRues[] = [];
  const porPagina = 20_000;

  for (let offset = 0; offset < cupo; offset += porPagina) {
    const url = new URL(RUES_URL);
    url.searchParams.set("$select", COLUMNAS_RUES);
    url.searchParams.set("$where", where);
    url.searchParams.set("$order", "matricula");
    url.searchParams.set("$limit", String(Math.min(porPagina, cupo - offset)));
    url.searchParams.set("$offset", String(offset));

    const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
    if (!res.ok) {
      throw new Error(
        `RUES respondió ${res.status}. Cuerpo: ${(await res.text()).slice(0, 300)}`,
      );
    }
    const pagina = (await res.json()) as RegistroRues[];
    filas.push(...pagina);
    if (pagina.length < porPagina) break;
  }

  return filas;
}

/** Descubre las cámaras de comercio reales, una consulta barata por código. */
async function listarCamaras(): Promise<void> {
  process.stderr.write("Consultando las 57 cámaras del RUES…\n");
  const encontradas: string[] = [];
  for (let n = 1; n <= 57; n++) {
    const codigo = String(n).padStart(2, "0");
    const url = new URL(RUES_URL);
    url.searchParams.set("$select", "camara_comercio");
    url.searchParams.set("$where", `codigo_camara=${comillasSoql(codigo)}`);
    url.searchParams.set("$limit", "1");
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) continue;
    const filas = (await res.json()) as RegistroRues[];
    const nombre = filas[0]?.camara_comercio;
    if (nombre) encontradas.push(`${codigo}  ${nombre}`);
  }
  console.log(encontradas.join("\n"));
}

// ---------------------------------------------------------------------------
// Fuente 2: MercadoLibre (opcional)
// ---------------------------------------------------------------------------

interface SenalComercial {
  vende: boolean;
  url: string;
}

interface ItemMeli {
  permalink?: string;
  seller?: { nickname?: string };
  official_store_name?: string;
}

async function tokenMercadoLibre(): Promise<string | null> {
  const id = process.env.MELI_CLIENT_ID;
  const secret = process.env.MELI_CLIENT_SECRET;
  if (!id || !secret) return null;

  const res = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: id,
      client_secret: secret,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    process.stderr.write(
      `MercadoLibre rechazó las credenciales (${res.status}). Se continúa sin esa señal.\n`,
    );
    return null;
  }
  const datos = (await res.json()) as { access_token?: string };
  return datos.access_token ?? null;
}

/**
 * Busca el nombre comercial en MercadoLibre y solo lo da por encontrado si el
 * nickname del vendedor comparte una palabra significativa con el nombre.
 *
 * Sin esa comprobación el resultado sería inútil: la búsqueda de MercadoLibre
 * indexa el texto del producto, así que "JABONES LA ESPERANZA" devuelve jabones
 * de cualquier vendedor. Aun con la comprobación es una señal débil —un
 * homónimo la dispara— y por eso pesa poco en el puntaje.
 */
async function senalMercadoLibre(nombre: string, token: string): Promise<SenalComercial> {
  const palabras = tokensSignificativos(nombre);
  if (palabras.length === 0) return { vende: false, url: "" };

  const url = new URL("https://api.mercadolibre.com/sites/MCO/search");
  url.searchParams.set("q", nombre);
  url.searchParams.set("limit", "10");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return { vende: false, url: "" };

  const datos = (await res.json()) as { results?: ItemMeli[] };
  for (const item of datos.results ?? []) {
    const vendedor = normalizar(
      `${item.seller?.nickname ?? ""} ${item.official_store_name ?? ""}`,
    );
    if (palabras.some((p) => vendedor.includes(p))) {
      return { vende: true, url: item.permalink ?? "" };
    }
  }
  return { vende: false, url: "" };
}

// ---------------------------------------------------------------------------
// Normalización y puntaje
// ---------------------------------------------------------------------------

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Palabras del nombre que sirven para identificar, sin el ruido societario. */
const RUIDO = new Set([
  "sas",
  "sa",
  "ltda",
  "eu",
  "scs",
  "esal",
  "cia",
  "compania",
  "empresa",
  "grupo",
  "del",
  "las",
  "los",
  "por",
  "para",
  "con",
  "acciones",
  "simplificada",
  "unipersonal",
  "sociedad",
  "limitada",
  "anonima",
  "colombia",
  "colombiana",
]);

function tokensSignificativos(nombre: string): string[] {
  return normalizar(nombre)
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 4 && !RUIDO.has(p));
}

interface Prospecto {
  registro: RegistroRues;
  perfiles: Perfil[];
  puntaje: number;
  motivos: string[];
  meli: SenalComercial;
}

/**
 * Puntaje 0-100 con los motivos siempre a la vista.
 *
 * Cada componente va acompañado de su razón en la columna `motivos` del CSV: un
 * número solo, sin el porqué, obliga a quien revisa a confiar a ciegas o a
 * reconstruir el cálculo. Los pesos no son un modelo, son una heurística
 * declarada — se ajustan cuando el onboarding diga cuáles predijeron bien.
 *
 * Los pesos están calibrados para **separar**, no para aprobar. En la primera
 * versión estar viva, ser SAS y tener el CIIU correcto ya sumaban 65 sobre 100,
 * así que 993 de cada 1.000 pasaban el corte y el puntaje no ordenaba nada. Lo
 * que distingue a un candidato no es existir —eso lo cumple todo el registro
 * mercantil— sino posicionarse: por eso la señal en el nombre y la presencia
 * comercial pesan más que la forma societaria.
 */
function puntuar(registro: RegistroRues, perfiles: Perfil[], anioActual: number): Prospecto {
  const motivos: string[] = [];
  let puntaje = 0;

  const renovado = Number(registro.ultimo_ano_renovado ?? "0");
  if (renovado >= anioActual) {
    puntaje += 20;
    motivos.push(`renovó ${renovado}`);
  } else if (renovado === anioActual - 1) {
    puntaje += 12;
    motivos.push(`renovó ${renovado}`);
  }

  const forma = (registro.organizacion_juridica ?? "").toUpperCase();
  if (forma.includes("ANIMO DE LUCRO") || forma.includes("SOLIDARIA") || forma.includes("ASOCIATIVA")) {
    // Asociaciones y cooperativas: encajan con los rasgos de impacto social del
    // catálogo (community_owned, campesino) mejor que cualquier SAS.
    puntaje += 10;
    motivos.push("asociativa o sin ánimo de lucro");
  } else if (
    forma.includes("ACCIONES SIMPLIFICADAS") ||
    forma.includes("LIMITADA") ||
    forma.includes("ANONIMA")
  ) {
    puntaje += 8;
    motivos.push("sociedad constituida");
  } else if (forma.includes("PERSONA NATURAL")) {
    puntaje += 4;
    motivos.push("persona natural");
  }

  const principal = registro.cod_ciiu_act_econ_pri ?? "";
  if (perfiles.some((p) => p.ciiu.includes(principal))) {
    puntaje += 15;
    motivos.push(`CIIU principal ${principal}`);
  } else {
    puntaje += 5;
    motivos.push(`CIIU solo secundario ${registro.cod_ciiu_act_econ_sec ?? "?"}`);
  }

  const nombre = normalizar(`${registro.razon_social ?? ""} ${registro.sigla ?? ""}`);
  const verdes = SENALES_VERDES.filter((s) => nombre.includes(s));
  if (verdes.length > 0) {
    puntaje += Math.min(30, verdes.length * 12);
    motivos.push(`nombre sugiere sostenibilidad (${verdes.join(", ")})`);
  }

  const anioMatricula = Number((registro.fecha_matricula ?? "").slice(0, 4));
  const antiguedad = anioMatricula > 0 ? anioActual - anioMatricula : 0;
  if (antiguedad >= 10) {
    puntaje += 12;
    motivos.push(`${antiguedad} años de operación`);
  } else if (antiguedad >= 3) {
    puntaje += 8;
    motivos.push(`${antiguedad} años de operación`);
  }

  return { registro, perfiles, puntaje: Math.min(100, puntaje), motivos, meli: { vende: false, url: "" } };
}

// ---------------------------------------------------------------------------
// Salida
// ---------------------------------------------------------------------------

const ENCABEZADOS = [
  "razon_social",
  "sigla",
  "nit",
  "matricula",
  "camara_comercio",
  "organizacion_juridica",
  "ciiu_principal",
  "ciiu_descripcion",
  "ultimo_ano_renovado",
  "anio_matricula",
  "puntaje",
  "motivos",
  "perfiles",
  "verticales",
  "vende_en_mercadolibre",
  "url_mercadolibre",
  "buscar_web",
  "buscar_instagram",
  "sitio_web",
  "instagram",
  "correo",
  "telefono",
  "ciudad",
  "departamento",
  "encaje",
  "notas",
];

function aFila(p: Prospecto): string[] {
  const nombre = p.registro.razon_social ?? "";
  const principal = p.registro.cod_ciiu_act_econ_pri ?? "";
  const consulta = encodeURIComponent(`"${nombre}" Colombia`);
  const consultaIg = encodeURIComponent(`site:instagram.com "${nombre}"`);

  return [
    nombre,
    p.registro.sigla ?? "",
    p.registro.nit ?? "",
    p.registro.matricula ?? "",
    p.registro.camara_comercio ?? "",
    p.registro.organizacion_juridica ?? "",
    principal,
    CIIU[principal] ?? "",
    p.registro.ultimo_ano_renovado ?? "",
    (p.registro.fecha_matricula ?? "").slice(0, 4),
    String(p.puntaje),
    p.motivos.join(" · "),
    p.perfiles.map((x) => x.slug).join(" "),
    [...new Set(p.perfiles.map((x) => x.vertical))].join(" "),
    p.meli.vende ? "si" : "",
    p.meli.url,
    `https://www.google.com/search?q=${consulta}`,
    `https://www.google.com/search?q=${consultaIg}`,
    // Las siete últimas las llena el subagente al enriquecer. Van vacías a
    // propósito: son las columnas donde vive el juicio, y este script no opina.
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ];
}

/**
 * CSV con `;` y BOM. Excel en configuración regional colombiana usa `;` como
 * separador de lista e ignora el UTF-8 sin BOM, así que sin las dos cosas el
 * archivo se abre en una sola columna y con las tildes rotas.
 */
function aCsv(filas: string[][]): string {
  const escapar = (v: string) =>
    /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  return "﻿" + filas.map((f) => f.map(escapar).join(";")).join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function bandera(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function tiene(nombre: string): boolean {
  return process.argv.includes(`--${nombre}`);
}

function separar(valor: string | undefined): string[] {
  return (valor ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

const AYUDA = `
Prospector de proveedores de Seregenera

  --perfil <slug,...>      Perfiles a prospectar (ver --listar-perfiles)
  --vertical <v,...>       Todos los perfiles de una vertical
                           (hoteles, hostales, restaurantes, transporte, agencias)
  --ciiu <codigo,...>      Códigos CIIU explícitos, sin pasar por un perfil
  --camara <NOMBRE,...>    Filtra por cámara de comercio (ver --listar-camaras)
  --desde <anio>           Renovadas desde este año. Por defecto, el anterior
  --candidatos <n>         Tope de registros a traer del RUES antes de puntuar (40000)
  --limite <n>             Cuántos prospectos escribir (200)
  --min-puntaje <n>        Umbral de corte (55)
  --formato csv|json       Por defecto csv
  --salida <ruta>          Por defecto .claude/prospectos/<fecha>-<slug>.csv
  --sin-mercadolibre       Salta la señal comercial aunque haya credenciales
  --listar-perfiles        Imprime los perfiles disponibles y sale
  --listar-camaras         Imprime las cámaras de comercio del RUES y sale
`;

async function main(): Promise<void> {
  if (tiene("ayuda") || tiene("help")) {
    console.log(AYUDA);
    return;
  }

  if (tiene("listar-perfiles")) {
    for (const p of PERFILES) {
      console.log(
        `${p.slug.padEnd(28)} ${p.vertical.padEnd(13)} CIIU ${p.ciiu.join(" ")}`,
      );
    }
    return;
  }

  if (tiene("listar-camaras")) {
    await listarCamaras();
    return;
  }

  const anioActual = new Date().getFullYear();
  const slugs = separar(bandera("perfil"));
  const verticales = separar(bandera("vertical"));
  const ciiuManual = separar(bandera("ciiu"));

  let perfiles = PERFILES.filter(
    (p) => slugs.includes(p.slug) || verticales.includes(p.vertical),
  );

  if (perfiles.length === 0 && ciiuManual.length === 0) {
    console.error("Falta --perfil, --vertical o --ciiu.\n" + AYUDA);
    process.exitCode = 1;
    return;
  }

  const desconocidos = slugs.filter((s) => !PERFILES.some((p) => p.slug === s));
  if (desconocidos.length > 0) {
    console.error(
      `Perfil desconocido: ${desconocidos.join(", ")}. Corre --listar-perfiles.`,
    );
    process.exitCode = 1;
    return;
  }

  if (ciiuManual.length > 0) {
    perfiles = [
      ...perfiles,
      {
        slug: "ciiu-manual",
        vertical: "hoteles",
        label: "CIIU indicado a mano",
        ciiu: ciiuManual,
        consultas: [],
      },
    ];
  }

  const ciiu = [...new Set(perfiles.flatMap((p) => p.ciiu))];
  const camaras = separar(bandera("camara")).map((c) => c.toUpperCase());
  const desde = Number(bandera("desde") ?? anioActual - 1);
  const candidatos = Number(bandera("candidatos") ?? 40_000);
  const limite = Number(bandera("limite") ?? 200);
  const minPuntaje = Number(bandera("min-puntaje") ?? 55);

  process.stderr.write(
    `RUES: ${ciiu.length} códigos CIIU, renovadas desde ${desde}` +
      `${camaras.length ? `, cámaras ${camaras.join("/")}` : ""}…\n`,
  );

  const where = condicionesRues(ciiu, camaras, desde);
  const universo = await contarRues(where);
  process.stderr.write(`RUES: ${universo} empresas activas cumplen el filtro.\n`);

  if (universo > candidatos) {
    process.stderr.write(
      `AVISO: se traen solo ${candidatos} de ${universo}. La muestra queda ordenada\n` +
        `por matrícula, así que NO es representativa. Sube --candidatos o acota con\n` +
        `--camara / --perfil antes de usar este CSV para decidir a quién contactar.\n`,
    );
  }

  const registros = await consultarRues(where, candidatos);
  process.stderr.write(`RUES devolvió ${registros.length} registros.\n`);

  const vistos = new Set<string>();
  const prospectos: Prospecto[] = [];

  for (const registro of registros) {
    const nombre = (registro.razon_social ?? "").toUpperCase();
    if (!nombre) continue;
    if (EXCLUIR_EN_NOMBRE.some((t) => nombre.includes(t))) continue;

    // El RUES repite una empresa por cada matrícula; la identidad es el NIT y,
    // si no lo tiene (persona natural sin registrar), la matrícula.
    const clave = registro.nit || `${registro.codigo_camara}-${registro.matricula}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);

    const suyos = perfiles.filter(
      (p) =>
        p.ciiu.includes(registro.cod_ciiu_act_econ_pri ?? "") ||
        p.ciiu.includes(registro.cod_ciiu_act_econ_sec ?? ""),
    );
    const prospecto = puntuar(registro, suyos.length > 0 ? suyos : perfiles, anioActual);
    if (prospecto.puntaje >= minPuntaje) prospectos.push(prospecto);
  }

  prospectos.sort((a, b) => b.puntaje - a.puntaje);
  const seleccion = prospectos.slice(0, limite);
  process.stderr.write(
    `${prospectos.length} superaron el umbral de ${minPuntaje}; se escriben ${seleccion.length}.\n`,
  );

  if (!tiene("sin-mercadolibre")) {
    const token = await tokenMercadoLibre();
    if (token) {
      process.stderr.write("MercadoLibre: buscando señal comercial…\n");
      for (const p of seleccion) {
        try {
          p.meli = await senalMercadoLibre(p.registro.razon_social ?? "", token);
          if (p.meli.vende) p.puntaje = Math.min(100, p.puntaje + 20);
        } catch {
          // Un fallo puntual de la API no puede tumbar una corrida de 200.
        }
        await new Promise((r) => setTimeout(r, 250));
      }
    } else {
      process.stderr.write(
        "MercadoLibre: sin MELI_CLIENT_ID/MELI_CLIENT_SECRET, se omite la señal comercial.\n",
      );
    }
  }

  const etiqueta = slugs[0] ?? verticales[0] ?? "ciiu";
  const fecha = new Date().toISOString().slice(0, 10);
  const formato = bandera("formato") ?? "csv";
  const salida =
    bandera("salida") ?? join(".claude", "prospectos", `${fecha}-${etiqueta}.${formato}`);

  mkdirSync(dirname(salida), { recursive: true });

  if (formato === "json") {
    writeFileSync(
      salida,
      JSON.stringify(
        seleccion.map((p) => {
          const fila = aFila(p);
          return Object.fromEntries(ENCABEZADOS.map((h, i) => [h, fila[i]]));
        }),
        null,
        2,
      ),
      "utf8",
    );
  } else {
    writeFileSync(salida, aCsv([ENCABEZADOS, ...seleccion.map(aFila)]), "utf8");
  }

  console.log(salida);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
