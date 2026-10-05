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
  lineas: { titulo: string; qty: number }[];
}): Mensaje {
  const url = sitio();
  const pesos = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(d.totalCop);

  const lista = d.lineas
    .map((l) => `${l.qty} × ${escapar(l.titulo)}`)
    .join("<br>");

  const cuerpo =
    seccion(
      h1("Recibimos tu pedido") +
        p(
          `Gracias, ${escapar(d.nombre.split(" ")[0] || d.nombre)}. Tu pedido quedó registrado con la referencia <strong style="color:${TINTA};">${escapar(d.referencia)}</strong> por <strong style="color:${TINTA};">${pesos}</strong>.`,
        ) +
        p(lista),
    ) +
    boton(`${url}/orden/${encodeURIComponent(d.referencia)}`, "Ver mi pedido y cómo pagar") +
    separador() +
    seccion(
      p(
        "El pago se coordina por transferencia. Usa la referencia en la descripción y te confirmamos el mismo día hábil.",
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
      ...d.lineas.map((l) => `${l.qty} × ${l.titulo}`),
      "",
      `Ver el pedido y cómo pagar: ${url}/orden/${d.referencia}`,
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
 * Le avisa a una empresa que un pedido con sus productos ya está pagado.
 *
 * Se manda al **confirmar el pago**, no al crear el pedido: antes de eso no hay
 * nada que preparar, y avisar de una orden sin pagar invita a despachar algo
 * que puede cancelarse. Lleva solo lo que es de esa empresa y ningún importe: las
 * cifras las calcula la base (invariantes 1 y 2) y el correo no las repite.
 */
export function correoPedidoPagadoProveedor(d: {
  nombre: string;
  correo: string;
  empresa: string;
  referencia: string;
  lineas: { titulo: string; qty: number }[];
}): Mensaje {
  const url = sitio();
  const nombre = escapar(d.nombre.split(" ")[0] || d.nombre);
  const lista = d.lineas.map((l) => `${l.qty} × ${escapar(l.titulo)}`).join("<br>");

  const cuerpo =
    seccion(
      h1("Tienes un pedido pagado") +
        p(
          `${nombre}, el pedido <strong style="color:${TINTA};">${escapar(d.referencia)}</strong> ya está pagado y incluye productos de ${escapar(d.empresa)}:`,
        ) +
        p(lista),
    ) + boton(`${url}/cuenta/empresa`, "Ir a mi empresa");

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
      `El pedido ${d.referencia} ya está pagado y incluye productos de ${d.empresa}:`,
      ...d.lineas.map((l) => `${l.qty} × ${l.titulo}`),
      "",
      `Tu empresa: ${url}/cuenta/empresa`,
      "",
      "— Seregenera",
    ].join("\n"),
  };
}
