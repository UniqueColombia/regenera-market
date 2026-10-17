import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AlmacenDeImagenes, Bucket, Pieza, ResultadoImagen } from "./almacenamiento";

/**
 * Las imágenes en el disco del propio servidor, en vez de Supabase Storage.
 * Experimento MySQL, etapa 3 (hito `2026-10-17-experimento-mysql-etapas-2-y-3.md`).
 *
 * Se enciende con `ALMACEN_CARPETA` (`getAlmacen()` de `almacenamiento.ts`). La
 * carpeta tiene que estar **fuera de lo que pisa cada despliegue**: en
 * Hostinger, cada build reemplaza la app entera, y unas fotos guardadas dentro
 * desaparecerían con el siguiente tag.
 *
 * Se sirven por `/archivos/…` (`src/app/archivos/[...ruta]/route.ts`), desde el
 * mismo dominio. La versión va **dentro de la ruta** y no como `?v=`: Next 16
 * no optimiza una imagen local con query string sin abrir
 * `images.localPatterns`, y abrirlo cerraría de paso las de `/img/`.
 *
 *   /archivos/<bucket>/<dueño>/<versión>/<pieza>.<ext>
 *
 * La versión cambia en cada subida (para que nadie vea la foto vieja en caché)
 * y el archivo en disco no: subir otra foto reemplaza la anterior.
 *
 * **Lo que se pierde frente a Storage:** allá la política de la 0008 volvía a
 * comprobar que la carpeta era de quien subía. Aquí no hay segunda comprobación:
 * vale la que hizo la acción antes de llamar a `guardar()`. Por eso cada
 * pedazo de la ruta se valida contra un patrón cerrado: lo único que llega de
 * fuera es el dueño, y tiene que ser un uuid.
 *
 * Sin imports relativos con valor: la prueba y el script de copia lo cargan
 * sin Next.
 */

