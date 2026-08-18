import { CERTIFICATIONS, TIERS } from "./taxonomy";
import type { Tier } from "./types";

/**
 * Motor de verificación regenerativa.
 *
 * El proveedor responde un cuestionario y adjunta evidencia; un admin la revisa
 * y aprueba. El puntaje resultante (0-100) determina el nivel visible en cada
 * ficha. Es deliberadamente auditable: cada punto sale de una respuesta
 * concreta, nunca de una impresión general.
 *
 * Las certificaciones externas suman en su propia dimensión, con tope, para que
 * un proveedor pequeño sin plata para certificarse pueda igual llegar a Raíz por
 * prácticas reales — y para que una certificación comprada no baste sola.
 */

export interface Question {
  id: string;
  text: string;
  help?: string;
  /** Puntos que aporta cada opción, en orden */
  options: { label: string; points: number }[];
  /** Exige documento de respaldo para que el admin pueda validarla */
  requiresEvidence?: boolean;
}

export interface Dimension {
  id: string;
  label: string;
  /** Peso sobre 100 */
  weight: number;
  description: string;
  questions: Question[];
}

const YES_NO = (yes: number) => [
  { label: "Sí", points: yes },
  { label: "Parcialmente", points: Math.round(yes / 2) },
  { label: "No", points: 0 },
];

export const DIMENSIONS: Dimension[] = [
  {
    id: "ambiental",
    label: "Gestión ambiental",
    weight: 25,
    description:
      "Cómo se gestionan agua, energía, residuos y emisiones en la operación.",
    questions: [
      {
        id: "amb_residuos",
        text: "¿Separa y aprovecha los residuos de su operación?",
        options: [
          { label: "Sí, con medición y aprovechamiento verificable", points: 10 },
          { label: "Separa en la fuente, sin medición", points: 6 },
          { label: "De forma informal", points: 3 },
          { label: "No", points: 0 },
        ],
        requiresEvidence: true,
      },
      {
        id: "amb_energia",
        text: "¿Qué proporción de su energía proviene de fuentes renovables?",
        options: [
          { label: "Más del 50%", points: 10 },
          { label: "Entre 10% y 50%", points: 6 },
          { label: "Menos del 10%", points: 2 },
          { label: "Ninguna", points: 0 },
        ],
      },
      {
        id: "amb_agua",
        text: "¿Tiene medidas activas de ahorro o reutilización de agua?",
        options: YES_NO(5),
      },
      {
        id: "amb_huella",
        text: "¿Mide la huella de carbono de su producto o servicio?",
        options: [
          { label: "Sí, medida y verificada por un tercero", points: 5 },
          { label: "Sí, medición propia", points: 3 },
          { label: "No", points: 0 },
        ],
        requiresEvidence: true,
      },
    ],
  },
  {
    id: "local",
    label: "Economía local y comercio justo",
    weight: 20,
    description:
      "Cuánto del valor generado se queda en el territorio donde opera.",
    questions: [
      {
        id: "loc_proveedores",
        text: "¿Qué porcentaje de sus insumos compra en el departamento donde opera?",
        options: [
          { label: "Más del 70%", points: 10 },
          { label: "Entre 30% y 70%", points: 6 },
          { label: "Menos del 30%", points: 2 },
        ],
      },
      {
        id: "loc_empleo",
        text: "¿Su equipo es contratado en la comunidad local?",
        options: [
          { label: "Sí, más del 80% del equipo", points: 6 },
          { label: "Parcialmente", points: 3 },
          { label: "No", points: 0 },
        ],
      },
      {
        id: "loc_precio",
        text: "¿Paga por encima del precio de mercado a productores primarios?",
        options: YES_NO(4),
        requiresEvidence: true,
      },
    ],
  },
  {
    id: "circularidad",
    label: "Ciclo de vida y circularidad",
    weight: 20,
    description:
      "De qué está hecho lo que vende y qué pasa con ello al final de su vida útil.",
    questions: [
      {
        id: "cir_materiales",
        text: "¿Sus materiales son reciclados, renovables o de origen certificado?",
        options: [
          { label: "Sí, la totalidad", points: 8 },
          { label: "La mayoría", points: 5 },
          { label: "Una parte", points: 2 },
          { label: "No", points: 0 },
        ],
        requiresEvidence: true,
      },
      {
        id: "cir_empaque",
        text: "¿El empaque es compostable, retornable o reutilizable?",
        options: YES_NO(6),
      },
      {
        id: "cir_fin_vida",
        text: "¿Ofrece recolección, reparación o recompra al final de la vida útil?",
        options: YES_NO(6),
      },
    ],
  },
  {
    id: "comunidad",
    label: "Cultura y comunidad",
    weight: 15,
    description:
      "Beneficio real para las comunidades y respeto por el patrimonio cultural.",
    questions: [
      {
        id: "com_beneficio",
        text: "¿Una parte de sus ingresos se reinvierte en la comunidad?",
        options: [
          { label: "Sí, con destinación documentada", points: 7 },
          { label: "Sí, de manera informal", points: 3 },
          { label: "No", points: 0 },
        ],
        requiresEvidence: true,
      },
      {
        id: "com_saberes",
        text: "¿Su oferta incorpora saberes tradicionales con consentimiento y retribución?",
        options: [
          { label: "Sí, con acuerdo escrito", points: 5 },
          { label: "Sí, sin acuerdo formal", points: 2 },
          { label: "No aplica", points: 3 },
        ],
      },
      {
        id: "com_inclusion",
        text: "¿Emplea o es liderada por mujeres, jóvenes o grupos históricamente excluidos?",
        options: YES_NO(3),
      },
    ],
  },
  {
    id: "gobernanza",
    label: "Gobernanza y transparencia",
    weight: 10,
    description: "Formalidad, trazabilidad y disposición a ser auditado.",
    questions: [
      {
        id: "gob_formal",
        text: "¿Está formalizado (RUT vigente y matrícula mercantil)?",
        options: YES_NO(4),
        requiresEvidence: true,
      },
      {
        id: "gob_politica",
        text: "¿Tiene una política de sostenibilidad publicada?",
        options: YES_NO(3),
      },
      {
        id: "gob_auditoria",
        text: "¿Acepta visitas de verificación en sitio por parte de Regenera Market?",
        options: YES_NO(3),
      },
    ],
  },
];

