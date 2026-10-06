"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useOptimistic, useRef, useTransition } from "react";
import { Check, ShieldCheck } from "lucide-react";
import { IconoCategoria } from "@/components/icono-categoria";
import { CATEGORIAS, categoriaPorId, type Categoria } from "@/lib/taxonomy";
import type { ListingFilters } from "@/lib/types";

/**
 * Las categorías del catálogo como puerta de entrada, no como un desplegable.
 *
 * Antes la categoría era una de ocho listas desplegables del formulario, con
 * nombres como «Tecnología» o «Servicios» que no decían qué había dentro. Aquí
 * cada una es una tarjeta con su icono, y **al pasar por encima dice a qué hace
 * referencia** y qué subcategorías agrupa: «Agua» es ahorro, tratamiento,
 * reutilización, captación y monitoreo. En un teléfono no hay «pasar por
 * encima»: ahí la descripción va escrita debajo del nombre, recortada a dos
 * líneas (regla de paridad de `diseno-visual`).
 *
 * ## Por qué es un componente de cliente
 *
 * Era de servidor y cada tarjeta, un enlace común. En el teléfono eso fallaba
 * de dos maneras: (1) **cada clic llevaba al inicio de la página**, y quien había
 * bajado hasta «Energía» tenía que volver a bajar; (2) las subcategorías salían
 * **debajo de las ocho tarjetas**, fuera de pantalla, y la página parecía
 * recargarse sin mostrar nada de lo elegido.
 *
 * Ahora la elección se refleja **al instante** (`useOptimistic`), sin esperar la
 * respuesta del servidor; la navegación sigue ocurriendo —cada combinación sigue
 * siendo una URL, invariante 19— pero sin saltar (`scroll: false`). Y en una
 * columna las subcategorías se abren **justo debajo de la tarjeta elegida**.
 *
 * Los enlaces siguen siendo enlaces: con clic derecho, clic con Ctrl o sin
 * JavaScript funcionan como siempre. Y cada uno **conserva los demás filtros**:
 * elegir «Energía» después de filtrar por hoteles en Antioquia no los borra.
 */
