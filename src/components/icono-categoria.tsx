import { createElement } from "react";
import {
  BedDouble,
  Briefcase,
  Bus,
  Droplets,
  Leaf,
  Recycle,
  Sprout,
  UtensilsCrossed,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * El icono de cada categoría del catálogo.
 *
 * Vive aquí y no en `src/lib/taxonomy.ts` para que la taxonomía siga siendo
 * datos puros, sin componentes: la leen también las acciones del servidor, que
 * no tienen por qué arrastrar `lucide-react`.
 *
 * Una categoría desconocida —una fila anterior a la 0012 que la conversión no
 * alcanzó— recibe la hoja, que es el icono genérico del sitio.
 */
const ICONOS: Record<string, LucideIcon> = {
  agua: Droplets,
  energia: Zap,
  residuos: Recycle,
  habitacion: BedDouble,
  gastronomia: UtensilsCrossed,
  territorio: Sprout,
  movilidad: Bus,
  consultoria: Briefcase,
};

/**
 * El icono ya pintado.
 *
 * Se exporta el componente y no la tabla porque `const Icono = TABLA[id]`
 * seguido de `<Icono />` dentro de un componente es, para el compilador de
 * React, **crear un
 * componente durante el render** (regla `react-hooks/static-components`): cada
 * render vería un tipo nuevo y desmontaría lo que hubiera dentro. Aquí la
 * búsqueda y el `createElement` van juntos, y el tipo que llega a React es
 * siempre uno de los de la tabla.
 */
export function IconoCategoria({
  id,
  className,
}: {
  id: string;
  className?: string;
}) {
  return createElement(ICONOS[id] ?? Leaf, { className, "aria-hidden": true });
}
