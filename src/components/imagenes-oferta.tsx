"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
import { recortar, type ResultadoImagenUI } from "./selector-imagen";

/** Cuántas fotos admite una oferta. Con más, la ficha deja de leerse como una galería. */
const MAXIMO = 6;

/**
 * Las fotos de una oferta: se eligen del teléfono o del computador, se
 * recortan a 4:3 en el navegador y se suben al elegirlas.
 *
 * Antes era una caja de texto que pedía «una dirección por línea», y nadie que
 * vende alojamiento o cacao tiene la dirección de una foto: tiene la foto.
 *
 * Lo que viaja con el formulario es solo la lista de URL, en un `<input hidden
 * name="images">` separada por saltos de línea — el formato que
 * `src/lib/ofertas.ts` ya entiende. La primera foto es la principal: la que se
 * ve en la tarjeta del catálogo.
 *
 * La subida pasa por `subir`, una Server Action distinta según quién edite
 * (la empresa, o el equipo en nombre de un proveedor). El recorte es
 * comodidad; el servidor vuelve a comprobar tipo y peso.
 */
export function ImagenesOferta({
  iniciales,
  subir,
  datosExtra,
}: {
  iniciales: string[];
  subir: (datos: FormData) => Promise<ResultadoImagenUI>;
  /** Campos que la acción necesita además de la foto (en administración, el proveedor). */
  datosExtra?: () => Record<string, string>;
}) {
  const [urls, setUrls] = useState<string[]>(iniciales);
  const [subiendo, setSubiendo] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  async function elegidas(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivos = Array.from(evento.target.files ?? []);
    // Limpiar siempre: elegir el mismo archivo otra vez tras un fallo no
    // dispara `change` si el valor sigue puesto.
    evento.target.value = "";
    if (archivos.length === 0) return;

    setError(null);
    const hueco = MAXIMO - urls.length - subiendo;
    if (hueco <= 0) {
      setError(`Cada oferta admite hasta ${MAXIMO} fotos. Quita alguna para subir otra.`);
      return;
    }
    if (archivos.length > hueco) {
      setError(`Solo caben ${hueco} más; subimos las primeras ${hueco}.`);
    }

    await Promise.all(archivos.slice(0, hueco).map(subirUna));
  }

  async function subirUna(archivo: File) {
    setSubiendo((n) => n + 1);
    try {
      let recortada: Blob;
      try {
        recortada = await recortar(archivo, "foto");
      } catch {
        setError("No pudimos leer una de las fotos. Prueba con JPG, PNG o WebP.");
        return;
      }
      const datos = new FormData();
      datos.set("imagen", recortada, "imagen");
      for (const [k, v] of Object.entries(datosExtra?.() ?? {})) datos.set(k, v);

      const r = await subir(datos);
      if (r.ok) setUrls((previas) => [...previas, r.url]);
      else setError(r.error);
    } finally {
      setSubiendo((n) => n - 1);
    }
  }

  function quitar(i: number) {
    setUrls((previas) => previas.filter((_, j) => j !== i));
  }

  function hacerPrincipal(i: number) {
    setUrls((previas) => [previas[i], ...previas.filter((_, j) => j !== i)]);
  }

  const lleno = urls.length + subiendo >= MAXIMO;

  return (
    <div>
      <input type="hidden" name="images" value={urls.join("\n")} />

      {(urls.length > 0 || subiendo > 0) && (
        <ul className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {urls.map((url, i) => (
            <li key={url} className="space-y-1.5">
              <div className="relative aspect-4/3 overflow-hidden rounded-lg bg-sand ring-1 ring-hairline">
                {/* `<img>` y no `next/image`: es una vista previa de lo recién
                    subido, sin necesidad del optimizador. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Foto ${i + 1}`} className="size-full object-cover" />
                {i === 0 && (
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-brand-700 px-2 py-0.5 text-[11px] font-semibold text-white">
                    Principal
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {i > 0 && (
                  <button
                    type="button"
                    onClick={() => hacerPrincipal(i)}
                    className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-brand-700 ring-1 ring-control transition hover:bg-sand"
                  >
                    <Star className="size-3.5" aria-hidden />
                    Principal
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => quitar(i)}
                  className="ml-auto flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-muted ring-1 ring-hairline transition hover:bg-sand hover:text-red-700"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  Quitar
                </button>
              </div>
            </li>
          ))}
          {Array.from({ length: subiendo }).map((_, i) => (
            <li key={`subiendo-${i}`}>
              <div className="grid aspect-4/3 place-items-center rounded-lg bg-sand ring-1 ring-hairline">
                <Loader2 className="size-6 animate-spin text-brand-600" aria-label="Subiendo foto" />
              </div>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        disabled={lleno}
        onClick={() => entrada.current?.click()}
        className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-brand-700 ring-1 ring-control transition hover:bg-sand disabled:opacity-40"
      >
        <ImagePlus className="size-4" aria-hidden />
        {urls.length === 0 ? "Subir fotos" : "Agregar más fotos"}
      </button>

      <p className="mt-2 text-xs text-muted">
        Elige fotos de tu celular o computador (hasta {MAXIMO}). La primera es la
        que se ve en el catálogo; las recortamos a formato 4:3 desde el centro. Si
        no subes ninguna, la ficha usa un fondo de color.
      </p>
      {error && (
        <p role="status" className="mt-1 text-xs text-red-700">
          {error}
        </p>
      )}

      <input
        ref={entrada}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/*"
        onChange={elegidas}
        className="sr-only"
        aria-label="Elegir fotos de la oferta"
      />
    </div>
  );
}
