import { isAbsolute } from "node:path";
import { createClient } from "./supabase/server";
import { createAdminClient } from "./supabase/admin";
import { isSupabaseConfigured } from "./supabase/config";
import { AlmacenDisco, nombreDeArchivo } from "./almacen-disco";
import { modoMysql } from "./modo";

/**
 * Dónde se guardan las imágenes que sube la gente.
 *
 * Es el patrón de `src/lib/payments.ts` aplicado al almacenamiento, y por el
 * mismo motivo: **el resto del código nunca conoce el nombre del proveedor**.
 * Hoy las imágenes viven en Supabase Storage; el plan es que pasen al VPS
 * propio cuando el MVP esté cerrado. Ese día se escribe una implementación más
 * de `AlmacenDeImagenes`, se cambia la línea de `getAlmacen()` y no se toca
 * ninguna página, ningún formulario y ninguna acción.
 *
 * Para que ese día sea de verdad así, hay una regla que conviene no romper:
 * **fuera de este archivo nadie llama a `supabase.storage`**. Si aparece un
 * `.storage.from(...)` en una acción o en un componente, la abstracción ya no
 * sirve para nada.
 *
 * ## Lo que se guarda en la base es la URL, no la ruta
 *
 * `profiles.avatar_url` y `providers.logo_url` existen desde la 0001 y guardan
 * una URL. Al migrar al VPS habrá que reescribir las que apunten a Supabase —
 * un `update` con `replace()` sobre el dominio—, y eso es más barato que la
 * alternativa: guardar la ruta y componer la URL en cada render obligaría a que
 * toda la aplicación supiera qué almacén está activo, que es justo lo que este
 * archivo existe para evitar.
 */

/** Los dos sitios donde se guarda algo. Espejan los buckets de la migración 0008. */
export type Bucket = "avatares" | "logos";

/**
 * Qué imagen es, dentro de la carpeta de su dueño.
 *
 * Una empresa tiene dos —su logo y la portada de su ficha— y las dos viven en
 * `logos/<provider_id>/`. **Lo que la política de Storage comprueba es la
 * primera carpeta de la ruta**, así que dos archivos distintos en la misma
 * carpeta no necesitan ni bucket ni política nueva. Ver la migración 0009.
 */
export type Pieza = "imagen" | "portada" | `oferta-${string}`;

export type ResultadoImagen =
  | { ok: true; url: string }
  | { ok: false; error: string };

export interface AlmacenDeImagenes {
  /** Para poder decir en pantalla qué está activo, sin leer una variable de entorno. */
  readonly nombre: string;
  /** ¿Se puede subir ahora mismo? Falso en un clon sin credenciales. */
  readonly disponible: boolean;
  /**
   * Guarda (o reemplaza) la imagen de un dueño y devuelve su URL pública.
   *
   * `duenio` es el id del usuario o de la empresa, y es **la primera carpeta de
   * la ruta**: `avatares/<user_id>/perfil.webp`. No es cosmético — las
   * políticas de Storage comparan esa carpeta con `auth.uid()` o con
   * `manages_provider()`, así que la ruta es parte del control de acceso.
   */
  guardar(
    bucket: Bucket,
    duenio: string,
    archivo: Blob,
    tipo: string,
    pieza?: Pieza,
    /**
     * Guardar con el cliente de servicio en vez del de sesión. Solo para el
     * equipo de administración, que sube imágenes a la carpeta de una empresa
     * que no gestiona; quien llama ya comprobó `requireAdmin()`.
     */
    comoServicio?: boolean,
  ): Promise<ResultadoImagen>;
  /**
   * Borra todo lo de un dueño: su foto de perfil, o el logo y las fotos de
   * ofertas de una empresa. Para cuando se elimina la cuenta o la empresa.
   *
   * **No lanza.** Lo llama una acción que ya borró los datos de la base: un
   * archivo que se queda huérfano pesa kilobytes y nadie lo sirve, y no puede
   * convertir una baja hecha en un error en pantalla.
   */
  borrarCarpeta(bucket: Bucket, duenio: string): Promise<void>;
  /**
   * Borra una pieza (`imagen`, `portada`) de un dueño, en cualquier formato. Para
   * cuando alguien quita su foto: vaciar la columna no basta, el archivo seguía
   * saliendo en su URL. **No lanza**, por lo mismo que `borrarCarpeta`.
   */
  borrarPieza(bucket: Bucket, duenio: string, pieza: Pieza): Promise<void>;
}

