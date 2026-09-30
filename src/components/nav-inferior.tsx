"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LayoutGrid, ShoppingBasket, User, Users } from "lucide-react";
import type { Sesion } from "@/lib/auth";
import { useCartCount } from "./cart";

/** Rutas donde la cinta estorba: administración, acceso y confirmación de orden. */
const OCULTA_EN = ["/admin", "/entrar", "/registro", "/auth", "/orden"];

/**
 * Cinta de navegación fija al pie, solo en móvil (`md:hidden`).
 *
 * Su alto lo publica `globals.css` como `--nav-inferior` cuando la cinta está en
 * el DOM (`body:has(.nav-inferior)`): el body reserva ese espacio para no tapar
 * el pie, y los avisos flotantes lo usan para subir sobre ella.
 */
export function NavInferior({ sesion }: { sesion: Sesion | null }) {
  const pathname = usePathname();
  const count = useCartCount();

  if (OCULTA_EN.some((r) => pathname === r || pathname.startsWith(`${r}/`))) {
    return null;
  }

  const items = [
    { href: "/", label: "Inicio", Icono: Home, activo: pathname === "/" },
    {
      href: "/catalogo",
      label: "Catálogo",
      Icono: LayoutGrid,
      activo: pathname.startsWith("/catalogo"),
    },
    {
      href: "/carrito",
      label: "Cesta",
      Icono: ShoppingBasket,
      activo: pathname.startsWith("/carrito"),
      contador: count,
    },
    {
      href: "/comunidad",
      label: "Comunidad",
      Icono: Users,
      activo: pathname.startsWith("/comunidad"),
    },
    {
      href: sesion ? "/cuenta" : "/entrar",
      label: sesion ? "Cuenta" : "Entrar",
      Icono: User,
      activo: pathname.startsWith("/cuenta"),
    },
  ];

  return (
    <nav
      aria-label="Navegación principal"
      className="nav-inferior fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-hairline bg-white/95 px-1 pt-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))] backdrop-blur md:hidden"
    >
      {items.map(({ href, label, Icono, activo, contador }) => (
        <Link
          key={href}
          href={href}
          aria-current={activo ? "page" : undefined}
          aria-label={
            contador ? `${label}, ${contador} artículos` : undefined
          }
          className={`flex min-h-12 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold [-webkit-tap-highlight-color:transparent] ${
            activo ? "text-brand-700" : "text-muted"
          }`}
        >
          <span
            className={`relative grid h-7 w-14 place-items-center rounded-full transition-colors ${
              activo ? "bg-brand-100" : ""
            }`}
          >
            <Icono className="size-[22px]" strokeWidth={1.8} aria-hidden />
            {!!contador && (
              <span className="absolute -top-0.5 left-7 grid h-4 min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold leading-none text-white tabular-nums">
                {contador > 99 ? "99+" : contador}
              </span>
            )}
          </span>
          <span className="max-w-full truncate">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
