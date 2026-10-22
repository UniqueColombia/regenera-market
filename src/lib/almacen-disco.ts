import { mkdir, readdir, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
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
 * **La versión es la fecha del archivo** (sus milisegundos en base 36, que se le
 * ponen como fecha de modificación al guardarlo) y se comprueba al leer: una
 * versión que no es la del archivo da 404. Sin eso, cada versión inventada era
 * una URL nueva que el optimizador de imágenes procesaba y guardaba en caché, y
 * una foto quitada seguía saliendo en su URL. Copiar la carpeta tiene que
 * conservar las fechas (`tar` y `scp -p` lo hacen).
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
 * pasa en un Safari viejo— `guardar()` borra el de la otra extensión: si no,
 * seguiría saliendo en su URL vieja.
 */
export function nombreDeArchivo(tipo: string, pieza: Pieza): string {
  const extension = tipo === "image/png" ? "png" : tipo === "image/jpeg" ? "jpg" : "webp";
  return `${pieza}.${extension}`;
}

/** La versión de una URL a partir de la fecha del archivo, en milisegundos. */
export function versionDeFecha(ms: number): string {
  return Math.round(ms).toString(36);
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

/**
 * La cuota de fotos (auditoría del 2026-10-22). Las fotos viven en el mismo disco
 * que la base de datos: si se llena, se cae el sitio entero. Como el tope de
 * fotos por publicación de MercadoLibre o de archivos por tienda de Shopify.
 *
 * - **Por empresa**: 300 fotos de ofertas. Cada subida es un archivo nuevo de
 *   hasta medio mega, y abrir una empresa es gratis.
 * - **En total**: `ALMACEN_LIMITE_GB` (5 por defecto). Lo que mide `statfs` en un
 *   hosting compartido es el disco del servidor, no la cuota de la cuenta, así
 *   que se suma lo que ocupa la carpeta.
 */
export const CUOTA = {
  fotosPorEmpresa: 300,
  limiteTotalBytes: (Number(process.env.ALMACEN_LIMITE_GB) || 5) * 1024 ** 3,
  /** Una foto subida y no usada en un día se puede borrar: nadie la va a guardar ya. */
  huerfanaTrasMs: 24 * 3600 * 1000,
} as const;

/** Lo que ocupa la carpeta, recalculado como mucho cada diez minutos. */
let ocupado: { bytes: number; medidoEn: number } | null = null;

async function bytesDe(carpeta: string): Promise<number> {
  let total = 0;
  const entradas = await readdir(carpeta, { withFileTypes: true }).catch(() => []);
  for (const e of entradas) {
    const ruta = join(carpeta, e.name);
    if (e.isDirectory()) total += await bytesDe(ruta);
    else total += (await stat(ruta).catch(() => null))?.size ?? 0;
  }
  return total;
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
    const ahora = Date.now();
    try {
      await mkdir(carpeta, { recursive: true });
      await writeFile(temporal, bytes);
      // La fecha antes del cambio de nombre: el archivo aparece ya con su versión.
      await utimes(temporal, ahora / 1000, ahora / 1000);
      await rename(temporal, destino);
      const otras = ["webp", "jpg", "png"].map((ext) => `${pieza}.${ext}`).filter((n) => n !== nombre);
      await Promise.all(otras.map((n) => rm(join(carpeta, n), { force: true })));
    } catch (e) {
      await rm(temporal, { force: true }).catch(() => {});
      console.error(`[almacenamiento] ${bucket}/${duenio}/${nombre}: ${e instanceof Error ? e.message : String(e)}`);
      return { ok: false, error: "No pudimos guardar la imagen. Inténtalo de nuevo en un minuto." };
    }
    return { ok: true, url: urlEnDisco(bucket, duenio, versionDeFecha(ahora), nombre) };
  }

  /** Borra los archivos de una pieza (`imagen.*`, `portada.*`): al quitar la foto, deja de existir. No lanza. */
  async borrarPieza(bucket: Bucket, duenio: string, pieza: Pieza): Promise<void> {
    if (!BUCKETS.has(bucket) || !UUID.test(duenio)) return;
    const carpeta = join(this.carpeta, bucket, duenio);
    try {
      const nombres = await readdir(carpeta);
      await Promise.all(
        nombres.filter((n) => ARCHIVO.test(n) && n.slice(0, n.lastIndexOf(".")) === pieza).map((n) => rm(join(carpeta, n), { force: true })),
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
      console.error(`[almacenamiento] no se borró ${bucket}/${duenio}/${pieza}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async hayLugarParaOferta(
    duenio: string,
    enUso: ReadonlySet<string>,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!UUID.test(duenio)) return { ok: false, error: "No pudimos guardar la imagen." };

    if (!ocupado || Date.now() - ocupado.medidoEn > 10 * 60 * 1000) {
      ocupado = { bytes: await bytesDe(this.carpeta), medidoEn: Date.now() };
    }
    if (ocupado.bytes > CUOTA.limiteTotalBytes) {
      console.error(`[almacenamiento] cuota total superada: ${ocupado.bytes} bytes`);
      return { ok: false, error: "Ahora mismo no podemos guardar más fotos. Escríbenos y lo resolvemos." };
    }

    const carpeta = join(this.carpeta, "logos", duenio);
    const nombres = (await readdir(carpeta).catch(() => [] as string[])).filter((n) => n.startsWith("oferta-") && ARCHIVO.test(n));
    if (nombres.length < CUOTA.fotosPorEmpresa) return { ok: true };

    // Al tope: primero se van las huérfanas viejas.
    const ahora = Date.now();
    for (const n of nombres) {
      if (enUso.has(n)) continue;
      const info = await stat(join(carpeta, n)).catch(() => null);
      if (info && ahora - info.mtimeMs > CUOTA.huerfanaTrasMs) await rm(join(carpeta, n), { force: true });
    }
    const quedan = (await readdir(carpeta).catch(() => [] as string[])).filter((n) => n.startsWith("oferta-")).length;
    return quedan < CUOTA.fotosPorEmpresa
      ? { ok: true }
      : {
          ok: false,
          error: `Tu empresa llegó al tope de ${CUOTA.fotosPorEmpresa} fotos. Quita fotos de ofertas que ya no uses y vuelve a intentarlo.`,
        };
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
 * `undefined` si la ruta no es una que este almacén escriba, el archivo no
 * existe o la versión no es la suya (la fecha del archivo).
 */
export async function leerImagen(
  carpeta: string,
  ruta: string[],
): Promise<{ cuerpo: Uint8Array<ArrayBuffer>; tipo: string } | undefined> {
  if (ruta.length !== 4) return undefined;
  const [bucket, duenio, version, archivo] = ruta;
  if (!VERSION.test(version) || !rutaValida(bucket, duenio, archivo)) return undefined;
  const destino = join(carpeta, bucket, duenio, archivo);
  try {
    if (versionDeFecha((await stat(destino)).mtimeMs) !== version) return undefined;
    const cuerpo = new Uint8Array(await readFile(destino));
    return { cuerpo, tipo: TIPO_DE[archivo.slice(archivo.lastIndexOf(".") + 1)] };
  } catch {
    return undefined;
  }
}
