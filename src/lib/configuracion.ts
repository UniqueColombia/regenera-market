/**
 * ¿Está bien configurada la producción? La lista de lo que tiene que estar.
 *
 * Existe por una trampa concreta: casi todo en esta app **degrada en silencio**
 * cuando le falta una variable, y eso es bueno en un clon recién hecho y malo en
 * producción. La peor: sin `BASE_DE_DATOS=mysql`, la app vuelve sola a Supabase,
 * que se quedó con los datos del 2026-10-17, y lo que se escriba desde entonces
 * queda partido en dos bases (`docs/VARIABLES.md`). Nadie se entera hasta que un
 * pedido «desaparece».
 *
 * Aquí no se decide nada: se describe. Quien llama decide qué hacer —
 * `src/instrumentation.ts` lo escribe en el registro al arrancar y
 * `/api/latido` responde 503 si hay algo crítico, que es lo que pone rojo el
 * monitor de GitHub (`.github/workflows/latido.yml`) y manda el correo.
 *
 * **Los mensajes nombran variables, nunca valores.** Van al registro del
 * servidor, y un valor ahí es un secreto en un archivo que no controlamos.
 *
 * Se recibe `env` y no se lee `process.env` adentro para poder probarlo, y se lee
 * con corchetes a propósito: `process.env.NEXT_PUBLIC_…` escrito literal lo
 * reemplaza Next al compilar, y aquí interesa lo que hay al correr.
 */

export interface RevisionDeConfiguracion {
  /** Producción no puede quedarse así: el latido responde 503. */
  criticos: string[];
  /** Funciona, pero algo sobra o falta: solo al registro. */
  avisos: string[];
}

type Entorno = Record<string, string | undefined>;

function hay(env: Entorno, nombre: string): boolean {
  return Boolean(env[nombre]?.trim());
}

/** Absoluta en Linux (Hostinger) o en Windows (el PC). */
function esRutaAbsoluta(ruta: string): boolean {
  return ruta.startsWith("/") || /^[A-Za-z]:[\\/]/.test(ruta);
}

export function esProduccion(env: Entorno = process.env): boolean {
  return env["NODE_ENV"] === "production";
}

export function revisarConfiguracion(env: Entorno = process.env): RevisionDeConfiguracion {
  const criticos: string[] = [];
  const avisos: string[] = [];
  const mysql = env["BASE_DE_DATOS"] === "mysql";

  if (!mysql) {
    criticos.push(
      "BASE_DE_DATOS no es «mysql»: la app usaría Supabase (datos del 2026-10-17) o los de ejemplo",
    );
  } else {
    for (const nombre of ["MYSQL_HOST", "MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD"]) {
      if (!hay(env, nombre)) criticos.push(`falta ${nombre}`);
    }
    const carpeta = env["ALMACEN_CARPETA"]?.trim();
    if (!carpeta) criticos.push("falta ALMACEN_CARPETA: las fotos no tienen dónde guardarse");
    else if (!esRutaAbsoluta(carpeta)) criticos.push("ALMACEN_CARPETA no es una ruta absoluta");
  }

  const sitio = env["NEXT_PUBLIC_SITE_URL"]?.trim();
  if (!sitio) criticos.push("falta NEXT_PUBLIC_SITE_URL: correos, redirecciones y sitemap apuntarían mal");
  else if (!sitio.startsWith("https://")) criticos.push("NEXT_PUBLIC_SITE_URL no empieza por https://");

  if (hay(env, "BOLD_MODO_PRUEBAS")) {
    criticos.push("BOLD_MODO_PRUEBAS tiene valor: en producción va vacía");
  }

  const secreto = env["SESION_SECRETO"]?.trim() ?? "";
  if (secreto.length < 32) {
    avisos.push("SESION_SECRETO falta o es corta (menos de 32 caracteres)");
  }

  const smtp = ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"].filter((n) => !hay(env, n));
  if (smtp.length) {
    avisos.push(`faltan ${smtp.join(", ")}: los correos de la app se escriben en la consola`);
  }

  if (hay(env, "BOLD_LLAVE_IDENTIDAD") !== hay(env, "BOLD_LLAVE_SECRETA")) {
    avisos.push("solo una de las dos llaves de BOLD tiene valor: el pago en línea queda apagado");
  }

  if (mysql) {
    const supabase = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"].filter(
      (n) => hay(env, n),
    );
    if (supabase.length) {
      avisos.push(`sobran ${supabase.join(", ")}: el modo MySQL no las usa`);
    }
  }

  for (const nombre of ["IS_WEBPACK_TEST", "HOSTINGER_API_KEY", "HOSTINGER_PASSWORD"]) {
    if (hay(env, nombre)) avisos.push(`sobra ${nombre} en las variables de la app`);
  }

  return { criticos, avisos };
}
