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

/**
 * Cabeceras de seguridad, para todas las respuestas.
 *
 * Van aquí y no en `src/proxy.ts` por una razón concreta: el proxy no corre
 * sobre `_next/static` ni sobre las imágenes —están excluidas de su `matcher`
 * para no pagar una llamada a Supabase por cada chunk—, así que puestas allá
 * dejarían sin cubrir justo lo que más se sirve.
 *
 * **La política de contenido (CSP) no está aquí** desde el 2026-10-22: lleva un
 * nonce por petición y la pone `src/proxy.ts` (`src/lib/csp.ts`). Lo que el
 * proxy no cubre —estáticos e imágenes— no es un documento y no la necesita.
 */
function cabecerasDeSeguridad(produccion: boolean) {
  const cabeceras = [
    // Lo mismo que `frame-ancestors` de la CSP, para lo que no pasa por el proxy.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Al salir a otro dominio se manda el origen, nunca la ruta: una URL de
    // orden (`/orden/SR-260924-A1B2`) no debe viajar en el `Referer`.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // El sitio no pide cámara, micrófono ni ubicación. Declararlo apagado impide
    // que un iframe o un script inyectado los pida en nuestro nombre.
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
  ];

  // HSTS solo en producción: sobre http://localhost le diría al navegador que
  // este dominio es siempre https, y quedaría recordado para el resto de
  // proyectos que uses en localhost.
  if (produccion) {
    cabeceras.push({
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    });
  }

  return cabeceras;
}

const nextConfig: NextConfig = {
  /** Sin `X-Powered-By: Next.js`: no hay por qué decir qué framework es. */
  poweredByHeader: false,

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

  experimental: {
    /**
     * Cuánto cuerpo de petición guarda en memoria el proxy (`src/proxy.ts`) antes
     * de pasarla. Por defecto, 10 MB: cualquiera, sin sesión, podía tener
     * ocupados 10 MB por petición. Las Server Actions cortan en 1 MB (no hay
     * `serverActions.bodySizeLimit`), y la foto más grande que se sube es de
     * medio mega: 2 MB sobra.
     */
    proxyClientMaxBodySize: "2mb",
    /**
     * Cuántos procesos usa `next build` para recoger los datos de las páginas.
     * Por defecto, uno por CPU que ve la máquina, y el servidor compartido de
     * Hostinger le muestra 57: el 2026-10-20 un build murió con «OS can't spawn
     * worker thread» porque la cuenta tiene un tope de hilos. Con 4 sobra para
     * este sitio, y en el PC y el CI no cambia nada que se note.
     */
    cpus: 4,
  },

  async headers() {
    return [
      {
        // Todo, incluidos los archivos estáticos y las imágenes optimizadas.
        source: "/:ruta*",
        headers: cabecerasDeSeguridad(process.env.NODE_ENV === "production"),
      },
    ];
  },

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
    /**
     * Tope de la caché del optimizador. Sin él, Next toma la mitad del disco
     * libre que ve al arrancar, y en Hostinger ese disco es la cuota de la
     * cuenta, la misma de MariaDB y de las fotos. La versión de `/archivos/…`
     * no se comprueba al leer (`almacen-disco.ts`): cada versión inventada es
     * una entrada nueva, así que sin tope se podía llenar la cuota a peticiones.
     */
    maximumDiskCacheSize: 300_000_000,
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
