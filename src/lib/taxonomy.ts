import type { ListingKind, Tier, Vertical, ProviderTrait } from "./types";

/**
 * Taxonomía heredada del prototipo: cinco verticales de negocio turístico, cada
 * una con sus cuatro necesidades típicas. Las subcategorías son de navegación
 * (el menú "Categorías"); la categoría del listing es transversal.
 */
export const VERTICALS: {
  id: Vertical;
  label: string;
  blurb: string;
  subcategories: { slug: string; label: string }[];
}[] = [
  {
    id: "hoteles",
    label: "Hoteles y Eco Lodges",
    blurb: "Amenities ecológicos, energía limpia y decoración sostenible",
    subcategories: [
      { slug: "energia-eficiencia", label: "Energía y eficiencia" },
      { slug: "aseo-verde", label: "Aseo verde" },
      { slug: "decoracion-sostenible", label: "Decoración sostenible" },
      { slug: "amenities-ecologicos", label: "Amenities ecológicos" },
    ],
  },
  {
    id: "hostales",
    label: "Hostales y Glampings",
    blurb: "Kits sostenibles, mobiliario natural y soluciones de camping",
    subcategories: [
      { slug: "kits-bienvenida", label: "Kits de bienvenida" },
      { slug: "camping-ecologico", label: "Camping ecológico" },
      { slug: "energia-solar", label: "Energía solar" },
      { slug: "mobiliario-natural", label: "Mobiliario natural" },
    ],
  },
  {
    id: "restaurantes",
    label: "Restaurantes y Cafés",
    blurb: "Utensilios eco, insumos orgánicos y empaques biodegradables",
    subcategories: [
      { slug: "cocina-sostenible", label: "Cocina sostenible" },
      { slug: "insumos-organicos", label: "Insumos orgánicos" },
      { slug: "limpieza-ecologica", label: "Limpieza ecológica" },
      { slug: "huertas-urbanas", label: "Huertas urbanas" },
    ],
  },
  {
    id: "transporte",
    label: "Transporte Turístico",
    blurb: "Eficiencia energética, branding verde y mantenimiento sostenible",
    subcategories: [
      { slug: "mantenimiento-verde", label: "Mantenimiento verde" },
      { slug: "eficiencia-energetica", label: "Eficiencia energética" },
      { slug: "branding-sostenible", label: "Branding sostenible" },
      { slug: "formacion", label: "Formación" },
    ],
  },
  {
    id: "agencias",
    label: "Agencias y Operadores",
    blurb: "Merchandising eco, experiencias regenerativas y consultoría",
    subcategories: [
      { slug: "merchandising-eco", label: "Merchandising eco" },
      { slug: "experiencias-regenerativas", label: "Experiencias regenerativas" },
      { slug: "material-pop", label: "Material POP" },
      { slug: "consultoria", label: "Consultoría" },
    ],
  },
];

export const VERTICAL_LABEL: Record<Vertical, string> = Object.fromEntries(
  VERTICALS.map((v) => [v.id, v.label]),
) as Record<Vertical, string>;

/**
 * Categorías del catálogo: **qué resuelve** una oferta, no a quién le sirve
 * (eso son las verticales de arriba).
 *
 * Sustituyen a la lista plana de once («Amenities», «Tecnología»,
 * «Servicios»…) que se usó hasta la migración 0012. Aquella agrupaba por forma
 * del producto, y un hotel no busca «tecnología»: busca ahorrar agua o bajar la
 * factura de luz. Estas agrupan por el problema que resuelven, que es como
 * pregunta quien compra.
 *
 * **En `listings.category` se guarda el `id`**, no la etiqueta: la etiqueta se
 * puede reescribir sin tocar la base ni romper los enlaces `?category=agua` que
 * ya circulen. La 0012 convierte las filas viejas; si aparece un valor que no
 * esté aquí, `categoriaPorId()` devuelve `undefined` y quien pinta enseña el
 * texto tal cual en vez de fallar.
 *
 * `avanzada` marca lo que solo puede ofrecer un proveedor con la evaluación
 * verificada por Seregenera: vender consultoría o una implementación es vender
 * criterio, y ese criterio lo tiene que haber revisado alguien. Lo impone el
 * trigger `listings_proteger_proveedor` de la 0012, no este archivo: esto solo
 * sirve para no ofrecer en pantalla lo que la base va a rechazar.
 */
