import type { NextConfig } from "next";

/**
 * De dónde se aceptan imágenes remotas.
 *
 * `next/image` niega por defecto cualquier dominio que no esté aquí, y eso está
 * bien: sin la lista, cualquier URL que llegara a la base convertiría nuestro
 * optimizador en un proxy de imágenes de terceros que pagamos nosotros.
 *
 * El dominio se deriva de `NEXT_PUBLIC_SUPABASE_URL` en vez de escribirse: cada
 * proyecto de Supabase tiene el suyo, y una constante aquí significaría que el
 * de producción no sirve fotos en el entorno de pruebas ni al revés.
 *
 * **Si la variable no está, la lista queda vacía y no pasa nada.** Un clon sin
 * credenciales no tiene ninguna imagen subida que mostrar —todos los avatares
 * son el monograma de iniciales—, y lanzar aquí tumbaría el build del CI, que
 * compila a propósito sin secretos. Ver `src/lib/supabase/config.ts`.
 *
 * El día que las imágenes se muden al VPS (`src/lib/almacenamiento.ts`), este
 * archivo necesita además el dominio nuevo — las URLs viejas seguirán apuntando
 * a Supabase hasta que se reescriban.
 */
function anfitrionDeSupabase(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const anfitrion = anfitrionDeSupabase();

const nextConfig: NextConfig = {
  /**
   * Los mapas de código **no se publican**.
   *
   * Es el valor por defecto de Next para el paquete del navegador, y se escribe
   * igual por lo mismo que `robots` se declara explícito en el layout: un
   * comportamiento que solo existe como ausencia es un comportamiento que
   * alguien cambia sin darse cuenta de lo que cambió. Con mapas publicados,
   * cualquiera reconstruye el código fuente del cliente desde el navegador —
   * incluidos los comentarios, que en este repositorio explican por qué cada
   * cosa está hecha como está.
   *
   * Comprobado con `find .next/static -name "*.map"`: cero archivos.
   */
  productionBrowserSourceMaps: false,

  images: {
    /**
     * AVIF primero, WebP de respaldo.
     *
     * Next negocia con el navegador: sirve AVIF a quien lo acepte y WebP al
     * resto, desde el mismo archivo original. AVIF pesa entre un 20 y un 30 %
     * menos que WebP a igual calidad, y las fotos de este sitio son su mayor
     * carga — los `hero-*.webp` originales rondan los 700 kB.
     *
     * Cuesta CPU en la primera petición de cada tamaño, y solo en esa: el
     * resultado queda en la caché del CDN. Merece la pena en un sitio donde la
     * foto es el argumento de venta.
     */
    formats: ["image/avif", "image/webp"],
    remotePatterns: anfitrion
      ? [
          {
            protocol: "https",
            hostname: anfitrion,
            // Solo lo que sirve Storage como público. Sin la ruta, el patrón
            // abriría también la API REST y la de autenticación al optimizador.
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
