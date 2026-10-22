/**
 * La política de contenido (CSP), con un nonce por petición (auditoría del
 * 2026-10-22).
 *
 * ## Por qué con nonce
 *
 * Hasta ese día `script-src` llevaba `'unsafe-inline'` y una lista de dominios
 * de Google, y la razón escrita era no perder el prerenderizado. Pero todas las
 * páginas ya se renderizan en cada petición (el layout lee la sesión), así que el
 * nonce no cuesta nada. Con `'unsafe-inline'` la CSP no frenaba un XSS; y
 * `www.google.com`, en la lista, tiene puntos JSONP con los que se salta una CSP
 * de dominios.
 *
 * ## Cómo
 *
 * `src/proxy.ts` genera el nonce, lo deja en la petición (`x-nonce` y esta misma
 * cabecera, que es de donde Next lo saca para sus scripts) y en la respuesta.
 * `'strict-dynamic'`: lo que carga un script con nonce también vale. Así entran
 * el motor del traductor y la librería de BOLD, que se insertan con
 * `document.createElement` desde nuestro código, sin listar sus dominios.
 * `https:` y `'unsafe-inline'` quedan solo para navegadores que no entienden
 * nonces; los que sí, los ignoran.
 *
 * ## Lo que se queda como estaba
 *
 * - `style-src 'unsafe-inline'`: el traductor y Next inyectan estilos, y un
 *   estilo no ejecuta código.
 * - `img-src https:`: hay fotos de ofertas que son direcciones de texto a la web
 *   del proveedor. Se cierra cuando subir la foto sea obligatorio.
 * - `frame-src 'self'` se agregó el 2026-10-22: el traductor crea un marco del
 *   propio sitio, y bloquearlo era parte de que el idioma no cambiara a la
 *   primera.
 */

const TRADUCTOR = "https://translate.googleapis.com https://translate-pa.googleapis.com";
const TRADUCTOR_MARCO = "https://translate.google.com";
/** La pasarela de pago (BOLD): su botón abre el pago en un marco y recibe el formulario. */
const PASARELA = "https://checkout.bold.co";

export function nonceNuevo(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function politicaDeContenido(opciones: { nonce: string; produccion: boolean }): string {
  const { nonce, produccion } = opciones;
  return [
    "default-src 'self'",
    // `'unsafe-eval'` solo en desarrollo: lo usa React para sus trazas.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'${produccion ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline' https://www.gstatic.com https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${TRADUCTOR} ${PASARELA}`,
    "media-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    `frame-src 'self' ${TRADUCTOR_MARCO} ${PASARELA}`,
    "frame-ancestors 'none'",
    `form-action 'self' ${PASARELA}`,
    "base-uri 'self'",
    "object-src 'none'",
    ...(produccion ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

/** Las cabeceras de una petición con el nonce, para `NextResponse.next({ request: { headers } })`. */
export function conNonce(cabeceras: Headers, nonce: string, politica: string): Headers {
  const salida = new Headers(cabeceras);
  salida.set("x-nonce", nonce);
  salida.set("content-security-policy", politica);
  return salida;
}
