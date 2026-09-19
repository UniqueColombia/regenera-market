import Link from "next/link";
import { TierBadge } from "./tier-badge";
import { comisionEnPorcentaje, progresoDe } from "@/lib/niveles";

/**
 * Dónde está una empresa dentro de su nivel.
 *
 * Componente de servidor: todo lo que pinta sale de `progresoDe()`, que es
 * cálculo puro sobre los puntos. Ninguna cuenta se hace aquí — la tabla de
 * niveles, los umbrales y las comisiones viven en `src/lib/niveles.ts`, que es
 * el gemelo de la migración 0006.
 *
 * ## La barra mide el tramo, no el total
 *
 * Alguien con 600 puntos acaba de entrar a Raíz y su barra empieza de cero otra
 * vez. Medirla sobre el total daría una barra que casi no se mueve durante
 * meses, que es la forma más rápida de que nadie vuelva a mirarla. La decisión
 * está en `progresoDe()`; esto solo la dibuja.
 *
 * ## Por qué se nombra la comisión
 *
 * Porque es lo que el nivel significa en dinero. «Vas por 340 de 600» no le
 * dice nada a nadie; «al llegar a Raíz pagas dos puntos menos de comisión en
 * cada venta» sí. Es también un límite real —de los que la regla 2 de
 * `redaccion-producto` sí manda decir—, no la descripción de un trámite.
 */
export function ProgresoNivel({
  puntos,
  compacto = false,
}: {
  puntos: number;
  /** En `/cuenta`, donde es un resumen con enlace. Completo en `/cuenta/empresa`. */
  compacto?: boolean;
}) {
  const p = progresoDe(puntos);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TierBadge tier={p.nivel.id} size="md" />
        <p className="text-sm text-muted">
          <span className="font-display text-2xl tabular-nums text-brand-700">
            {p.puntos.toLocaleString("es-CO")}
          </span>{" "}
          {p.puntos === 1 ? "punto" : "puntos"} de experiencia
        </p>
      </div>

      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-sand"
        role="progressbar"
        aria-valuenow={p.porcentaje}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={
          p.siguiente
            ? `Progreso hacia ${p.siguiente.label}`
            : `Nivel ${p.nivel.label}, el más alto`
        }
      >
        <div
          className="h-full rounded-full bg-brand-600 transition-[width] duration-500"
          style={{ width: `${p.porcentaje}%` }}
        />
      </div>

      {p.siguiente ? (
        <p className="mt-3 text-sm text-muted">
          Te faltan{" "}
          <span className="font-medium tabular-nums text-ink">
            {p.faltan.toLocaleString("es-CO")}
          </span>{" "}
          para {p.siguiente.label}. Al llegar, tu comisión baja del{" "}
          {comisionEnPorcentaje(p.nivel.comision)} % al{" "}
          {comisionEnPorcentaje(p.siguiente.comision)} % en cada venta que
          cierres.
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted">
          Estás en el nivel más alto, con la comisión más baja:{" "}
          {comisionEnPorcentaje(p.nivel.comision)} % por venta cerrada.
        </p>
      )}

      {compacto && (
        <Link
          href="/cuenta/empresa"
          className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-brand-700 underline underline-offset-4"
        >
          Ver de dónde salen tus puntos
        </Link>
      )}
    </div>
  );
}
