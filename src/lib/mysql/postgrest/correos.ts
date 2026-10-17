import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Mensaje } from "../../correo/tipos";

/**
 * Los correos del código de seis dígitos, en el modo MySQL. Con Supabase los
 * manda Supabase con las plantillas pegadas en su panel; aquí los manda la app
 * con **las mismas plantillas**, leídas de `plantillas-correo/` (la copia de
 * referencia que ya existía). Un cambio de texto se hace en esos archivos y
 * vale para los dos modos.
 *
 * Se reemplazan las variables de Supabase que usan las plantillas 01 y 02:
 * `{{ .Token }}`, `{{ .TokenHash }}` (el enlace de `/auth/callback`),
 * `{{ .SiteURL }}` y `{{ .Email }}`.
 */

interface Plantilla {
  asunto: string;
  html: string;
}

const cache = new Map<string, Plantilla>();

function plantilla(archivo: string): Plantilla {
  const guardada = cache.get(archivo);
  if (guardada) return guardada;
  const md = readFileSync(join(process.cwd(), "plantillas-correo", archivo), "utf8");
  const asunto = /## Asunto\s+```[a-z]*\r?\n([\s\S]*?)\r?\n```/.exec(md)?.[1]?.trim();
  const html = /## Cuerpo\s+```html\r?\n([\s\S]*?)\r?\n```/.exec(md)?.[1];
  if (!asunto || !html) throw new Error(`plantillas-correo/${archivo}: no encontré el asunto o el cuerpo`);
  const p = { asunto, html };
  cache.set(archivo, p);
  return p;
}

export function correoDeCodigo(datos: { para: string; codigo: string; tokenHash: string; registro: boolean }): Mensaje {
  const sitio = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const p = plantilla(datos.registro ? "01-confirmar-registro.md" : "02-codigo-de-acceso.md");
  const reemplazar = (s: string) =>
    s
      .replaceAll("{{ .Token }}", datos.codigo)
      .replaceAll("{{ .TokenHash }}", encodeURIComponent(datos.tokenHash))
      .replaceAll("{{ .SiteURL }}", sitio)
      .replaceAll("{{ .Email }}", datos.para);
  const enlace = `${sitio}/auth/callback?token_hash=${encodeURIComponent(datos.tokenHash)}&type=email`;
  return {
    para: datos.para,
    asunto: reemplazar(p.asunto),
    html: reemplazar(p.html),
    texto: `Tu código de Seregenera: ${datos.codigo}\n\nVence en una hora y sirve una sola vez.\n\nTambién puedes entrar con este enlace:\n${enlace}\n\nSi no fuiste tú, ignora este correo.`,
  };
}
