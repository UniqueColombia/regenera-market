// ⚠️ ESTE CLIENTE SE SALTA RLS. Lee y escribe la base entera, como si fuera el
// dueño. Importarlo desde una página o un componente expone todos los datos de
// todos los usuarios. Solo para tareas de servidor que lo necesiten de verdad:
// el seed del catálogo, la confirmación de un pago, asignar un rol.

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente con la clave de servicio.
 *
 * Lee las dos variables a mano en vez de reutilizar `./config`, y es a
 * propósito: `scripts/seed.mts` lo importa y se ejecuta con `node` pelado, que
 * resuelve módulos ESM y exige la extensión en las rutas relativas. Con un
 * `import "./config"` el script no arranca. Son dos líneas duplicadas a cambio
 * de que el único cliente que se salta RLS siga estando escrito una sola vez.
 *
 * La guarda de abajo no es paranoia decorativa: `SUPABASE_SERVICE_ROLE_KEY` no
 * lleva prefijo `NEXT_PUBLIC_`, así que en el navegador vale `undefined` y este
 * módulo fallaría igual — pero con un error de Supabase confuso en vez de uno
 * que diga qué se hizo mal. El job `secretos` del CI cubre el otro lado: falla
 * si alguien le pone el prefijo para "arreglarlo".
 *
 * No persiste sesión ni refresca token: no hay usuario detrás, hay una llave.
 */
export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error(
      "createAdminClient() se llamó desde el navegador. Este cliente se salta " +
        "RLS y jamás puede viajar al cliente: muévelo a una Server Action, un " +
        "Route Handler o un script.",
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error(
      "Falta NEXT_PUBLIC_SUPABASE_URL. Copia .env.example a .env.local y " +
        "llénala. Ver docs/BETA.md, Bloque 0.",
    );
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY. Está en el panel, Settings → API, " +
        "como 'service_role'. Va en .env.local y en Vercel SIN el prefijo " +
        "NEXT_PUBLIC_. Ver docs/BETA.md, Bloque 0.",
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
