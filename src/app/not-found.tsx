import type { Metadata } from "next";
import Link from "next/link";
import { Compass, Search, Store, Users } from "lucide-react";
import { privada } from "@/lib/seo";

/**
 * La página que se ve cuando la dirección no existe.
 *
 * ## Qué tiene que hacer, y qué no
 *
 * Quien llega aquí venía a algo. Casi siempre desde un enlace viejo —una oferta
 * que se retiró, un proveedor que cambió de slug, una URL copiada a medias— y
 * la única pregunta que tiene es «¿y ahora qué?». Así que la página **no
 * explica el error**: ofrece los cuatro sitios a los que puede querer ir.
 *
 * No lleva buscador propio porque el buscador vive en `/catalogo` con sus
 * filtros, y mandar ahí es mejor que reimplementar una caja de texto que busca
 * peor.
 *
 * `robots: index: false`: una 404 indexada es una página en el buscador que
 * promete algo y no lo cumple. Next ya responde con el código 404 correcto —
 * eso es lo que de verdad lee un rastreador—, pero la etiqueta cuesta una línea.
 */
export const metadata: Metadata = {
  title: "Esta página no existe",
  ...privada(),
};

const SALIDAS = [
  {
    href: "/catalogo",
    icono: Search,
    titulo: "Buscar en el catálogo",
    detalle: "Filtra por categoría, departamento, nivel o certificación.",
  },
  {
    href: "/proveedores",
    icono: Store,
    titulo: "Ver los proveedores",
    detalle: "Las empresas que venden aquí, con su nivel y su impacto.",
  },
  {
    href: "/comunidad",
    icono: Users,
    titulo: "Pasar por la Comunidad",
    detalle: "Lo que están contando compradores y proveedores.",
  },
  {
    href: "/",
    icono: Compass,
    titulo: "Volver al inicio",
    detalle: "Y empezar de nuevo desde la portada.",
  },
];

export default function NotFound() {
  return (
    <div className="container-page max-w-3xl py-20">
      <p className="font-display text-6xl text-brand-200">404</p>
      <h1 className="mt-4 font-display text-3xl text-ink sm:text-4xl">
        Esta dirección no lleva a ninguna parte
      </h1>
      <p className="mt-3 max-w-xl text-muted">
        Puede que la oferta que buscabas ya no esté publicada, o que el enlace
        se haya copiado incompleto. Desde aquí llegas a lo mismo por otro lado.
      </p>

      <ul className="mt-10 grid gap-3 sm:grid-cols-2">
        {SALIDAS.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="flex h-full flex-col rounded-xl bg-white p-5 ring-1 ring-hairline transition hover:ring-brand-300 hover:shadow-lg hover:shadow-brand-900/5"
            >
              <s.icono className="size-6 text-brand-600" aria-hidden />
              <span className="mt-3 font-display text-base text-ink">
                {s.titulo}
              </span>
              <span className="mt-1 text-sm text-muted">{s.detalle}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
