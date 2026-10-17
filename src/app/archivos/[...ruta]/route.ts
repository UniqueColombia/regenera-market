import { leerImagen } from "@/lib/almacen-disco";

/**
 * Sirve las imágenes que guarda `AlmacenDisco` (`src/lib/almacen-disco.ts`).
 * Experimento MySQL, etapa 3.
 *
 * Sin `ALMACEN_CARPETA` no hay nada que servir y responde 404: con las fotos en
 * Supabase Storage esta ruta no existe para nadie. `leerImagen()` valida cada
 * pedazo de la ruta contra un patrón cerrado, así que un `..` o un nombre
 * inventado también son un 404, no un archivo del servidor.
 */
export async function GET(_req: Request, ctx: RouteContext<"/archivos/[...ruta]">) {
  const carpeta = process.env.ALMACEN_CARPETA;
  if (!carpeta) return new Response(null, { status: 404 });
  const { ruta } = await ctx.params;
  const imagen = await leerImagen(carpeta, ruta);
  if (!imagen) return new Response(null, { status: 404 });
  return new Response(imagen.cuerpo, {
    headers: {
      "Content-Type": imagen.tipo,
      // La versión va en la ruta: una URL dada no cambia de contenido mientras
      // nadie suba otra foto, y si la suben, la URL guardada es otra.
      "Cache-Control": "public, max-age=86400",
    },
  });
}
