import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { dentroDelRitmo, origenDeLaPeticion } from "@/lib/ritmo";

/**
 * Señal de vida: toca Postgres y dice cuánto tardó.
 *
 * Existe por una razón concreta y aburrida: **el plan gratuito de Supabase
 * pausa un proyecto que pasa siete días sin actividad de API.** No borra los
 * datos —restaurarlo es un botón— pero mientras está pausado el sitio entero
 * responde 500, y nadie se entera hasta que un hotel abre el enlace.
 *
 * Lo que cuenta como actividad es una petición **de fuera**, no un trabajo
 * interno de la base: un `pg_cron` corriendo dentro de Postgres no evita la
 * pausa, porque no hay ninguna petición a la API. De ahí que el latido lo
 * dispare `.github/workflows/latido.yml` desde GitHub, que es una máquina
 * ajena a todo esto.
 *
 * Se consulta `providers` y no una tabla de sistema porque lo que interesa
 * comprobar es el camino completo: PostgREST, la conexión, RLS y la tabla. Un
 * `select 1` diría que la base respira aunque la aplicación no pudiera leer
 * nada.
 *
 * **No expone ningún dato.** Devuelve si hubo respuesta y en cuántos
 * milisegundos; ni una fila. Es público a propósito: si exigiera una clave, el
 * latido tendría que llevarla en un secreto y dejaría de poder llamarlo
 * cualquier monitor de disponibilidad.
 *
 * Público no es lo mismo que gratis: cada llamada es una consulta real a
 * Postgres, así que en un bucle esto es un ariete contra la base con un solo
 * `curl`. De ahí el tope por IP. Es generoso —el latido de verdad corre una vez
 * al día y cualquier monitor razonable, cada minuto— y aun así corta el bucle.
 *
 * Cuando topa responde **429 con `Retry-After`**, que es lo que un monitor
 * entiende como «estoy vivo, estás llamando demasiado», y no un 503 que se
 * leería como caída.
 */

// Nunca se cachea: una respuesta guardada diría "vivo" con la base caída, que
// es justo el fallo que este endpoint existe para detectar.
export const dynamic = "force-dynamic";

export async function GET() {
  if (!dentroDelRitmo(`latido:${await origenDeLaPeticion()}`, 20, 60)) {
    return NextResponse.json(
      { ok: false, motivo: "demasiadas-peticiones" },
      { status: 429, headers: { "retry-after": "60" } },
    );
  }

  if (!isSupabaseConfigured()) {
    // Un clon sin credenciales tiene que poder responder algo sensato en vez de
    // reventar: es la misma propiedad que protege el job `verificar` del CI.
    return NextResponse.json(
      { ok: false, motivo: "sin-configurar" },
      { status: 503 },
    );
  }

  const inicio = Date.now();

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("providers")
      .select("id", { count: "exact", head: true })
      .limit(1);

    const ms = Date.now() - inicio;

    if (error) {
      return NextResponse.json(
        { ok: false, motivo: "consulta", detalle: error.message, ms },
        { status: 503 },
      );
    }

    return NextResponse.json({ ok: true, ms, fecha: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        motivo: "excepcion",
        detalle: e instanceof Error ? e.message : String(e),
        ms: Date.now() - inicio,
      },
      { status: 503 },
    );
  }
}
