/**
 * Las reacciones de la Comunidad.
 *
 * ## Esta tabla tiene un gemelo en Postgres
 *
 * Los cinco identificadores son los mismos del `check` de
 * `community_reactions.kind` (migración 0008). El de la base es la barrera —vale
 * aunque alguien escriba directo contra PostgREST— y el de aquí es el que pinta
 * el icono y la etiqueta. **Si agregas una, agrégala en los dos sitios**: sin la
 * de allá, la reacción rebota con un error de restricción; sin la de aquí, la
 * base acepta un valor que la pantalla no sabe dibujar.
 *
 * ## Por qué se pueden marcar varias a la vez
 *
 * La 0007 tenía una sola reacción y una clave primaria `(post_id, user_id)` que
 * imponía «una persona, una reacción». Marcar «me dio una idea» obligaba
 * entonces a renunciar a «me sirve», y lo que la gente quiere decir de una
 * publicación útil suele ser las dos cosas. La clave primaria pasó a incluir el
 * tipo, así que lo que sigue siendo único es **cada reacción** de cada persona:
 * un doble toque desde un teléfono con mala señal sigue sin contar dos.
 *
 * ## El orden importa
 *
 * Es el orden en que salen en la tarjeta, y es el de uso esperado, no el
 * alfabético: la semilla primero porque es la que ya existía y la que le da
 * nombre al gesto en esta plataforma.
 */

import type { LucideIcon } from "lucide-react";
import { Award, HeartHandshake, Lightbulb, Sprout, ThumbsUp } from "lucide-react";

export const REACCIONES = [
  {
    id: "semilla",
    /** Lo que lee quien pasa el puntero por encima, en primera persona. */
    etiqueta: "Me sirve",
    icono: Sprout,
  },
  {
    id: "megusta",
    etiqueta: "Me gusta",
    icono: ThumbsUp,
  },
  {
    id: "bien_hecho",
    etiqueta: "Bien hecho",
    icono: Award,
  },
  {
    id: "idea",
    etiqueta: "Me dio una idea",
    icono: Lightbulb,
  },
  {
    id: "apoyo",
    etiqueta: "Cuenta conmigo",
    icono: HeartHandshake,
  },
] as const satisfies readonly {
  id: string;
  etiqueta: string;
  icono: LucideIcon;
}[];

export type Reaccion = (typeof REACCIONES)[number];
export type ReaccionId = Reaccion["id"];

const IDS = REACCIONES.map((r) => r.id) as readonly string[];

/**
 * ¿Este texto es una de las cinco?
 *
 * Se usa al leer de la base y al recibir del navegador. En los dos casos el
 * valor viene de fuera de TypeScript, y `as ReaccionId` sobre algo que no lo sea
 * mete un id inventado hasta la tarjeta, donde se cae al buscar el icono.
 */
export function esReaccion(valor: unknown): valor is ReaccionId {
  return typeof valor === "string" && IDS.includes(valor);
}

/**
 * El `{"semilla": 12}` de `community_posts.reaction_counts`, limpio.
 *
 * Descarta claves desconocidas y valores que no sean números positivos: la
 * columna es jsonb, así que su forma la garantiza el trigger que la escribe y no
 * el tipo de la columna. Confiar en ella sin mirar es confiar en que nadie va a
 * escribir nunca ahí a mano.
 */
export function leerConteos(valor: unknown): Partial<Record<ReaccionId, number>> {
  if (!valor || typeof valor !== "object") return {};
  const salida: Partial<Record<ReaccionId, number>> = {};
  for (const [clave, n] of Object.entries(valor as Record<string, unknown>)) {
    if (esReaccion(clave) && typeof n === "number" && n > 0) {
      salida[clave] = Math.floor(n);
    }
  }
  return salida;
}

/** «12 personas», «1 persona». Para el título del botón, que solo muestra la cifra. */
export function personas(n: number): string {
  return n === 1 ? "1 persona" : `${n} personas`;
}
