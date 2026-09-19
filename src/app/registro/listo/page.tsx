import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, MessagesSquare, PartyPopper, ShoppingBasket, Store } from "lucide-react";
import { getSesion } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Cuenta activada",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/**
 * Lo que se ve al terminar de crear la cuenta.
 *
 * ## Por qué existe esta página
 *
 * Antes, verificar el código del registro llevaba a `/cuenta/clave` — la
 * pantalla de «ponte una contraseña»— porque `PasoCodigo` decide el destino con
 * `necesitaClave`, y esa bandera está pensada para `/entrar`: cubre a las
 * cuentas viejas sin contraseña y a las que crea un administrador. Aplicada al
 * registro pedía por segunda vez lo que la persona acababa de elegir dos
 * pantallas antes, y el mensaje que transmitía era que la primera vez no había
 * servido de nada.
 *
 * El registro termina aquí, diciendo lo único que hacía falta decir: la cuenta
 * quedó activa. Ver `src/components/paso-codigo.tsx`, parámetro `origen`.
 *
 * ## `getSesion()` y no `requireUser()`
 *
 * **La diferencia es el motivo entero de la página.** `requireUser()` manda a
 * `/cuenta/clave` cuando la cuenta no tiene la marca `tiene_clave`, que es
 * exactamente el rebote que se está quitando de en medio. Aquí solo hace falta
 * comprobar que hay sesión.
 */
export default async function RegistroListoPage(
  props: PageProps<"/registro/listo">,
) {
  const sesion = await getSesion();
  if (!sesion) redirect("/entrar");

  const sp = await props.searchParams;
  const crudo = Array.isArray(sp.volver) ? sp.volver[0] : sp.volver;
  // Misma comprobación que en el resto del flujo: `volver` viene de la barra de
  // direcciones, y sin ella esto sería un redirector abierto.
  const volver = crudo?.startsWith("/") && !crudo.startsWith("//") ? crudo : null;

  return (
    <div className="container-page max-w-xl py-16">
      <div className="rounded-2xl bg-brand-50 p-8 text-center ring-1 ring-brand-200">
        <PartyPopper className="mx-auto size-10 text-brand-600" />
        <h1 className="mt-4 font-display text-3xl text-brand-900">
          ¡Tu cuenta está activa!
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-brand-800">
          Confirmaste tu correo, {sesion.nombre}. De aquí en adelante entras con
          tu contraseña, y el código de seis dígitos solo vuelve a aparecer
          cuando entres desde un dispositivo nuevo.
        </p>

        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link
            href={volver ?? "/catalogo"}
            className="inline-flex items-center gap-2 rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-800 active:bg-brand-800"
          >
            {volver ? "Seguir donde estabas" : "Explorar el catálogo"}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>

      <h2 className="mt-12 font-display text-xl text-ink">Qué puedes hacer ya</h2>
      <ul className="mt-4 grid gap-3">
        <Siguiente
          href="/catalogo"
          icon={ShoppingBasket}
          titulo="Comprar con seguimiento del pedido"
          detalle="Precios mayoristas, impacto por unidad y certificado de compra."
        />
        <Siguiente
          href="/comunidad"
          icon={MessagesSquare}
          titulo="Escribir en la Comunidad"
          detalle="Cuenta cómo te fue, pregunta algo o comparte una práctica."
        />
        <Siguiente
          href="/vender"
          icon={Store}
          titulo="Registrar tu empresa como proveedora"
          detalle="Si produces algo regenerativo, publica tu catálogo desde hoy."
        />
      </ul>
    </div>
  );
}

function Siguiente({
  href,
  icon: Icon,
  titulo,
  detalle,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  titulo: string;
  detalle: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="group flex items-start gap-4 rounded-xl bg-white p-5 ring-1 ring-hairline transition hover:ring-brand-300 active:ring-brand-300"
      >
        <Icon className="mt-0.5 size-6 shrink-0 text-brand-600" />
        <span className="flex-1">
          <span className="block font-display text-base text-ink transition-colors group-hover:text-brand-700">
            {titulo}
          </span>
          <span className="mt-0.5 block text-sm text-muted">{detalle}</span>
        </span>
        <ArrowRight className="mt-1 size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-brand-700" />
      </Link>
    </li>
  );
}
