/**
 * Los datos de la empresa que opera Seregenera, en un solo sitio.
 *
 * Aparecen en el pie de página, en las dos páginas legales, en los datos
 * estructurados que lee un buscador y en `/llms.txt`. Escritos cinco veces
 * acaban siendo cinco correos distintos, y el que quede viejo va a ser justo el
 * de la política de privacidad — que es el único que alguien usa cuando tiene un
 * problema.
 *
 * **Pendiente y anotado a propósito:** falta el NIT y la dirección física de la
 * sociedad. Los dos son obligatorios en una factura y convenientes en la
 * política de privacidad; el correo, además, va a cambiar por uno del dominio
 * propio cuando el sitio se mude al VPS. Ninguno se inventa aquí: un dato legal
 * falso es peor que un dato legal ausente.
 */
export const CONTACTO = {
  razonSocial: "Dimension Natural SAS",
  pais: "Colombia",
  correo: "dimensionnaturalsas@gmail.com",
  /** Como se lee. */
  telefono: "+57 312 684 4848",
  /** Como se marca: sin espacios, con indicativo. Para `tel:` y para schema.org. */
  telefonoE164: "+573126844848",
} as const;

/**
 * Desde cuándo rigen los términos y la política de privacidad.
 *
 * **Se mueve a mano, y esa es la gracia.** Un documento legal sin fecha no se
 * puede citar: si cambian las condiciones, nadie puede demostrar cuáles aceptó.
 * Que haya que editar esta constante obliga a que cambiar el texto sea un acto
 * consciente, y deja el cambio a la vista en el diff.
 *
 * Si algún día los dos documentos cambian por separado, se parte en dos
 * constantes. Hoy nacieron juntos.
 */
export const VIGENCIA_LEGAL = "2026-09-19";
