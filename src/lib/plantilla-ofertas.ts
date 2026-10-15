import {
  ESTILO,
  escribirLibro,
  letraDeColumna,
  normalizar,
  type CeldaEscrita,
  type Hoja,
  type ValidacionDeLista,
} from "./hoja-de-calculo";
import { CATEGORIAS, DEPARTMENTS, KIND_LABEL, VERTICALS, categoriaPorId } from "./taxonomy";
import type { ListingKind } from "./types";

/**
 * La planilla para cargar muchas ofertas de una vez.
 *
 * Pedido de Jesús el 2026-10-14: «si un proveedor nos manda su portafolio,
 * ¿cómo lo subimos?». La respuesta es esta plantilla: la empresa la descarga
 * desde «Tus ofertas», la llena (o el equipo la llena con el portafolio que le
 * mandaron en Word o PDF) y la sube con las fotos al lado. Cada fila se vuelve
 * una oferta **con las mismas validaciones del formulario**, porque pasa por
 * el mismo esquema (`src/lib/ofertas.ts`) y la misma acción de guardar.
 *
 * Las columnas se reconocen por su **título** y no por su posición: si alguien
 * borra las que no usa o las cambia de orden, la planilla se sigue leyendo.
 *
 * Módulo neutral (ni servidor ni cliente): lo usan la ruta que genera el
 * archivo y el componente que lo lee en el navegador.
 */

export type Obligatoria = "siempre" | "producto" | "empresa" | "no";

export interface ColumnaPlantilla {
  /** El nombre del campo en `CamposOferta`, o `fotos`. */
  clave: string;
  titulo: string;
  obligatoria: Obligatoria;
  ayuda: string;
  ancho: number;
  /** El nombre de una lista de la hoja «Listas», para el desplegable. */
  lista?: keyof typeof LISTAS;
  /** Valor de las tres filas de ejemplo: producto, experiencia, servicio. */
  ejemplo: [string, string, string];
}

const SI_NO = ["Sí", "No"];
const DESPACHO = ["Lo llevo yo", "Por transportadora"];

/** Las listas de los desplegables, en la hoja «Listas». */
export const LISTAS = {
  tipo: Object.values(KIND_LABEL),
  categoria: CATEGORIAS.map((c) => c.label),
  subcategoria: [...new Set(CATEGORIAS.flatMap((c) => c.subcategorias.map((s) => s.label)))],
  departamento: [...DEPARTMENTS],
  siNo: SI_NO,
  despacho: DESPACHO,
  paraQuien: VERTICALS.map((v) => v.label),
} as const;

