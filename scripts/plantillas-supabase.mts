#!/usr/bin/env node
/**
 * Sube a Supabase las plantillas de correo de `plantillas-correo/`.
 *
 *   node --env-file=.env scripts/plantillas-supabase.mts            # solo compara
 *   node --env-file=.env scripts/plantillas-supabase.mts --aplicar  # sube las distintas
 *   node --env-file=.env scripts/plantillas-supabase.mts --aplicar --site-url https://seregenera.com
 *
 * ## Por qué existe
 *
 * Los correos de acceso los manda Supabase, y su HTML vive en el panel. Hasta
 * el 2026-10-17 se pegaban a mano, pestaña por pestaña, y nadie podía decir
 * cuáles estaban al día: ese día, leyendo el panel por la API, resultó que solo
 * dos de las seis tenían el texto del repositorio, en una versión vieja y sin
 * logo, y las otras cuatro seguían en inglés, de fábrica. Este script hace que
 * el repositorio sea la fuente y el panel la copia, y no al revés.
 *
 * Sin `--aplicar` no escribe nada: dice, plantilla por plantilla, si el panel
 * coincide con el archivo.
 *
 * ## El token
 *
 * `SUPABASE_ACCESS_TOKEN` es un token **personal** de la cuenta de Supabase
 * (supabase.com/dashboard/account/tokens), no una clave del proyecto. Da acceso
 * a la configuración de todos los proyectos de esa cuenta, así que solo vive en
 * el `.env` y nunca en una variable de Hostinger: la aplicación no lo usa.
 *
 * ## Lo que comprueba antes de subir
 *
 * Las reglas de `plantillas-correo/README.md`, porque romper cualquiera deja el
 * acceso roto sin ningún error a la vista: el código `{{ .Token }}` en
 * registro y en acceso (Supabase elige una u otra según la persona exista), y
 * ningún `{{ .ConfirmationURL }}` (devuelve a la portada sin sesión). Si una
 * falla, no se sube ninguna.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Archivo del repositorio → nombre de la plantilla en la API de Supabase. */
const PLANTILLAS = [
  { archivo: "01-confirmar-registro.md", clave: "confirmation", conCodigo: true },
  { archivo: "02-codigo-de-acceso.md", clave: "magic_link", conCodigo: true },
  { archivo: "03-invitacion.md", clave: "invite", conCodigo: false },
  { archivo: "04-cambio-de-correo.md", clave: "email_change", conCodigo: false },
  { archivo: "05-recuperar-clave.md", clave: "recovery", conCodigo: false },
  { archivo: "07-confirmar-operacion.md", clave: "reauthentication", conCodigo: true },
] as const;

const args = process.argv.slice(2);
const aplicar = args.includes("--aplicar");
const siteUrlPedida = args.includes("--site-url") ? args[args.indexOf("--site-url") + 1] : undefined;

const token = process.env.SUPABASE_ACCESS_TOKEN;
const urlProyecto = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!token || !urlProyecto) {
  console.error("Faltan SUPABASE_ACCESS_TOKEN o NEXT_PUBLIC_SUPABASE_URL en el .env.");
  process.exit(1);
}
// El ref es el subdominio de la URL del proyecto: no se escribe aquí.
const ref = new URL(urlProyecto).hostname.split(".")[0];
const API = `https://api.supabase.com/v1/projects/${ref}/config/auth`;

/** El primer bloque de código después de un encabezado `## <titulo>`. */
function bloque(md: string, titulo: string): string {
  const desde = md.indexOf(`## ${titulo}`);
  if (desde < 0) throw new Error(`no tiene la sección «${titulo}»`);
  const m = md.slice(desde).match(/```[a-z]*\n([\s\S]*?)\n```/);
  if (!m) throw new Error(`la sección «${titulo}» no trae bloque de código`);
  return m[1];
}

