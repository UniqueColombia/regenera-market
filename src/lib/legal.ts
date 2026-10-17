/**
 * Los datos de la empresa que opera Seregenera, en un solo sitio.
 *
 * Aparecen en el pie de página, en las dos páginas legales, en los datos
 * estructurados que lee un buscador y en `/llms.txt`. Escritos cinco veces
 * acaban siendo cinco correos distintos, y el que quede viejo va a ser justo el
 * de la política de privacidad — que es el único que alguien usa cuando tiene un
 * problema.
 *
 * **Pendiente y anotado a propósito:** falta la dirección física de la
 * sociedad, obligatoria en una factura y conveniente en la política de
 * privacidad. No se inventa aquí: un dato legal falso es peor que un dato legal
 * ausente.
 *
 * El NIT y el correo los dio Jesús el 2026-10-17. Desde ese día el correo de
 * Seregenera es uno solo, `info@seregenera.com` (el buzón de Hostinger): es al
 * que se escribe para reclamar o ejercer un derecho, desde el que salen todos
 * los correos y al que llegan las respuestas a las invitaciones. Antes era el
 * Gmail de la sociedad.
 */
export const CONTACTO = {
  /** La sociedad que opera Seregenera y responde por ella. */
  razonSocial: "Dimension Natural SAS",
  nit: "901812769-8",
  pais: "Colombia",
  correo: "info@seregenera.com",
  /** Como se lee. */
  telefono: "+57 312 684 4848",
  /** Como se marca: sin espacios, con indicativo. Para `tel:` y para schema.org. */
  telefonoE164: "+573126844848",
} as const;

/**
 * Desde cuándo rigen los términos y la política de privacidad.
 *
 * **Se mueven a mano, y esa es la gracia.** Un documento legal sin fecha no se
 * puede citar: si cambian las condiciones, nadie puede demostrar cuáles aceptó.
 * Que haya que editar estas constantes obliga a que cambiar el texto sea un
 * acto consciente, y deja el cambio a la vista en el diff.
 *
 * Nacieron juntas el 2026-09-19 en una sola constante. Se partieron el
 * 2026-09-24, cuando la medición de uso cambió la política y no los términos:
 * mover la fecha de un documento que no cambió es decir que cambió. La
 * política volvió a moverse el 2026-10-14: los datos de contacto de empresas
 * que invitamos a vender («Contactar proveedores») y la pasarela de pago. Las
 * dos se movieron el 2026-10-17: el sitio y el correo pasaron a Hostinger, la
 * política nombra la dirección de entrega y las reseñas, y los términos
 * describen el envío, el pago y cuándo se le paga al proveedor.
 */
export const VIGENCIA_TERMINOS = "2026-10-17";
export const VIGENCIA_PRIVACIDAD = "2026-10-17";

/**
 * Cuántos días hábiles tiene quien compró, desde que el pedido queda
 * entregado, para avisar de un problema antes de que se le pague al proveedor.
 *
 * Es la pieza del modelo que se decidió copiar el 2026-10-17 (Airbnb y
 * MercadoLibre retienen la plata del vendedor hasta después de la entrega):
 * el comprador paga, Seregenera retiene su comisión y el proveedor cobra cuando
 * lo vendido llegó. **El número es una propuesta y espera el visto bueno de
 * Ivan**: es negocio, no código. Cinco no es arbitrario: es el retracto de la
 * Ley 1480 (art. 47, cinco días hábiles desde la entrega) y el plazo para
 * pedir la reversión de un pago (art. 51); liberar antes deja al comprador con
 * un derecho que Seregenera ya no puede cubrir con la plata retenida. Lo citan
 * los términos; la liquidación al proveedor, cuando se programe, tiene que leer
 * este mismo valor.
 */
export const DIAS_PARA_RECLAMAR = 5;

/**
 * Las redes de Seregenera.
 *
 * **Vacías hasta tener los enlaces de verdad** (pendiente con Ivan, ver «Para
 * conversar con Ivan» en `docs/ESTADO.md`). Se escribe la URL completa del
 * perfil (`https://www.instagram.com/…`); para WhatsApp, `https://wa.me/57…`.
 *
 * Dos usos, con dos reglas distintas:
 *
 * - **Los íconos del sitio** (pie, encabezado, menú del teléfono) se ven
 *   siempre, con `redesParaMostrar()`. Hasta el 2026-10-15 no se pintaba
 *   ninguno mientras estuvieran vacías; Jesús pidió que se vean ya. La que no
 *   tiene dirección sale como «pronto» y **no es un enlace**: así sigue sin
 *   llevar a una cuenta que no existe, o a la de otra empresa con el mismo
 *   nombre, que era el motivo de esconderlas.
 * - **Lo que leen otros** —el `sameAs` de los buscadores y el pie de los
 *   correos— usa `redesActivas()`: solo las que tienen dirección. Un buscador
 *   o un correo no tienen cómo decir «pronto».
 */
export const REDES: Record<RedSocial, string> = {
  instagram: "",
  facebook: "",
  linkedin: "",
  tiktok: "",
  youtube: "",
  whatsapp: "",
};

export type RedSocial = "instagram" | "facebook" | "linkedin" | "tiktok" | "youtube" | "whatsapp";

export const NOMBRE_RED: Record<RedSocial, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
  whatsapp: "WhatsApp",
};

/**
 * Todas, en el orden de arriba, con su dirección o `null` si todavía no la
 * tienen. Para los íconos del sitio (`redes-sociales.tsx`).
 */
export function redesParaMostrar(): { red: RedSocial; nombre: string; url: string | null }[] {
  return (Object.keys(REDES) as RedSocial[]).map((red) => {
    const url = REDES[red].trim();
    return { red, nombre: NOMBRE_RED[red], url: url.startsWith("https://") ? url : null };
  });
}

/** Las que tienen enlace, en el orden de arriba. Solo `https://`: lo demás no se pinta. */
export function redesActivas(): { red: RedSocial; nombre: string; url: string }[] {
  return (Object.keys(REDES) as RedSocial[])
    .map((red) => ({ red, nombre: NOMBRE_RED[red], url: REDES[red].trim() }))
    .filter((r) => r.url.startsWith("https://"));
}
