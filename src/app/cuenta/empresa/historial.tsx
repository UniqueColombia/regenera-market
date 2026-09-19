import { EXPERIENCIA } from "@/lib/niveles";
import type { EventoExperiencia } from "@/lib/repo";

/**
 * De dónde salió cada punto.
 *
 * Es la invariante 14 de `dominio-regenera` puesta en pantalla: el puntaje tiene
 * que poder seguirse punto por punto. Hasta ahora los eventos se apuntaban en
 * `experience_events` y no había dónde verlos, así que el nivel era un número
 * que subía solo.
 *
 * **Los eventos con una clave desconocida se muestran igual.** `migracion_0006`
 * acreditó a cada proveedor el nivel que ya tenía cuando el modelo cambió, y no
 * está en la tabla `EXPERIENCIA` porque no es algo que nadie pueda volver a
 * hacer. Esconderlo haría que la suma de la lista no cuadrara con el total —
 * justo lo que una auditoría tiene que poder comprobar.
 */

/** Las claves que no están en `EXPERIENCIA` porque no son un logro repetible. */
const ESPECIALES: Record<string, string> = {
  migracion_0006: "Nivel que ya tenías antes de que existieran los puntos",
};

export function Historial({ eventos }: { eventos: EventoExperiencia[] }) {
  if (eventos.length === 0) {
    return (
      <p className="mt-4 rounded-xl bg-white p-6 text-sm text-muted ring-1 ring-hairline">
        Todavía no tienes puntos apuntados. Los primeros los dan completar tu
        ficha y publicar tu primera oferta.
      </p>
    );
  }

  return (
    <ul className="mt-4 space-y-2">
      {eventos.map((e) => {
        const conocido = EXPERIENCIA.find((x) => x.clave === e.clave);
        const titulo = conocido?.titulo ?? ESPECIALES[e.clave] ?? e.clave;

        return (
          <li
            key={e.id}
            className="flex items-center gap-4 rounded-xl bg-white p-4 ring-1 ring-hairline"
          >
            <p className="w-14 shrink-0 text-right font-display text-xl tabular-nums text-brand-700">
              +{e.puntos}
            </p>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink">{titulo}</p>
              <p className="text-xs text-muted">
                {new Date(e.createdAt).toLocaleDateString("es-CO", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
