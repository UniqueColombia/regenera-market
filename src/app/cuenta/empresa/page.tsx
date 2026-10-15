import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Building2, FileSpreadsheet, Plus, Tags, Truck } from "lucide-react";
import { Giros } from "./giros";
import { CerrarEmpresa } from "./cerrar-empresa";
import { Historial } from "./historial";
import {
  guardarLogo,
  guardarPortada,
  quitarLogo,
  quitarPortada,
} from "./actions";
import { FondoBotanico } from "@/components/fondo-botanico";
import { ProgresoNivel } from "@/components/progreso-nivel";
import { SelectorImagen } from "@/components/selector-imagen";
import { Tarjeta } from "@/components/tarjeta";
import { requireUser } from "@/lib/auth";
import { bajaDisponible, getEventosDeExperiencia, getMiEmpresa, getOfertasDeEmpresa } from "@/lib/repo";
import { EXPERIENCIA, nivelPorId } from "@/lib/niveles";
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
      <div className="relative isolate">
      <FondoBotanico />
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
      </div>
    );
  }

  const [eventos, ofertas] = await Promise.all([
    getEventosDeExperiencia(empresa.id),
    getOfertasDeEmpresa(empresa.id),
  ]);
  const publicadas = ofertas.filter((o) => o.status === "approved").length;
  // Lo que más puntos da y todavía se puede conseguir: lo que se hace una sola
  // vez y ya se hizo no se sugiere. Llena «Tu nivel» con algo que sirve, en vez
  // del hueco que dejaba al lado de «Tu giro».
  const conseguidos = new Set(eventos.map((e) => e.clave));
  const queMasSuma = [...EXPERIENCIA]
    .filter((x) => x.repetible || !conseguidos.has(x.clave))
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, 3);
  const enRevision = ofertas.filter((o) => o.status === "pending_review").length;

  return (
    <div className="relative isolate">
      <FondoBotanico />
      <div className="container-page py-12">
        <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.2em] text-brand-600">
          <Building2 className="size-4" />
          Tu empresa
        </p>
        <h1 className="mt-3 font-display text-3xl text-ink sm:text-4xl">{empresa.name}</h1>
        <p className="mt-2 text-sm text-muted">
          {empresa.city}, {empresa.department} ·{" "}
          <Link
            href={`/proveedor/${empresa.slug}`}
            className="font-medium text-brand-700 underline underline-offset-4"
          >
            ver tu ficha pública
          </Link>
        </p>

        {/* Una columna de bloques a lo ancho, y dos donde caben dos del mismo
            peso (giro y nivel; logo y portada dentro de un mismo bloque). Así
            ninguna columna termina mucho antes que la otra dejando un hueco, y
            lo que se lee de corrido —tus puntos, cerrar la empresa— va centrado
            y entero. En el teléfono, todo en una columna en este mismo orden. */}
        <div className="mt-8 space-y-6">
          {/* Lo primero, porque es para lo que se viene aquí: publicar. */}
          <Tarjeta
            tono="marca"
            i={0}
            className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
          >
            <div>
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
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/cuenta/empresa/ofertas/nueva"
                className="inline-flex items-center gap-2 rounded-full bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
              >
                <Plus className="size-4" />
                Nueva oferta
              </Link>
              <Link
                href="/cuenta/empresa/ofertas/importar"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-brand-700 ring-1 ring-brand-200 transition hover:bg-sand"
              >
                <FileSpreadsheet className="size-4" />
                Cargar varias desde Excel
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
              {ofertas.length > 0 && (
                // Donde se despacha lo vendido y se carga la guía.
                <Link
                  href="/cuenta/empresa/pedidos"
                  className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-brand-700 ring-1 ring-brand-200 transition hover:bg-sand"
                >
                  <Truck className="size-4" />
                  Pedidos
                </Link>
              )}
            </div>
          </Tarjeta>

          <div className="grid gap-6 lg:grid-cols-2">
            <Tarjeta i={1}>
              <h2 className="font-display text-xl text-ink">Tu giro</h2>
              <p className="mt-1 text-sm text-muted">
                ¿Qué es tu empresa y qué ofrece? Una ecoposada puede ser
                alojamiento, restaurante, transporte y tours a la vez. Lo ven los
                compradores en tu ficha.
              </p>
              <div className="mt-4">
                <Giros
                  iniciales={empresa.giros}
                  tope={GIROS_POR_NIVEL[empresa.tier]}
                  nivel={nivelPorId(empresa.tier)?.label ?? "Semilla"}
                  verificada={empresa.evaluacionVerificada}
                />
              </div>
            </Tarjeta>

            <Tarjeta i={2} className="flex flex-col">
              <h2 className="font-display text-xl text-ink">Tu nivel</h2>
              <div className="mt-4">
                <ProgresoNivel puntos={empresa.experiencePoints} />
              </div>

              {empresa.evaluacionVerificada && (
                <p className="mt-4 flex items-start gap-2 text-sm text-muted">
                  <BadgeCheck className="mt-0.5 size-4 shrink-0 text-clay-600" />
                  Tu evaluación de sostenibilidad está verificada, y eso es
                  distinto del nivel: el sello mide cómo operas y el nivel mide tu
                  actividad.
                </p>
              )}

              <div className="mt-5 border-t border-hairline pt-4">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
                  Lo que más te suma ahora
                </h3>
                <ul className="mt-2 space-y-1.5">
                  {queMasSuma.map((x) => (
                    <li key={x.clave} className="flex items-baseline gap-3 text-sm">
                      <span className="w-12 shrink-0 text-right font-display text-lg tabular-nums text-brand-700">
                        +{x.puntos}
                      </span>
                      <span className="text-ink">{x.titulo}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <p className="mt-auto pt-4 text-xs text-muted">
                <Link
                  href="/niveles"
                  className="font-medium text-brand-700 underline underline-offset-4"
                >
                  Cómo funcionan los niveles
                </Link>{" "}
                y qué suma cada cosa.
              </p>
            </Tarjeta>
          </div>

          <Tarjeta i={3}>
            {/* El título y la explicación van en la columna del logo: arriba de
                las dos dejaban esa columna medio vacía al lado de la portada. */}
            <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-8">
              <div>
                <h2 className="font-display text-xl text-ink">La cara de tu ficha</h2>
                <p className="mt-1 text-sm text-muted">
                  Son dos imágenes distintas y hacen dos cosas distintas: el logo
                  te identifica en cualquier lista, y la portada es lo primero que
                  ve quien abre tu ficha.
                </p>
                <h3 className="mt-5 font-display text-base text-ink">Tu logo</h3>
                <div className="mt-3">
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

              <div className="border-t border-hairline pt-6 md:border-l md:border-t-0 md:pl-8 md:pt-0">
                <h3 className="font-display text-base text-ink">La foto de portada</h3>
                <div className="mt-3">
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
          </Tarjeta>

          <Tarjeta i={4}>
            <h2 className="font-display text-xl text-ink">De dónde salen tus puntos</h2>
            <p className="mt-1 text-sm text-muted">
              Cada línea es algo que hiciste. Los puntos suben y no bajan (salvo
              que elimines la publicación que los dio).
            </p>
            <Historial eventos={eventos} />
          </Tarjeta>

          {(await bajaDisponible()) && <CerrarEmpresa nombre={empresa.name} />}
        </div>
      </div>
    </div>
  );
}
