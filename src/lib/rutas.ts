/**
 * Qué partes del sitio son públicas y cuáles no.
 *
 * Existe porque la misma lista la necesitan tres sitios —`robots.txt`, el
 * sitemap y la revisión de que ninguna página privada se quedó sin
 * `robots: { index: false }`— y tres listas que hay que mantener iguales acaban
 * distintas. La primera vez que pasa, una orden de un comprador sale en Google.
 *
 * **No es control de acceso.** Que una ruta esté aquí no impide que nadie la
 * abra: eso lo deciden `requireUser()` / `requireAdmin()` y, por debajo, las
 * políticas RLS de `supabase/migrations/`. Esta lista solo decide qué se indexa.
 */

/** Rutas que no deben salir en ningún buscador. Sin barra final. */
export const RUTAS_PRIVADAS = [
  "/admin",
  "/cuenta",
  "/carrito",
  "/orden",
  "/auth",
  "/api",
  "/salir",
] as const;

/**
 * Las páginas públicas fijas, con la prioridad que se le declara al buscador.
 *
 * `prioridad` es relativa **dentro de este sitio** y no una nota: le dice al
 * rastreador a qué volver primero cuando no puede recorrerlo todo. La portada y
 * el catálogo mandan; las legales existen y no compiten.
 *
 * Las páginas de oferta y de proveedor **no están aquí**: se generan desde la
 * base en `src/app/sitemap.ts`, porque son las que cambian.
 *
 * **`/entrar` y `/registro` tampoco están, y no es un olvido.** Las dos llevan
 * `robots: { index: false }` desde antes de esta lista, así que meterlas en el
 * sitemap sería mandar dos señales contrarias al mismo rastreador: «indexa
 * esto» en un archivo y «no lo indexes» en la etiqueta. Search Console lo
 * reporta como error, y con razón. Si algún día se decide que la página de
 * registro sí debe salir en el buscador, se quita el `robots` de esa página
 * **y** se agrega aquí — las dos cosas, o ninguna.
 */
export const RUTAS_PUBLICAS = [
  { ruta: "/", prioridad: 1, frecuencia: "daily" },
  { ruta: "/catalogo", prioridad: 0.9, frecuencia: "daily" },
  { ruta: "/proveedores", prioridad: 0.8, frecuencia: "weekly" },
  { ruta: "/comunidad", prioridad: 0.8, frecuencia: "daily" },
  { ruta: "/vender", prioridad: 0.8, frecuencia: "monthly" },
  { ruta: "/verificacion", prioridad: 0.7, frecuencia: "monthly" },
  { ruta: "/niveles", prioridad: 0.7, frecuencia: "monthly" },
  { ruta: "/terminos", prioridad: 0.3, frecuencia: "yearly" },
  { ruta: "/privacidad", prioridad: 0.3, frecuencia: "yearly" },
] as const satisfies readonly {
  ruta: string;
  prioridad: number;
  frecuencia: "daily" | "weekly" | "monthly" | "yearly";
}[];
