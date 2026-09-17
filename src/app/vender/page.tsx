import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  FileCheck2,
  Globe2,
  LineChart,
  Store,
  TrendingDown,
} from "lucide-react";
import { ApplicationForm } from "./application-form";
import { HeroBanner } from "@/components/hero-banner";
import { Revelar } from "@/components/revelar";
import { NIVELES, comisionEnPorcentaje } from "@/lib/niveles";

export const metadata: Metadata = {
  title: "Vende en Seregenera",
  description:
    "Registra tu empresa, cooperativa o comunidad y publica hoy mismo productos, experiencias y servicios regenerativos para hoteles, glampings, restaurantes y operadores de Colombia y América Latina. Publicar es gratis: solo se cobra comisión cuando vendes.",
};

const BENEFICIOS = [
  {
    icon: Store,
    titulo: "Publicas hoy, no cuando te aprobemos",
    cuerpo:
      "Te registras y tu ficha existe. No hay comité, ni cinco días hábiles, ni un correo que nunca llega. Si lo que vendes no encaja, se retira después — y eso pasa poquísimas veces.",
  },
  {
    icon: Banknote,
    titulo: "Gratis hasta que vendas",
    cuerpo: `Sin mensualidad, sin cobro por destacar y sin límite de publicaciones. Seregenera retiene ${comisionEnPorcentaje(NIVELES[0].comision)} % sobre cada venta cerrada y el resto se te dispersa.`,
  },
  {
    icon: TrendingDown,
    titulo: "La comisión baja según tu nivel",
    cuerpo: `Entregar pedidos, recibir buenas reseñas y completar tu evaluación suman experiencia. Con experiencia subes de nivel, y cada nivel te baja la comisión hasta ${comisionEnPorcentaje(NIVELES[NIVELES.length - 1].comision)} %.`,
  },
  {
    icon: LineChart,
    titulo: "Tu impacto se vuelve argumento de venta",
    cuerpo:
      "Cada ficha muestra el CO₂, el agua y los residuos que evita tu producto. Es lo que convence al comprador corporativo que necesita sustentar su reporte.",
  },
];

const REQUISITOS = [
  {
    icon: FileCheck2,
    titulo: "Poder facturar en tu país",
    cuerpo:
      "La identificación tributaria de tu organización: NIT si estás en Colombia, RUC en Perú o Ecuador, RFC en México, CUIT en Argentina, RUT en Chile o Uruguay. Sirve también la de una asociación, una cooperativa, un consejo comunitario o la tuya como persona natural.",
  },
  {
    icon: Globe2,
    titulo: "Producir o prestar el servicio tú",
    cuerpo:
      "Seregenera conecta a quien produce con quien compra. Si eres distribuidor de un producto de otro, dilo en tu descripción: no es un impedimento, pero el comprador tiene derecho a saberlo.",
  },
  {
    icon: LineChart,
    titulo: "Sostener lo que declares",
    cuerpo:
      "Publicar es libre; afirmar es responsabilidad tuya. Si dices que tu empaque es compostable o que tu taller emplea a la comunidad, tienes que poder demostrarlo cuando alguien pregunte. Lo que no se sostiene se retira.",
  },
  {
    icon: Store,
    titulo: "Despachar lo que prometes",
    cuerpo:
      "En el plazo que publicaste. Un pedido que no llega le cuesta el cliente al marketplace entero, no solo a ti — y es lo único que de verdad hace que a alguien se le suspenda la ficha.",
  },
];

