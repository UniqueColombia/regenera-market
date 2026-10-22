import { useSyncExternalStore } from "react";

const sinSuscripcion = () => () => {};

/**
 * `false` en el HTML del servidor y hasta que React toma la página; `true`
 * después. Con `useSyncExternalStore` y no un `useEffect`, para que el valor
 * del servidor y el del primer pintado coincidan sin un render de más.
 *
 * Lo usan los botones de los formularios de acceso: apretados antes de tiempo,
 * el navegador envía el formulario por su cuenta (ver `src/lib/url-sensible.ts`).
 * Con `method="post"` ya no expone nada, pero recarga la página vacía y parece
 * que el botón no hizo nada. Desactivado, simplemente espera.
 */
export function useHidratado(): boolean {
  return useSyncExternalStore(
    sinSuscripcion,
    () => true,
    () => false,
  );
}