export interface Categoria {
  id: string;
  label: string;
  /** Lo que se lee al pasar por encima: a qué hace referencia la categoría. */
  descripcion: string;
  subcategorias: { id: string; label: string }[];
  avanzada?: boolean;
}

export const CATEGORIAS: readonly Categoria[] = [
  {
    id: "agua",
    label: "Agua",
    descripcion:
      "Todo lo que ayuda a gastar menos agua y a devolverla limpia: ahorro, tratamiento, reutilización, captación de lluvia y monitoreo de consumo.",
    subcategorias: [
      { id: "ahorro-agua", label: "Ahorro de agua" },
      { id: "tratamiento-agua", label: "Tratamiento" },
      { id: "reutilizacion-agua", label: "Reutilización" },
      { id: "captacion-agua", label: "Captación de lluvia" },
      { id: "monitoreo-agua", label: "Monitoreo de consumo" },
    ],
  },
  {
    id: "energia",
    label: "Energía",
    descripcion:
      "Iluminación eficiente, paneles solares, sensores de movimiento, eficiencia energética y monitoreo: lo que baja la factura y la huella a la vez.",
    subcategorias: [
      { id: "iluminacion", label: "Iluminación eficiente" },
      { id: "paneles-solares", label: "Paneles solares" },
      { id: "eficiencia-energetica", label: "Eficiencia energética" },
      { id: "sensores", label: "Sensores de movimiento" },
      { id: "monitoreo-energia", label: "Monitoreo de consumo" },
    ],
  },
  {
    id: "residuos",
    label: "Residuos",
    descripcion:
      "Compostaje, reciclaje, recolección de aceite usado, separación en la fuente y economía circular: que lo que sobra vuelva a servir.",
    subcategorias: [
      { id: "compostaje", label: "Compostaje" },
      { id: "reciclaje", label: "Reciclaje" },
      { id: "aceite-usado", label: "Aceite usado" },
      { id: "separacion", label: "Separación en la fuente" },
      { id: "economia-circular", label: "Economía circular" },
    ],
  },
  {
    id: "habitacion",
    label: "Habitación y hospitalidad",
    descripcion:
      "Lo que usa el huésped: amenities (champú, cremas), dispensadores ecológicos, toallas y sábanas de algodón orgánico, limpieza ecológica, kits de bienvenida y mobiliario natural.",
    subcategorias: [
      { id: "amenities", label: "Amenities" },
      { id: "dispensadores", label: "Dispensadores ecológicos" },
      { id: "textiles", label: "Textiles orgánicos" },
      { id: "limpieza", label: "Limpieza ecológica" },
      { id: "kits-bienvenida", label: "Kits de bienvenida" },
      { id: "mobiliario", label: "Mobiliario y camping" },
    ],
  },
  {
    id: "gastronomia",
    label: "Gastronomía sostenible",
    descripcion:
      "Empaques compostables, alimentos locales, productos orgánicos, café y cacao de origen, y vajilla reutilizable para cocinas y restaurantes.",
    subcategorias: [
      { id: "empaques", label: "Empaques" },
      { id: "alimentos-locales", label: "Alimentos locales" },
      { id: "organicos", label: "Productos orgánicos" },
      { id: "cafe-cacao", label: "Café y cacao" },
      { id: "vajilla", label: "Vajilla reutilizable" },
    ],
  },
  {
    id: "territorio",
    label: "Territorio y regeneración",
    descripcion:
      "Artesanías, agroecología, educación ambiental, reforestación, restauración de ecosistemas y experiencias con comunidades locales.",
    subcategorias: [
      { id: "artesanias", label: "Artesanías" },
      { id: "agroecologia", label: "Agroecología" },
      { id: "educacion-ambiental", label: "Educación ambiental" },
      { id: "reforestacion", label: "Reforestación" },
      { id: "restauracion", label: "Restauración" },
      { id: "experiencias-comunitarias", label: "Experiencias comunitarias" },
    ],
  },
  {
    id: "movilidad",
    label: "Movilidad sostenible",
    descripcion:
      "Para flotas y transporte turístico: mantenimiento verde, eficiencia de combustible, calidad del aire y limpieza de vehículos.",
    subcategorias: [
      { id: "mantenimiento-verde", label: "Mantenimiento verde" },
      { id: "eficiencia-flota", label: "Eficiencia de flota" },
      { id: "calidad-aire", label: "Calidad del aire" },
      { id: "limpieza-vehiculos", label: "Limpieza de vehículos" },
    ],
  },
  {
    id: "consultoria",
    label: "Consultoría e implementación",
    descripcion:
      "Diagnósticos, acompañamiento a certificaciones, implementación de sistemas y formación de equipos. Solo la ofrecen proveedores con el sello verificado por Seregenera.",
    subcategorias: [
      { id: "diagnostico", label: "Diagnóstico y auditoría" },
      { id: "certificaciones", label: "Acompañamiento a certificaciones" },
      { id: "implementacion", label: "Implementación de sistemas" },
      { id: "formacion", label: "Formación de equipos" },
    ],
    avanzada: true,
  },
];

