"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

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
 * Marca o desmarca «me sirve».
 *
 * Es un alternador y no dos acciones porque el botón es uno solo. El estado real
 * lo decide la clave primaria `(post_id, user_id)`: si la fila existe se borra,
 * si no existe se inserta. El contador lo lleva un trigger, nunca esta función
 * — ver la sección 4 de la migración 0007.
 */
export async function alternarReaccion(
  postId: string,
  reaccionado: boolean,
): Promise<{ ok: boolean }> {
  const usuario = await getUser();
  if (!usuario) return { ok: false };

  const db = await createClient();

  if (reaccionado) {
    // Sin `.eq("user_id", …)`: `community_reactions_delete_own` ya limita el
    // borrado a las propias. Escribir el filtro aquí sería pedirle al código que
    // garantice lo que garantiza la base.
    const { error } = await db
      .from("community_reactions")
      .delete()
      .eq("post_id", postId);
    if (error) return { ok: false };
  } else {
    const { error } = await db
      .from("community_reactions")
      .insert({ post_id: postId, user_id: usuario.id });
    // Una reacción repetida choca contra la clave primaria. No es un error del
    // usuario —es un doble toque en un teléfono con mala señal— y se trata como
    // éxito: el estado final es el que quería.
    if (error && !error.message.includes("duplicate")) return { ok: false };
  }

  revalidarMuro();
  return { ok: true };
}

/** Las dos rutas donde se ve el muro. Si aparece una tercera, va aquí. */
function revalidarMuro(): void {
  revalidatePath("/comunidad");
  revalidatePath("/");
}
