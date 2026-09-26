"use server";

import { z } from "zod";
import { getUser } from "@/lib/auth";
import { enviarCorreo } from "@/lib/correo";
import { correoPedidoRecibido } from "@/lib/correo/plantillas";
import { mensajeDeFallo, registrarFallo } from "@/lib/incidencias";
import { generateReference } from "@/lib/payments";
import { crearOrden, saveOrder, type MotivoRechazo } from "@/lib/orders";
import { priceLine, totalsFor, type PricedLine } from "@/lib/pricing";
import { getListingsByIds, getProviderTiers } from "@/lib/repo";
import type { Order, OrderItem } from "@/lib/types";
import { dentroDelRitmo } from "@/lib/ritmo";
import type { CartLine, PricedCartDTO } from "./types";

/**
 * Valoriza un carrito contra el catálogo del servidor.
 *
 * La comparten `priceCart()` —lo que se pinta— y `checkout()` —lo que se
 * compara con lo que cobró la base—, para que las dos sumas salgan del mismo
 * sitio.
 */
async function valorizar(lines: CartLine[]) {
  const listings = await getListingsByIds(lines.map((l) => l.listingId));
  const byId = new Map(listings.map((l) => [l.id, l]));

  // La comisión depende del nivel del proveedor (src/lib/niveles.ts), así que
  // hace falta saber de qué nivel es cada uno antes de valorizar. Un proveedor
  // que no aparezca en el mapa paga la tasa base, que es la más alta.
  const niveles = await getProviderTiers(listings.map((l) => l.providerId));

  const priced = lines
    .map((line) => {
      const listing = byId.get(line.listingId);
      // Una oferta retirada del catálogo simplemente desaparece del carrito.
      return listing
        ? priceLine(line, listing, niveles.get(listing.providerId))
        : null;
    })
    .filter((l): l is PricedLine => l !== null);

  return { byId, priced, totals: totalsFor(priced) };
}

/**
 * Resuelve el carrito contra el catálogo del servidor.
 *
 * El cliente solo manda identificadores y cantidades; los precios se calculan
 * aquí. Así un carrito guardado hace un mes no puede comprar al precio de hace
 * un mes.
 */
