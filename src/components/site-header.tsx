"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Menu, ShoppingBasket, User, X } from "lucide-react";
import { Isotipo } from "./isotipo";
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
        <Link href="/" className="group flex items-center gap-2">
          {/* Compacto y no detalle: a 36 px los nervios y los continentes
              se empastan. Ver src/components/isotipo.tsx */}
          <Isotipo
            variante="compacto"
            className="h-9 w-auto text-brand-600 transition-transform duration-300 group-hover:scale-110 motion-reduce:transition-none"
          />
          <span className="leading-none">
            <span className="block font-display text-lg font-semibold text-brand-700 transition-colors group-hover:text-brand-500">
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
              className="group relative flex items-center gap-1 rounded-full px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:bg-sand hover:text-brand-700"
            >
              Categorías
              <ChevronDown
                className={`size-4 transition ${openCategories ? "rotate-180" : ""}`}
              />
              <Subrayado activo={openCategories} />
            </button>

            {openCategories && (
              <div className="absolute left-1/2 top-full mt-2 w-[42rem] max-w-[calc(100vw-2.5rem)] -translate-x-1/2 animate-desplegar rounded-xl bg-white p-5 shadow-xl ring-1 ring-hairline motion-reduce:animate-none">
                <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                  {VERTICALS.map((v) => (
                    <div key={v.id}>
                      <Link
                        href={`/catalogo?vertical=${v.id}`}
                        className="font-display text-sm font-semibold text-brand-700 underline-offset-4 transition-colors hover:text-brand-500 hover:underline"
                      >
                        {v.label}
                      </Link>
                      <ul className="mt-1.5 space-y-1">
                        {v.subcategories.map((s) => (
                          <li key={s.slug}>
                            <Link
                              href={`/catalogo?vertical=${v.id}&q=${encodeURIComponent(s.label)}`}
                              className="inline-block text-sm text-muted transition-all duration-200 hover:translate-x-0.5 hover:text-brand-700 motion-reduce:transition-none"
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

          {NAV.map((item) => {
            const activo = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={activo ? "page" : undefined}
                className={`group relative rounded-full px-3.5 py-2 text-sm font-medium transition-colors hover:bg-sand ${
                  activo ? "bg-sand text-brand-700" : "text-ink hover:text-brand-700"
                }`}
              >
                {item.label}
                <Subrayado activo={activo} />
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <Link
            href="/vender"
            className="hidden rounded-full px-3 py-2 text-sm text-muted transition-colors hover:bg-sand hover:text-brand-700 lg:block"
            title="Portal de proveedores"
          >
            <User className="size-5" />
            <span className="sr-only">Portal de proveedores</span>
          </Link>
          <CartButton />
          <button
            type="button"
            onClick={() => setOpenMenu(!openMenu)}
            className="rounded-full p-2 transition-colors hover:bg-sand hover:text-brand-700 active:bg-brand-50 md:hidden"
            aria-expanded={openMenu}
            aria-label="Menú"
          >
            {openMenu ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {openMenu && (
        <nav className="animate-desplegar border-t border-hairline bg-white motion-reduce:animate-none md:hidden">
          <ul className="container-page divide-y divide-hairline py-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <FilaMovil
                  href={item.href}
                  activo={pathname.startsWith(item.href)}
                >
                  {item.label}
                </FilaMovil>
              </li>
            ))}
            {VERTICALS.map((v) => (
              <li key={v.id}>
                <FilaMovil href={`/catalogo?vertical=${v.id}`} tenue>
                  {v.label}
                </FilaMovil>
              </li>
            ))}
            <li>
              <FilaMovil href="/vender" activo={pathname === "/vender"}>
                Portal de proveedores
              </FilaMovil>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}

/**
 * Subrayado que crece desde el centro al pasar el puntero, y queda puesto en la
 * sección donde estás.
 *
 * Va como `<span>` absoluto y no como `border-bottom` porque el enlace tiene
 * `rounded-full`: un borde real seguiría la curva de la píldora y se vería
 * torcido en las puntas.
 *
 * Es decoración pura — quien navega con lector de pantalla ya tiene el
 * `aria-current` del enlace, y quien tiene el sistema en «menos movimiento»
 * recibe el subrayado sin la animación, no sin el subrayado.
 */
function Subrayado({ activo }: { activo: boolean }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-x-3.5 bottom-1 h-0.5 origin-center rounded-full bg-brand-500 transition-transform duration-200 ease-out group-hover:scale-x-100 motion-reduce:transition-none ${
        activo ? "scale-x-100" : "scale-x-0"
      }`}
    />
  );
}

/**
 * Fila del menú desplegable de móvil.
 *
 * El indicador es vertical y no un subrayado: en una lista apilada, una barra
 * al costado se lee como «esta es la fila» sin ensanchar el renglón. Responde
 * también a `active:` porque en un teléfono no hay puntero que pase por encima
 * y, sin eso, tocar la fila no daría ninguna señal antes de que cargue la
 * página siguiente.
 */
function FilaMovil({
  href,
  activo = false,
  tenue = false,
  children,
}: {
  href: string;
  activo?: boolean;
  tenue?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={activo ? "page" : undefined}
      className={`group flex items-center gap-3 py-3 text-sm transition-colors hover:text-brand-700 active:text-brand-700 ${
        tenue ? "text-muted" : "font-medium"
      } ${activo ? "text-brand-700" : ""}`}
    >
      <span
        aria-hidden
        className={`h-4 w-0.5 origin-center rounded-full bg-brand-500 transition-transform duration-200 ease-out group-hover:scale-y-100 group-active:scale-y-100 motion-reduce:transition-none ${
          activo ? "scale-y-100" : "scale-y-0"
        }`}
      />
      {children}
    </Link>
  );
}

function CartButton() {
  const count = useCartCount();
  return (
    <Link
      href="/carrito"
      className="relative rounded-full p-2 transition-colors hover:bg-sand hover:text-brand-700"
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