export const COLUMNAS: ColumnaPlantilla[] = [
  {
    clave: "kind",
    titulo: "Tipo",
    obligatoria: "siempre",
    ayuda: "Producto, Experiencia o Servicio.",
    ancho: 14,
    lista: "tipo",
    ejemplo: ["Producto", "Experiencia", "Servicio"],
  },
  {
    clave: "title",
    titulo: "Título",
    obligatoria: "siempre",
    ayuda: "El nombre con el que se busca. Entre 4 y 140 caracteres.",
    ancho: 30,
    ejemplo: ["Cacao Arhuaco 72 % (100 g)", "Caminata a la cascada con guía local", "Diagnóstico de consumo de agua"],
  },
  {
    clave: "summary",
    titulo: "Resumen",
    obligatoria: "no",
    ayuda: "Una o dos frases que se leen en la tarjeta del catálogo. Hasta 300 caracteres.",
    ancho: 40,
    ejemplo: [
      "Chocolate de cacao de origen Arhuaco, de la Sierra Nevada de Santa Marta.",
      "Medio día por el bosque con un guía de la vereda.",
      "Medimos dónde se va el agua de tu hotel y te decimos cómo ahorrarla.",
    ],
  },
  {
    clave: "description",
    titulo: "Descripción",
    obligatoria: "no",
    ayuda: "Todo lo que quieras contar: cómo se hace, quién lo hace, cómo se usa. Hasta 5.000 caracteres.",
    ancho: 50,
    ejemplo: ["", "", ""],
  },
  {
    clave: "category",
    titulo: "Categoría",
    obligatoria: "siempre",
    ayuda: "Una de la lista. «Consultoría e implementación» exige el sello verificado.",
    ancho: 24,
    lista: "categoria",
    ejemplo: ["Gastronomía sostenible", "Territorio y regeneración", "Agua"],
  },
  {
    clave: "subcategory",
    titulo: "Subcategoría",
    obligatoria: "no",
    ayuda: "Una de las de esa categoría (mira la hoja «Listas»).",
    ancho: 24,
    lista: "subcategoria",
    ejemplo: ["Café y cacao", "Experiencias comunitarias", "Monitoreo de consumo"],
  },
  {
    clave: "priceCop",
    titulo: "Precio (COP)",
    obligatoria: "siempre",
    ayuda: "En pesos, sin decimales: 35000 o 35.000. Si es solo cotización, el precio «desde».",
    ancho: 14,
    ejemplo: ["35000", "120000", "800000"],
  },
  {
    clave: "unit",
    titulo: "Se vende por",
    obligatoria: "no",
    ayuda: "unidad, kit, persona, hora, mes… Si lo dejas vacío, «unidad».",
    ancho: 14,
    ejemplo: ["unidad", "persona", "visita"],
  },
  {
    clave: "quoteOnly",
    titulo: "Solo cotización",
    obligatoria: "no",
    ayuda: "Sí si no se compra directo y primero hay que pedir cotización.",
    ancho: 14,
    lista: "siNo",
    ejemplo: ["No", "No", "Sí"],
  },
  {
    clave: "wholesalePriceCop",
    titulo: "Precio mayorista (COP)",
    obligatoria: "no",
    ayuda: "El precio por unidad desde cierta cantidad. Si lo pones, llena también «Mayorista desde».",
    ancho: 16,
    ejemplo: ["32000", "", ""],
  },
  {
    clave: "wholesaleMinQty",
    titulo: "Mayorista desde (unidades)",
    obligatoria: "no",
    ayuda: "Desde cuántas unidades aplica el precio mayorista.",
    ancho: 16,
    ejemplo: ["20", "", ""],
  },
  {
    clave: "stock",
    titulo: "Unidades disponibles",
    obligatoria: "no",
    ayuda: "Si llevas inventario. Vacío = no llevamos la cuenta.",
    ancho: 14,
    ejemplo: ["150", "", ""],
  },
  {
    clave: "verticals",
    titulo: "Para quién",
    obligatoria: "no",
    ayuda: "Hoteles, Hostales, Restaurantes, Transporte o Agencias. Varios, separados con punto y coma.",
    ancho: 24,
    lista: "paraQuien",
    ejemplo: ["Hoteles y Eco Lodges; Restaurantes y Cafés", "Agencias y Operadores", "Hoteles y Eco Lodges"],
  },
  {
    clave: "department",
    titulo: "Departamento de origen",
    obligatoria: "no",
    ayuda: "De dónde sale o dónde ocurre. Si cobras envío local, es obligatorio.",
    ancho: 20,
    lista: "departamento",
    ejemplo: ["Magdalena", "Magdalena", ""],
  },
  {
    clave: "city",
    titulo: "Ciudad o municipio",
    obligatoria: "no",
    ayuda: "",
    ancho: 18,
    ejemplo: ["Santa Marta", "Minca", ""],
  },
  {
    clave: "aporteAmbiental",
    titulo: "Qué aporta al ambiente",
    obligatoria: "empresa",
    ayuda: "En tus palabras, al menos una frase (20 caracteres).",
    ancho: 40,
    ejemplo: [
      "Cacao de sombra sembrado entre bosque nativo; se paga precio justo a las familias.",
      "Parte de cada entrada financia la restauración del sendero.",
      "Un hotel que lo aplica baja entre 15 y 30 % su consumo de agua.",
    ],
  },
  {
    clave: "consecuenciaAmbiental",
    titulo: "Qué cuesta al ambiente",
    obligatoria: "empresa",
    ayuda: "De dónde viene, cómo llega, qué deja. Al menos una frase (20 caracteres).",
    ancho: 40,
    ejemplo: [
      "Viaja en camión desde Santa Marta; el empaque interno es de aluminio.",
      "Los visitantes llegan en vehículo hasta Minca.",
      "Requiere una visita presencial con desplazamiento del equipo.",
    ],
  },
  {
    clave: "huellaCo2Kg",
    titulo: "Huella de CO2 por unidad (kg)",
    obligatoria: "no",
    ayuda: "Si la conoces: lo que emite producir y entregar una unidad.",
    ancho: 16,
    ejemplo: ["0,4", "", ""],
  },
  {
    clave: "co2KgSaved",
    titulo: "CO2 evitado por unidad (kg)",
    obligatoria: "no",
    ayuda: "Frente a la alternativa convencional. Lo revisamos antes de publicarlo.",
    ancho: 16,
    ejemplo: ["2,1", "", ""],
  },
  {
    clave: "waterLitersSaved",
    titulo: "Agua ahorrada por unidad (litros)",
    obligatoria: "no",
    ayuda: "",
    ancho: 16,
    ejemplo: ["", "", "500"],
  },
  {
    clave: "wasteKgReduced",
    titulo: "Residuos evitados por unidad (kg)",
    obligatoria: "no",
    ayuda: "",
    ancho: 16,
    ejemplo: ["", "", ""],
  },
  {
    clave: "despacho",
    titulo: "Quién lo lleva",
    obligatoria: "producto",
    ayuda: "Solo productos: «Lo llevo yo» o «Por transportadora».",
    ancho: 18,
    lista: "despacho",
    ejemplo: ["Por transportadora", "", ""],
  },
  {
    clave: "transportadora",
    titulo: "Transportadora",
    obligatoria: "no",
    ayuda: "Si va por transportadora: Aveonline, Servientrega, Coordinadora…",
    ancho: 16,
    ejemplo: ["Aveonline", "", ""],
  },
  {
    clave: "envioCop",
    titulo: "Envío al resto del país (COP)",
    obligatoria: "producto",
    ayuda: "Solo productos: lo que cuesta mandar una unidad a cualquier parte. 0 = gratis.",
    ancho: 18,
    ejemplo: ["17000", "", ""],
  },
  {
    clave: "envioLocalCop",
    titulo: "Envío dentro del departamento (COP)",
    obligatoria: "no",
    ayuda: "Si el pedido va al mismo departamento de origen. Vacío = el de arriba.",
    ancho: 18,
    ejemplo: ["9000", "", ""],
  },
  {
    clave: "envioAdicionalCop",
    titulo: "Envío por unidad adicional (COP)",
    obligatoria: "no",
    ayuda: "Lo que suma cada unidad después de la primera. Vacío = el envío no cambia con la cantidad.",
    ancho: 18,
    ejemplo: ["1500", "", ""],
  },
  {
    clave: "entregaDiasMin",
    titulo: "Llega desde (días hábiles)",
    obligatoria: "no",
    ayuda: "",
    ancho: 14,
    ejemplo: ["3", "", ""],
  },
  {
    clave: "entregaDiasMax",
    titulo: "Llega hasta (días hábiles)",
    obligatoria: "producto",
    ayuda: "Solo productos: en cuántos días hábiles llega, como máximo, después del pago.",
    ancho: 14,
    ejemplo: ["7", "", ""],
  },
  {
    clave: "pesoKg",
    titulo: "Peso empacado (kg)",
    obligatoria: "no",
    ayuda: "De una unidad lista para enviar.",
    ancho: 12,
    ejemplo: ["0,15", "", ""],
  },
  { clave: "largoCm", titulo: "Largo (cm)", obligatoria: "no", ayuda: "", ancho: 10, ejemplo: ["18", "", ""] },
  { clave: "anchoCm", titulo: "Ancho (cm)", obligatoria: "no", ayuda: "", ancho: 10, ejemplo: ["9", "", ""] },
  { clave: "altoCm", titulo: "Alto (cm)", obligatoria: "no", ayuda: "", ancho: 10, ejemplo: ["2", "", ""] },
  {
    clave: "durationHours",
    titulo: "Duración (horas)",
    obligatoria: "no",
    ayuda: "Solo experiencias.",
    ancho: 12,
    ejemplo: ["", "5", ""],
  },
  {
    clave: "minPeople",
    titulo: "Mínimo de personas",
    obligatoria: "no",
    ayuda: "Solo experiencias.",
    ancho: 12,
    ejemplo: ["", "2", ""],
  },
  {
    clave: "maxPeople",
    titulo: "Máximo de personas",
    obligatoria: "no",
    ayuda: "Solo experiencias.",
    ancho: 12,
    ejemplo: ["", "12", ""],
  },
  {
    clave: "meetingPoint",
    titulo: "Punto de encuentro",
    obligatoria: "no",
    ayuda: "Solo experiencias.",
    ancho: 22,
    ejemplo: ["", "Parque principal de Minca", ""],
  },
  {
    clave: "includes",
    titulo: "Incluye",
    obligatoria: "no",
    ayuda: "Solo experiencias. Varias cosas, separadas con punto y coma.",
    ancho: 30,
    ejemplo: ["", "Guía local; refrigerio; seguro", ""],
  },
  {
    clave: "deliveryTime",
    titulo: "Tiempo de entrega",
    obligatoria: "no",
    ayuda: "Solo servicios: «15 días hábiles», «ciclo de 3 meses»…",
    ancho: 18,
    ejemplo: ["", "", "15 días hábiles"],
  },
  {
    clave: "scope",
    titulo: "Alcance",
    obligatoria: "no",
    ayuda: "Solo servicios. Lo que incluye, separado con punto y coma.",
    ancho: 30,
    ejemplo: ["", "", "Visita técnica; informe; plan de ahorro"],
  },
  {
    clave: "fotos",
    titulo: "Fotos",
    obligatoria: "no",
    ayuda: "El nombre de cada archivo de foto (cacao-1.jpg; cacao-2.jpg), que subes junto con esta planilla. Hasta 6. También sirve un enlace directo a una imagen (https://…jpg).",
    ancho: 34,
    ejemplo: ["cacao-1.jpg; cacao-2.jpg", "cascada.jpg", ""],
  },
];