const carpeta = join(import.meta.dirname, "..", "plantillas-correo");
const locales = PLANTILLAS.map((p) => {
  const md = readFileSync(join(carpeta, p.archivo), "utf8").replace(/\r\n/g, "\n");
  const asunto = bloque(md, "Asunto").trim();
  const cuerpo = bloque(md, "Cuerpo");
  const fallos: string[] = [];
  if (p.conCodigo && !cuerpo.includes("{{ .Token }}")) fallos.push("le falta {{ .Token }}");
  if (cuerpo.includes("{{ .ConfirmationURL }}")) fallos.push("usa {{ .ConfirmationURL }}");
  if (asunto.includes("{{ .Token }}")) fallos.push("lleva el código en el asunto");
  return { ...p, asunto, cuerpo, fallos };
});

const conFallos = locales.filter((l) => l.fallos.length > 0);
if (conFallos.length > 0) {
  for (const l of conFallos) console.error(`✗ ${l.archivo}: ${l.fallos.join(", ")}`);
  console.error("No se sube nada.");
  process.exit(1);
}

/**
 * Lo que habla con Supabase va en una función que devuelve el código de salida,
 * y no corta con `process.exit()`: en Windows, con Node 24, cortar mientras
 * `fetch` cierra sus conexiones revienta con «Assertion failed:
 * !(handle->flags & UV_HANDLE_CLOSING)» (pasó el 2026-10-17).
 */
async function main(): Promise<number> {
  const respuesta = await fetch(API, { headers: { Authorization: `Bearer ${token}` } });
  if (!respuesta.ok) {
    console.error(`Supabase respondió ${respuesta.status}: ${(await respuesta.text()).slice(0, 200)}`);
    if (respuesta.status === 401) console.error("El token venció o no es de la cuenta dueña del proyecto.");
    return 1;
  }
  const panel = (await respuesta.json()) as Record<string, unknown>;

  const cambios: Record<string, string> = {};
  for (const l of locales) {
    const campoAsunto = `mailer_subjects_${l.clave}`;
    const campoCuerpo = `mailer_templates_${l.clave}_content`;
    const igualAsunto = panel[campoAsunto] === l.asunto;
    const igualCuerpo = panel[campoCuerpo] === l.cuerpo;
    if (igualAsunto && igualCuerpo) {
      console.log(`= ${l.archivo}: el panel ya coincide`);
      continue;
    }
    console.log(
      `≠ ${l.archivo}: ${[!igualAsunto && "asunto", !igualCuerpo && "cuerpo"].filter(Boolean).join(" y ")} distinto` +
        ` (en el panel: «${String(panel[campoAsunto] ?? "")}»)`,
    );
    cambios[campoAsunto] = l.asunto;
    cambios[campoCuerpo] = l.cuerpo;
  }

  // Las plantillas pegan rutas detrás de `{{ .SiteURL }}`: con una barra final
  // salen `//img/…` y `//auth/callback`, y con `www.` la sesión queda en otro
  // dominio que el del sitio, así que el enlace del correo entra y la persona
  // aparece fuera.
  const siteUrl = String(panel.site_url ?? "");
  if (siteUrlPedida) {
    if (siteUrlPedida.endsWith("/")) {
      console.error("--site-url va sin barra final.");
      return 1;
    }
    if (siteUrl !== siteUrlPedida) cambios.site_url = siteUrlPedida;
    console.log(`${siteUrl === siteUrlPedida ? "=" : "≠"} Site URL: «${siteUrl}» → «${siteUrlPedida}»`);
  } else if (siteUrl.endsWith("/") || new URL(siteUrl).hostname.startsWith("www.")) {
    console.log(`! Site URL es «${siteUrl}»: usa --site-url con el dominio sin www y sin barra final.`);
  }

  if (Object.keys(cambios).length === 0) {
    console.log("Nada que subir.");
    return 0;
  }
  if (!aplicar) {
    console.log("Para subirlo: el mismo comando con --aplicar.");
    return 0;
  }

  const subida = await fetch(API, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(cambios),
  });
  if (!subida.ok) {
    console.error(`No se subió: ${subida.status} ${(await subida.text()).slice(0, 300)}`);
    return 1;
  }
  console.log(`✓ Subido: ${Object.keys(cambios).length} campos. Pruébalo con el paso A5 de docs/CORREOS.md.`);
  return 0;
}

process.exitCode = await main();