export default function VenderPage() {
  return (
    <div>
      <HeroBanner
        foto="/img/secciones/hero-vender.webp"
        encuadreMovil="object-[62%_50%]"
        encabezado="Para proveedores"
        titulo="Vende lo que produces al turismo de toda América Latina"
      >
        <p className="mt-4 max-w-2xl text-lg text-brand-100">
          Cooperativas, talleres, consejos comunitarios y empresas que producen
          de forma regenerativa. Te registras, publicas el mismo día y solo pagas
          cuando vendes.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href="#postular"
            className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-brand-800 transition hover:bg-brand-50 active:bg-brand-50"
          >
            Crear mi cuenta de proveedor
          </a>
          <Link
            href="/niveles"
            className="rounded-full border border-brand-400 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-800 active:bg-brand-800"
          >
            Ver cómo funcionan los niveles
          </Link>
        </div>
      </HeroBanner>

      <section className="container-page py-14">
        <Revelar>
          <h2 className="font-display text-3xl text-ink">Qué te damos</h2>
        </Revelar>
        <ul className="mt-8 grid gap-4 md:grid-cols-2">
          {BENEFICIOS.map((b, i) => (
            <Revelar as="li" key={b.titulo} retraso={i * 70}>
              <div className="h-full rounded-xl bg-white p-6 ring-1 ring-hairline transition hover:ring-brand-300 hover:shadow-lg hover:shadow-brand-900/5">
                <b.icon className="size-7 text-brand-600" />
                <h3 className="mt-4 font-display text-lg text-ink">{b.titulo}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{b.cuerpo}</p>
              </div>
            </Revelar>
          ))}
        </ul>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Niveles y comisión                                                  */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-brand-900 py-16 text-white">
        <div className="container-page">
          <Revelar>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-300">
              Niveles
            </p>
            <h2 className="mt-3 max-w-2xl font-display text-3xl">
              Cuanto más vendes, menos te cobramos
            </h2>
            <p className="mt-3 max-w-2xl text-brand-100">
              Todos entran como Semilla. La experiencia se gana publicando,
              entregando pedidos y recibiendo buenas reseñas — no comprándola ni
              esperando a que alguien la apruebe.
            </p>
          </Revelar>

          <ul className="mt-10 grid gap-4 md:grid-cols-3">
            {NIVELES.map((nivel, i) => (
              <Revelar as="li" key={nivel.id} retraso={i * 90}>
                <div
                  className={`flex h-full flex-col rounded-2xl p-6 ${
                    i === NIVELES.length - 1
                      ? "bg-white text-ink ring-1 ring-brand-300"
                      : "bg-brand-800 ring-1 ring-brand-700"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h3
                      className={`font-display text-xl ${i === NIVELES.length - 1 ? "text-brand-900" : "text-white"}`}
                    >
                      {nivel.label}
                    </h3>
                    <span
                      className={`text-xs font-medium tabular-nums ${i === NIVELES.length - 1 ? "text-muted" : "text-brand-300"}`}
                    >
                      {nivel.minPuntos === 0
                        ? "desde el día 1"
                        : `${nivel.minPuntos.toLocaleString("es-CO")} pts`}
                    </span>
                  </div>

                  <p
                    className={`mt-4 font-display text-4xl tabular-nums ${i === NIVELES.length - 1 ? "text-brand-700" : "text-white"}`}
                  >
                    {comisionEnPorcentaje(nivel.comision)}
                    <span className="text-xl"> %</span>
                  </p>
                  <p
                    className={`text-xs ${i === NIVELES.length - 1 ? "text-muted" : "text-brand-200"}`}
                  >
                    de comisión por venta cerrada
                  </p>

                  <ul
                    className={`mt-5 space-y-2 text-sm ${i === NIVELES.length - 1 ? "text-muted" : "text-brand-100"}`}
                  >
                    {nivel.beneficios.map((b) => (
                      <li key={b} className="flex gap-2">
                        <span
                          aria-hidden
                          className={`mt-1.5 size-1.5 shrink-0 rounded-full ${i === NIVELES.length - 1 ? "bg-brand-600" : "bg-brand-400"}`}
                        />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              </Revelar>
            ))}
          </ul>

          <p className="mt-6 text-sm text-brand-200">
            Publicar siempre es gratis, en cualquier nivel. No hay mensualidad ni
            cobro por destacar.{" "}
            <Link
              href="/niveles"
              className="font-medium text-white underline underline-offset-4"
            >
              Qué suma puntos, uno por uno
            </Link>
            .
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Qué pedimos                                                         */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-sand py-14">
        <div className="container-page">
          <Revelar>
            <h2 className="font-display text-3xl text-ink">Qué pedimos</h2>
            <p className="mt-2 max-w-2xl text-muted">
              Cuatro cosas, y ninguna es un trámite nuestro. No hay evaluación
              previa, ni visita, ni puntaje que aprobar antes de publicar.
            </p>
          </Revelar>

          <ul className="mt-8 grid max-w-4xl gap-4 sm:grid-cols-2">
            {REQUISITOS.map((r, i) => (
              <Revelar as="li" key={r.titulo} retraso={i * 70}>
                <div className="h-full rounded-xl bg-white p-5 ring-1 ring-hairline">
                  <r.icon className="size-6 text-brand-600" />
                  <h3 className="mt-3 font-display text-base text-ink">
                    {r.titulo}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    {r.cuerpo}
                  </p>
                </div>
              </Revelar>
            ))}
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Formulario                                                          */}
      {/* ------------------------------------------------------------------ */}
      <section id="postular" className="container-page py-14">
        <div className="mx-auto max-w-2xl">
          <h2 className="font-display text-3xl text-ink">
            Crea tu cuenta de proveedor
          </h2>
          <p className="mt-2 text-muted">
            Son tres pasos y unos dos minutos. Si tienes sesión abierta, al
            terminar ya tienes ficha y puedes publicar.
          </p>
          <p className="mt-3 text-sm text-muted">
            ¿Todavía no tienes cuenta?{" "}
            <Link
              href="/registro"
              className="font-medium text-brand-700 underline underline-offset-4"
            >
              Créala primero
            </Link>{" "}
            y tu empresa queda activa en el acto. También puedes llenar el
            formulario sin cuenta: guardamos tu postulación y te escribimos para
            que la actives.
          </p>
          <div className="mt-8">
            <ApplicationForm />
          </div>
        </div>
      </section>

      <section className="container-page pb-16">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-clay-100 p-8">
          <div>
            <h2 className="font-display text-2xl text-ink">
              ¿Prefieres ver primero cómo se ve una ficha?
            </h2>
            <p className="mt-1 text-sm text-muted">
              Mira el catálogo y la ficha de un proveedor antes de decidir.
            </p>
          </div>
          <Link
            href="/proveedores"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-clay-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-clay-700 active:bg-clay-700"
          >
            Ver proveedores
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