/** Cuántas filas se aceptan en una planilla. Más de eso, en varias tandas. */
export const MAXIMO_FILAS = 300;
/** Las mismas seis fotos que admite el formulario (`imagenes-oferta.tsx`). */
export const MAXIMO_FOTOS = 6;

const FILAS_CON_DESPLEGABLE = 501;

// ---------------------------------------------------------------------------
// Escribir la plantilla
// ---------------------------------------------------------------------------

const OBLIGATORIA_TEXTO: Record<Obligatoria, string> = {
  siempre: "Sí",
  producto: "Sí, en productos",
  empresa: "Sí",
  no: "No",
};

/** El archivo `.xlsx` de la plantilla, listo para descargar. */
export function plantillaDeOfertas(): Uint8Array {
  const encabezado: CeldaEscrita[] = COLUMNAS.map((c) => ({
    v: c.titulo,
    s: c.obligatoria === "no" ? ESTILO.encabezado : ESTILO.obligatorio,
  }));
  const anchos = COLUMNAS.map((c) => c.ancho);

  const nombresListas = Object.keys(LISTAS) as (keyof typeof LISTAS)[];
  const largoMaximo = Math.max(...nombresListas.map((n) => LISTAS[n].length));
  const hojaListas = {
    nombre: "Listas",
    anchos: nombresListas.map(() => 28),
    filas: [
      nombresListas.map((n) => ({ v: TITULO_LISTA[n], s: ESTILO.encabezado })),
      ...Array.from({ length: largoMaximo }, (_, i) =>
        nombresListas.map((n) => ({ v: (LISTAS[n][i] as string | undefined) ?? "" })),
      ),
    ],
    fijarEncabezado: true,
  };

  const validaciones: ValidacionDeLista[] = COLUMNAS.flatMap((c, i) => {
    if (!c.lista) return [];
    const col = letraDeColumna(nombresListas.indexOf(c.lista));
    return [
      {
        columna: i,
        desde: 2,
        hasta: FILAS_CON_DESPLEGABLE,
        rango: `Listas!$${col}$2:$${col}$${LISTAS[c.lista].length + 1}`,
        aviso:
          c.lista === "paraQuien"
            ? "Si son varios, sepáralos con punto y coma."
            : "Elige un valor de la lista (hoja «Listas»).",
      },
    ];
  });

  return escribirLibro([
    {
      nombre: "Ofertas",
      anchos,
      filas: [encabezado],
      fijarEncabezado: true,
      validaciones,
    },
    {
      nombre: "Instrucciones",
      anchos: [34, 18, 90],
      filas: [
        [{ v: "Cómo llenar esta planilla", s: ESTILO.titulo }],
        [],
        [{ v: "1. Una fila por cada producto, experiencia o servicio, en la hoja «Ofertas». Mira la hoja «Ejemplo».", s: ESTILO.negrita }],
        [{ v: "2. Las columnas en terracota son obligatorias; las verdes, opcionales. Puedes borrar las que no uses.", s: ESTILO.negrita }],
        [{ v: "3. En «Fotos» escribe el nombre de cada archivo; al subir la planilla, eliges esas fotos y las unimos solas.", s: ESTILO.negrita }],
        [{ v: "4. Súbela en «Tus ofertas» → «Cargar desde Excel». Te mostramos cada fila antes de guardar y te decimos qué corregir.", s: ESTILO.negrita }],
        [{ v: "5. Las ofertas quedan en revisión: las revisamos antes de publicarlas, sobre todo lo que dicen de su impacto.", s: ESTILO.negrita }],
        [],
        [
          { v: "Columna", s: ESTILO.encabezado },
          { v: "¿Obligatoria?", s: ESTILO.encabezado },
          { v: "Qué escribir", s: ESTILO.encabezado },
        ],
        ...COLUMNAS.map((c) => [
          { v: c.titulo, s: ESTILO.negrita },
          { v: OBLIGATORIA_TEXTO[c.obligatoria] },
          { v: c.ayuda, s: ESTILO.nota },
        ]),
      ],
    },
    {
      nombre: "Ejemplo",
      anchos,
      filas: [
        encabezado,
        ...[0, 1, 2].map((i) => COLUMNAS.map((c) => ({ v: c.ejemplo[i] }))),
      ],
      fijarEncabezado: true,
    },
    hojaListas,
  ]);
}

