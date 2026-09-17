import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Infinity as Infinito, TrendingDown } from "lucide-react";
import { HeroBanner } from "@/components/hero-banner";
import { Revelar } from "@/components/revelar";
import { TierBadge } from "@/components/tier-badge";
import {
  EXPERIENCIA,
  NIVELES,
  comisionEnPorcentaje,
  type ClaveExperiencia,
} from "@/lib/niveles";

/**
 * Cómo funcionan los niveles, para el proveedor.
 *
 * Es la página que contesta «¿y qué gano con subir?» sin que nadie tenga que
 * escribir a preguntarlo. La enlazan `/vender` (tres veces) y el correo de
 * respaldo de una postulación, así que **no es opcional**: sin ella, el correo
 * que recibe todo proveedor nuevo apunta a un 404.
 *
 * Todo lo que muestra sale de `src/lib/niveles.ts`, que es el gemelo de la
 * migración 0006. Ningún número está escrito aquí a mano: si alguien cambia un
 * umbral o una comisión, esta página cambia con él.
 *
 * **Reusa la foto de `/vender`** con otro encuadre. Es la misma audiencia y la
 * misma escena —dos personas empacando lo que producen—, y pedirle a la IA una
 * foto casi igual para la página de al lado es lo que hace que un sitio se vea
 * hecho de retazos. Si algún día tiene una propia, va por `docs/IMAGENES.md`.
 */
export const metadata: Metadata = {
  title: "Niveles de proveedor",
  description:
    "Semilla, Raíz y Bosque: cómo se gana el nivel en Seregenera con puntos de experiencia, qué suma cada cosa y cuánta comisión se cobra en cada uno. Publicar siempre es gratis.",
};

/**
 * Lo que la base sí premia pero el sitio todavía no puede ofrecer.
 *
 * `articulo_publicado` y `articulo_destacado` existen en `otorgar_experiencia()`
 * porque los puntos se definen con la regla y no con la pantalla. Pero la
 * sección de Comunidad no está construida: anunciar puntos por publicar un
 * artículo en un sitio donde no se puede publicar ninguno es prometer algo que
 * no se puede cumplir, que es justo lo que esta página existe para no hacer.
 *
 * Se quitan de aquí y no de la tabla: el día que exista la Comunidad se borra
 * esta lista y aparecen solos.
 */
const AUN_NO: ClaveExperiencia[] = ["articulo_publicado", "articulo_destacado"];

const EVENTOS = EXPERIENCIA.filter((e) => !AUN_NO.includes(e.clave));

const PUNTOS_EVALUACION = EXPERIENCIA.find(
  (e) => e.clave === "evaluacion_aprobada",
)!.puntos;

