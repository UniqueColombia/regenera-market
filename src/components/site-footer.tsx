import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import { BotonCookies } from "./aviso-cookies";
import { Isotipo } from "./isotipo";
import { CONTACTO } from "@/lib/legal";
import { VERTICALS } from "@/lib/taxonomy";

export function SiteFooter() {
  return (
    <footer className="mt-20 bg-brand-900 text-brand-100">
      <div className="container-page grid gap-10 py-14 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <Isotipo className="h-10 w-auto text-brand-300" />
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
                  className="text-brand-200 transition-colors hover:text-white active:text-white"
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
              <Link href="/verificacion" className="text-brand-200 transition-colors hover:text-white active:text-white">
                Cómo verificamos
              </Link>
            </li>
            <li>
              <Link href="/proveedores" className="text-brand-200 transition-colors hover:text-white active:text-white">
                Proveedores aliados
              </Link>
            </li>
            <li>
              <Link href="/vender" className="text-brand-200 transition-colors hover:text-white active:text-white">
                Vende en Seregenera
              </Link>
            </li>
            <li>
              <Link href="/niveles" className="text-brand-200 transition-colors hover:text-white active:text-white">
                Niveles de proveedor
              </Link>
            </li>
            <li>
              <Link href="/catalogo" className="text-brand-200 transition-colors hover:text-white active:text-white">
                Catálogo completo
              </Link>
            </li>
            <li>
              <Link href="/comunidad" className="text-brand-200 transition-colors hover:text-white active:text-white">
                Comunidad
              </Link>
            </li>
            <li>
              <Link href="/legal" className="text-brand-200 transition-colors hover:text-white active:text-white">
                Políticas y términos
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
                href={`mailto:${CONTACTO.correo}`}
                className="transition-colors hover:text-white active:text-white"
              >
                {CONTACTO.correo}
              </a>
            </li>
            <li className="flex items-center gap-2">
              <Phone className="size-4 shrink-0" />
              <a
                href={`tel:${CONTACTO.telefonoE164}`}
                className="transition-colors hover:text-white active:text-white"
              >
                {CONTACTO.telefono}
              </a>
            </li>
            <li className="flex items-center gap-2">
              <MapPin className="size-4 shrink-0" />
              {CONTACTO.razonSocial} — {CONTACTO.pais}
            </li>
          </ul>
        </div>
      </div>

      {/* Lo legal sigue en la barra inferior porque es donde se busca, pero ya
          no **solo** ahí: «Políticas y términos» está también arriba, en la
          columna de plataforma, y lleva a `/legal`, que las reúne y las explica.
          El motivo del cambio es que la letra pequeña del pie sirve para cumplir
          y no para que nadie lo lea, y estos documentos dicen cosas que a un
          proveedor le conviene saber antes de firmar — la comisión, entre
          ellas. Los de aquí abajo son el atajo directo a cada documento. */}
      <div className="border-t border-brand-800">
        <div className="container-page flex flex-col items-center gap-3 py-5 text-xs text-brand-300 sm:flex-row sm:justify-between">
          <p className="text-center sm:text-left">
            © {new Date().getFullYear()} Seregenera — {CONTACTO.razonSocial}.
            Turismo que regenera vidas y paisajes.
          </p>
          <nav aria-label="Legal">
            <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              <li>
                <Link
                  href="/legal"
                  className="transition-colors hover:text-white active:text-white"
                >
                  Todas las políticas
                </Link>
              </li>
              <li>
                <Link
                  href="/terminos"
                  className="transition-colors hover:text-white active:text-white"
                >
                  Términos y condiciones
                </Link>
              </li>
              <li>
                <Link
                  href="/privacidad"
                  className="transition-colors hover:text-white active:text-white"
                >
                  Privacidad
                </Link>
              </li>
              <li>
                <BotonCookies className="transition-colors hover:text-white active:text-white" />
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}