const TITULO_LISTA: Record<keyof typeof LISTAS, string> = {
  tipo: "Tipo",
  categoria: "Categoría",
  subcategoria: "Subcategoría",
  departamento: "Departamento",
  siNo: "Sí / No",
  despacho: "Quién lo lleva",
  paraQuien: "Para quién",
};

// ---------------------------------------------------------------------------
// Leer una planilla llena
// ---------------------------------------------------------------------------

export interface FilaLeida {
  /** El número de fila en Excel, para decirle a la persona dónde mirar. */
  numero: number;
  valores: Record<string, string>;
}

export interface PlanillaLeida {
  filas: FilaLeida[];
  /** Títulos que no reconocimos: se ignoran, pero se dicen. */
  desconocidas: string[];
}

function alias(c: ColumnaPlantilla): string[] {
  return [normalizar(c.titulo), normalizar(c.titulo.replace(/\(.*?\)/g, "")), normalizar(c.clave)];
}

/**
 * Encuentra la hoja y la fila de encabezados, y devuelve las filas con datos.
 *
 * La hoja se llama «Ofertas» en la plantilla, pero se acepta cualquiera cuyo
 * encabezado tenga al menos tres columnas conocidas: alguien puede haber
 * copiado los datos a un libro propio. La hoja «Ejemplo» se salta siempre.
 */
