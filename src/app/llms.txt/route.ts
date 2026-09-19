import { VERTICALS } from "@/lib/taxonomy";
import { NIVELES, comisionEnPorcentaje } from "@/lib/niveles";

/**
 * `/llms.txt` — qué es este sitio, para un asistente que lo esté leyendo.
 *
 * ## Qué es esto, en serio
 *
 * Una convención joven (llmstxt.org, 2024): un Markdown corto en la raíz del
 * dominio que le dice a un modelo de lenguaje **qué es el sitio y dónde está lo
 * importante**, sin que tenga que deducirlo del HTML. No lo impone ningún
 * estándar y ningún buscador lo exige; es barato de mantener y el costo de
 * equivocarse es cero.
 *
 * La razón para tenerlo aquí es concreta y no es la moda: cuando alguien le
 * pregunta a un asistente «quién vende amenities biodegradables en Colombia»,
 * el asistente lee lo que encuentre. Si lo primero que encuentra es una página
 * de marketing, resume marketing; si encuentra esto, resume lo que de verdad
 * hace la plataforma, con las cifras correctas.
 *
 * ## Por qué se genera y no es un archivo en `public/`
 *
 * Porque las comisiones y las categorías viven en el código
 * (`src/lib/niveles.ts`, `src/lib/taxonomy.ts`) y un archivo suelto se queda
 * viejo en silencio. Aquí no puede: si cambia un número, cambia esto con él.
 * Es la misma regla que hace que `/niveles` no tenga ni una cifra escrita a
 * mano.
 *
 * ## Relación con `robots.txt`
 *
 * Ninguna, y conviene no confundirlas. `robots.txt` dice **quién puede leer**;
 * esto dice **qué hay**. Un robot de entrenamiento bloqueado allí sigue estando
 * bloqueado: este archivo no le abre la puerta a nadie.
 */

export const dynamic = "force-dynamic";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function GET(): Promise<Response> {
  const categorias = VERTICALS.map(
    (v) => `- **${v.label}**: ${v.subcategories.map((s) => s.label).join(", ")}`,
  ).join("\n");

  const niveles = NIVELES.map(
    (n) =>
      `- **${n.label}** (desde ${n.minPuntos.toLocaleString("es-CO")} puntos de experiencia): comisión del ${comisionEnPorcentaje(n.comision)} % sobre cada venta cerrada.`,
  ).join("\n");

  const cuerpo = `# Seregenera

> Marketplace B2B que conecta empresas turísticas de Colombia —hoteles, hostales, glampings, restaurantes, transportadores y agencias— con proveedores de productos, experiencias y servicios regenerativos. Lo opera Dimension Natural SAS.

Seregenera no vende al consumidor final: quien compra es una empresa que necesita abastecerse. Quien vende es un proveedor verificado que puede demostrar su impacto.

## Qué se puede hacer aquí

- Buscar y comparar ofertas por categoría, departamento, nivel del proveedor y certificación: ${siteUrl}/catalogo
- Ver la ficha de un proveedor, con su impacto declarado y su nivel: ${siteUrl}/proveedores
- Dar de alta una empresa proveedora y publicar el mismo día: ${siteUrl}/vender
- Leer y publicar en la Comunidad —prácticas, noticias y experiencias del sector: ${siteUrl}/comunidad

## Categorías

${categorias}

## Cómo funciona el nivel de un proveedor

El nivel se gana con actividad (publicar, vender, entregar, recibir buenas reseñas, aportar en la Comunidad), no con una cuota ni con una revisión previa. El nivel decide la comisión:

${niveles}

Publicar es gratis en cualquier nivel. La comisión se descuenta solo de una venta cerrada y queda anotada ítem por ítem en la orden, con la tasa que se aplicó.

Detalle completo: ${siteUrl}/niveles

## La evaluación de sostenibilidad es otra cosa

El **nivel** mide actividad. El **sello de evaluación verificada** mide cómo opera la empresa: seis dimensiones, 16 preguntas, evidencia documental y revisión humana, con repaso cada doce meses. Una empresa puede tener el nivel más alto sin el sello, y al revés.

Metodología: ${siteUrl}/verificacion

## Lo que este sitio no es

- No es una tienda al consumidor final.
- No es un directorio: los proveedores tienen ficha, catálogo y órdenes reales.
- No certifica a nadie. Reconoce certificaciones de terceros y evalúa prácticas.

## Legal y contacto

- Términos y condiciones: ${siteUrl}/terminos
- Política de privacidad y cookies: ${siteUrl}/privacidad
- Contacto: el del pie de página del sitio.
`;

  return new Response(cuerpo, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // Una hora: cambia cuando cambia el código, no cuando cambia un dato.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
