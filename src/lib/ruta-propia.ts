/**
 * `?volver=` como ruta de este sitio, o `null` si apunta a otro.
 *
 * `volver` viene de la barra de direcciones: cualquiera puede mandar un enlace
 * a `/entrar?volver=…` del sitio de verdad, y la persona termina donde diga ahí
 * después de escribir su contraseña. Comprobar que empiece por `/` y no por `//`
 * no basta: `/\evil.com` y `/<tab>/evil.com` pasan esa prueba, y el navegador
 * los lee como `https://evil.com/` (la barra invertida es una barra, y el
 * tabulador se descarta). Aquí se resuelve la ruta como lo haría el navegador y
 * solo se acepta si sigue en el mismo origen.
 */
export function rutaPropia(volver: string | null | undefined): string | null {
  if (!volver || !volver.startsWith("/")) return null;
  // Barra invertida y caracteres de control: no los escribe nadie a mano y son
  // justo los que el navegador reinterpreta.
  if (/[\\\u0000-\u001f\u007f]/.test(volver)) return null;
  const base = "https://ruta-propia.invalid";
  try {
    const url = new URL(volver, base);
    return url.origin === base ? url.pathname + url.search + url.hash : null;
  } catch {
    return null;
  }
}