/** Los `id`, para validar con Zod: `z.enum(IDS_CATEGORIA)`. */
export const IDS_CATEGORIA = CATEGORIAS.map((c) => c.id) as [string, ...string[]];

export function categoriaPorId(id: string | undefined): Categoria | undefined {
  return id ? CATEGORIAS.find((c) => c.id === id) : undefined;
}

/**
 * La etiqueta de una categoría guardada.
 *
 * Un valor desconocido se devuelve tal cual: puede ser una fila anterior a la
 * 0012 que la conversión no alcanzó, y enseñar «Mobiliario» es mejor que enseñar
 * un hueco o reventar la tarjeta.
 */
export function categoriaLabel(id: string): string {
  return categoriaPorId(id)?.label ?? id;
}

export function subcategoriaLabel(
  categoria: string,
  sub: string | undefined,
): string | undefined {
  if (!sub) return undefined;
  return categoriaPorId(categoria)?.subcategorias.find((s) => s.id === sub)?.label;
}

/**
 * El giro de una empresa: **qué es y qué ofrece**, no qué vende en concreto.
 *
 * Se elige al dar de alta la empresa y se puede cambiar en `/cuenta/empresa`.
 * Una ecoposada como La Jorara es alojamiento, restaurante, transporte y tours a
 * la vez; un taller de jabones es solo «productos».
 *
 * **Cuántos giros caben depende del nivel** (`GIROS_POR_NIVEL`). Ofrecerlo todo
 * a la vez —alojar, dar de comer, llevar y guiar— es lo que hace un proveedor
 * con recorrido, y el nivel es justamente la medida del recorrido. Lo impone el
 * trigger `providers_limitar_giros` de la 0012; esta tabla es su gemelo para
 * pintarlo, igual que `src/lib/niveles.ts` lo es de la 0006.
 */
export const GIROS = [
  { id: "alojamiento", label: "Alojamiento y hospedaje" },
  { id: "restaurante", label: "Restaurante y gastronomía" },
  { id: "transporte", label: "Transporte turístico" },
  { id: "tours", label: "Tours y experiencias" },
  { id: "turismo", label: "Agencia u operador turístico" },
  { id: "productos", label: "Productos sostenibles" },
  { id: "servicios", label: "Servicios técnicos y mantenimiento" },
  {
    id: "consultoria",
    label: "Consultoría e implementación",
    avanzado: true,
  },
] as const satisfies readonly { id: string; label: string; avanzado?: boolean }[];

export type GiroId = (typeof GIROS)[number]["id"];

export const IDS_GIRO = GIROS.map((g) => g.id) as [GiroId, ...GiroId[]];

export function giroLabel(id: string): string {
  return GIROS.find((g) => g.id === id)?.label ?? id;
}

/**
 * Cuántos giros puede declarar una empresa según su nivel.
 *
 * `unverified` cuenta como Semilla: ante la duda, el límite estrecho. Bosque no
 * tiene tope práctico — son todos los que hay.
 *
 * **Espeja `limite_de_giros()` de la migración 0012.** Si se cambia uno sin el
 * otro, la pantalla ofrece una casilla que la base rechaza al guardar.
 */
export const GIROS_POR_NIVEL: Record<Tier, number> = {
  unverified: 2,
  semilla: 2,
  raiz: 3,
  bosque: GIROS.length,
};

export const KIND_LABEL: Record<ListingKind, string> = {
  product: "Producto",
  experience: "Experiencia",
  service: "Servicio",
};

export const KIND_PLURAL: Record<ListingKind, string> = {
  product: "Productos",
  experience: "Experiencias",
  service: "Servicios",
};