export function leerPlanillaDeOfertas(hojas: Hoja[]): PlanillaLeida | { error: string } {
  const candidatas = [
    ...hojas.filter((h) => normalizar(h.nombre) === "ofertas"),
    ...hojas.filter((h) => !["ofertas", "ejemplo", "instrucciones", "listas"].includes(normalizar(h.nombre))),
  ];

  for (const hoja of candidatas) {
    for (let f = 0; f < Math.min(10, hoja.filas.length); f++) {
      const mapa = new Map<number, string>();
      const desconocidas: string[] = [];
      hoja.filas[f].forEach((titulo, i) => {
        const t = normalizar(titulo);
        if (!t) return;
        const col = COLUMNAS.find((c) => alias(c).includes(t));
        if (col) mapa.set(i, col.clave);
        else desconocidas.push(titulo.trim());
      });
      if (mapa.size < 3) continue;

      const filas: FilaLeida[] = [];
      for (let r = f + 1; r < hoja.filas.length; r++) {
        const valores: Record<string, string> = {};
        for (const [i, clave] of mapa) {
          const v = (hoja.filas[r][i] ?? "").trim();
          if (v) valores[clave] = v;
        }
        if (Object.keys(valores).length > 0) filas.push({ numero: r + 1, valores });
      }
      if (filas.length > MAXIMO_FILAS) {
        return {
          error: `La planilla tiene ${filas.length} filas y caben ${MAXIMO_FILAS} por vez. Pártela en varias y súbelas una tras otra.`,
        };
      }
      return { filas, desconocidas };
    }
  }
  return {
    error:
      "No encontramos la fila de títulos de la plantilla. Descarga la plantilla de nuevo y copia tus datos debajo de sus títulos.",
  };
}

