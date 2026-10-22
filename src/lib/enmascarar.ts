/**
 * Direcciones de correo a medias, para los registros del servidor: se puede
 * buscar `an***@dominio.com` sin publicar la dirección entera.
 */

/** `alguien@dominio.com` → `al***@dominio.com`. */
export function enmascarar(correo: string): string {
  const [usuario, dominio] = correo.split("@");
  if (!dominio) return "***";
  return `${usuario.slice(0, 2)}***@${dominio}`;
}

/**
 * Cada dirección de un texto, enmascarada. Para lo que llega de fuera y repite
 * la dirección: el error de un servidor SMTP («<ana@x.com>: Recipient address
 * rejected») o el de la base («Duplicate entry 'ana@x.com'»).
 */
export function sinCorreos(texto: string): string {
  return texto.replace(/[^\s<>"'`@,;:()]+@[^\s<>"'`@,;:()]+/g, (c) => enmascarar(c));
}
