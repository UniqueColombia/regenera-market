/**
 * Campos que nunca deben quedarse en una URL.
 *
 * El 2026-10-22 un acceso terminó en
 * `/entrar?email=…&password=…`: el formulario se envió antes de que React
 * tomara la página y, sin `method`, el navegador lo mandó por GET. La causa se
 * arregló poniendo `method="post"` en todos los formularios (ver
 * `src/app/entrar/formulario-acceso.tsx`). Esto es la segunda barrera: si
 * algún formulario nuevo se olvida, el `proxy` (`src/proxy.ts`) redirige a la
 * misma ruta sin estos campos antes de pintar nada, para que la página no los
 * reciba ni los deje en enlaces, analíticas o capturas.
 *
 * La petición que los traía ya pasó por la red y por el registro de acceso de
 * Hostinger: eso no se puede deshacer desde aquí. Por eso la barrera de verdad
 * es el `method="post"`.
 *
 * Son los `name` de los campos de contraseña y de código de la app. No incluye
 * `token_hash` ni `type`: los usa el enlace de los correos de acceso
 * (`/auth/callback`) y tienen que llegar.
 */
export const CAMPOS_SENSIBLES = [
  "password",
  "password2",
  "actual",
  "clave",
  "token",
  // Datos personales de la cesta y de `/vender` (auditoría del 2026-10-22): un
  // documento, un teléfono o una dirección en una URL acaban igual en el
  // historial y en el registro del servidor.
  "documento",
  "taxid",
  "phone",
  "telefono",
  "direccion",
] as const;

/**
 * Lo que se borra junto con ellos: datos personales que solo llegan a una URL
 * por el mismo error. Sueltos (`/entrar?email=…` escrito a mano) no se tocan.
 */
const ACOMPANANTES = ["email", "nombre", "apellido", "acepto", "name", "company", "ciudad", "indicaciones", "contactname"];

/**
 * La búsqueda (`?a=1&b=2`) sin los campos sensibles, o `null` si no traía
 * ninguno y no hay nada que limpiar.
 */
export function busquedaSinCamposSensibles(busqueda: string): string | null {
  const params = new URLSearchParams(busqueda);
  const sensibles = [...params.keys()].filter((k) =>
    (CAMPOS_SENSIBLES as readonly string[]).includes(k.toLowerCase()),
  );
  if (sensibles.length === 0) return null;
  for (const k of [...params.keys()]) {
    const minuscula = k.toLowerCase();
    if ((CAMPOS_SENSIBLES as readonly string[]).includes(minuscula) || ACOMPANANTES.includes(minuscula)) {
      params.delete(k);
    }
  }
  const resto = params.toString();
  return resto ? `?${resto}` : "";
}
