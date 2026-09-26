/**
 * Los avisos que puede dejar una acción para la pantalla siguiente.
 *
 * Viven aparte de `avisos.ts` porque ese importa `next/headers`, que no puede
 * viajar al navegador, y `AvisoAlVolver` —que es cliente— necesita leer esta
 * tabla. Es el mismo motivo por el que `src/app/vender/limites.ts` existe.
 */
export const COOKIE_AVISO = "sgr_aviso";

export const AVISOS = {
  entrada: {
    titulo: "Entraste",
    texto: "Tu sesión está abierta en este dispositivo.",
  },
  salida: {
    titulo: "Cerraste sesión",
    texto: "Hasta pronto. Tu cesta sigue guardada en este navegador.",
  },
} as const;

export type AvisoId = keyof typeof AVISOS;

export function esAviso(v: string | undefined): v is AvisoId {
  return v !== undefined && Object.hasOwn(AVISOS, v);
}