/**
 * Los tres niveles, para pintarlos. El nombre es deliberadamente regenerativo
 * en vez de bronce/plata/oro: comunica progresión ecológica, no jerarquía
 * comercial.
 *
 * **Los umbrales y la comisión no están aquí**, están en `src/lib/niveles.ts`,
 * que es el gemelo de la migración 0006. Esta tabla tenía un `min` con el
 * puntaje de sostenibilidad desde el que se otorgaba cada nivel, y dejó de ser
 * verdad el día que el nivel pasó a salir de los puntos de experiencia. Se
 * quitó en vez de dejarlo sin usar: un número a mano que ya no manda es lo que
 * hace que alguien vuelva a filtrar por él sin que nada se queje.
 */
export const TIERS: Record<Tier, { label: string; description: string }> = {
  unverified: {
    label: "Sin verificar",
    description:
      "Ficha anterior al sistema de niveles. Ningún proveedor nuevo entra así.",
  },
  semilla: {
    label: "Semilla",
    description:
      "Acaba de llegar: publica y vende desde hoy, y su historial empieza ahora.",
  },
  raiz: {
    label: "Raíz",
    description:
      "Con recorrido: pedidos entregados, perfil completo y buenas reseñas.",
  },
  bosque: {
    label: "Bosque",
    description:
      "Referente del marketplace, con historial largo, sostenido y verificable.",
  },
};

export const TRAIT_LABEL: Record<ProviderTrait, string> = {
  women_led: "Liderado por mujeres",
  community_owned: "Propiedad comunitaria",
  indigenous: "Comunidad indígena",
  afro: "Comunidad afrocolombiana",
  campesino: "Economía campesina",
  b_corp: "Empresa B",
  rural: "Origen rural",
};

/**
 * Certificaciones reconocidas. `points` alimenta la dimensión "certificaciones"
 * del puntaje; solo cuentan si un admin verificó el documento vigente.
 */
export const CERTIFICATIONS: Record<
  string,
  { label: string; issuer: string; points: number }
> = {
  "b-corp": { label: "B Corp", issuer: "B Lab", points: 10 },
  "rainforest-alliance": {
    label: "Rainforest Alliance",
    issuer: "Rainforest Alliance",
    points: 10,
  },
  "fair-trade": { label: "Fair Trade", issuer: "Fairtrade International", points: 8 },
  "comercio-justo": { label: "Comercio Justo", issuer: "WFTO", points: 8 },
  fsc: { label: "FSC", issuer: "Forest Stewardship Council", points: 8 },
  "nts-ts": {
    label: "NTS-TS",
    issuer: "MinComercio / ICONTEC",
    points: 10,
  },
  "iso-14001": { label: "ISO 14001", issuer: "ISO", points: 8 },
  gots: { label: "GOTS", issuer: "Global Organic Textile Standard", points: 7 },
  "grs-recycled": { label: "GRS Recycled", issuer: "Textile Exchange", points: 6 },
  "carbon-neutral": { label: "Carbono Neutral", issuer: "ICONTEC", points: 7 },
  "ok-compost": { label: "OK Compost", issuer: "TÜV Austria", points: 6 },
  "bpi-compostable": { label: "BPI Compostable", issuer: "BPI", points: 6 },
  "cradle-to-cradle": { label: "Cradle to Cradle", issuer: "C2C Institute", points: 9 },
  ecolabel: { label: "EU Ecolabel", issuer: "Comisión Europea", points: 7 },
  "energy-star": { label: "Energy Star", issuer: "EPA", points: 5 },
  watersense: { label: "WaterSense", issuer: "EPA", points: 5 },
  biosphere: { label: "Biosphere", issuer: "Responsible Tourism Institute", points: 9 },
  mincomercio: { label: "MinComercio", issuer: "MinComercio Colombia", points: 5 },
};

export function certLabel(code: string): string {
  return CERTIFICATIONS[code]?.label ?? code;
}

/** Departamentos con oferta turística relevante, para el filtro de origen. */
export const DEPARTMENTS = [
  "Amazonas",
  "Antioquia",
  "Atlántico",
  "Bolívar",
  "Boyacá",
  "Caldas",
  "Cauca",
  "Cesar",
  "Chocó",
  "Cundinamarca",
  "Huila",
  "La Guajira",
  "Magdalena",
  "Meta",
  "Nariño",
  "Quindío",
  "Risaralda",
  "Santander",
  "Tolima",
  "Valle del Cauca",
] as const;
