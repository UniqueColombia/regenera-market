import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, LineChart, Store, Users } from "lucide-react";
import { ApplicationForm } from "./application-form";
import { HeroBanner } from "@/components/hero-banner";
import { COMMISSION_RATE } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Vende en Seregenera",
  description:
    "Postula tu empresa, cooperativa o comunidad para vender productos, experiencias y servicios regenerativos a hoteles, glampings, restaurantes y operadores de todo Colombia.",
};

const BENEFITS = [
  {
    icon: Store,
    title: "Un canal que ya trae al comprador",
    body: "Hoteles, glampings, restaurantes y operadores llegan buscando exactamente lo que produces. No tienes que salir a tocar puertas una por una.",
  },
  {
    icon: Banknote,
    title: "Comisión solo cuando vendes",
    body: `Publicar es gratis. Retenemos ${Math.round(COMMISSION_RATE * 100)}% sobre cada venta cerrada y el resto se te dispersa. Sin mensualidad ni cobro por destacar.`,
  },
  {
    icon: LineChart,
    title: "Tu impacto se vuelve argumento de venta",
    body: "Cada ficha muestra el CO₂, el agua y los residuos que evita tu producto. Es lo que convence al comprador corporativo que necesita sustentar su reporte.",
  },
  {
    icon: Users,
    title: "Verificación que te diferencia",
    body: "El sello Semilla, Raíz o Bosque te distingue de quien solo dice ser sostenible. Y te decimos exactamente qué mejorar para subir de nivel.",
  },
];

export default function VenderPage() {
  return (
    <div>
      <HeroBanner
        foto="/img/secciones/hero-vender.webp"
        encabezado="Para proveedores"
        titulo="Vende lo que produces a todo el turismo colombiano"
      >
        <p className="mt-4 max-w-2xl text-lg text-brand-100">
          Buscamos cooperativas, talleres, consejos comunitarios y empresas que
          produzcan de forma regenerativa. Si tu operación deja el territorio
          mejor de como lo encontró, este es tu canal.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href="#postular"
            className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-brand-800 hover:bg-brand-50"
          >
            Postular mi empresa
          </a>
          <Link
            href="/verificacion"
            className="rounded-full border border-brand-400 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-800"
          >
            Calcular mi puntaje primero
          </Link>
        </div>
      </HeroBanner>

      <section className="container-page py-14">
        <h2 className="font-display text-3xl text-ink">Qué te damos</h2>
        <ul className="mt-8 grid gap-4 md:grid-cols-2">
          {BENEFITS.map((b) => (
            <li
              key={b.title}
              className="rounded-xl bg-white p-6 ring-1 ring-hairline"
            >
              <b.icon className="size-7 text-brand-600" />
              <h3 className="mt-4 font-display text-lg text-ink">{b.title}</h3>
              <p className="mt-2 text-sm text-muted">{b.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-sand py-14">
        <div className="container-page">
          <h2 className="font-display text-3xl text-ink">Qué pedimos</h2>
          <ul className="mt-6 grid max-w-3xl gap-3">
            {[
              "Estar formalizado: RUT vigente y matrícula mercantil, o el documento equivalente si eres una asociación o consejo comunitario.",
              "Poder sustentar con documentos lo que declares en la evaluación de sostenibilidad.",
              "Capacidad real de despachar lo que publiques, en el plazo que prometas.",
              "Aceptar una visita de verificación en sitio si tu postulación la amerita.",
            ].map((req) => (
              <li
                key={req}
                className="flex gap-3 rounded-lg bg-white p-4 text-sm text-ink ring-1 ring-hairline"
              >
                <span
                  aria-hidden
                  className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-600"
                />
                {req}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="postular" className="container-page py-14">
        <div className="mx-auto max-w-2xl">
          <h2 className="font-display text-3xl text-ink">Postula tu empresa</h2>
          <p className="mt-2 text-muted">
            Cuéntanos quién eres y qué produces. Te respondemos en menos de cinco
            días hábiles con los siguientes pasos de la evaluación.
          </p>
          <div className="mt-8">
            <ApplicationForm />
          </div>
        </div>
      </section>
    </div>
  );
}