const TIPOS: Record<string, ListingKind> = {
  producto: "product",
  product: "product",
  experiencia: "experience",
  experience: "experience",
  servicio: "service",
  service: "service",
};

function siNo(v: string | undefined): boolean {
  return ["si", "s", "x", "1", "true", "verdadero", "yes"].includes(normalizar(v ?? ""));
}

function lista(v: string | undefined): string[] {
  return (v ?? "")
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** «1,5» escrito como texto en una celda: el decimal con coma de Colombia. */
function decimal(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  return /^\d+,\d+$/.test(v.trim()) ? v.trim().replace(",", ".") : v;
}

const NUMERICOS = [
  "wholesaleMinQty",
  "stock",
  "co2KgSaved",
  "waterLitersSaved",
  "wasteKgReduced",
  "huellaCo2Kg",
  "durationHours",
  "minPeople",
  "maxPeople",
  "entregaDiasMin",
  "entregaDiasMax",
  "pesoKg",
  "largoCm",
  "anchoCm",
  "altoCm",
] as const;

const DINERO = ["priceCop", "wholesalePriceCop", "envioCop", "envioLocalCop", "envioAdicionalCop"] as const;

export interface FilaConvertida {
  /** Lo que se le manda a la acción de guardar, sin `images` (van aparte). */
  datos: Record<string, unknown>;
  /** Lo que no se pudo traducir: una categoría que no existe, un tipo mal escrito. */
  errores: Record<string, string>;
  /** Nombres de archivo o enlaces de la columna «Fotos». */
  fotos: string[];
}

/**
 * Traduce una fila de la planilla a los campos del formulario.
 *
 * Lo que escribe una persona («Gastronomía sostenible», «Sí», «Magdalena») se
 * pasa a lo que guarda la base (`gastronomia`, `true`, `Magdalena`), sin
 * tildes ni mayúsculas de por medio. Lo que no se reconoce queda en `errores`
 * con un mensaje que dice qué escribir; **validar el resto es trabajo del
 * esquema de siempre**, que corre después.
 */
export function convertirFila(valores: Record<string, string>): FilaConvertida {
  const errores: Record<string, string> = {};
  const datos: Record<string, unknown> = {};

  const tipo = TIPOS[normalizar(valores.kind ?? "")];
  if (valores.kind && !tipo) errores.kind = "Escribe Producto, Experiencia o Servicio";
  datos.kind = tipo ?? valores.kind ?? "";

  for (const campo of ["title", "summary", "description", "unit", "city", "transportadora", "meetingPoint", "deliveryTime", "aporteAmbiental", "consecuenciaAmbiental"]) {
    if (valores[campo] !== undefined) datos[campo] = valores[campo];
  }
  if (!datos.unit) datos.unit = "unidad";

  const categoria = valores.category
    ? CATEGORIAS.find(
        (c) => normalizar(c.label) === normalizar(valores.category) || c.id === normalizar(valores.category),
      )
    : undefined;
  if (valores.category && !categoria) {
    errores.category = `No reconocemos la categoría «${valores.category}». Elige una de la lista.`;
  }
  datos.category = categoria?.id ?? "";

  if (valores.subcategory) {
    const sub = categoriaPorId(categoria?.id)?.subcategorias.find(
      (s) => normalizar(s.label) === normalizar(valores.subcategory) || s.id === normalizar(valores.subcategory).replace(/ /g, "-"),
    );
    if (!sub) {
      errores.subcategory = categoria
        ? `«${valores.subcategory}» no es una subcategoría de ${categoria.label}.`
        : "Primero elige una categoría válida.";
    }
    datos.subcategory = sub?.id ?? "";
  } else datos.subcategory = "";

  for (const campo of DINERO) if (valores[campo] !== undefined) datos[campo] = valores[campo];
  for (const campo of NUMERICOS) if (valores[campo] !== undefined) datos[campo] = decimal(valores[campo]);

  datos.quoteOnly = siNo(valores.quoteOnly);

  const verticales = lista(valores.verticals).map((v) => {
    const n = normalizar(v);
    return VERTICALS.find((x) => x.id === n || normalizar(x.label) === n || normalizar(x.label).split(" ")[0] === n.split(" ")[0]);
  });
  if (verticales.some((v) => !v)) {
    errores.verticals = "En «Para quién» escribe Hoteles, Hostales, Restaurantes, Transporte o Agencias.";
  }
  datos.verticals = [...new Set(verticales.filter(Boolean).map((v) => v!.id))];

  if (valores.department) {
    const dep = DEPARTMENTS.find((d) => normalizar(d) === normalizar(valores.department));
    if (!dep) errores.department = `No reconocemos el departamento «${valores.department}». Elige uno de la lista.`;
    datos.department = dep ?? "";
  } else datos.department = "";

  if (valores.despacho) {
    const d = normalizar(valores.despacho);
    datos.despacho = d.includes("transport") ? "transportadora" : d.includes("yo") || d.includes("vendedor") ? "vendedor" : null;
    if (!datos.despacho) errores.despacho = "Escribe «Lo llevo yo» o «Por transportadora».";
  } else datos.despacho = "";

  datos.includes = lista(valores.includes).join("\n");
  datos.scope = lista(valores.scope).join("\n");
  datos.certifications = [];

  const fotos = lista(valores.fotos);
  if (fotos.length > MAXIMO_FOTOS) {
    errores.fotos = `Cada oferta admite hasta ${MAXIMO_FOTOS} fotos; en esta hay ${fotos.length}.`;
  }
  for (const f of fotos) {
    if (/^https?:\/\//i.test(f) && !/^https:\/\/\S+\.(jpe?g|png|webp)(\?\S*)?$/i.test(f)) {
      errores.fotos =
        "Un enlace de foto tiene que ser una imagen directa (https://…jpg, .png o .webp). Mejor: sube el archivo.";
    }
  }

  return { datos, errores, fotos };
}

/** El título de la columna de un campo, para decir el error donde se ve. */
export function tituloDeColumna(clave: string): string {
  return COLUMNAS.find((c) => c.clave === clave)?.titulo ?? clave;
}

/** ¿Es una foto que hay que subir (un nombre de archivo) y no un enlace? */
export function esArchivo(foto: string): boolean {
  return !/^https?:\/\//i.test(foto);
}

/** Para emparejar «Cacao 1.JPG» de la planilla con el archivo `cacao 1.jpg` elegido. */
export function claveDeArchivo(nombre: string): string {
  return nombre.split(/[\\/]/).pop()!.trim().toLowerCase();
}