/**
 * El almacén de un clon sin credenciales.
 *
 * `npm run dev` con `.env.local` vacío tiene que seguir levantando una app
 * navegable —es la propiedad que protege `docs/DEPLOY.md` y el job `verificar`
 * del CI—, así que aquí no se lanza: se devuelve un error que la pantalla sabe
 * enseñar. Quien clone el repo ve el formulario y un mensaje que dice por qué
 * no puede subir, en vez de un 500.
 */
class SinAlmacen implements AlmacenDeImagenes {
  readonly nombre = "ninguno";
  readonly disponible = false;

  async guardar(): Promise<ResultadoImagen> {
    return {
      ok: false,
      error:
        "Todavía no hay dónde guardar imágenes en este entorno. Falta configurar Supabase.",
    };
  }

  async borrarCarpeta(): Promise<void> {}

  async borrarPieza(): Promise<void> {}
}

class AlmacenSupabase implements AlmacenDeImagenes {
  readonly nombre = "supabase";
  readonly disponible = true;

  async guardar(
    bucket: Bucket,
    duenio: string,
    archivo: Blob,
    tipo: string,
    pieza: Pieza = "imagen",
    comoServicio = false,
  ): Promise<ResultadoImagen> {
    // El cliente de sesión, no el de servicio: así la subida pasa por las
    // políticas de `storage.objects` de la migración 0008. Es defensa en
    // profundidad — la acción ya comprobó quién es, y la base lo vuelve a
    // comprobar. Con el cliente de servicio, un fallo de la comprobación de
    // arriba dejaría a cualquiera escribiendo en la carpeta de otro.
    const db = comoServicio ? createAdminClient() : await createClient();
    const ruta = `${duenio}/${nombreDeArchivo(tipo, pieza)}`;

    const { error } = await db.storage.from(bucket).upload(ruta, archivo, {
      // Reemplaza la anterior en vez de acumular una foto por cambio. Exige la
      // política de `update` además de la de `insert`, y por eso la 0008 crea
      // las dos.
      upsert: true,
      contentType: tipo,
      cacheControl: "3600",
    });

    if (error) {
      console.error(`[almacenamiento] ${bucket}/${ruta}: ${error.message}`);
      return {
        ok: false,
        error: "No pudimos guardar la imagen. Inténtalo de nuevo en un minuto.",
      };
    }

    const { data } = db.storage.from(bucket).getPublicUrl(ruta);

    // La ruta es siempre la misma, así que el navegador y el CDN servirían la
    // foto anterior después de cambiarla. El sufijo cambia la URL sin cambiar
    // el archivo; sin él, alguien sube su foto nueva y sigue viendo la vieja
    // durante una hora, que se lee como «no se guardó».
    return { ok: true, url: `${data.publicUrl}?v=${Date.now()}` };
  }

