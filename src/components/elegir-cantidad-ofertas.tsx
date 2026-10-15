import Link from "next/link";
import { FileSpreadsheet, Plus } from "lucide-react";

/**
 * «¿Una oferta o varias?», justo debajo del enlace de volver en «Nueva oferta»
 * y en «Cargar desde Excel».
 *
 * La carga masiva existía pero se llegaba a ella por «Ver todas» → «Cargar
 * desde Excel»: quien abría «Nueva oferta» con veinte productos por subir
 * llenaba el formulario veinte veces sin saber que había otro camino. Este
 * selector está en las dos pantallas, así que desde cualquiera se pasa a la
 * otra de un clic. Es de servidor: son dos enlaces, no estado.
 *
 * ## Por qué la píldora se desliza y no salta
 *
 * Son dos páginas distintas, así que al cambiar el selector se vuelve a pintar
 * entero y la píldora aparecería de golpe en el otro lado. Para que viaje, el
 * selector y la píldora llevan cada uno su `view-transition-name` —el mismo
 * recurso que ya usa el encabezado del sitio (ver `globals.css`)—: el
 * navegador los saca de la transición de página y anima la píldora de donde
 * estaba a donde queda. Donde no hay View Transitions simplemente cambia, y
 * con `prefers-reduced-motion` también.
 *
 * **Tiene que estar en el mismo sitio en las dos pantallas** (debajo del
 * enlace de volver, antes del título): si una lo pone más abajo, la transición
 * no solo desliza la píldora sino que la sube o la baja.
 */
export function ElegirCantidadOfertas({
  activa,
  hrefUna,
  hrefVarias,
}: {
  activa: "una" | "varias";
  hrefUna: string;
  hrefVarias: string;
}) {
  return (
    <nav
      aria-label="Cuántas ofertas vas a publicar"
      style={{ viewTransitionName: "selector-oferta" }}
      className="mt-5 flex w-full max-w-md gap-1 rounded-full bg-white p-1 ring-1 ring-control sm:w-fit"
    >
      <Opcion href={hrefUna} activa={activa === "una"} icono={<Plus className="size-4" aria-hidden />}>
        Una oferta
      </Opcion>
      <Opcion href={hrefVarias} activa={activa === "varias"} icono={<FileSpreadsheet className="size-4" aria-hidden />}>
        Varias desde Excel
      </Opcion>
    </nav>
  );
}

function Opcion({
  href,
  activa,
  icono,
  children,
}: {
  href: string;
  activa: boolean;
  icono: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={activa ? "page" : undefined}
      className={`relative flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold transition-colors sm:flex-none sm:px-5 ${
        activa ? "text-white" : "text-brand-700 hover:bg-sand"
      }`}
    >
      {/* Solo la opción activa lo lleva: es la única con ese nombre en la página,
          como exige `view-transition-name`. */}
      {activa && (
        <span
          aria-hidden
          style={{ viewTransitionName: "pildora-oferta" }}
          className="absolute inset-0 rounded-full bg-brand-700"
        />
      )}
      <span className="relative flex items-center gap-2">
        {icono}
        {children}
      </span>
    </Link>
  );
}
