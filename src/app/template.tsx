import { ViewTransition } from "react";

/**
 * La animación de entrada y salida entre páginas.
 *
 * Es un `template` y no parte del layout por una razón concreta: **el layout no
 * se vuelve a montar al navegar**, así que un `<ViewTransition>` ahí nunca vería
 * entrar ni salir nada. El template sí se monta de nuevo en cada ruta, y eso es
 * exactamente lo que hace falta para que la página vieja «salga» y la nueva
 * «entre» — de `/catalogo` a `/proveedores`, por ejemplo.
 *
 * `default="none"` para que solo anime al cambiar de página: sin él, cualquier
 * transición de React dentro de la página —una revalorización del carrito, un
 * filtro— haría un fundido de la pantalla entera.
 *
 * Las animaciones están en `src/app/globals.css` (`.pagina`), y el encabezado
 * queda quieto porque lleva su propio nombre de transición. Donde el navegador
 * no soporta View Transitions, la clase `entrada-pagina` pone un fundido
 * sencillo y ya.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="pagina" exit="pagina" default="none">
      <div className="entrada-pagina">{children}</div>
    </ViewTransition>
  );
}