export function Categorias({ filters }: { filters: ListingFilters }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  // Lo que se pinta: lo elegido ya, aunque el servidor todavía no haya contestado.
  // Cuando la navegación termina, `vista` vuelve a ser `filters`, ya actualizado.
  const [vista, elegir] = useOptimistic(
    filters,
    (actual: ListingFilters, cambios: Partial<ListingFilters>) => ({ ...actual, ...cambios }),
  );
  const activa = categoriaPorId(vista.category);

  // La tarjeta que se tocó y a qué altura de la pantalla estaba, para dejarla ahí.
  const ancla = useRef<{ id: string; arriba: number } | null>(null);

  // **Al cambiar de categoría, la tarjeta tocada no se mueve de la pantalla.** El
  // panel de la categoría anterior se cierra —y si estaba más arriba, todo lo de
  // debajo sube— en el mismo cuadro en que se abre el nuevo. Sin esto, la tarjeta
  // se va de debajo del dedo unos 200 px y la lista parece colapsar y volver a
  // crecer. Se corrige el scroll por la diferencia, antes de pintar.
  useLayoutEffect(() => {
    const a = ancla.current;
    if (!a) return;
    ancla.current = null;
    const tarjeta = document.getElementById(`cat-${a.id}`);
    if (!tarjeta) return;
    const desvio = tarjeta.getBoundingClientRect().top - a.arriba;
    if (Math.abs(desvio) > 1) window.scrollBy({ top: desvio, behavior: "instant" });
  }, [activa?.id]);

  function ir(e: React.MouseEvent, cambios: Partial<ListingFilters>, tarjetaId?: string) {
    // Ctrl, Cmd, Shift, clic del medio: el navegador abre en otra pestaña, como siempre.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (tarjetaId) {
      const tarjeta = document.getElementById(`cat-${tarjetaId}`);
      if (tarjeta) ancla.current = { id: tarjetaId, arriba: tarjeta.getBoundingClientRect().top };
    }
    startTransition(() => {
      elegir(cambios);
      router.push(conFiltros(vista, cambios), { scroll: false });
    });
  }

  return (
    <section aria-labelledby="titulo-categorias" className="mt-8 [overflow-anchor:none]">
      <h2 id="titulo-categorias" className="font-display text-xl text-ink">
        ¿Qué quieres resolver?
      </h2>

      <ul className="mt-4 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
        {CATEGORIAS.map((c) => {
          const elegida = activa?.id === c.id;
          const cambios: Partial<ListingFilters> = {
            category: elegida ? undefined : c.id,
            subcategory: undefined,
          };

          return (
            <li key={c.id} id={`cat-${c.id}`} className="group relative">
              <Link
                href={conFiltros(vista, cambios)}
                scroll={false}
                onClick={(e) => ir(e, cambios, c.id)}
                aria-current={elegida ? "true" : undefined}
                aria-describedby={`desc-${c.id}`}
                // `h-full` solo desde dos columnas, donde las tarjetas de una fila igualan su alto.
                // En una columna el <li> también lleva el panel de subcategorías, y con `h-full` la
                // tarjeta se estiraba hasta ocuparlo: el panel quedaba debajo de ella, fuera del <li> y
                // tapado por la tarjeta siguiente.
                className={`flex items-start gap-3 rounded-xl p-4 ring-1 min-[480px]:h-full transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-900/5 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
                  elegida
                    ? "bg-brand-50 ring-brand-400"
                    : "bg-white ring-hairline hover:ring-brand-300"
                }`}
              >
                <span
                  className={`grid size-10 shrink-0 place-items-center rounded-full transition-colors ${
                    elegida
                      ? "bg-brand-600 text-white"
                      : "bg-brand-50 text-brand-600 group-hover:bg-brand-600 group-hover:text-white"
                  }`}
                >
                  {elegida ? (
                    <Check className="size-5" aria-hidden />
                  ) : (
                    <IconoCategoria id={c.id} className="size-5" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 font-display text-base leading-snug text-ink">
                    <span className="min-w-0 break-words">{c.label}</span>
                    {c.avanzada && (
                      <ShieldCheck
                        className="size-4 shrink-0 text-clay-600"
                        aria-label="Solo proveedores verificados"
                      />
                    )}
                  </span>
                  {/* En táctil no hay hover: la descripción va aquí, corta. */}
                  <span className="mt-1 hidden text-xs leading-snug text-muted [@media(hover:none)]:line-clamp-2">
                    {c.descripcion}
                  </span>
                </span>
              </Link>

              {/* En una sola columna las subcategorías se abren aquí, justo
                  debajo de la tarjeta elegida: es lo que se ve sin tener que
                  bajar. Desde dos columnas el panel va debajo de la rejilla,
                  a todo el ancho, porque dentro de la tarjeta quedaría estrecho. */}
              {elegida && activa && (
                <div className="min-[480px]:hidden">
                  <PanelSubcategorias activa={activa} vista={vista} ir={ir} />
                </div>
              )}

              {/* La descripción flotante, solo con puntero. En táctil el foco se
                  queda en la tarjeta tras tocarla y la dejaría abierta encima de
                  la siguiente; ahí ya está escrita dentro de la tarjeta.
                  `pointer-events-none` para que no robe el clic de la tarjeta
                  de abajo. */}
              <div
                id={`desc-${c.id}`}
                role="tooltip"
                className="pointer-events-none invisible absolute left-0 right-0 top-full z-30 mt-2 translate-y-1 rounded-xl bg-ink p-4 text-left opacity-0 shadow-xl transition duration-150 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 motion-reduce:transition-none [@media(hover:none)]:hidden"
              >
                <p className="text-sm leading-relaxed text-white">{c.descripcion}</p>
                <p className="mt-2 text-xs text-brand-200">
                  {c.subcategorias.map((s) => s.label).join(" · ")}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {activa && (
        <div className="hidden min-[480px]:block">
          <PanelSubcategorias activa={activa} vista={vista} ir={ir} />
        </div>
      )}
    </section>
  );
}

/**
 * Las subcategorías de la categoría elegida.
 *
 * **Se abre con una animación** (`animate-abrir`: crece y aparece) en lugar de
 * aparecer de golpe, que es lo que hacía parecer que la página se recargaba. Se
 * vuelve a animar al cambiar de categoría porque el `key` cambia con ella.
 * El `overflow-hidden` es lo que permite que crezca; los `-mx-1 px-1 pb-1` dejan
 * sitio al anillo de los chips, que de otro modo se recortaría.
 */
function PanelSubcategorias({
  activa,
  vista,
  ir,
}: {
  activa: Categoria;
  vista: ListingFilters;
  ir: (e: React.MouseEvent, cambios: Partial<ListingFilters>, tarjetaId?: string) => void;
}) {
  return (
    <div
      key={activa.id}
      className="-mx-1 mt-3 animate-abrir overflow-hidden px-1 pb-1 min-[480px]:mt-4 motion-reduce:animate-none"
    >
      <p className="text-sm text-muted">{activa.descripcion}</p>
      <ul className="mt-3 flex flex-wrap gap-2" aria-label={`Subcategorías de ${activa.label}`}>
        <li>
          <Chip
            href={conFiltros(vista, { subcategory: undefined })}
            activo={!vista.subcategory}
            onClick={(e) => ir(e, { subcategory: undefined })}
          >
            Todo {activa.label.toLowerCase()}
          </Chip>
        </li>
        {activa.subcategorias.map((s) => {
          const cambios = { subcategory: vista.subcategory === s.id ? undefined : s.id };
          return (
            <li key={s.id}>
              <Chip
                href={conFiltros(vista, cambios)}
                activo={vista.subcategory === s.id}
                onClick={(e) => ir(e, cambios)}
              >
                {s.label}
              </Chip>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Chip({
  href,
  activo,
  onClick,
  children,
}: {
  href: string;
  activo: boolean;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      onClick={onClick}
      aria-current={activo ? "true" : undefined}
      className={`block rounded-full px-3.5 py-1.5 text-sm transition ${
        activo
          ? "bg-brand-700 font-medium text-white"
          : "bg-white text-ink ring-1 ring-hairline hover:bg-sand hover:text-brand-700"
      }`}
    >
      {children}
    </Link>
  );
}

/** La URL del catálogo con estos filtros, cambiando solo los que se pasan. */
function conFiltros(actuales: ListingFilters, cambios: Partial<ListingFilters>): string {
  const todos = { ...actuales, ...cambios };
  const sp = new URLSearchParams();
  for (const [clave, valor] of Object.entries(todos)) {
    if (valor !== undefined && valor !== "") sp.set(clave, String(valor));
  }
  const q = sp.toString();
  return q ? `/catalogo?${q}` : "/catalogo";
}
