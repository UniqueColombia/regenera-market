"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Leaf, Menu, ShoppingBasket, User, X } from "lucide-react";
import { useCartCount } from "./cart";
import { VERTICALS } from "@/lib/taxonomy";

const NAV = [
  { href: "/catalogo", label: "Catálogo" },
  { href: "/proveedores", label: "Proveedores" },
  { href: "/verificacion", label: "Verificación" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const categoriesRef = useRef<HTMLDivElement>(null);

  // En vez de guardar "abierto/cerrado" y cerrarlo al navegar, se guarda la ruta
  // en la que se abrió. Al cambiar de página deja de coincidir y el menú queda
  // cerrado solo, sin efectos de por medio.
  const [menuOpenedAt, setMenuOpenedAt] = useState<string | null>(null);
  const [categoriesOpenedAt, setCategoriesOpenedAt] = useState<string | null>(
    null,
  );
  const openMenu = menuOpenedAt === pathname;
  const openCategories = categoriesOpenedAt === pathname;

  const setOpenMenu = (open: boolean) => setMenuOpenedAt(open ? pathname : null);
  const setOpenCategories = (open: boolean) =>
    setCategoriesOpenedAt(open ? pathname : null);

  useEffect(() => {
    if (!openCategories) return;
    // Se usa el setter de estado directo, no el envoltorio: este cierra siempre,
    // y así el efecto no depende de una función que cambia en cada render.
    function onPointerDown(e: PointerEvent) {
      if (!categoriesRef.current?.contains(e.target as Node)) {
        setCategoriesOpenedAt(null);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setCategoriesOpenedAt(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openCategories]);

  return (
    <header className="sticky top-0 z-50 border-b border-hairline bg-cream/90 backdrop-blur">
      <div className="container-page flex h-16 items-center gap-4">
        <Link href="/" className="flex items-center gap-2">
          <Leaf className="size-7 text-brand-600" />
          <span className="leading-none">
            <span className="block font-display text-lg font-semibold text-brand-700">
              Seregenera
            </span>
            <span className="block text-[11px] text-muted">
              Turismo que regenera
            </span>
          </span>
        </Link>

        <nav className="ml-auto hidden items-center gap-1 md:flex">
          <div ref={categoriesRef} className="relative">
            <button
              type="button"
              onClick={() => setOpenCategories(!openCategories)}
              aria-expanded={openCategories}
              className="flex items-center gap-1 rounded-full px-3.5 py-2 text-sm font-medium text-ink hover:bg-sand"
            >
              Categorías
              <ChevronDown
                className={`size-4 transition ${openCategories ? "rotate-180" : ""}`}
              />
            </button>

            {openCategories && (
              <div className="absolute left-1/2 top-full mt-2 w-[42rem] -translate-x-1/2 rounded-xl bg-white p-5 shadow-xl ring-1 ring-hairline">
                <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                  {VERTICALS.map((v) => (
                    <div key={v.id}>
                      <Link
                        href={`/catalogo?vertical=${v.id}`}
                        className="font-display text-sm font-semibold text-brand-700 hover:underline"
                      >
                        {v.label}
                      </Link>
                      <ul className="mt-1.5 space-y-1">
                        {v.subcategories.map((s) => (
                          <li key={s.slug}>
                            <Link
                              href={`/catalogo?vertical=${v.id}&q=${encodeURIComponent(s.label)}`}
                              className="text-sm text-muted hover:text-brand-700"
                            >
                              {s.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-full px-3.5 py-2 text-sm font-medium hover:bg-sand ${
                pathname.startsWith(item.href) ? "bg-sand text-brand-700" : "text-ink"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <Link
            href="/vender"
            className="hidden rounded-full px-3 py-2 text-sm text-muted hover:text-brand-700 lg:block"
            title="Portal de proveedores"
          >
            <User className="size-5" />
            <span className="sr-only">Portal de proveedores</span>
          </Link>
          <CartButton />
          <button
            type="button"
            onClick={() => setOpenMenu(!openMenu)}
            className="rounded-full p-2 hover:bg-sand md:hidden"
            aria-expanded={openMenu}
            aria-label="Menú"
          >
            {openMenu ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {openMenu && (
        <nav className="border-t border-hairline bg-white md:hidden">
          <ul className="container-page divide-y divide-hairline py-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="block py-3 text-sm font-medium">
                  {item.label}
                </Link>
              </li>
            ))}
            {VERTICALS.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/catalogo?vertical=${v.id}`}
                  className="block py-3 text-sm text-muted"
                >
                  {v.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/vender" className="block py-3 text-sm font-medium">
                Portal de proveedores
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}

function CartButton() {
  const count = useCartCount();
  return (
    <Link
      href="/carrito"
      className="relative rounded-full p-2 hover:bg-sand"
      aria-label={`Cesta${count ? `, ${count} artículos` : ""}`}
    >
      <ShoppingBasket className="size-5" />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid size-5 place-items-center rounded-full bg-brand-600 text-[11px] font-semibold text-white tabular-nums">
          {count}
        </span>
      )}
    </Link>
  );
}
