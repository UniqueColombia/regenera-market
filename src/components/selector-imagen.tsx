"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { ProviderAvatar } from "./provider-avatar";

/**
 * Elegir, recortar y subir una imagen: la foto de una persona o el logo de una
 * empresa.
 *
 * ## Por qué el recorte se hace en el navegador
 *
 * Tres razones, y la primera es la que manda:
 *
 * 1. **Una foto de un teléfono pesa entre 3 y 8 MB.** El límite por defecto del
 *    cuerpo de una Server Action es 1 MB, así que subirla tal cual no falla a
 *    veces: falla siempre, y con un error que no dice nada. Reducida a 512 px
 *    en WebP queda entre 20 y 120 kB.
 * 2. **El recorte es una decisión visual y aquí se ve.** La imagen se encuadra
 *    en cuadrado desde el centro y se previsualiza antes de guardarse.
 * 3. Sube lo mismo desde una conexión mala que desde una buena, que es la
 *    diferencia entre que un proveedor rural ponga su logo o lo deje para
 *    luego.
 *
 * Lo que el navegador hace **no** es una barrera de seguridad: es comodidad. El
 * servidor vuelve a comprobar tipo y peso en `revisarImagen()`, y las políticas
 * de Storage comprueban además de quién es la carpeta. Quien mande el
 * `FormData` a mano se encuentra con las dos.
 *
 * ## Se guarda al elegir, sin botón de confirmar
 *
 * Elegir una foto ya es la confirmación; pedir además un «guardar» es un paso
 * que solo sirve para que alguien se vaya creyendo que la subió. Lo que sí hay
 * es cómo deshacerlo: quitar la imagen y volver al monograma.
 */

export type ResultadoImagenUI =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * Cuánto mide el recorte de cada tipo de imagen.
 *
 * **El logo y la foto de perfil se recortan a cuadrado; la portada, a 16:9.**
 * Una portada recortada a cuadrado y luego estirada en un banner apaisado se ve
 * deformada, y el encuadre que la persona aprobó no es el que acaba viendo un
 * comprador. Cada destino recorta con la forma con la que se va a mostrar.
 *
 * 512 de lado se ve nítido en pantallas densas y pesa poco. La portada va a
 * 1600 × 900 porque se muestra a todo el ancho de la pantalla: a 512 se vería
 * borrosa en un portátil, que es donde más se mira una ficha de proveedor.
 */
const MEDIDAS = {
  cuadrada: { ancho: 512, alto: 512 },
  apaisada: { ancho: 1600, alto: 900 },
} as const;

export type Proporcion = keyof typeof MEDIDAS;

