/**
 * El tema de color elegido por la persona: qué se guarda y cómo se lee.
 *
 * Cookie y no `localStorage` por la misma razón que el consentimiento
 * (`consentimiento.ts`): la tiene que leer **el servidor**, para pintar el
 * `<html>` ya con `data-tema="oscuro"` y que la página no destelle en claro
 * antes de oscurecerse.
 *
 * Sin cookie, el sitio es claro: es el tema con el que se diseñó y el que se
 * enseña a quien no ha elegido nada.
 */

export type Tema = "claro" | "oscuro";

export const COOKIE_TEMA = "sgr_tema";

/** Un año, como la decisión de cookies. */
export const VIDA_TEMA = 60 * 60 * 24 * 365;

/** Cualquier valor que no sea exactamente «oscuro» es claro. */
export function leerTema(valor: string | undefined): Tema {
  return valor === "oscuro" ? "oscuro" : "claro";
}
