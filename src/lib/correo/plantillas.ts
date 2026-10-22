import { plazoDeEntrega } from "../envios";
import { longDate } from "../format";
import { CONTACTO, redesActivas } from "../legal";
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
            Marketplace regenerativo para el turismo${pieDeRedes()}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Las redes, como enlaces de texto al pie. Texto y no íconos: Gmail bloquea las
 * imágenes remotas hasta que se piden y no admite SVG, así que un ícono saldría
 * como un cuadro vacío. Sin redes configuradas, nada.
 */
function pieDeRedes(): string {
  const redes = redesActivas();
  if (redes.length === 0) return "";
  const enlaces = redes
    .map(
      (r) =>
        `<a href="${escapar(r.url)}" style="color:${VERDE}; text-decoration:underline;">${escapar(r.nombre)}</a>`,
    )
    .join(" · ");
  return `<br>${enlaces}`;
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

// ---------------------------------------------------------------------------
// Bienvenida a una persona
// ---------------------------------------------------------------------------

/**
 * Lo que llega al terminar de crear la cuenta.
 *
 * Hasta ahora quien se registraba recibía **solo** el código de seis dígitos,
 * que manda Supabase y no nosotros. Eso es un trámite, no un recibimiento: nadie
 * le decía qué podía hacer ahora. Este correo lo dice, y no repite el código ni
 * pide nada.
 *
 * Una empresa recibe además `correoPostulacionRecibida()` al darse de alta, que
 * es su propia bienvenida: la de aquí es de la persona, la otra de su empresa.
 */
export function correoBienvenida(d: { nombre: string; correo: string }): Mensaje {
  const url = sitio();

  const cuerpo =
    seccion(
      h1(`Hola, ${d.nombre.split(" ")[0] || d.nombre}: ya estás dentro`) +
        p(
          "Tu cuenta en Seregenera ya está activa. Desde hoy puedes comprar a proveedores que te cuentan de dónde viene lo que venden y cuánto impacto evita.",
        ),
    ) +
    bloqueSiguientesPasos([
      "Explora el catálogo por lo que quieres resolver: agua, energía, residuos, hospitalidad…",
      "Si tienes una empresa que vende algo regenerativo, dala de alta y publica el mismo día.",
      "Pasa por la Comunidad: ahí cuentan otros qué les funcionó.",
    ]) +
    boton(`${url}/catalogo`, "Ver el catálogo") +
    separador() +
    seccion(
      p(
        `¿Vendes? <a href="${url}/vender" style="color:${VERDE};">Da de alta tu empresa</a>. Publicar es gratis y la comisión solo se cobra cuando vendes.`,
      ),
    );

  return {
    para: d.correo,
    asunto: "Te damos la bienvenida a Seregenera",
    html: envolver({
      titulo: "Te damos la bienvenida a Seregenera",
      preencabezado: "Tu cuenta ya está activa. Esto es lo que puedes hacer ahora.",
      cuerpo,
    }),
    texto: [
      "Te damos la bienvenida a Seregenera",
      "",
      `${d.nombre.split(" ")[0] || d.nombre}, tu cuenta ya está activa.`,
      "",
      "1. Explora el catálogo por lo que quieres resolver: agua, energía, residuos…",
      "2. Si tienes una empresa que vende algo regenerativo, dala de alta.",
      "3. Pasa por la Comunidad: ahí cuentan otros qué les funcionó.",
      "",
      `Catálogo: ${url}/catalogo`,
      `Vender en Seregenera: ${url}/vender`,
      "",
      "— Seregenera",
    ].join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Pedido recibido
// ---------------------------------------------------------------------------

/**
 * El respaldo de un pedido: qué se compró, cuánto es y con qué referencia se
 * paga. Es lo que la persona busca en su correo el día que va a transferir.
 *
 * Los importes llegan ya calculados por la base (`crear_orden()`): aquí no se
 * suma nada, solo se pinta. Invariante 1 de `dominio-regenera`.
 */
export function correoPedidoRecibido(d: {
  nombre: string;
  correo: string;
  referencia: string;
  totalCop: number;
  /**
   * `diasMin`/`diasMax`: el plazo que declaró el vendedor, si lo declaró.
   * `fecha`: el día de una experiencia (AAAA-MM-DD), si lo tiene.
   */
  lineas: { titulo: string; qty: number; diasMin?: number; diasMax?: number; fecha?: string }[];
}): Mensaje {
  const url = sitio();
  const pesos = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(d.totalCop);

  // El mismo plazo que la cesta y la página del pedido (`plazoDeEntrega()`):
  // si el correo dijera otro, el que vale para reclamar es el que se prometió
  // en pantalla y la persona no tendría cómo saber cuál.
  const conPlazo = d.lineas.map((l) => ({ ...l, plazo: plazoDeEntrega(l.diasMin, l.diasMax) }));
  const lista = conPlazo
    .map(
      (l) =>
        `${l.qty} × ${escapar(l.titulo)}` +
        (l.fecha ? ` <span style="color:${APAGADO};">· el ${longDate(l.fecha)}</span>` : "") +
        (l.plazo ? ` <span style="color:${APAGADO};">· llega ${escapar(l.plazo)}</span>` : ""),
    )
    .join("<br>");
  const hayPlazos = conPlazo.some((l) => l.plazo);

  const cuerpo =
    seccion(
      h1("Recibimos tu pedido") +
        p(
          `Gracias, ${escapar(d.nombre.split(" ")[0] || d.nombre)}. Tu pedido quedó registrado con la referencia <strong style="color:${TINTA};">${escapar(d.referencia)}</strong> por <strong style="color:${TINTA};">${pesos}</strong>.`,
        ) +
        p(lista) +
        (hayPlazos ? p("Los días hábiles se cuentan desde que confirmamos tu pago.") : ""),
    ) +
    boton(`${url}/orden/${encodeURIComponent(d.referencia)}`, "Ver mi pedido y cómo pagar") +
    separador() +
    seccion(
      p(
        "En tu pedido están las formas de pagar. Si pagas con llave Bre-B o por transferencia, escribe la referencia en la descripción y te confirmamos el pago el mismo día hábil.",
      ),
    );

  return {
    para: d.correo,
    asunto: `Tu pedido ${d.referencia} en Seregenera`,
    html: envolver({
      titulo: `Tu pedido ${d.referencia}`,
      preencabezado: `Referencia ${d.referencia} · ${pesos}`,
      cuerpo,
    }),
    texto: [
      "Recibimos tu pedido",
      "",
      `Referencia: ${d.referencia}`,
      `Total: ${pesos}`,
      "",
      ...conPlazo.map(
        (l) =>
          `${l.qty} × ${l.titulo}${l.fecha ? ` · el ${longDate(l.fecha)}` : ""}${l.plazo ? ` · llega ${l.plazo}` : ""}`,
      ),
      ...(hayPlazos ? ["Los días hábiles se cuentan desde que confirmamos tu pago."] : []),
      "",
      `Ver el pedido y cómo pagar: ${url}/orden/${d.referencia}`,
      "Si pagas con llave Bre-B o por transferencia, escribe la referencia en la descripción.",
      "",
      "— Seregenera",
    ].join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Ofertas: en revisión y publicada
// ---------------------------------------------------------------------------

/**
 * Una oferta que la empresa mandó a revisión.
 *
 * **Escrita y sin conectar todavía**: ninguna acción la llama. El sitio donde
 * iría es `src/app/cuenta/empresa/ofertas/actions.ts`, justo después de guardar
 * con `status = "pending_review"`. Está aquí para que el texto se pueda revisar y
 * ajustar antes de que alguien la reciba (ver `docs/CORREOS.md`).
 *
 * Dice qué pasa ahora y qué no hace falta que la persona haga: la oferta no se
 * ve en el catálogo hasta que el equipo la revise, y editarla la devuelve a
 * revisión.
 */
export function correoOfertaEnRevision(d: {
  nombre: string;
  correo: string;
  titulo: string;
}): Mensaje {
  const url = sitio();
  const titulo = escapar(d.titulo);
  const nombre = escapar(d.nombre.split(" ")[0] || d.nombre);

  const cuerpo =
    seccion(
      h1("Tu oferta está en revisión") +
        p(
          `${nombre}, recibimos <strong style="color:${TINTA};">${titulo}</strong>. El equipo la revisa antes de mostrarla en el catálogo y te avisamos apenas esté publicada.`,
        ) +
        p("Mientras tanto no tienes que hacer nada. Si la editas, vuelve a la cola de revisión."),
    ) +
    boton(`${url}/cuenta/empresa/ofertas`, "Ver mis ofertas");

  return {
    para: d.correo,
    asunto: `Recibimos tu oferta «${d.titulo}»`,
    html: envolver({
      titulo: "Tu oferta está en revisión",
      preencabezado: `${d.titulo} · te avisamos cuando esté publicada`,
      cuerpo,
    }),
    texto: [
      "Tu oferta está en revisión",
      "",
      `Recibimos «${d.titulo}». El equipo la revisa antes de mostrarla en el catálogo y te avisamos apenas esté publicada.`,
      "Si la editas, vuelve a la cola de revisión.",
      "",
      `Mis ofertas: ${url}/cuenta/empresa/ofertas`,
      "",
      "— Seregenera",
    ].join("\n"),
  };
}

/**
 * La constancia de que se eliminó una cuenta. Se manda **después** de borrarla:
 * si el borrado fallara, un correo que dice «eliminamos tu cuenta» mentiría.
 * Es también el aviso para quien no la eliminó, si alguien entró con su
 * contraseña: por eso dice a quién escribir.
 */
export function correoCuentaEliminada(d: { nombre: string; correo: string }): Mensaje {
  const nombre = escapar(d.nombre.split(" ")[0] || d.nombre);
  const cuerpo = seccion(
    h1("Eliminamos tu cuenta") +
      p(
        `${nombre}, borramos tu perfil, tu foto, tus dispositivos de confianza, lo que publicaste en la Comunidad y tus reseñas.`,
      ) +
      p(
        "Tus pedidos se conservan sin tu cuenta, con el nombre y el correo con los que compraste, porque la ley contable nos obliga a guardarlos.",
      ) +
      p(
        `Si no fuiste tú, escríbenos ya a <a href="mailto:${CONTACTO.correo}" style="color:${VERDE};">${CONTACTO.correo}</a>.`,
      ),
  );
  return {
    para: d.correo,
    asunto: "Eliminamos tu cuenta de Seregenera",
    html: envolver({ titulo: "Eliminamos tu cuenta", preencabezado: "Tu perfil y lo que publicaste ya no están", cuerpo }),
    texto: [
      "Eliminamos tu cuenta",
      "",
      "Borramos tu perfil, tu foto, tus dispositivos de confianza, lo que publicaste en la Comunidad y tus reseñas.",
      "Tus pedidos se conservan sin tu cuenta, con el nombre y el correo con los que compraste, porque la ley contable nos obliga a guardarlos.",
      "",
      `Si no fuiste tú, escríbenos ya a ${CONTACTO.correo}.`,
      "",
      "— Seregenera",
    ].join("\n"),
  };
}

/** La constancia de que se cerró una empresa, con lo que pasó según tuviera ventas o no. */
export function correoEmpresaCerrada(d: {
  nombre: string;
  correo: string;
  empresa: string;
  resultado: "borrada" | "cerrada";
}): Mensaje {
  const url = sitio();
  const nombre = escapar(d.nombre.split(" ")[0] || d.nombre);
  const empresa = escapar(d.empresa);
  const que =
    d.resultado === "borrada"
      ? "La borramos con sus ofertas y sus fotos: no había vendido nada todavía."
      : "Ya no aparece en el sitio y sus ofertas quedaron retiradas. Guardamos sus ventas, porque la ley contable nos obliga a conservarlas. Queda ligada a su documento tributario: si la das de alta otra vez con el mismo, vuelve como la dejaste.";
  const cuerpo =
    seccion(
      h1(`Cerraste ${empresa}`) +
        p(`${nombre}, ${escapar(que)}`) +
        p("Puedes dar de alta una empresa cuando quieras."),
    ) + boton(`${url}/vender#postular`, "Dar de alta otra empresa");
  return {
    para: d.correo,
    asunto: `Cerraste ${d.empresa} en Seregenera`,
    html: envolver({ titulo: `Cerraste ${d.empresa}`, preencabezado: que, cuerpo }),
    texto: [
      `Cerraste ${d.empresa}`,
      "",
      que,
      "Puedes dar de alta una empresa cuando quieras:",
      `${url}/vender#postular`,
      "",
      "— Seregenera",
    ].join("\n"),
  };
}

/**
 * Un correo de «Contactar proveedores»: una invitación a vender o una noticia,
 * a una empresa que todavía no está en Seregenera.
 *
 * El texto lo escribe el equipo en el panel (con `{empresa}` ya reemplazado);
 * esta plantilla pone lo que no se puede borrar sin querer al editarlo:
 *
 * - en la invitación, el botón para darse de alta, con el token de la empresa
 *   (`/vender?invitacion=…` llega con sus datos ya escritos) y el enlace a la
 *   plantilla de Excel para quien tiene el catálogo en un archivo;
 * - en todos, **de dónde sacamos su correo y cómo darse de baja**, en el pie y
 *   en las cabeceras `List-Unsubscribe` (el botón «Anular suscripción» de Gmail
 *   hace un POST a `/api/baja` sin abrir nada). Sin baja visible un envío en
 *   bloque es spam, para la ley y para los filtros.
 */
export function correoDeCampana(d: {
  tipo: "invitacion" | "noticia";
  para: string;
  empresa: string;
  asunto: string;
  /** Texto plano: los párrafos se separan con una línea en blanco. */
  cuerpo: string;
  token: string;
  responderA: string;
}): Mensaje {
  const url = sitio();
  const baja = `${url}/baja?t=${d.token}`;
  const parrafos = d.cuerpo
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  const html = parrafos.map((b) => p(escapar(b).replace(/\n/g, "<br>"))).join("");
  const alta = `${url}/vender?invitacion=${d.token}`;

  const cuerpo =
    seccion(html) +
    (d.tipo === "invitacion"
      ? boton(alta, "Publicar mis productos") +
        seccion(
          p(
            `¿Tienes muchos productos? <a href="${url}/api/plantilla-ofertas" style="color:${VERDE};">Descarga la plantilla de Excel</a>, llénala y súbela desde tu cuenta, o respóndenos con ella.`,
          ),
        )
      : "") +
    separador() +
    seccion(
      `<p style="margin:14px 0 0 0; font-family:${SANS}; font-size:12px; line-height:1.6; color:${APAGADO};">Te escribimos a ${escapar(d.para)} porque ${escapar(d.empresa)} lo publica como contacto en su sitio web o en un registro público. Si no quieres recibir más correos de Seregenera, <a href="${baja}" style="color:${APAGADO}; text-decoration:underline;">date de baja aquí</a>.</p>`,
    );

  return {
    para: d.para,
    asunto: d.asunto,
    responderA: d.responderA,
    html: envolver({ titulo: d.asunto, preencabezado: parrafos[1] ?? parrafos[0] ?? d.asunto, cuerpo }),
    texto: [
      ...parrafos.flatMap((b) => [b, ""]),
      ...(d.tipo === "invitacion"
        ? [`Publicar mis productos: ${alta}`, `Plantilla de Excel: ${url}/api/plantilla-ofertas`, ""]
        : []),
      "— Seregenera",
      "",
      `Te escribimos a ${d.para} porque ${d.empresa} lo publica como contacto en su sitio web o en un registro público.`,
      `Para no recibir más correos: ${baja}`,
    ].join("\n"),
    cabeceras: {
      "List-Unsubscribe": `<${url}/api/baja?t=${d.token}>, <mailto:${d.responderA}?subject=Baja>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

/**
 * Varias ofertas que entraron a revisión de una vez, desde la planilla.
 *
 * Una sola carta y no una por oferta: treinta correos seguidos con el mismo
 * asunto son ruido, y Gmail empieza a tratarlos como tal.
 */
export function correoOfertasImportadas(d: {
  nombre: string;
  correo: string;
  titulos: string[];
}): Mensaje {
  const url = sitio();
  const nombre = escapar(d.nombre.split(" ")[0] || d.nombre);
  const n = d.titulos.length;
  const visibles = d.titulos.slice(0, 15);
  const resto = n - visibles.length;
  const lista = visibles
    .map((t) => `<li style="margin:4px 0;">${escapar(t)}</li>`)
    .join("");

  const cuerpo =
    seccion(
      h1(n === 1 ? "Tu oferta está en revisión" : `Tus ${n} ofertas están en revisión`) +
        p(
          `${nombre}, recibimos lo que cargaste desde la planilla. El equipo revisa cada oferta antes de mostrarla en el catálogo y te avisamos apenas estén publicadas.`,
        ) +
        `<ul style="margin:14px 0 0 0; padding-left:20px; font-family:${SANS}; font-size:15px; line-height:1.5; color:${TINTA};">${lista}</ul>` +
        (resto > 0 ? p(`Y ${resto} más.`) : ""),
    ) +
    boton(`${url}/cuenta/empresa/ofertas`, "Ver mis ofertas");

  return {
    para: d.correo,
    asunto: n === 1 ? `Recibimos tu oferta «${d.titulos[0]}»` : `Recibimos tus ${n} ofertas`,
    html: envolver({
      titulo: "Tus ofertas están en revisión",
      preencabezado: `${n} ${n === 1 ? "oferta" : "ofertas"} · te avisamos cuando estén publicadas`,
      cuerpo,
    }),
    texto: [
      n === 1 ? "Tu oferta está en revisión" : `Tus ${n} ofertas están en revisión`,
      "",
      "Recibimos lo que cargaste desde la planilla. El equipo revisa cada oferta antes de mostrarla en el catálogo.",
      "",
      ...visibles.map((t) => `- ${t}`),
      ...(resto > 0 ? [`Y ${resto} más.`] : []),
      "",
      `Mis ofertas: ${url}/cuenta/empresa/ofertas`,
      "",
      "— Seregenera",
    ].join("\n"),
  };
}

/**
 * Una oferta aprobada: ya está en el catálogo.
 *
 * **Escrita y sin conectar todavía.** Iría en `cambiarEstadoOferta()` de
 * `src/app/admin/ofertas/actions.ts` cuando el estado nuevo es `approved`, y
 * hace falta resolver antes a quién se le manda: la acción hoy no lee el correo
 * de los miembros de la empresa.
 */
export function correoOfertaPublicada(d: {
  nombre: string;
  correo: string;
  titulo: string;
  slug: string;
}): Mensaje {
  const url = sitio();
  const titulo = escapar(d.titulo);
  const nombre = escapar(d.nombre.split(" ")[0] || d.nombre);
  const enlace = `${url}/oferta/${encodeURIComponent(d.slug)}`;

  const cuerpo =
    seccion(
      h1("Tu oferta ya está publicada") +
        p(
          `${nombre}, <strong style="color:${TINTA};">${titulo}</strong> ya aparece en el catálogo y se puede comprar.`,
        ) +
        p("Compártela con tus clientes: el enlace es tuyo."),
    ) +
    boton(enlace, "Ver mi oferta");

  return {
    para: d.correo,
    asunto: `«${d.titulo}» ya está en Seregenera`,
    html: envolver({
      titulo: "Tu oferta ya está publicada",
      preencabezado: `${d.titulo} ya se puede comprar`,
      cuerpo,
    }),
    texto: [
      "Tu oferta ya está publicada",
      "",
      `«${d.titulo}» ya aparece en el catálogo y se puede comprar.`,
      "",
      `Ver mi oferta: ${enlace}`,
      "",
      "— Seregenera",
    ].join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Pedido: cambio de estado y aviso al proveedor
// ---------------------------------------------------------------------------

/**
 * Los estados de una orden que se le cuentan a quien compró.
 *
 * `pending_payment` no está: es el estado de origen, y volver a él desde
 * «cancelada» es una corrección del equipo, no algo que deba llegarle al comprador.
 */
export type EstadoAvisable = "paid" | "in_progress" | "fulfilled" | "cancelled" | "refunded";

const TEXTO_ESTADO: Record<EstadoAvisable, { asunto: string; titulo: string; frase: string }> = {
  paid: {
    asunto: "Confirmamos el pago de tu pedido",
    titulo: "Recibimos tu pago",
    frase: "Ya confirmamos el pago. Los proveedores pueden empezar a preparar tu pedido.",
  },
  in_progress: {
    asunto: "Tu pedido está en preparación",
    titulo: "Tu pedido está en preparación",
    frase: "Los proveedores ya están preparando lo que pediste.",
  },
  fulfilled: {
    asunto: "Tu pedido fue entregado",
    titulo: "Tu pedido fue entregado",
    frase: "Marcamos tu pedido como entregado. Gracias por comprar a quienes regeneran.",
  },
  cancelled: {
    asunto: "Cancelamos tu pedido",
    titulo: "Tu pedido fue cancelado",
    frase: "Tu pedido quedó cancelado y no se te cobrará nada por él.",
  },
  refunded: {
    asunto: "Devolvimos tu pedido",
    titulo: "Registramos la devolución de tu pedido",
    frase: "Tu pedido quedó marcado como devuelto.",
  },
};

/**
 * Cada vez que el equipo mueve una orden a un estado que le importa al comprador.
 *
 * Hoy el pago se confirma a mano, así que este correo es lo que le dice a quien
 * transfirió que su dinero llegó. Se manda desde `cambiarEstadoOrden()`.
 */
export function correoEstadoPedido(d: {
  nombre: string;
  correo: string;
  referencia: string;
  estado: EstadoAvisable;
}): Mensaje {
  const url = sitio();
  const t = TEXTO_ESTADO[d.estado];
  const nombre = escapar(d.nombre.split(" ")[0] || d.nombre);
  const enlace = `${url}/orden/${encodeURIComponent(d.referencia)}`;

  const cuerpo =
    seccion(
      h1(t.titulo) +
        p(
          `${nombre}, tu pedido <strong style="color:${TINTA};">${escapar(d.referencia)}</strong>: ${escapar(t.frase)}`,
        ),
    ) + boton(enlace, "Ver mi pedido");

  return {
    para: d.correo,
    asunto: `${t.asunto} · ${d.referencia}`,
    html: envolver({ titulo: t.titulo, preencabezado: `Pedido ${d.referencia}`, cuerpo }),
    texto: [
      t.titulo,
      "",
      `Pedido ${d.referencia}: ${t.frase}`,
      "",
      `Ver mi pedido: ${enlace}`,
      "",
      "— Seregenera",
    ].join("\n"),
  };
}

/**
 * Un producto del pedido salió: va en camino, y con qué guía seguirlo.
 *
 * Se manda desde `despachar()` de `/cuenta/empresa/pedidos`, **solo cuando el
 * despacho ocurrió de verdad** (`cambiado: true` de `despachar_item()`): volver
 * a pulsar el botón o corregir la guía no lo repite.
 */
export function correoPedidoDespachado(d: {
  nombre: string;
  correo: string;
  referencia: string;
  titulo: string;
  transportadora?: string;
  guia?: string;
  /** El plazo congelado en el ítem al comprar (`entrega_dias_min/max`). */
  diasMin?: number;
  diasMax?: number;
}): Mensaje {
  const url = sitio();
  const nombre = escapar(d.nombre.split(" ")[0] || d.nombre);
  const enlace = `${url}/orden/${encodeURIComponent(d.referencia)}`;
  const seguimiento = d.guia
    ? `Va por <strong style="color:${TINTA};">${escapar(d.transportadora ?? "transportadora")}</strong> con la guía <strong style="color:${TINTA};">${escapar(d.guia)}</strong>.`
    : "Lo lleva el propio vendedor; te contactará para coordinar la entrega.";
  const plazo = plazoDeEntrega(d.diasMin, d.diasMax);
  const promesa = plazo
    ? `El vendedor se comprometió a entregarlo ${plazo} desde que se confirmó tu pago.`
    : undefined;

  const cuerpo =
    seccion(
      h1("Tu pedido va en camino") +
        p(
          `${nombre}, <strong style="color:${TINTA};">${escapar(d.titulo)}</strong> de tu pedido <strong style="color:${TINTA};">${escapar(d.referencia)}</strong> ya salió.`,
        ) +
        p(seguimiento) +
        (promesa ? p(escapar(promesa)) : "") +
        p("Cuando te llegue, márcalo como recibido desde tu pedido y cuéntanos qué tal te pareció."),
    ) + boton(enlace, "Ver mi pedido");

  return {
    para: d.correo,
    asunto: `Tu pedido ${d.referencia} va en camino`,
    html: envolver({ titulo: "Tu pedido va en camino", preencabezado: `${d.titulo} ya salió`, cuerpo }),
    texto: [
      "Tu pedido va en camino",
      "",
      `«${d.titulo}» de tu pedido ${d.referencia} ya salió.`,
      d.guia
        ? `Transportadora: ${d.transportadora ?? "—"} · Guía: ${d.guia}`
        : "Lo lleva el propio vendedor; te contactará para coordinar la entrega.",
      ...(promesa ? [promesa] : []),
      "",
      `Ver mi pedido: ${enlace}`,
      "",
      "— Seregenera",
    ].join("\n"),
  };
}

/**
 * Le avisa a una empresa que un pedido con sus productos ya está pagado.
 *
 * Se manda al **confirmar el pago**, no al crear el pedido: antes de eso no hay
 * nada que preparar, y avisar de una orden sin pagar invita a despachar algo
 * que puede cancelarse. Lleva solo lo que es de esa empresa y ningún importe: las
 * cifras las calcula la base (invariantes 1 y 2) y el correo no las repite.
 *
 * **Una experiencia lleva su día** (desde el 2026-10-22), en negrita: es lo
 * que la empresa necesita para organizarse, sobre todo cuando el día lo eligió
 * quien reservó (`src/lib/fechas.ts`) y no es una de las fechas que ella abrió.
 */
export function correoPedidoPagadoProveedor(d: {
  nombre: string;
  correo: string;
  empresa: string;
  referencia: string;
  /** `fecha`: el día de una experiencia (AAAA-MM-DD), si lo tiene. */
  lineas: { titulo: string; qty: number; fecha?: string }[];
}): Mensaje {
  const url = sitio();
  const nombre = escapar(d.nombre.split(" ")[0] || d.nombre);
  const lista = d.lineas
    .map(
      (l) =>
        `${l.qty} × ${escapar(l.titulo)}` +
        (l.fecha ? ` · <strong style="color:${TINTA};">para el ${longDate(l.fecha)}</strong>` : ""),
    )
    .join("<br>");
  const hayFechas = d.lineas.some((l) => l.fecha);

  const cuerpo =
    seccion(
      h1("Tienes un pedido pagado") +
        p(
          `${nombre}, el pedido <strong style="color:${TINTA};">${escapar(d.referencia)}</strong> ya está pagado y incluye lo que vende ${escapar(d.empresa)}:`,
        ) +
        p(lista),
    ) + boton(`${url}/cuenta/empresa/pedidos`, hayFechas ? "Ver el pedido" : "Ver qué despachar");

  return {
    para: d.correo,
    asunto: `Pedido pagado ${d.referencia} · ${d.empresa}`,
    html: envolver({
      titulo: "Tienes un pedido pagado",
      preencabezado: `Pedido ${d.referencia} · ${d.empresa}`,
      cuerpo,
    }),
    texto: [
      "Tienes un pedido pagado",
      "",
      `El pedido ${d.referencia} ya está pagado y incluye lo que vende ${d.empresa}:`,
      ...d.lineas.map((l) => `${l.qty} × ${l.titulo}${l.fecha ? ` · para el ${longDate(l.fecha)}` : ""}`),
      "",
      `${hayFechas ? "Ver el pedido" : "Qué despachar"}: ${url}/cuenta/empresa/pedidos`,
      "",
      "— Seregenera",
    ].join("\n"),
  };
}
