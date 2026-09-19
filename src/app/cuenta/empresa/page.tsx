import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Building2 } from "lucide-react";
import { Historial } from "./historial";
import { guardarLogo, quitarLogo } from "./actions";
import { ProgresoNivel } from "@/components/progreso-nivel";
import { SelectorImagen } from "@/components/selector-imagen";
import { requireUser } from "@/lib/auth";
import { getEventosDeExperiencia, getMiEmpresa } from "@/lib/repo";

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

  const eventos = await getEventosDeExperiencia(empresa.id);

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

      <section className="mt-10">
        <h2 className="font-display text-xl text-ink">Tu logo</h2>
        <div className="mt-3 rounded-xl bg-white p-5 ring-1 ring-hairline">
          <SelectorImagen
            nombre={empresa.name}
            imagenUrl={empresa.logoUrl}
            forma="cuadrada"
            guardar={guardarLogo}
            quitar={quitarLogo}
            ayuda="Sale en tu ficha, en el catálogo y en lo que publiques en la Comunidad. Lo recortamos a cuadrado desde el centro; si tu logo es alargado, déjale aire alrededor antes de subirlo."
          />
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
