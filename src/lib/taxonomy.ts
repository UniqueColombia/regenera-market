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

/** Categoría transversal del listing, independiente de la vertical. */
export const CATEGORIES = [
  "Amenities",
  "Capacitación",
  "Empaques",
  "Energía",
  "Equipamiento",
  "Experiencias",
  "Mantenimiento",
  "Marketing",
  "Mobiliario",
  "Servicios",
  "Tecnología",
] as const;

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
 * Niveles de verificación. El nombre es deliberadamente regenerativo en vez de
 * bronce/plata/oro: comunica progresión ecológica, no jerarquía comercial.
 */
export const TIERS: Record<
  Tier,
  { label: string; min: number; description: string }
> = {
  unverified: {
    label: "Sin verificar",
    min: 0,
    description: "Aún no completa la evaluación de sostenibilidad.",
  },
  semilla: {
    label: "Semilla",
    min: 40,
    description:
      "Prácticas sostenibles documentadas y compromiso verificado de mejora.",
  },
  raiz: {
    label: "Raíz",
    min: 60,
    description:
      "Impacto medido, cadena de suministro local y beneficio comunitario demostrable.",
  },
  bosque: {
    label: "Bosque",
    min: 80,
    description:
      "Impacto neto positivo verificado con certificación externa vigente.",
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
