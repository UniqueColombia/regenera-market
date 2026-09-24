import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { GraficoDiario, Ranking } from "./graficos";
import { getAnaliticas, type Analiticas } from "@/lib/repo";
import { money, num, shortDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Analíticas",
};

/**
 * Cuánta gente entra, qué mira y si acaba en algo.
 *
 * **Solo cuenta a quien aceptó la medición** en el aviso de cookies: las cifras
 * de tráfico son un piso, no el total. Se dice en la página porque es lo
 * primero que alguien tiene que saber para no sacar conclusiones de más.
 *
 * Las cifras del negocio —cuentas, postulaciones, órdenes, publicaciones— no
 * dependen del permiso: salen de las tablas de siempre y son exactas.
 *
 * El rol lo comprueba `src/app/admin/layout.tsx`, y `admin_analiticas()` lo
 * vuelve a comprobar en la base.
 */
export const dynamic = "force-dynamic";

const PERIODOS = [7, 30, 90] as const;

const APARATOS: Record<string, string> = {
  movil: "Teléfono",
  tableta: "Tableta",
  escritorio: "Computador",
};

const PAISES = new Intl.DisplayNames(["es"], { type: "region" });

function pais(codigo: string): string {
  if (!codigo) return "Sin dato";
  try {
    return PAISES.of(codigo) ?? codigo;
  } catch {
    return codigo;
  }
}

/** «+12 %» frente al periodo anterior, o nada si antes no había con qué comparar. */
function cambio(ahora: number, antes: number, dias: number): string | null {
  if (antes === 0) return null;
  const pct = Math.round(((ahora - antes) / antes) * 100);
  return `${pct > 0 ? "+" : ""}${pct} % frente a los ${dias} días anteriores`;
}

export default async function AdminAnaliticasPage(
  props: PageProps<"/admin/analiticas">,
) {
  const sp = await props.searchParams;
  const pedido = Number(Array.isArray(sp.dias) ? sp.dias[0] : sp.dias);
  const dias = PERIODOS.find((p) => p === pedido) ?? 30;

  const datos = await getAnaliticas(dias);

  return (
    <div>
      <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-ink">Analíticas</h1>
          <p className="mt-1 text-sm text-muted">
            {datos
              ? `Del ${shortDate(datos.desde)} al ${shortDate(datos.hasta)}.`
              : "Todavía no hay datos."}
          </p>
        </div>

        {/* Enlaces y no un selector con estado: cada periodo es una URL que se
            puede mandar a alguien. */}
        <nav aria-label="Periodo" className="flex gap-1">
          {PERIODOS.map((p) => (
            <Link
              key={p}
              href={`/admin/analiticas?dias=${p}`}
              aria-current={p === dias ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                p === dias
                  ? "bg-brand-700 text-white"
                  : "text-muted ring-1 ring-hairline hover:bg-sand hover:text-brand-700"
              }`}
            >
              {p} días
            </Link>
          ))}
        </nav>
      </div>

      {!datos ? (
        <div className="mt-8 rounded-xl bg-white p-10 text-center ring-1 ring-hairline">
          <BarChart3 className="mx-auto size-8 text-muted" />
          <p className="mt-3 text-sm text-muted">
            Falta aplicar la migración{" "}
            <code className="font-mono text-ink">0010_medicion_de_uso.sql</code>{" "}
            en la base. En cuanto esté, las visitas empiezan a contarse aquí.
          </p>
        </div>
      ) : (
        <Panel datos={datos} />
      )}
    </div>
  );
}

function Panel({ datos }: { datos: Analiticas }) {
  const trafico = [
    {
      titulo: "Visitas",
      dato: num(datos.visitas),
      pie: cambio(datos.visitas, datos.visitasAntes, datos.dias),
    },
    {
      titulo: "Visitantes distintos",
      dato: num(datos.visitantes),
      pie: cambio(datos.visitantes, datos.visitantesAntes, datos.dias),
    },
    {
      titulo: "Páginas por visitante",
      dato: datos.visitantes === 0 ? "—" : num(datos.visitas / datos.visitantes),
      pie: null,
    },
  ];

  const negocio = [
    { href: "/admin/usuarios" as const, titulo: "Cuentas nuevas", dato: num(datos.negocio.cuentas) },
    {
      href: "/admin/postulaciones" as const,
      titulo: "Postulaciones",
      dato: num(datos.negocio.postulaciones),
    },
    {
      href: "/admin/ordenes" as const,
      titulo: "Órdenes",
      dato: num(datos.negocio.ordenes),
      pie: datos.negocio.ordenes > 0 ? money(datos.negocio.ordenesCop) : undefined,
    },
    {
      href: "/admin/comunidad" as const,
      titulo: "Publicaciones",
      dato: num(datos.negocio.publicaciones),
    },
  ];

  return (
    <>
      <ul className="mt-6 grid gap-3 sm:grid-cols-3">
        {trafico.map((t) => (
          <li key={t.titulo} className="rounded-xl bg-white p-5 ring-1 ring-hairline">
            <span className="text-sm font-medium text-muted">{t.titulo}</span>
            <span className="mt-2 block font-display text-4xl tabular-nums text-ink">
              {t.dato}
            </span>
            {t.pie && (
              <span className="mt-1 block text-xs text-muted">
                {t.pie}
              </span>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-2 text-xs text-muted">
        Solo cuentan quienes aceptaron la medición en el aviso de cookies, así
        que el tráfico real es algo mayor. Las páginas privadas —cuentas,
        órdenes y este panel— no se miden.
      </p>

      <section className="mt-6 rounded-xl bg-white p-5 ring-1 ring-hairline">
        <h2 className="font-display text-lg text-ink">Visitas por día</h2>
        <div className="mt-4">
          <GraficoDiario dias={datos.porDia} />
        </div>
      </section>

      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        <Ranking
          titulo="Páginas más vistas"
          filas={datos.paginas}
          etiqueta={(c) => c}
          vacio="Todavía no hay visitas en este periodo."
        />
        <Ranking
          titulo="De dónde llegan"
          filas={datos.origenes}
          etiqueta={(c) => c || "Directo o sin dato"}
          vacio="Todavía no hay visitas en este periodo."
        />
        <Ranking
          titulo="Con qué aparato"
          filas={datos.dispositivos}
          etiqueta={(c) => APARATOS[c] ?? c}
          vacio="Todavía no hay visitas en este periodo."
        />
        <Ranking
          titulo="Desde qué país"
          filas={datos.paises}
          etiqueta={pais}
          vacio="Todavía no hay visitas en este periodo."
        />
      </div>

      <h2 className="mt-10 font-display text-xl text-ink">En el mismo periodo</h2>
      <p className="mt-1 text-sm text-muted">
        Lo que pasó en el marketplace, con o sin permiso de medición.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {negocio.map((n) => (
          <li key={n.href}>
            <Link
              href={n.href}
              className="flex h-full flex-col rounded-xl bg-white p-5 ring-1 ring-hairline transition hover:ring-brand-300 active:ring-brand-300"
            >
              <span className="text-sm font-medium text-muted">{n.titulo}</span>
              <span className="mt-2 font-display text-3xl tabular-nums text-ink">
                {n.dato}
              </span>
              {n.pie && <span className="mt-1 text-xs text-muted">{n.pie}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
