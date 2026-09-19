import type { Mensaje } from "./tipos";

/**
 * Los correos que manda la aplicación.
 *
 * **Están en código y no en el panel de Supabase, y esa es la diferencia que
 * importa**: estos se despliegan con el repositorio, se revisan en un PR y no se
 * pierden si alguien recrea el proyecto de Supabase. Los de acceso no pueden
 * estar aquí —los manda Supabase— y por eso viven copiados en
 * `plantillas-correo/`.
 *
 * El HTML sigue las mismas reglas que aquellos, explicadas en
 * `plantillas-correo/00-base.md`: tablas, estilos en línea, Georgia en los
 * títulos, ancho máximo 560 px y ningún archivo adjunto. No es nostalgia: Gmail
 * borra el `<head>` y Outlook renderiza con el motor de Word.
 */

const VERDE = "#1b5b3d";
const TINTA = "#17241d";
const APAGADO = "#55655c";
const ARENA = "#f0ebe2";
const VERDE_CLARO = "#eef7f1";
const LINEA = "#e3ded3";

const SERIF = "Georgia,'Times New Roman',serif";
const SANS =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * De dónde cuelgan el logo y los enlaces.
 *
 * Misma variable que usa `src/app/layout.tsx` para las tarjetas al compartir. Si
 * se queda en `localhost`, el logo del correo sale como cuadro roto en la
 * bandeja de quien lo reciba — es el mismo fallo, en otro sitio.
 */
