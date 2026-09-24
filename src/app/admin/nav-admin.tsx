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
      <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {SECCIONES.map(({ href, label, icono: Icono, ...resto }) => {
          const exacto = "exacto" in resto && resto.exacto;
          const activo = exacto ? pathname === href : pathname.startsWith(href);

          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={activo ? "page" : undefined}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition ${
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