export async function priceCart(lines: CartLine[]): Promise<PricedCartDTO> {
  const { byId, priced, totals } = await valorizar(lines);

  return {
    lines: priced.map((l) => ({
      listingId: l.listing.id,
      slug: l.listing.slug,
      title: l.listing.title,
      category: l.listing.category,
      kind: l.listing.kind,
      unit: l.listing.unit,
      images: l.listing.images,
      providerId: l.listing.providerId,
      quoteOnly: l.listing.quoteOnly,
      qty: l.line.qty,
      date: l.line.date,
      unitPriceCop: l.unitPriceCop,
      wholesaleApplied: l.wholesaleApplied,
      subtotalCop: l.subtotalCop,
    })),
    subtotalCop: totals.subtotalCop,
    totalCop: totals.totalCop,
    commissionTotalCop: totals.commissionTotalCop,
    impact: totals.impact,
    providerCount: totals.providerCount,
    dropped: lines
      .filter((l) => !byId.has(l.listingId))
      .map((l) => ({ listingId: l.listingId, date: l.date })),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lo que llega del formulario. El correo **no** viene de aquí: es el de la
 * cuenta. Antes se escribía a mano, y un correo mal escrito dejaba al comprador
 * sin su respaldo y sin forma de encontrar su orden.
 */
const CheckoutSchema = z
  .object({
    /** La llave de idempotencia: el `id` que tendrá la orden. Ver `cesta.tsx`. */
    clave: z.uuid("Recarga la página y vuelve a intentarlo"),
    como: z.enum(["persona", "empresa"]).default("persona"),
    name: z.string().trim().min(3, "Escribe tu nombre completo").max(160),
    phone: z.string().trim().min(7, "Escribe un teléfono de contacto").max(40),
    providerId: z.string().trim().optional(),
    company: z.string().trim().max(160).optional(),
    documento: z.string().trim().max(40, "La identificación es demasiado larga").optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .refine(
    (d) =>
      d.como !== "empresa" ||
      (typeof d.providerId === "string" && UUID.test(d.providerId)) ||
      (typeof d.company === "string" && d.company.length >= 2),
    { path: ["company"], message: "Escribe la razón social de la empresa" },
  );

export type CheckoutResult =
  | { ok: true; reference: string }
  | { ok: false; errors: Record<string, string> };

/**
 * Lo que se le dice a la persona cuando la base no crea la orden. Son los
 * `raise exception` de `crear_orden()` (migración 0012) en español.
 */
function explicar(motivo: MotivoRechazo, oferta?: string): Record<string, string> {
  const cual = oferta ? `«${oferta}»` : "una de tus ofertas";
  switch (motivo) {
    case "sin-sesion":
      return { form: "Tu sesión se cerró. Entra otra vez para confirmar el pedido." };
    case "sin-cupo":
      return { form: `Ya no queda cupo para ${cual} en esa fecha. Elige otra fecha en su ficha.` };
    case "sin-stock":
      return { form: `No quedan unidades suficientes de ${cual}. Baja la cantidad o escríbenos.` };
    case "falta-fecha":
      return { form: `Elige una fecha para ${cual} antes de confirmar.` };
    case "nada-comprable":
      return { form: "No hay nada comprable en la cesta." };
    case "empresa-ajena":
      return { providerId: "Solo puedes comprar a nombre de una empresa que gestionas." };
    case "contacto-incompleto":
      return { name: "Revisa tu nombre y tu teléfono." };
    case "demasiados-pedidos":
      return {
        form: "Recibimos varios pedidos seguidos desde tu cuenta. Espera unos minutos y vuelve a intentarlo.",
      };
    case "demasiados-pendientes":
      return {
        form: "Tienes varios pedidos esperando pago. Págalos o escríbenos para cancelar alguno antes de hacer otro.",
      };
    case "clave-ajena":
    case "cesta-invalida":
    case "cantidad-invalida":
      return { form: "No pudimos leer tu cesta. Recarga la página y vuelve a intentarlo." };
  }
}

/**
 * Cierra la compra.
 *
 * ## Qué cambió el 2026-09-26
 *
 * - **Exige cuenta.** Antes se compraba sin registrarse, y eso dejaba la orden
 *   atada a un correo escrito a mano. Ahora se compra a nombre propio o de una
 *   empresa, pero siempre desde una cuenta: es lo que permite que la orden
 *   aparezca en «Tus pedidos» y que solo la vea quien la hizo.
 * - **La orden la escribe `crear_orden()`**, en una transacción que además
 *   descuenta el cupo de las experiencias (invariante 10) y es idempotente. Ver
 *   la sección 5 de la migración 0012.
 * - **Un fallo inesperado deja un código.** Antes lanzaba, y la persona veía la
 *   pantalla de error con el `digest` de Next y nada más; así llegó el reporte
 *   del error `3014714994`, que no aparecía en ningún registro que se pudiera
 *   leer desde el repositorio. Ahora se apunta con `registrarFallo()` y la
 *   persona ve un código que se busca en los registros con `[checkout]`.
 */
export async function checkout(
  lines: CartLine[],
  form: unknown,
): Promise<CheckoutResult> {
  try {
    return await cerrarCompra(lines, form);
  } catch (e) {
    const codigo = registrarFallo("checkout", e, { lineas: lines.length });
    return { ok: false, errors: { form: mensajeDeFallo(codigo) } };
  }
}

async function cerrarCompra(lines: CartLine[], form: unknown): Promise<CheckoutResult> {
  const parsed = CheckoutSchema.safeParse(form);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      errors[key] ??= issue.message;
    }
    return { ok: false, errors };
  }
  const d = parsed.data;

  const usuario = await getUser();
  if (!usuario) return { ok: false, errors: explicar("sin-sesion") };

  // Por cuenta y no por IP: ahora que comprar exige sesión, la cuenta es la
  // identidad que de verdad importa. Cinco pedidos en diez minutos es más de lo
  // que hace nadie comprando de verdad, y mucho menos de lo que hace un guion.
  if (!dentroDelRitmo(`checkout:${usuario.id}`, 5, 600)) {
    return {
      ok: false,
      errors: {
        form: "Recibimos varios pedidos seguidos desde tu cuenta. Espera unos minutos y vuelve a intentarlo.",
      },
    };
  }

  const { priced, totals } = await valorizar(lines);
  if (totals.purchasable.length === 0) {
    return { ok: false, errors: explicar("nada-comprable") };
  }

  const comoEmpresa = d.como === "empresa";
  const providerId =
    comoEmpresa && d.providerId && UUID.test(d.providerId) ? d.providerId : undefined;
  const empresa = comoEmpresa && !providerId ? d.company || undefined : undefined;
  const documento = comoEmpresa ? d.documento || undefined : undefined;

  const creada = await crearOrden({
    id: d.clave,
    lineas: lines,
    nombre: d.name,
    telefono: d.phone,
    empresa,
    providerId,
    documento,
    notas: d.notes || undefined,
  });

  let reference: string;
  let repetida: boolean;

  if (creada.ok) {
    reference = creada.reference;
    repetida = creada.repetida;
    // Dos cálculos del mismo total, en dos lenguajes: el de `pricing.ts` para
    // pintar y el de la base para cobrar. Si alguna vez divergen, lo que la
    // persona vio en la cesta no es lo que se le cobra, y eso tiene que quedar
    // escrito aunque no sea un error para ella.
    if (!repetida && creada.totalCop !== undefined && creada.totalCop !== totals.totalCop) {
      console.error(
        `[checkout] total distinto: cesta=${totals.totalCop} base=${creada.totalCop} ref=${reference}`,
      );
    }
  } else if (creada.motivo === "sin-funcion") {
    // La 0012 todavía no está aplicada. Se sigue vendiendo por el camino
    // anterior en vez de dejar el sitio sin poder cerrar una compra.
    console.warn("[checkout] crear_orden() no existe: usando saveOrder()");
    const guardada = await saveOrder(armarOrden(d.clave, usuario.email ?? "", d, priced, {
      empresa: providerId ? undefined : empresa,
    }));
    reference = guardada.reference;
    repetida = guardada.repetida;
  } else {
    return { ok: false, errors: explicar(creada.motivo, creada.oferta) };
  }

  console.info(`[checkout] orden ${reference} repetida=${repetida}`);

  // El respaldo por correo, fuera del camino crítico: la orden ya existe, y un
  // SMTP caído no puede hacer que la persona crea que no se guardó y vuelva a
  // comprar. Una orden repetida no lo manda otra vez.
  if (!repetida && usuario.email) {
    try {
      const envio = await enviarCorreo(
        correoPedidoRecibido({
          nombre: d.name,
          correo: usuario.email,
          referencia: reference,
          totalCop: creada.ok && creada.totalCop !== undefined ? creada.totalCop : totals.totalCop,
          lineas: totals.purchasable.map((l) => ({ titulo: l.listing.title, qty: l.line.qty })),
        }),
      );
      if (!envio.ok) console.error(`[checkout] respaldo no enviado (${envio.via}): ${envio.error}`);
    } catch (e) {
      registrarFallo("checkout-correo", e);
    }
  }

  return { ok: true, reference };
}

/** La orden del camino anterior, armada en TypeScript. Solo para `saveOrder()`. */
function armarOrden(
  id: string,
  correo: string,
  d: z.infer<typeof CheckoutSchema>,
  priced: PricedLine[],
  extra: { empresa?: string },
): Order {
  const totals = totalsFor(priced);
  const items: OrderItem[] = totals.purchasable.map((l) => ({
    listingId: l.listing.id,
    providerId: l.listing.providerId,
    titleSnapshot: l.listing.title,
    unitPriceCop: l.unitPriceCop,
    qty: l.line.qty,
    date: l.line.date,
    commissionCop: l.commissionCop,
    commissionRate: l.commissionRate,
  }));

  return {
    id,
    reference: generateReference(),
    buyerName: d.name,
    buyerEmail: correo,
    buyerPhone: d.phone,
    buyerCompany: extra.empresa,
    items,
    subtotalCop: totals.subtotalCop,
    commissionTotalCop: totals.commissionTotalCop,
    totalCop: totals.totalCop,
    status: "pending_payment",
    impact: totals.impact,
    notes: d.notes || undefined,
    createdAt: new Date().toISOString(),
  };
}