const BUCKETS: ReadonlySet<string> = new Set<Bucket>(["avatares", "logos"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VERSION = /^[a-z0-9]{1,16}$/;
const ARCHIVO = /^(imagen|portada|oferta-[a-z0-9-]{1,80})\.(webp|jpg|png)$/;
const TIPO_DE: Record<string, string> = { webp: "image/webp", jpg: "image/jpeg", png: "image/png" };

/**
 * `image/webp` → `imagen.webp`. Un archivo por pieza y dueño: el anterior se
 * reemplaza, así que subir una foto nueva no deja la vieja ocupando sitio.
 *
 * **La extensión sale del tipo y no del archivo original**, porque el original
 * ya no existe: lo que llega aquí es lo que el navegador reconvirtió. Si el
 * tipo cambia entre una subida y la siguiente —de WebP a JPEG, que es lo que
 * pasa en un Safari viejo— quedan dos archivos y la URL guardada apunta al
 * último. El anterior queda huérfano, pesa kilobytes y nadie lo sirve.
 */
export function nombreDeArchivo(tipo: string, pieza: Pieza): string {
  const extension = tipo === "image/png" ? "png" : tipo === "image/jpeg" ? "jpg" : "webp";
  return `${pieza}.${extension}`;
}

/** La URL de una imagen guardada en disco. */
export function urlEnDisco(bucket: Bucket, duenio: string, version: string, archivo: string): string {
  return `/archivos/${bucket}/${duenio}/${version}/${archivo}`;
}

/**
 * ¿Los primeros bytes son de verdad del tipo declarado? El tipo lo pone el
 * cliente en el `FormData`, y sin esto cualquier cosa de hasta medio mega se
 * guardaría como `imagen.png`. Se sirve con `nosniff` y tipo de imagen, así que
 * no llega a ser un XSS, pero no se guarda lo que no es una imagen.
 */
export function bytesDeImagen(tipo: string, b: Uint8Array): boolean {
  const empieza = (...firma: number[]) => firma.every((x, i) => b[i] === x);
  if (tipo === "image/png") return empieza(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (tipo === "image/jpeg") return empieza(0xff, 0xd8, 0xff);
  // RIFF....WEBP
  return empieza(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
}

/** ¿Es una ruta que este almacén pudo haber escrito? Todo lo demás es un 404. */
function rutaValida(bucket: string, duenio: string, archivo: string): boolean {
  return BUCKETS.has(bucket) && UUID.test(duenio) && ARCHIVO.test(archivo);
}

export class AlmacenDisco implements AlmacenDeImagenes {
  readonly nombre = "disco";
  readonly disponible = true;
  // Campo explícito y no `constructor(private readonly carpeta)`: Node, al
  // correr TypeScript sin compilar (los scripts), no acepta esa forma.
  private readonly carpeta: string;

  constructor(carpeta: string) {
    this.carpeta = carpeta;
  }

  async guardar(
    bucket: Bucket,
    duenio: string,
    archivo: Blob,
    tipo: string,
    pieza: Pieza = "imagen",
  ): Promise<ResultadoImagen> {
    const nombre = nombreDeArchivo(tipo, pieza);
    if (!rutaValida(bucket, duenio, nombre)) {
      console.error(`[almacenamiento] ruta rechazada: ${bucket}/${duenio}/${nombre}`);
      return { ok: false, error: "No pudimos guardar la imagen. Inténtalo de nuevo en un minuto." };
    }
    const bytes = Buffer.from(await archivo.arrayBuffer());
    if (!bytesDeImagen(tipo, bytes)) {
      return { ok: false, error: "Tiene que ser una imagen JPG, PNG o WebP." };
    }
    const carpeta = join(this.carpeta, bucket, duenio);
    const destino = join(carpeta, nombre);
    // Primero a un temporal y después el cambio de nombre: quien pida la foto
    // mientras se escribe ve la anterior entera, nunca media nueva. Declarado
    // fuera del `try` para poder borrarlo si la escritura falla a medias (disco
    // lleno): si no, cada fallo deja un `.tmp` ocupando cuota.
    const temporal = `${destino}.${crypto.randomUUID()}.tmp`;
    try {
      await mkdir(carpeta, { recursive: true });
      await writeFile(temporal, bytes);
      await rename(temporal, destino);
    } catch (e) {
      await rm(temporal, { force: true }).catch(() => {});
      console.error(`[almacenamiento] ${bucket}/${duenio}/${nombre}: ${e instanceof Error ? e.message : String(e)}`);
      return { ok: false, error: "No pudimos guardar la imagen. Inténtalo de nuevo en un minuto." };
    }
    return { ok: true, url: urlEnDisco(bucket, duenio, Date.now().toString(36), nombre) };
  }

  /** No lanza, como el de Supabase: lo llama una baja que ya está hecha en la base. */
  async borrarCarpeta(bucket: Bucket, duenio: string): Promise<void> {
    if (!BUCKETS.has(bucket) || !UUID.test(duenio)) return;
    try {
      await rm(join(this.carpeta, bucket, duenio), { recursive: true, force: true });
    } catch (e) {
      console.error(`[almacenamiento] no se borró ${bucket}/${duenio}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

/**
 * La imagen que pide `/archivos/<bucket>/<dueño>/<versión>/<archivo>`, o
 * `undefined` si la ruta no es una que este almacén escriba o el archivo no
 * existe. La versión no se usa para leer: solo cambia la URL.
 */
export async function leerImagen(
  carpeta: string,
  ruta: string[],
): Promise<{ cuerpo: Uint8Array<ArrayBuffer>; tipo: string } | undefined> {
  if (ruta.length !== 4) return undefined;
  const [bucket, duenio, version, archivo] = ruta;
  if (!VERSION.test(version) || !rutaValida(bucket, duenio, archivo)) return undefined;
  try {
    const cuerpo = new Uint8Array(await readFile(join(carpeta, bucket, duenio, archivo)));
    return { cuerpo, tipo: TIPO_DE[archivo.slice(archivo.lastIndexOf(".") + 1)] };
  } catch {
    return undefined;
  }
}
