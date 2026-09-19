import type { Metadata } from "next";

/**
 * Lo que toda página pública tiene que declarar, en un solo sitio.
 *
 * ## La URL canónica
 *
 * Next **no** genera etiquetas canónicas solo. Sin ellas, la misma página
 * indexa varias veces: `/catalogo`, `/catalogo?vertical=hoteles` y
 * `/catalogo?utm_source=…` son tres URLs distintas con el mismo contenido, y el
 * buscador reparte la autoridad entre las tres en vez de sumarla en una. En un
 * catálogo con filtros por GET —que es lo que es el nuestro, a propósito
 * (invariante 19 de `dominio-regenera`)— eso no es un caso raro: es el caso
 * normal.
 *
 * Se resuelve contra `metadataBase`, que el layout toma de
 * `NEXT_PUBLIC_SITE_URL`. Por eso aquí se pasa la ruta y nunca el dominio: una
 * canónica con el dominio escrito a mano apunta a producción desde el entorno
 * de pruebas, y entonces le está diciendo al buscador que indexe otra cosa.
 *
 * ## Lo que NO hace
 *
 * No pone `robots`. Una página privada (`/cuenta`, `/admin`, una orden) no se
 * arregla con una canónica: se marca `index: false`, y eso lo declara cada
 * página porque es una decisión suya. Para eso está `privada()`.
 */

/** Metadatos de una página pública: canónica y `og:url` del mismo sitio. */
export function publica(ruta: string): Metadata {
  return {
    alternates: { canonical: ruta },
    openGraph: { url: ruta },
  };
}

/**
 * Metadatos de una página que no debe salir en ningún buscador.
 *
 * `follow` se deja puesto: los enlaces de `/cuenta` van a páginas públicas y no
 * hay motivo para cortar el rastreo, solo para no listar esta.
 */
export function privada(): Metadata {
  return { robots: { index: false, follow: true } };
}

/**
 * Los buscadores cortan la descripción alrededor de los 155 caracteres.
 *
 * No trunca a la fuerza —una frase cortada a mitad se lee peor que una larga—:
 * avisa en desarrollo y deja pasar. Es una ayuda para quien escribe, no una
 * regla que pueda tumbar un build.
 */
export function descripcion(texto: string): string {
  if (process.env.NODE_ENV === "development" && texto.length > 160) {
    console.warn(
      `[seo] Una descripción de ${texto.length} caracteres se va a cortar en el buscador: «${texto.slice(0, 60)}…»`,
    );
  }
  return texto;
}
