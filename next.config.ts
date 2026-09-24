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
 * ## La política de contenido, y hasta dónde llega
 *
 * **`script-src` lleva `'unsafe-inline'`, y eso hay que decirlo en voz alta.**
 * Next inyecta scripts en línea para hidratar (`self.__next_f.push(...)`), y la
 * única forma de no permitirlos es un `nonce` por respuesta — que obliga a
 * renderizar cada página en cada petición, o sea a renunciar al prerenderizado
 * del catálogo y de las fichas, que es de donde sale la velocidad del sitio.
 * Con `'unsafe-inline'`, esta CSP **no** es una defensa contra XSS.
 *
 * Lo que sí hace, y no es poco, es cerrar todo lo demás:
 *
 * - `frame-ancestors 'none'` — nadie puede meter el sitio en un iframe, que es
 *   el clickjacking clásico: un botón invisible encima de «confirmar pedido».
 * - `form-action 'self'` — un formulario inyectado no puede enviar a otro
 *   dominio. Es lo que convierte un XSS en un robo de datos del formulario.
 * - `base-uri 'self'` — un `<base>` inyectado no puede repuntar todas las rutas
 *   relativas de la página a un servidor ajeno.
 * - `object-src 'none'` — ni Flash, ni applets, ni PDFs incrustados.
 * - `connect-src` acotado — aunque alguien lograra ejecutar algo, no puede
 *   mandar lo que lea a cualquier sitio.
 *
 * **`img-src` acepta cualquier `https:` a propósito.** Hoy la foto de una oferta
 * es una dirección de texto que escribe el proveedor
 * (`src/components/listing-media.tsx` la pinta con un `<img>` pelado), así que
 * acotarla al dominio de Supabase dejaría sin imagen a medio catálogo. El día
 * que subir el archivo sea obligatorio, esta línea se cierra al mismo dominio
 * que `remotePatterns`.
 */
function cabecerasDeSeguridad(produccion: boolean) {
  const supabase = anfitrion ? `https://${anfitrion} wss://${anfitrion}` : "";

  const csp = [
    "default-src 'self'",
    // `'unsafe-eval'` solo en desarrollo: lo necesita el recargado en caliente.
    `script-src 'self' 'unsafe-inline'${produccion ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${supabase}`.trim(),
    "media-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    ...(produccion ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const cabeceras = [
    { key: "Content-Security-Policy", value: csp },
    // Redundante con `frame-ancestors` en navegadores actuales, y gratis.
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