  /**
   * Con el cliente de servicio, y es a propósito: cuando esto corre, la cuenta
   * o la empresa ya no existe en la base, así que las políticas de Storage
   * —que comparan la carpeta con `auth.uid()` o con `manages_provider()`— ya
   * no le reconocen dueño a nadie. Quien llama ya comprobó que era suya.
   */
  async borrarCarpeta(bucket: Bucket, duenio: string): Promise<void> {
    try {
      const db = createAdminClient();
      const { data, error } = await db.storage.from(bucket).list(duenio, { limit: 1000 });
      if (error) throw new Error(error.message);
      const rutas = (data ?? []).map((f) => `${duenio}/${f.name}`);
      if (rutas.length === 0) return;
      const { error: errorBorrado } = await db.storage.from(bucket).remove(rutas);
      if (errorBorrado) throw new Error(errorBorrado.message);
    } catch (e) {
      console.error(`[almacenamiento] no se borró ${bucket}/${duenio}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Con el de servicio, como `borrarCarpeta`: quien llama ya comprobó que la pieza es suya. */
  async borrarPieza(bucket: Bucket, duenio: string, pieza: Pieza): Promise<void> {
    try {
      const db = createAdminClient();
      const rutas = ["webp", "jpg", "png"].map((ext) => `${duenio}/${pieza}.${ext}`);
      const { error } = await db.storage.from(bucket).remove(rutas);
      if (error) throw new Error(error.message);
    } catch (e) {
      console.error(`[almacenamiento] no se borró ${bucket}/${duenio}/${pieza}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

/**
 * Quién guarda hoy.
 *
 * Un solo sitio decide. En el modo MySQL (`src/lib/modo.ts`), el disco del
 * servidor (`almacen-disco.ts`, con `ALMACEN_CARPETA`); si no, Supabase
 * Storage. **`ALMACEN_CARPETA` sin el modo MySQL no hace nada**, a propósito: con
 * los datos en Supabase, una foto guardada en el disco de un PC quedaría con su
 * URL en la base de producción, rota para todos los demás.
 *
 * La app degrada sola si falta la credencial, y nunca lanza al importarse por
 * una variable ausente: eso tumbaría el build en un entorno donde el almacén
 * todavía no aplique.
 */
export function getAlmacen(): AlmacenDeImagenes {
  if (modoMysql()) {
    const carpeta = process.env.ALMACEN_CARPETA;
    // Una ruta relativa (o con `~`) caería dentro de la carpeta de la app, que
    // cada despliegue reemplaza entera: las fotos durarían hasta el siguiente tag.
    if (carpeta && !isAbsolute(carpeta)) {
      console.error(`[almacenamiento] ALMACEN_CARPETA tiene que ser una ruta absoluta: ${carpeta}`);
      return new SinAlmacen();
    }
    return carpeta ? new AlmacenDisco(carpeta) : new SinAlmacen();
  }
  if (isSupabaseConfigured()) return new AlmacenSupabase();
  return new SinAlmacen();
}

/**
 * Lo que se acepta de un formulario.
 *
 * El navegador ya recorta y reduce la imagen a un cuadrado antes de mandarla
 * (`src/components/selector-imagen.tsx`), así que estos límites no son la
 * experiencia de uso: son el suelo por si alguien manda el `FormData` a mano.
 * Una imagen de 512 px en webp pesa entre 20 y 120 kB; medio mega es holgado
 * para cualquiera de los tres formatos y sigue estando lejos del límite de las
 * Server Actions.
 */
export const TIPOS_ACEPTADOS = ["image/webp", "image/jpeg", "image/png"] as const;
export const PESO_MAXIMO = 512 * 1024;

/**
 * Comprueba lo que llegó y lo devuelve listo para guardar.
 *
 * Devuelve el mensaje en español que va junto al campo, no un código: quien lo
 * llama lo pone tal cual en pantalla.
 */
export function revisarImagen(
  valor: unknown,
): { ok: true; archivo: Blob; tipo: string } | { ok: false; error: string } {
  if (!(valor instanceof Blob) || valor.size === 0) {
    return { ok: false, error: "Elige una imagen." };
  }
  if (!TIPOS_ACEPTADOS.includes(valor.type as (typeof TIPOS_ACEPTADOS)[number])) {
    return { ok: false, error: "Tiene que ser una imagen JPG, PNG o WebP." };
  }
  if (valor.size > PESO_MAXIMO) {
    return { ok: false, error: "La imagen pesa demasiado. Prueba con una más pequeña." };
  }
  return { ok: true, archivo: valor, tipo: valor.type };
}
