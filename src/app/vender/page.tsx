import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  FileCheck2,
  FileText,
  Globe2,
  LineChart,
  Store,
  TrendingDown,
} from "lucide-react";
import { ApplicationForm, type DatosConocidos } from "./application-form";
import { HeroBanner } from "@/components/hero-banner";
import { Revelar } from "@/components/revelar";
import { getSesion } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { mostrarTelefono } from "@/lib/telefono";
import { NIVELES, comisionEnPorcentaje } from "@/lib/niveles";

export const metadata: Metadata = {
  title: "Vende en Seregenera",
  description:
    "Registra tu empresa, cooperativa o comunidad y publica hoy mismo productos, experiencias y servicios regenerativos para hoteles, glampings, restaurantes y operadores de Colombia y América Latina. Publicar es gratis: solo se cobra comisión cuando vendes.",
};

/**
 * Qué servicios presta Seregenera a un proveedor.
 *
 * **Cada tarjeta nombra algo que la plataforma hace**, no algo que no hace. La
 * primera decía «Publicas hoy, no cuando te aprobemos», y debajo explicaba que
 * no hay comité, ni cinco días hábiles, ni un correo que nunca llega. Todo eso
 * es verdad, y ninguna de esas frases dice qué recibe quien se registra: quien
 * llega a esta página quiere saber qué le dan, no de qué se libra.
 *
 * La regla, que vale para el resto de la página: si una frase se puede
 * sustituir por «no te hacemos X» sin perder información, sobra. Está en la
 * skill `redaccion-producto`.
 */
const BENEFICIOS = [
  {
    icon: Store,
    titulo: "Tu catálogo publicado y buscable",
    cuerpo:
      "Una ficha por cada producto, experiencia o servicio, con fotos, precio mayorista y tiempo de entrega. Aparece en el catálogo, en el buscador y en los filtros por vertical y por territorio.",
  },
  {
    icon: Banknote,
    titulo: "Cobro y dispersión de cada pedido",
    cuerpo: `Seregenera le cobra al comprador, retiene la comisión de esa venta y te dispersa el resto. Cada pedido llega con su referencia y su estado. Sin mensualidad, sin cobro por destacar y sin límite de publicaciones.`,
  },
  {
    icon: TrendingDown,
    titulo: "Comisión que baja con tu nivel",
    cuerpo: `Empiezas en ${comisionEnPorcentaje(NIVELES[0].comision)} %. Publicar, entregar pedidos, responder cotizaciones, recibir buenas reseñas y escribir en la Comunidad suman experiencia, y con ella el nivel baja la comisión hasta ${comisionEnPorcentaje(NIVELES[NIVELES.length - 1].comision)} %.`,
  },
  {
    icon: LineChart,
    titulo: "Ficha de impacto por unidad",
    cuerpo:
      "Calculamos y mostramos el CO₂, el agua y los residuos que evita cada producto tuyo. Es lo que necesita el comprador corporativo para sustentar su reporte de sostenibilidad.",
  },
  {
    icon: FileText,
    titulo: "Cotizaciones de compradores grandes",
    cuerpo:
      "Un hotel que necesita volumen o algo a medida te lo pide desde tu ficha. Llega como cotización, con qué quiere y para cuándo, y respondes con tu precio.",
  },
  {
    icon: BadgeCheck,
    titulo: "Evaluación de sostenibilidad y su sello",
    cuerpo:
      "Seis dimensiones con evidencia documental que revisa nuestro equipo. Aprobarla pone el sello en tu ficha y es, con diferencia, lo que más experiencia suma.",
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

/**
 * El formulario ya no vuelve a preguntar lo que la sesión sabe.
 *
 * `profiles` solo lo puede leer su dueño (`profiles_own`), así que esta consulta
 * devuelve el perfil de quien mira o nada — no hace falta filtrar por id, y no
 * filtrarlo es lo que hace que la política sea la que decide.
 *
 * El teléfono se guarda en E.164 (+573001234567) y se muestra formateado: meter
 * el crudo en un campo de texto que la persona va a leer es enseñarle la tripa
 * del sistema.
 */
async function datosConocidos(): Promise<DatosConocidos> {
  const sesion = await getSesion();
  if (!sesion) return {};

  const db = await createClient();
  const { data: perfil } = await db
    .from("profiles")
    .select("full_name, phone")
    .maybeSingle();

  return {
    contactName: perfil?.full_name || sesion.nombre,
    email: sesion.email,
    phone: mostrarTelefono(perfil?.phone) || undefined,
  };
}

export const dynamic = "force-dynamic";

export default async function VenderPage() {
  const sesion = await getSesion();
  const conocidos = await datosConocidos();

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
          <h2 className="font-display text-3xl text-ink">
            Qué incluye vender en Seregenera
          </h2>
          <p className="mt-2 max-w-2xl text-muted">
            Seis servicios, todos sin costo fijo. Lo único que se cobra es la
            comisión de una venta cerrada.
          </p>
        </Revelar>
        <ul className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
              entregando pedidos, respondiendo cotizaciones, recibiendo buenas
              reseñas y aportando en la Comunidad.
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
              Cuatro condiciones, todas sobre tu organización y sobre lo que
              vendes.
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
          <h2 className="font-display text-3xl text-ink">Registra tu empresa</h2>
          <p className="mt-2 text-muted">
            Tres pasos y unos dos minutos: los datos de la organización, quién la
            representa y qué vende. Con la sesión abierta, al terminar ya tienes
            ficha y puedes publicar.
          </p>
          {!sesion && (
            <p className="mt-3 text-sm text-muted">
              ¿Todavía no tienes cuenta?{" "}
              <Link
                href="/registro?volver=%2Fvender"
                className="font-medium text-brand-700 underline underline-offset-4"
              >
                Créala primero
              </Link>{" "}
              y tu empresa queda activa en el acto. También puedes llenar el
              formulario sin cuenta: guardamos la postulación y te escribimos
              para que la actives.
            </p>
          )}
          <div className="mt-8">
            <ApplicationForm conocidos={conocidos} />
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