/** Puntaje máximo alcanzable por cuestionario, sin contar certificaciones. */
export const CERT_DIMENSION_WEIGHT = 10;

function maxRawFor(dimension: Dimension): number {
  return dimension.questions.reduce(
    (sum, q) => sum + Math.max(...q.options.map((o) => o.points)),
    0,
  );
}

export interface ScoreBreakdown {
  total: number;
  tier: Tier;
  dimensions: {
    id: string;
    label: string;
    weight: number;
    /** 0-100 dentro de la dimensión */
    percent: number;
    /** Puntos ponderados que aporta al total */
    contribution: number;
  }[];
}

/**
 * Calcula el puntaje total a partir de las respuestas del cuestionario y las
 * certificaciones ya verificadas.
 *
 * @param answers  { [questionId]: índice de la opción elegida }
 * @param verifiedCertifications códigos de CERTIFICATIONS validados por un admin
 */
export function scoreProvider(
  answers: Record<string, number>,
  verifiedCertifications: string[] = [],
): ScoreBreakdown {
  const dimensions = DIMENSIONS.map((dim) => {
    const max = maxRawFor(dim);
    const raw = dim.questions.reduce((sum, q) => {
      const choice = answers[q.id];
      const option = choice === undefined ? undefined : q.options[choice];
      return sum + (option?.points ?? 0);
    }, 0);
    const percent = max === 0 ? 0 : (raw / max) * 100;
    return {
      id: dim.id,
      label: dim.label,
      weight: dim.weight,
      percent: Math.round(percent),
      contribution: (percent / 100) * dim.weight,
    };
  });

  // Las certificaciones tienen tope: acumular sellos no compensa una mala operación.
  const certPoints = verifiedCertifications.reduce(
    (sum, code) => sum + (CERTIFICATIONS[code]?.points ?? 0),
    0,
  );
  const certPercent = Math.min(100, (certPoints / 20) * 100);
  dimensions.push({
    id: "certificaciones",
    label: "Certificaciones verificadas",
    weight: CERT_DIMENSION_WEIGHT,
    percent: Math.round(certPercent),
    contribution: (certPercent / 100) * CERT_DIMENSION_WEIGHT,
  });

  const total = Math.round(
    dimensions.reduce((sum, d) => sum + d.contribution, 0),
  );

  return { total, tier: tierForScore(total), dimensions };
}

export function tierForScore(score: number): Tier {
  if (score >= TIERS.bosque.min) return "bosque";
  if (score >= TIERS.raiz.min) return "raiz";
  if (score >= TIERS.semilla.min) return "semilla";
  return "unverified";
}

/** Total de preguntas, para mostrar progreso en el onboarding. */
export const TOTAL_QUESTIONS = DIMENSIONS.reduce(
  (n, d) => n + d.questions.length,
  0,
);
