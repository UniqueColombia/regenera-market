"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ClipboardList,
  LayoutGrid,
  MessagesSquare,
  Receipt,
  Store,
  Tags,
  Users,
} from "lucide-react";

/**
 * Navegación del panel.
 *
 * Es cliente por una sola razón —`usePathname()` para marcar la pestaña
 * activa— y por eso es un archivo aparte del layout, que sí se renderiza en el
 * servidor. Si el layout entero llevara `"use client"`, la comprobación de rol
 * tendría que mudarse a otra parte y el panel completo viajaría al navegador.
 *
 * Barra desplazable en horizontal en móvil: ocho pestañas no caben en 360 px, y
 * apilarlas empujaría el contenido media pantalla hacia abajo.
 *
 * ## Por qué las píldoras se veían cortadas
 *
 * Un contenedor con `overflow-x: auto` **también recorta en vertical**: CSS no
 * deja desbordar un eje y recortar el otro, así que `overflow-y` pasa a `auto`
 * aunque no se escriba. El borde de cada píldora es un `ring`, que es una sombra
 * **por fuera** de la caja, y el anillo de foco va 2 px más afuera todavía: los
 * dos quedaban fuera del contenedor y se cortaban arriba y abajo. Y como el
 * `overflow` seguía puesto en escritorio, donde la barra ya se parte en líneas,
 * se cortaban también ahí.
 *
 * El arreglo son dos cosas: `py-1.5` le da a la sombra sitio dentro del
 * contenedor, y `sm:overflow-visible` quita el recorte donde ya no hace falta
 * desplazar. `shrink-0` va en el `<li>` y no en el enlace: el que se encogía era
 * el elemento de la lista, y con él el texto se partía en dos renglones.
 */
const SECCIONES = [
  { href: "/admin", label: "Resumen", icono: LayoutGrid, exacto: true },
  { href: "/admin/ofertas", label: "Ofertas", icono: Tags },
  { href: "/admin/proveedores", label: "Proveedores", icono: Store },
  { href: "/admin/postulaciones", label: "Postulaciones", icono: ClipboardList },
  { href: "/admin/ordenes", label: "Órdenes", icono: Receipt },
  { href: "/admin/comunidad", label: "Comunidad", icono: MessagesSquare },
  { href: "/admin/usuarios", label: "Usuarios", icono: Users },
  { href: "/admin/analiticas", label: "Analíticas", icono: BarChart3 },
] as const;

export function NavAdmin() {
  const pathname = usePathname();

  return (
    <nav aria-label="Secciones de administración" className="mt-5">
      <ul className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5 py-1.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {SECCIONES.map(({ href, label, icono: Icono, ...resto }) => {
          const exacto = "exacto" in resto && resto.exacto;
          const activo = exacto ? pathname === href : pathname.startsWith(href);

          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={activo ? "page" : undefined}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition ${
                  activo
                    ? "bg-brand-700 text-white"
                    : "text-muted ring-1 ring-hairline hover:bg-sand hover:text-brand-700"
                }`}
              >
                <Icono className="size-4" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