export function SelectorImagen({
  nombre,
  imagenUrl,
  forma,
  proporcion = "cuadrada",
  guardar,
  quitar,
  ayuda,
}: {
  /** Para las iniciales del monograma y el texto alternativo. */
  nombre: string;
  imagenUrl?: string;
  /** Cómo se dibuja la vista previa: redonda es una persona, cuadrada una empresa. */
  forma: "cuadrada" | "redonda" | "apaisada";
  /** Cómo se recorta el archivo. Una portada no se recorta a cuadrado. */
  proporcion?: Proporcion;
  guardar: (datos: FormData) => Promise<ResultadoImagenUI>;
  quitar: () => Promise<ResultadoImagenUI>;
  /** La línea en letra pequeña de debajo. Cambia si es una persona o una empresa. */
  ayuda: string;
}) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  // La vista previa local se pinta mientras el servidor confirma. Al terminar,
  // `router.refresh()` trae la URL de verdad y esta sobra — pero si se quitara
  // antes de eso, la imagen parpadearía de vuelta a la anterior.
  const [previa, setPrevia] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  async function elegida(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    // El valor se limpia siempre: sin esto, elegir el mismo archivo otra vez
    // después de un fallo no dispara `change` y parece que el botón se rompió.
    evento.target.value = "";
    if (!archivo) return;

    setError(null);

    let recortada: Blob;
    try {
      recortada = await recortar(archivo, proporcion);
    } catch {
      setError(
        "No pudimos leer esa imagen. Prueba con una foto en JPG, PNG o WebP.",
      );
      return;
    }

    setPrevia(URL.createObjectURL(recortada));

    const datos = new FormData();
    datos.set("imagen", recortada, "imagen");

    iniciar(async () => {
      const r = await guardar(datos);
      if (r.ok) {
        router.refresh();
      } else {
        setPrevia(null);
        setError(r.error);
      }
    });
  }

  function quitarla() {
    setError(null);
    iniciar(async () => {
      const r = await quitar();
      if (r.ok) {
        setPrevia(null);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  const actual = previa ?? imagenUrl;

  const apaisada = forma === "apaisada";

  return (
    <div
      className={
        apaisada ? "space-y-4" : "flex flex-wrap items-center gap-5"
      }
    >
      {/* La vista previa tiene la forma con la que se va a ver de verdad. Una
          portada apaisada previsualizada en un cuadrado pequeño no enseña lo
          único que hay que decidir aquí, que es el encuadre. */}
      <div className={apaisada ? "relative" : "relative shrink-0"}>
        {apaisada ? (
          <div className="relative aspect-video w-full max-w-md overflow-hidden rounded-xl bg-sand ring-1 ring-hairline">
            {actual ? (
              // `<img>` y no `next/image`: la vista previa local es un
              // `blob:` que el optimizador de Next no puede buscar, y mezclar
              // los dos caminos según de dónde venga la imagen es más frágil
              // que servir 1600 px sin optimizar en una pantalla de ajustes.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={actual}
                alt={`Portada de ${nombre}`}
                className="size-full object-cover"
              />
            ) : (
              <span className="grid size-full place-items-center px-4 text-center text-xs text-muted">
                Sin portada. Se usa una foto de lo que vendes.
              </span>
            )}
          </div>
        ) : (
          <ProviderAvatar
            name={nombre}
            logoUrl={actual}
            forma={forma}
            className="size-20 text-xl"
          />
        )}
        {pendiente && (
          <span
            className={`absolute inset-0 grid place-items-center bg-ink/40 ${
              forma === "redonda" ? "rounded-full" : "rounded-xl"
            } ${apaisada ? "max-w-md" : ""}`}
          >
            <Loader2 className="size-6 animate-spin text-white" aria-hidden />
          </span>
        )}
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pendiente}
            onClick={() => entrada.current?.click()}
            className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-brand-700 ring-1 ring-control transition hover:bg-sand disabled:opacity-40"
          >
            <ImagePlus className="size-4" aria-hidden />
            {actual ? "Cambiar" : "Subir una imagen"}
          </button>

          {actual && (
            <button
              type="button"
              disabled={pendiente}
              onClick={quitarla}
              className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-muted ring-1 ring-hairline transition hover:bg-sand hover:text-red-700 disabled:opacity-40"
            >
              <Trash2 className="size-4" aria-hidden />
              Quitar
            </button>
          )}
        </div>

        <p className="mt-2 max-w-sm text-xs text-muted">{ayuda}</p>
        {error && (
          <p role="status" className="mt-1 max-w-sm text-xs text-red-700">
            {error}
          </p>
        )}
      </div>

      {/* Oculto y disparado desde el botón de arriba: el control nativo de
          archivo no se puede maquetar y se ve distinto en cada navegador. Sigue
          siendo un `input` de verdad, así que el teclado y el lector de pantalla
          lo alcanzan por la etiqueta. */}
      <input
        ref={entrada}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        onChange={elegida}
        className="sr-only"
        aria-label={`Elegir imagen para ${nombre}`}
      />
    </div>
  );
}

/**
 * Recorta desde el centro a la proporción pedida y reduce.
 *
 * El recorte es **el mayor rectángulo con esa proporción que cabe en la
 * imagen**, centrado. Recortar por el centro acierta casi siempre —la gente
 * encuadra lo importante en el medio— y la alternativa, un editor con marco
 * arrastrable, es mucho más trabajo del que ahora mismo merece poner un logo.
 *
 * Sale en WebP, que es la mitad de peso que JPEG a la misma calidad. Safari
 * viejo devuelve PNG cuando se le pide WebP —`toBlob` no falla, ignora el tipo—
 * y un PNG de 1600 px se pasa largo del medio mega que acepta el servidor, así
 * que en ese caso se rehace en JPEG, que entiende todo el mundo desde siempre.
 */
async function recortar(archivo: File, proporcion: Proporcion): Promise<Blob> {
  const bitmap = await createImageBitmap(archivo);
  const { ancho, alto } = MEDIDAS[proporcion];
  const relacion = ancho / alto;

  // El recorte más grande con la proporción pedida que quepa dentro: se limita
  // por el ancho o por el alto según cuál sobre.
  const sobraAncho = bitmap.width / bitmap.height > relacion;
  const rw = sobraAncho ? bitmap.height * relacion : bitmap.width;
  const rh = sobraAncho ? bitmap.height : bitmap.width / relacion;

  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;

  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("sin canvas");

  ctx.drawImage(
    bitmap,
    (bitmap.width - rw) / 2,
    (bitmap.height - rh) / 2,
    rw,
    rh,
    0,
    0,
    ancho,
    alto,
  );
  bitmap.close();

  const webp = await aBlob(lienzo, "image/webp");
  if (webp.type === "image/webp") return webp;
  return aBlob(lienzo, "image/jpeg");
}

function aBlob(lienzo: HTMLCanvasElement, tipo: string): Promise<Blob> {
  return new Promise((resolver, rechazar) => {
    lienzo.toBlob(
      (b) => (b ? resolver(b) : rechazar(new Error("sin blob"))),
      tipo,
      0.85,
    );
  });
}
