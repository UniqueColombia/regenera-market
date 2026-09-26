import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Building2, Plus, Tags } from "lucide-react";
import { Giros } from "./giros";
import { Historial } from "./historial";
import {
  guardarLogo,
  guardarPortada,
  quitarLogo,
  quitarPortada,
} from "./actions";
import { ProgresoNivel } from "@/components/progreso-nivel";
import { SelectorImagen } from "@/components/selector-imagen";
import { requireUser } from "@/lib/auth";
import { getEventosDeExperiencia, getMiEmpresa, getOfertasDeEmpresa } from "@/lib/repo";
import { nivelPorId } from "@/lib/niveles";
import { GIROS_POR_NIVEL } from "@/lib/taxonomy";

export const metadata: Metadata = {
  title: "Tu empresa",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/**
 * La empresa de quien está mirando: su logo, su nivel y de dónde salieron sus
 * puntos.
 *
 * ## Por qué esta pantalla existe
 *
 * El nivel decide la comisión de cada venta y hasta ahora el proveedor no tenía
 * **ningún** sitio donde ver el suyo. `/niveles` explica cómo funciona el
 * sistema en abstracto, que es otra cosa: quien ya está dentro quiere saber en
 * cuál está él, cuánto le falta y por qué. El historial es la mitad que hace
 * creíble a la otra — un número que sube solo, sin decir de dónde, se lee como
 * arbitrario.
 *
 * ## Quien no gestiona ninguna empresa
 *
 * No ve un error: ve la invitación a dar de alta la suya. Llegar aquí sin
 * empresa es lo que le pasa a un comprador que sigue el enlace del menú por
 * curiosidad, y tratarlo como un fallo sería tratar la curiosidad como un fallo.
 */
export default async function EmpresaPage() {
  await requireUser("/cuenta/empresa");
  const empresa = await getMiEmpresa();

  if (!empresa) {
    return (
      <div className="container-page max-w-2xl py-12">
        <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.2em] text-brand-600">
          <Building2 className="size-4" />
          Tu empresa
        </p>
        <h1 className="mt-3 font-display text-3xl text-ink">
          Todavía no vendes en Seregenera
        </h1>
        <p className="mt-3 text-muted">
          Si tienes un producto o un servicio que encaje aquí, das de alta tu
          empresa en un formulario y publicas el mismo día.
        </p>
        <Link
          href="/vender#postular"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Dar de alta mi empresa
          <ArrowRight className="size-4" />
        </Link>
      </div>
    );
  }

  const [eventos, ofertas] = await Promise.all([
    getEventosDeExperiencia(empresa.id),
    getOfertasDeEmpresa(empresa.id),
  ]);
  const publicadas = ofertas.filter((o) => o.status === "approved").length;
  const enRevision = ofertas.filter((o) => o.status === "pending_review").length;

  return (
    <div className="container-page max-w-2xl py-12">
      <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.2em] text-brand-600">
        <Building2 className="size-4" />
        Tu empresa
      </p>
      <h1 className="mt-3 font-display text-3xl text-ink">{empresa.name}</h1>
      <p className="mt-2 text-sm text-muted">
        {empresa.city}, {empresa.department} ·{" "}
        <Link
          href={`/proveedor/${empresa.slug}`}
          className="font-medium text-brand-700 underline underline-offset-4"
        >
          ver tu ficha pública
        </Link>
      </p>

      {/* Lo primero, porque es para lo que se viene aquí: publicar. Antes de
          esta tanda una empresa no tenía desde dónde crear una oferta y tenía
          que pedírsela al equipo. */}
      <section className="mt-10">
        <div className="rounded-xl bg-brand-50 p-6 ring-1 ring-brand-100">
          <h2 className="flex items-center gap-2 font-display text-xl text-brand-900">
            <Tags className="size-5 text-brand-600" aria-hidden />
            Lo que vendes
          </h2>
          <p className="mt-1 text-sm text-brand-800">
            {ofertas.length === 0
              ? "Todavía no publicas nada. Productos, experiencias o servicios: empieza por lo que más vendes."
              : `${publicadas} ${publicadas === 1 ? "publicada" : "publicadas"}${
                  enRevision > 0 ? ` · ${enRevision} en revisión` : ""
                } · ${ofertas.length} en total`}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/cuenta/empresa/ofertas/nueva"
              className="inline-flex items-center gap-2 rounded-full bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
            >
              <Plus className="size-4" />
              Nueva oferta
            </Link>
            {ofertas.length > 0 && (
              <Link
                href="/cuenta/empresa/ofertas"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-brand-700 ring-1 ring-brand-200 transition hover:bg-sand"
              >
                Ver todas
                <ArrowRight className="size-4" />
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl text-ink">Tu giro</h2>
        <p className="mt-1 text-sm text-muted">
          ¿Qué es tu empresa y qué ofrece? Una ecoposada puede ser alojamiento,
          restaurante, transporte y tours a la vez. Lo ven los compradores en tu
          ficha.
        </p>
        <div className="mt-3 rounded-xl bg-white p-5 ring-1 ring-hairline">
          <Giros
            iniciales={empresa.giros}
            tope={GIROS_POR_NIVEL[empresa.tier]}
            nivel={nivelPorId(empresa.tier)?.label ?? "Semilla"}
            verificada={empresa.evaluacionVerificada}
          />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl text-ink">La cara de tu ficha</h2>
        <p className="mt-1 text-sm text-muted">
          Son dos imágenes distintas y hacen dos cosas distintas: el logo te
          identifica en cualquier lista, y la portada es lo primero que ve quien
          abre tu ficha.
        </p>

        <div className="mt-3 space-y-3">
          <div className="rounded-xl bg-white p-5 ring-1 ring-hairline">
            <h3 className="font-display text-base text-ink">Tu logo</h3>
            <div className="mt-4">
              <SelectorImagen
                nombre={empresa.name}
                imagenUrl={empresa.logoUrl}
                forma="cuadrada"
                guardar={guardarLogo}
                quitar={quitarLogo}
                ayuda="Sale en tu ficha, en el catálogo y en lo que publiques en la Comunidad. Lo recortamos a cuadrado desde el centro; si tu logo es alargado, déjale aire alrededor antes de subirlo."
              />
            </div>
          </div>

          <div className="rounded-xl bg-white p-5 ring-1 ring-hairline">
            <h3 className="font-display text-base text-ink">
              La foto de portada
            </h3>
            <div className="mt-4">
              <SelectorImagen
                nombre={empresa.name}
                imagenUrl={empresa.coverUrl}
                forma="apaisada"
                proporcion="apaisada"
                guardar={guardarPortada}
                quitar={quitarPortada}
                ayuda="Ocupa todo el ancho al abrir tu ficha, detrás de tu nombre. Funciona mejor una foto de tu taller, tu cultivo o tu equipo trabajando que un montaje con texto: encima va el título y no se leerían los dos. Si no subes ninguna, usamos la foto de una de tus ofertas."
              />
            </div>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl text-ink">Tu nivel</h2>
        <div className="mt-3 rounded-xl bg-white p-6 ring-1 ring-hairline">
          <ProgresoNivel puntos={empresa.experiencePoints} />
        </div>

        {empresa.evaluacionVerificada && (
          <p className="mt-3 flex items-start gap-2 text-sm text-muted">
            <BadgeCheck className="mt-0.5 size-4 shrink-0 text-clay-600" />
            Tu evaluación de sostenibilidad está verificada, y eso es distinto
            del nivel: el sello mide cómo operas y el nivel mide tu actividad.
          </p>
        )}

        <p className="mt-3 text-xs text-muted">
          <Link
            href="/niveles"
            className="font-medium text-brand-700 underline underline-offset-4"
          >
            Cómo funcionan los niveles
          </Link>{" "}
          y qué suma cada cosa.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl text-ink">De dónde salen tus puntos</h2>
        <p className="mt-1 text-sm text-muted">
          Cada línea es algo que hiciste. Los puntos suben y no bajan.
        </p>
        <Historial eventos={eventos} />
      </section>
    </div>
  );
}
