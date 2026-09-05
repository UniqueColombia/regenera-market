/**
 * Lectura de las variables de Supabase, en un solo sitio.
 *
 * Devuelve `null` cuando no están puestas en vez de reventar, y eso no es
 * tolerancia a la chapuza: es la propiedad que `docs/DEPLOY.md` protege y que
 * conviene no perder — `npm run dev` con `.env.local` vacío levanta una app
 * navegable contra el catálogo en memoria de `src/data/`, y el job `verificar`
 * del CI compila sin credenciales. Si cualquier módulo de arranque lanzara al
 * importarse, las dos cosas se caen.
 *
 * Quien de verdad necesita la base llama a `requireSupabaseConfig()` y falla
 * ahí, con un mensaje que dice qué hacer.
 *
 * Las variables se leen por su nombre literal a propósito: Next sustituye
 * `process.env.NEXT_PUBLIC_*` en tiempo de compilación buscando el texto exacto.
 * Armar el nombre con una variable deja el valor en `undefined` en el navegador.
 */
export type SupabaseConfig = {
  url: string;
  anonKey: string;
};

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/** ¿Hay base configurada? Úsalo para decidir, nunca para adivinar una clave. */
export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

export function requireSupabaseConfig(): SupabaseConfig {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error(
      "Falta NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Copia .env.example a .env.local y llénalas con las claves del panel " +
        "(Settings → API). Ver docs/BETA.md, Bloque 0.",
    );
  }
  return config;
}
