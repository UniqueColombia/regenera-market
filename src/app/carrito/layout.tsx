import type { Metadata } from "next";
import { privada } from "@/lib/seo";

/**
 * El carrito es un componente de cliente —tiene estado, escucha el
 * almacenamiento local— y un componente de cliente **no puede exportar
 * `metadata`**: Next la lee en el servidor, antes de que ese archivo exista
 * para el navegador.
 *
 * De ahí este layout, que no pinta nada y solo existe para declararlos. Es el
 * patrón de Next para este caso exacto, y es la razón de que el archivo parezca
 * vacío.
 *
 * `index: false`: el carrito de alguien no es una página; es un estado. Sin
 * esto se indexaría un carrito vacío con el título por defecto del sitio.
 */
export const metadata: Metadata = {
  title: "Tu carrito",
  ...privada(),
};

export default function CarritoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