function sitio(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

/**
 * El esqueleto compartido.
 *
 * `preencabezado` es el texto que la bandeja de entrada enseña junto al asunto.
 * Sin él, Gmail rellena ese hueco con lo primero que encuentra en el HTML — que
 * es el `alt` del logo — y en la lista se lee «Seregenera Seregenera».
 */
function envolver({
  titulo,
  preencabezado,
  cuerpo,
}: {
  titulo: string;
  preencabezado: string;
  cuerpo: string;
}): string {
  const url = sitio();
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapar(titulo)}</title>
</head>
<body style="margin:0; padding:0; background-color:${ARENA};">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all;">${escapar(preencabezado)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${ARENA};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width:100%; max-width:560px; background-color:#ffffff; border-radius:16px; overflow:hidden;">
        <tr><td style="height:4px; line-height:4px; font-size:0; background-color:${VERDE};">&nbsp;</td></tr>
        <tr><td align="center" style="padding:28px 24px 8px 24px;">
          <a href="${url}" style="text-decoration:none;"><img src="${url}/img/marca/redes/firma-correo.png" width="160" height="40" alt="Seregenera" style="display:block; border:0; outline:none; text-decoration:none; width:160px; height:40px; font-family:${SERIF}; font-size:22px; font-weight:bold; color:${VERDE};"></a>
        </td></tr>
${cuerpo}
        <tr><td align="center" style="padding:26px 32px 30px 32px;">
          <p style="margin:0; font-family:${SANS}; font-size:12px; line-height:1.6; color:${APAGADO};">
            <strong style="color:${VERDE};">Seregenera</strong><br>
            Marketplace regenerativo para el turismo
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function seccion(html: string): string {
  return `        <tr><td style="padding:12px 32px 0 32px;">${html}</td></tr>\n`;
}

function h1(texto: string): string {
  return `<h1 style="margin:0; font-family:${SERIF}; font-size:26px; line-height:1.25; font-weight:normal; color:${TINTA};">${escapar(texto)}</h1>`;
}

function p(html: string): string {
  return `<p style="margin:14px 0 0 0; font-family:${SANS}; font-size:16px; line-height:1.6; color:${APAGADO};">${html}</p>`;
}

function boton(href: string, texto: string): string {
  return `        <tr><td align="center" style="padding:26px 32px 4px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td align="center" style="background-color:${VERDE}; border-radius:999px;">
              <a href="${href}" style="display:inline-block; padding:14px 30px; font-family:${SANS}; font-size:15px; font-weight:bold; color:#ffffff; text-decoration:none; border-radius:999px;">${escapar(texto)}</a>
            </td>
          </tr></table>
        </td></tr>\n`;
}

function separador(): string {
  return `        <tr><td style="padding:28px 32px 0 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="height:1px; line-height:1px; font-size:0; background-color:${LINEA};">&nbsp;</td>
          </tr></table>
        </td></tr>\n`;
}

/**
 * Escapa lo que escribió el usuario antes de meterlo en el HTML.
 *
 * **Aquí no hay React que lo haga por nosotros.** El nombre de la empresa y el
 * del contacto vienen de un formulario público: sin esto, una empresa llamada
 * `<script>` o con un `"` en el nombre rompe el correo, y quien lo reciba es el
 * administrador que lo lee. Es la misma razón por la que el `<title>` también
 * pasa por aquí.
 */
function escapar(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface DatosPostulacion {
  empresa: string;
  contacto: string;
  correo: string;
  /** ¿Quedó activada la cuenta de proveedor, o hace falta que se registre? */
  activada: boolean;
  /** El slug de su ficha pública, cuando quedó activada. */
  slug?: string;
}

/**
 * El respaldo de una postulación.
 *
 * Tiene dos versiones porque hay dos desenlaces de verdad, y fingir que son uno
 * solo es lo que convierte un correo útil en un acuse de recibo que nadie lee:
 *
 * - **Activada** (postuló con sesión): su empresa ya existe y ya puede publicar.
 *   El correo es una bienvenida con el enlace a su ficha, no una espera.
 * - **Sin activar** (postuló sin cuenta): la postulación está guardada y falta un
 *   paso suyo. El correo le dice exactamente cuál y con qué correo hacerlo.
 *
 * En ningún caso dice «te responderemos en cinco días hábiles». Ya no es verdad,
 * y era lo que hacía que el formulario se sintiera una solicitud de permiso.
 */
export function correoPostulacionRecibida(d: DatosPostulacion): Mensaje {
  const url = sitio();
  const empresa = escapar(d.empresa);
  const nombre = escapar(d.contacto.split(" ")[0] || d.contacto);

  const cuerpo = d.activada
    ? seccion(
        h1(`Ya estás dentro, ${d.contacto.split(" ")[0] || ""}`.trim()) +
          p(
            `<strong style="color:${TINTA};">${empresa}</strong> ya tiene su ficha en Seregenera y entra con nivel <strong style="color:${TINTA};">Semilla</strong>. Desde hoy puedes publicar lo que vendes.`,
          ),
      ) +
      bloqueSiguientesPasos([
        "Completa tu perfil: logo, descripción y ubicación. Son 80 puntos de experiencia.",
        "Publica tu primera oferta con su precio y su impacto por unidad.",
        "Cuando quieras, responde la evaluación de sostenibilidad: son 300 puntos y el sello de evaluación verificada.",
      ]) +
      boton(
        d.slug ? `${url}/proveedor/${d.slug}` : `${url}/cuenta`,
        "Ver mi ficha",
      ) +
      separador() +
      seccion(
        p(
          `Publicar es gratis y no hay mensualidad. Seregenera retiene una comisión solo cuando vendes, y esa comisión <strong style="color:${TINTA};">baja con tu nivel</strong>: 12 % en Semilla, 10 % en Raíz y 8 % en Bosque. El nivel te sube según lo que vendas y entregues. <a href="${url}/niveles" style="color:${VERDE};">Cómo funcionan los niveles</a>.`,
        ),
      )
    : seccion(
        h1("Recibimos tu postulación") +
          p(
            `Guardamos lo que nos contaste de <strong style="color:${TINTA};">${empresa}</strong>, ${nombre}. Falta un solo paso para que puedas publicar, y lo puedes dar ahora mismo.`,
          ) +
          p(
            `<strong style="color:${TINTA};">Crea tu cuenta con este mismo correo</strong> (${escapar(d.correo)}) y tu empresa queda activa en el acto, con su ficha y su nivel Semilla. Publicar es gratis y la comisión solo se cobra cuando vendes.`,
          ),
      ) +
      boton(`${url}/registro`, "Crear mi cuenta") +
      separador() +
      seccion(
        p(
          `Si ya tienes cuenta con otro correo, entra y vuelve a mandar el formulario de <a href="${url}/vender#postular" style="color:${VERDE};">/vender</a> desde esa sesión: así queda enlazada a ti.`,
        ),
      );

  return {
    para: d.correo,
    asunto: d.activada
      ? `${d.empresa} ya está en Seregenera`
      : "Recibimos tu postulación a Seregenera",
    html: envolver({
      titulo: d.activada
        ? `${d.empresa} ya está en Seregenera`
        : "Recibimos tu postulación a Seregenera",
      preencabezado: d.activada
        ? "Tu ficha ya existe y puedes publicar desde hoy."
        : "Falta un paso: crear tu cuenta con este mismo correo.",
      cuerpo,
    }),
    texto: d.activada ? textoActivada(d, url) : textoSinActivar(d, url),
  };
}

function bloqueSiguientesPasos(pasos: string[]): string {
  const filas = pasos
    .map(
      (paso, i) => `
            <tr>
              <td width="28" valign="top" style="font-family:${SERIF}; font-size:18px; color:${VERDE}; padding:6px 0;">${i + 1}.</td>
              <td style="font-family:${SANS}; font-size:15px; line-height:1.55; color:${APAGADO}; padding:6px 0;">${escapar(paso)}</td>
            </tr>`,
    )
    .join("");

  return `        <tr><td style="padding:22px 32px 0 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${VERDE_CLARO}; border-radius:12px;">
            <tr><td style="padding:18px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${filas}
              </table>
            </td></tr>
          </table>
        </td></tr>\n`;
}

function textoActivada(d: DatosPostulacion, url: string): string {
  return [
    `Ya estás dentro, ${d.contacto.split(" ")[0] || ""}`.trim(),
    "",
    `${d.empresa} ya tiene su ficha en Seregenera y entra con nivel Semilla.`,
    "Desde hoy puedes publicar lo que vendes.",
    "",
    "Siguientes pasos:",
    "1. Completa tu perfil (logo, descripción, ubicación) — 80 puntos.",
    "2. Publica tu primera oferta con su precio y su impacto por unidad.",
    "3. Responde la evaluación de sostenibilidad cuando quieras — 300 puntos y el sello.",
    "",
    d.slug ? `Tu ficha: ${url}/proveedor/${d.slug}` : `Tu cuenta: ${url}/cuenta`,
    "",
    "Publicar es gratis. La comisión solo se cobra cuando vendes, y baja con tu",
    "nivel: 12 % en Semilla, 10 % en Raíz, 8 % en Bosque. El nivel te sube",
    "según lo que vendas y entregues.",
    `Cómo funcionan los niveles: ${url}/niveles`,
    "",
    "— Seregenera",
  ].join("\n");
}

function textoSinActivar(d: DatosPostulacion, url: string): string {
  return [
    "Recibimos tu postulación",
    "",
    `Guardamos lo que nos contaste de ${d.empresa}.`,
    "Falta un solo paso para que puedas publicar:",
    "",
    `Crea tu cuenta con este mismo correo (${d.correo}) y tu empresa queda`,
    "activa en el acto, con su ficha y su nivel Semilla.",
    "",
    `Crear cuenta: ${url}/registro`,
    "",
    "Publicar es gratis y la comisión solo se cobra cuando vendes.",
    "",
    "— Seregenera",
  ].join("\n");
}
