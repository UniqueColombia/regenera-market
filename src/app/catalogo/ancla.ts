/**
 * El `id` del bloque de resultados del catálogo: destino del salto al tocar una
 * subcategoría, del `action` del formulario y de cada enlace de página.
 *
 * Vive en un archivo normal, no en `navegacion.tsx`: lo que exporta un archivo
 * `"use client"` le llega a un Server Component como referencia, no como su
 * valor, y `page.tsx` habría pintado otra cosa en el `action` y en los enlaces
 * (la trampa de los `LIMITES` de `/vender`, skill `componentizacion`).
 */
export const ID_RESULTADOS = "resultados";
