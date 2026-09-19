"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { esReaccion } from "@/lib/comunidad";

/**
 * Publicar en la Comunidad y reaccionar a lo publicado.
 *
 * ## Qué hace la base y qué hace este archivo
 *
 * Casi todo lo hace la base (`supabase/migrations/0007_comunidad.sql`), y eso es
 * deliberado: quién firma (`author_name`), qué está destacado, cuántas
 * reacciones lleva y si una empresa puede ser la firmante son todos valores de
 * los que el usuario se beneficia, así que los escribe o los comprueba Postgres.
 *
 * Lo que queda aquí es lo que solo puede hacerse aquí: validar el texto antes de
 * que llegue, dar un mensaje en español cuando algo rebota, y revalidar las dos
 * rutas que muestran el muro.
 *
 * ## Por qué no se exige el rol de proveedor para nada
 *
 * La Comunidad es de **cualquiera con cuenta**. Un hotel que compró y quiere
 * contar cómo le fue aporta tanto como quien vende. Publicar en nombre de una
 * empresa sí exige gestionarla, pero eso no es un rol: es `provider_members`, y
 * lo comprueba `community_posts_insert` con `manages_provider()`.
 */

const TEMAS = ["experiencia", "noticia", "practica", "pregunta"] as const;

/**
 * Los mínimos son los mismos `check` que tiene la tabla, escritos otra vez.
 *
 * **Duplicarlos es el punto.** Los de Postgres son la barrera —valen aunque
 * alguien llame a PostgREST directo— y los de aquí existen para que quien
 * escribe 40 caracteres vea «cuéntanos un poco más» junto al campo en lugar de
 * un error de restricción. Si cambias uno, cambia el otro.
 */
const PublicacionSchema = z.object({
  title: z
    .string()
    .trim()
    .min(6, "Ponle un título de al menos 6 caracteres")
    .max(140, "El título se pasa de 140 caracteres"),
  body: z
    .string()
    .trim()
    .min(80, "Cuéntanos un poco más: al menos 80 caracteres")
    .max(4000, "Se pasa de 4.000 caracteres. Publícalo en dos partes."),
  topic: z.enum(TEMAS, "Elige de qué va tu publicación"),
  /** Vacío = publica a título personal. */
  providerId: z.union([z.uuid(), z.literal("")]).optional(),
});

export type ResultadoReaccion = { ok: true } | { ok: false; error: string };

export type ResultadoPublicacion =
  | { ok: true }
  | { ok: false; errors: Record<string, string> };

export async function publicar(datos: unknown): Promise<ResultadoPublicacion> {
  const usuario = await getUser();
  if (!usuario) {
    return {
      ok: false,
      errors: { form: "Tienes que entrar con tu cuenta para publicar." },
    };
  }

  const parsed = PublicacionSchema.safeParse(datos);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const campo = String(issue.path[0]);
      errors[campo] ??= issue.message;
    }
    return { ok: false, errors };
  }

  const d = parsed.data;
  const db = await createClient();

  // `author_name` no se manda: lo sella el trigger `community_posts_derivados`
  // desde `profiles`. Mandarlo desde aquí sería aceptar del cliente el nombre
  // con el que se firma algo en público.
  const { error } = await db.from("community_posts").insert({
    author_id: usuario.id,
    provider_id: d.providerId || null,
    title: d.title,
    body: d.body,
    topic: d.topic,
  });

  if (error) {
    // No se devuelve `error.message`: trae nombres de columnas y de políticas,
    // que es información gratis para quien esté probando el formulario.
    console.error(`[comunidad] publicar: ${error.message}`);
    return {
      ok: false,
      errors: {
        form: "No pudimos publicar tu entrada. Inténtalo de nuevo en un minuto.",
      },
    };
  }

  revalidarMuro();
  return { ok: true };
}

/**
 * Marca o quita una de las cinco reacciones.
 *
 * ## Qué se arregló aquí, y qué no era el problema
 *
 * La versión anterior devolvía `{ ok: boolean }` y **nadie lo miraba**: el
 * botón hacía `await alternarReaccion(...)` y seguía. Con eso, cualquier fallo
 * —sesión caducada, RLS negando, la red— se veía exactamente igual que el éxito:
 * el número subía un instante por el optimismo del cliente y volvía a su sitio
 * al llegar la respuesta del servidor. Sin error en ninguna parte. Es el
 * síntoma que se reportó como «le da clic otro usuario y no se suma», y por eso
 * ahora el resultado dice qué pasó y el botón lo enseña.
 *
 * Lo segundo era la otra mitad: un `insert` que chocaba con la clave primaria se
 * trataba como éxito. Sigue tratándose como éxito —un doble toque desde un
 * teléfono con mala señal no es un error del usuario— pero ya no puede dejar el
 * contador quieto, porque desde la migración 0008 el contador **se recuenta**
 * desde las filas en vez de sumarse de uno en uno.
 *
 * ## Sigue siendo un alternador
 *
 * El estado real lo decide la clave primaria `(post_id, user_id, kind)`: si la
 * fila existe se borra, si no existe se inserta. El contador lo lleva un
 * trigger, nunca esta función — sección 3 de la migración 0008.
 */
export async function alternarReaccion(
  postId: string,
  tipo: string,
  marcada: boolean,
): Promise<ResultadoReaccion> {
  const usuario = await getUser();
  if (!usuario) {
    return { ok: false, error: "Tu sesión se cerró. Entra otra vez para reaccionar." };
  }

  // El tipo viene del navegador. Sin esta comprobación, un valor inventado
  // llegaría hasta el `check` de Postgres, que respondería con el texto de una
  // restricción — información gratis sobre el esquema para quien esté probando.
  if (!esReaccion(tipo)) {
    return { ok: false, error: "Esa reacción no existe." };
  }

  const db = await createClient();

  if (marcada) {
    // Sin `.eq("user_id", …)`: `community_reactions_delete_own` ya limita el
    // borrado a las propias. Escribir el filtro aquí sería pedirle al código que
    // garantice lo que garantiza la base.
    const { error } = await db
      .from("community_reactions")
      .delete()
      .eq("post_id", postId)
      .eq("kind", tipo);
    if (error) {
      console.error(`[comunidad] quitar reacción: ${error.message}`);
      return { ok: false, error: "No pudimos quitar tu reacción. Inténtalo otra vez." };
    }
  } else {
    const { error } = await db
      .from("community_reactions")
      // `ignoreDuplicates`: si ya estaba marcada, el estado final es el que la
      // persona quería. No es un error y no se le cuenta como tal.
      .upsert(
        { post_id: postId, user_id: usuario.id, kind: tipo },
        { onConflict: "post_id,user_id,kind", ignoreDuplicates: true },
      );
    if (error) {
      console.error(`[comunidad] marcar reacción: ${error.message}`);
      return { ok: false, error: "No pudimos guardar tu reacción. Inténtalo otra vez." };
    }
  }

  revalidarMuro();
  return { ok: true };
}

/** Las dos rutas donde se ve el muro. Si aparece una tercera, va aquí. */
function revalidarMuro(): void {
  revalidatePath("/comunidad");
  revalidatePath("/");
}