export default function NivelesPage() {
  const tope = NIVELES[NIVELES.length - 1];

  return (
    <div>
      <HeroBanner
        foto="/img/secciones/hero-vender.webp"
        encuadreMovil="object-[35%_50%]"
        encabezado="Niveles"
        titulo="El nivel se gana vendiendo, no esperando a que alguien te apruebe"
      >
        <p className="mt-4 max-w-2xl text-lg text-brand-100">
          Todo proveedor entra como Semilla y publica el mismo día. Publicar,
          entregar pedidos y recibir buenas reseñas suman puntos de experiencia;
          con los puntos sube el nivel, y con el nivel baja la comisión hasta el{" "}
          {comisionEnPorcentaje(tope.comision)} %.
        </p>
        <div className="mt-8">
          <Link
            href="/vender#postular"
            className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-brand-800 transition hover:bg-brand-50 active:bg-brand-50"
          >
            Crear mi cuenta de proveedor
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </HeroBanner>

      {/* ------------------------------------------------------------------ */}
      {/* Los tres niveles                                                    */}
      {/* ------------------------------------------------------------------ */}
      <section className="container-page py-14">
        <h2 className="font-display text-3xl text-ink">Los tres niveles</h2>
        <p className="mt-2 max-w-2xl text-muted">
          Son tres y no diez a propósito: un escalón tiene que significar algo.
          Entre el primero y el último hay cuatro puntos de comisión de
          diferencia en cada venta.
        </p>

        <ul className="mt-8 grid gap-4 md:grid-cols-3">
          {NIVELES.map((nivel, i) => (
            <Revelar as="li" key={nivel.id} retraso={i * 90}>
              <div className="flex h-full flex-col rounded-xl bg-white p-6 ring-1 ring-hairline">
                <div className="flex items-baseline justify-between gap-2">
                  <TierBadge tier={nivel.id} size="md" />
                  <span className="text-xs font-medium tabular-nums text-muted">
                    {nivel.minPuntos === 0
                      ? "desde el día 1"
                      : `${nivel.minPuntos.toLocaleString("es-CO")} puntos`}
                  </span>
                </div>

                <p className="mt-5 font-display text-4xl tabular-nums text-brand-700">
                  {comisionEnPorcentaje(nivel.comision)}
                  <span className="text-xl"> %</span>
                </p>
                <p className="text-xs text-muted">de comisión por venta cerrada</p>

                <p className="mt-4 text-sm leading-relaxed text-ink">
                  {nivel.resumen}
                </p>

                <ul className="mt-5 space-y-2 text-sm text-muted">
                  {nivel.beneficios.map((b) => (
                    <li key={b} className="flex gap-2">
                      <span
                        aria-hidden
                        className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-600"
                      />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            </Revelar>
          ))}
        </ul>

        <p className="mt-6 max-w-2xl text-sm text-muted">
          Publicar es gratis en cualquier nivel: no hay mensualidad, ni cobro por
          destacar, ni límite de publicaciones. La comisión se descuenta de cada
          venta cerrada y queda anotada ítem por ítem en la orden, junto con la
          tasa que se aplicó — para poder revisarla seis meses después.
        </p>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Qué suma puntos                                                     */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-sand py-14">
        <div className="container-page">
          <Revelar>
            <h2 className="font-display text-3xl text-ink">Qué suma puntos</h2>
            <p className="mt-2 max-w-2xl text-muted">
              Cada punto sale de un hecho: una oferta publicada, un pedido
              entregado, una reseña de quien te compró. No se compran, no se
              piden y no se negocian.
            </p>
          </Revelar>

          <ul className="mt-8 grid max-w-4xl gap-3 sm:grid-cols-2">
            {EVENTOS.map((evento, i) => (
              <Revelar as="li" key={evento.clave} retraso={i * 40}>
                <div className="flex h-full items-start gap-4 rounded-xl bg-white p-5 ring-1 ring-hairline">
                  <p className="shrink-0 font-display text-2xl tabular-nums text-brand-700">
                    +{evento.puntos}
                  </p>
                  <div>
                    <h3 className="font-display text-base text-ink">
                      {evento.titulo}
                      {!evento.repetible && (
                        <span className="ml-2 align-middle font-sans text-[11px] font-medium uppercase tracking-wide text-muted">
                          una vez
                        </span>
                      )}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted">
                      {evento.detalle}
                    </p>
                  </div>
                </div>
              </Revelar>
            ))}
          </ul>

          <p className="mt-6 max-w-2xl text-sm text-muted">
            Los topes son a propósito. Publicar cien fichas vacías en una tarde
            no compra un nivel, y las certificaciones cuentan hasta tres: un
            taller que no tiene con qué certificarse tiene que poder llegar
            arriba igual.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Las dos cosas que se confunden                                      */}
      {/* ------------------------------------------------------------------ */}
      <section className="container-page py-14">
        <h2 className="font-display text-3xl text-ink">
          El nivel y el sello son cosas distintas
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-white p-6 ring-1 ring-hairline">
            <TrendingDown className="size-7 text-brand-600" />
            <h3 className="mt-4 font-display text-lg text-ink">
              El nivel mide oficio
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Sale de los puntos de experiencia: cuánto has publicado, entregado
              y cumplido. Es lo que baja tu comisión y lo que te ordena mejor en
              el catálogo. Se gana con el tiempo y no lo aprueba nadie.
            </p>
          </div>

          <div className="rounded-xl bg-white p-6 ring-1 ring-hairline">
            <BadgeCheck className="size-7 text-clay-600" />
            <h3 className="mt-4 font-display text-lg text-ink">
              El sello mide sostenibilidad
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Sale de la evaluación de seis dimensiones, con evidencia y revisión
              humana. Es el evento que más puntos da —{PUNTOS_EVALUACION} de una
              vez— y lo único que otorga el distintivo de evaluación verificada.
            </p>
            <Link
              href="/verificacion"
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-brand-700 underline underline-offset-4"
            >
              Cómo es la evaluación
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>

        <p className="mt-6 max-w-3xl text-sm text-muted">
          Se tienen por separado y se muestran por separado. Un proveedor puede
          llegar a {tope.label} vendiendo mucho sin haber pasado la evaluación:
          tendrá el nivel y no tendrá el sello. Y al revés, quien acaba de llegar
          puede tener el sello el primer mes y seguir siendo Semilla.
        </p>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Los puntos no bajan                                                 */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-brand-900 py-14 text-white">
        <div className="container-page flex flex-wrap items-start gap-6">
          <Infinito className="size-8 shrink-0 text-brand-300" aria-hidden />
          <div className="max-w-3xl">
            <h2 className="font-display text-2xl">Los puntos suben y no bajan</h2>
            <p className="mt-3 text-brand-100">
              Un sistema que resta por estar quieto castiga al taller que produce
              por temporada, que es justo a quien este marketplace existe para
              incluir. Si dejas de vender tres meses, tu nivel te espera. Lo
              único que cuesta la ficha es incumplir de verdad: no despachar lo
              que prometiste.
            </p>
          </div>
        </div>
      </section>

      <section className="container-page py-16">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-clay-100 p-8">
          <div>
            <h2 className="font-display text-2xl text-ink">
              Empiezas en Semilla hoy mismo
            </h2>
            <p className="mt-1 max-w-xl text-sm text-muted">
              Te registras, tu ficha existe y puedes publicar. Los primeros
              puntos los dan completar tu perfil y publicar tu primera oferta.
            </p>
          </div>
          <Link
            href="/vender#postular"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 active:bg-brand-700"
          >
            Crear mi cuenta
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
