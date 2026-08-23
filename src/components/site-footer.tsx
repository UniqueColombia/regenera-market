import Link from "next/link";
import { Leaf, Mail, MapPin, Phone } from "lucide-react";
import { VERTICALS } from "@/lib/taxonomy";

export function SiteFooter() {
  return (
    <footer className="mt-20 bg-brand-900 text-brand-100">
      <div className="container-page grid gap-10 py-14 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <Leaf className="size-7 text-brand-300" />
            <span className="font-display text-lg font-semibold text-white">
              Seregenera
            </span>
          </div>
          <p className="mt-3 max-w-xs text-sm text-brand-200">
            Conectamos empresas turísticas con proveedores que regeneran el
            territorio donde operan.
          </p>
        </div>

        <div>
          <h2 className="font-display text-sm font-semibold text-white">
            Categorías
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {VERTICALS.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/catalogo?vertical=${v.id}`}
                  className="text-brand-200 hover:text-white"
                >
                  {v.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="font-display text-sm font-semibold text-white">
            Plataforma
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="/verificacion" className="text-brand-200 hover:text-white">
                Cómo verificamos
              </Link>
            </li>
            <li>
              <Link href="/proveedores" className="text-brand-200 hover:text-white">
                Proveedores aliados
              </Link>
            </li>
            <li>
              <Link href="/vender" className="text-brand-200 hover:text-white">
                Vende en Seregenera
              </Link>
            </li>
            <li>
              <Link href="/catalogo" className="text-brand-200 hover:text-white">
                Catálogo completo
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-display text-sm font-semibold text-white">
            Contacto
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-brand-200">
            <li className="flex items-center gap-2">
              <Mail className="size-4 shrink-0" />
              <a
                href="mailto:dimensionnaturalsas@gmail.com"
                className="hover:text-white"
              >
                dimensionnaturalsas@gmail.com
              </a>
            </li>
            <li className="flex items-center gap-2">
              <Phone className="size-4 shrink-0" />
              <a href="tel:+573126844848" className="hover:text-white">
                +57 312 684 4848
              </a>
            </li>
            <li className="flex items-center gap-2">
              <MapPin className="size-4 shrink-0" />
              Dimension Natural SAS — Colombia
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-brand-800">
        <p className="container-page py-5 text-center text-xs text-brand-300">
          © {new Date().getFullYear()} Seregenera — Dimension Natural SAS.
          Turismo que regenera vidas y paisajes.
        </p>
      </div>
    </footer>
  );
}
