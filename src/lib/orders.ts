import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";
import { getUser } from "./auth";
import { COMMISSION_RATE } from "./pricing";
import type { Order, OrderItem, OrderStatus } from "./types";

/**
 * Órdenes, en Postgres.
 *
 * Hasta ahora vivían en un `Map` dentro del proceso de Node: se borraban en
 * cada redespliegue y no las veía nadie más que el servidor que las creó. Las
 * firmas no cambian —se reemplazó el cuerpo, como manda la skill
 * `supabase-schema`—, así que `src/app/carrito/actions.ts` y
 * `/orden/[reference]` siguen igual.
 *
 * ## Por qué la escritura usa la clave de servicio
 *
 * Es la decisión incómoda de este archivo, así que conviene la razón entera.
 *
 * El pago de Seregenera es manual: se crea la orden y un administrador confirma
 * la transferencia. **Y se puede comprar sin cuenta** — el formulario del
 * carrito pide nombre, correo y teléfono, no sesión. Para que un comprador
 * anónimo pudiera insertar su orden por RLS, la política tendría que permitir
 * `insert` a cualquiera; y entonces cualquiera podría escribir directo contra
 * PostgREST una orden con el total que se le antoje. El total no es un dato del
 * comprador: lo calcula el servidor contra el catálogo (invariante 1), y RLS no
 * sabe expresar «los totales los calculó mi código».
 *
 * Así que la orden la escribe el servidor con la clave de servicio, y **no hay
 * ninguna política de inserción**: nadie puede crear órdenes desde fuera de la
 * aplicación. Es el mismo argumento por el que `admin.ts` lista «confirmar
 * pagos» entre sus tres usos legítimos.
 *
 * ## Y por qué la lectura del panel NO la usa
 *
 * `listOrders()` va con el cliente de sesión: ahí sí hay un usuario, y la
 * política `orders_admin` es la que decide si ve todo o nada. Usar la clave de
 * servicio para leer convertiría cualquier fallo de ruta en acceso a las
 * órdenes de todo el mundo.
 *
 * Desde la 0012 la escritura normal tampoco la usa: va por `crear_orden()`,
 * que calcula los totales dentro de la base. `saveOrder()` queda como respaldo
 * mientras la migración no esté aplicada.
 */

/** Lo que se guarda en `orders`, tal cual las columnas de la tabla. */
interface FilaOrden {
  id: string;
  reference: string;
  buyer_id: string | null;
  buyer_email: string;
  buyer_name: string;
  buyer_company: string | null;
  buyer_phone: string | null;
  /** Llega `undefined` mientras no esté aplicada la 0012. */
  buyer_provider_id?: string | null;
  buyer_tax_id?: string | null;
  subtotal_cop: number;
  commission_total_cop: number;
  total_cop: number;
  status: OrderStatus;
  notes: string | null;
  co2_kg_saved: number | string | null;
  water_liters_saved: number | string | null;
  waste_kg_reduced: number | string | null;
  created_at: string;
}

interface FilaItem {
  listing_id: string | null;
  provider_id: string;
  title_snapshot: string;
  unit_price_cop: number;
  qty: number;
  date: string | null;
  commission_cop: number;
  /** Puede llegar null en las órdenes anteriores a los niveles de proveedor. */
  commission_rate: number | string | null;
}

function numero(v: number | string | null): number | undefined {
  if (v === null) return undefined;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : undefined;
}

function aOrden(fila: FilaOrden, items: FilaItem[]): Order {
  return {
    id: fila.id,
    reference: fila.reference,
    buyerEmail: fila.buyer_email,
    buyerName: fila.buyer_name,
    buyerCompany: fila.buyer_company ?? undefined,
    buyerPhone: fila.buyer_phone ?? undefined,
    buyerProviderId: fila.buyer_provider_id ?? undefined,
    buyerTaxId: fila.buyer_tax_id ?? undefined,
    items: items.map<OrderItem>((i) => ({
      listingId: i.listing_id ?? "",
      providerId: i.provider_id,
      titleSnapshot: i.title_snapshot,
      unitPriceCop: i.unit_price_cop,
      qty: i.qty,
      date: i.date ?? undefined,
      commissionCop: i.commission_cop,
      // Las órdenes creadas antes de que la comisión dependiera del nivel no
      // guardaron la tasa. Se les atribuye la base, que es la que se les aplicó.
      commissionRate: numero(i.commission_rate) ?? COMMISSION_RATE,
    })),
    subtotalCop: fila.subtotal_cop,
    commissionTotalCop: fila.commission_total_cop,
    totalCop: fila.total_cop,
    status: fila.status,
    impact: {
      co2KgSaved: numero(fila.co2_kg_saved),
      waterLitersSaved: numero(fila.water_liters_saved),
      wasteKgReduced: numero(fila.waste_kg_reduced),
    },
    notes: fila.notes ?? undefined,
    createdAt: fila.created_at,
  };
}

/** Una línea tal como la manda el carrito: identificador, cantidad y fecha. */
export interface LineaPedida {
  listingId: string;
  qty: number;
  date?: string;
}

/** Por qué `crear_orden()` no creó nada. Son los `raise exception` de la 0012. */
export type MotivoRechazo =
  | "sin-sesion"
  | "sin-cupo"
  | "sin-stock"
  | "falta-fecha"
  | "nada-comprable"
  | "empresa-ajena"
  | "clave-ajena"
  | "contacto-incompleto"
  | "cesta-invalida"
  | "cantidad-invalida"
  | "demasiados-pedidos"
  | "demasiados-pendientes";

const MOTIVOS: readonly MotivoRechazo[] = [
  "sin-sesion",
  "sin-cupo",
  "sin-stock",
  "falta-fecha",
  "nada-comprable",
  "empresa-ajena",
  "clave-ajena",
  "contacto-incompleto",
  "cesta-invalida",
  "cantidad-invalida",
  "demasiados-pedidos",
  "demasiados-pendientes",
];

export type ResultadoCrearOrden =
  | { ok: true; reference: string; repetida: boolean; totalCop?: number }
  /** La base dijo que no, por una razón que se le puede explicar a la persona. */
  | { ok: false; motivo: MotivoRechazo; oferta?: string }
  /** Falta la migración 0012: quien llama tiene que usar `saveOrder()`. */
  | { ok: false; motivo: "sin-funcion" };

/**
 * Crea la orden entera en Postgres, en una transacción: orden, ítems, cupo.
 *
 * **Con el cliente de sesión, no con la clave de servicio.** Los precios los
 * calcula `crear_orden()` contra el catálogo (ver la sección 5 de la 0012), así
 * que ya no hace falta saltarse RLS para que nadie ponga su propio total: la
 * función solo recibe identificadores y cantidades, igual que `priceCart()`.
 *
 * `id` es la llave de idempotencia. Lo genera el navegador una vez por cesta; si
 * la misma cesta se confirma dos veces —doble clic, un reintento tras un corte—
 * vuelve la misma orden con `repetida: true` en vez de una segunda.
 *
 * Lanza solo ante lo inesperado (red, un error de Postgres que no es de los
 * nuestros). Lo esperado —sin cupo, sin sesión— vuelve como `ok: false` con su
 * motivo, para que la pantalla lo diga en español.
 */
export async function crearOrden(datos: {
  id: string;
  lineas: LineaPedida[];
  nombre: string;
  telefono: string;
  empresa?: string;
  providerId?: string;
  documento?: string;
  notas?: string;
}): Promise<ResultadoCrearOrden> {
  const db = await createClient();
  const { data, error } = await db.rpc("crear_orden", {
    _id: datos.id,
    _lineas: datos.lineas.map((l) => ({
      listing_id: l.listingId,
      qty: l.qty,
      date: l.date ?? null,
    })),
    _nombre: datos.nombre,
    _telefono: datos.telefono,
    _empresa: datos.empresa ?? null,
    _provider_id: datos.providerId ?? null,
    _notas: datos.notas ?? null,
    _documento: datos.documento ?? null,
  });

  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      return { ok: false, motivo: "sin-funcion" };
    }
    const motivo = MOTIVOS.find((m) => error.message.includes(m));
    if (motivo) return { ok: false, motivo, oferta: error.hint || undefined };
    throw new Error(`crearOrden: ${error.code ?? ""} ${error.message}`);
  }

  const r = data as { reference: string; repetida: boolean; total_cop?: number };
  return { ok: true, reference: r.reference, repetida: r.repetida, totalCop: r.total_cop };
}

/**
 * El camino de antes de la 0012: la orden la escribe el servidor con la clave
 * de servicio. **Solo se usa si `crear_orden()` todavía no existe en la base**,
 * para que desplegar el código antes de aplicar la migración no deje el sitio
 * sin poder vender.
 *
 * Ahora es al menos idempotente y no deja huérfanas:
 *
 * - Si ya existe una orden con ese `id`, no se crea otra (el `id` es la llave
 *   que manda el navegador; ver `crearOrden()`).
 * - Si fallan los ítems, se borra la orden recién creada. No es una
 *   transacción —eso solo lo da la función de Postgres—, pero deja de quedar
 *   una orden sin líneas en el panel.
 *
 * **No descuenta cupo.** Esa es la razón de fondo para aplicar la 0012.
 */
export async function saveOrder(
  order: Order,
): Promise<{ reference: string; repetida: boolean }> {
  const usuario = await getUser();
  const db = createAdminClient();

  const { data: previa } = await db
    .from("orders")
    .select("reference")
    .eq("id", order.id)
    .maybeSingle();
  if (previa) return { reference: previa.reference as string, repetida: true };

  const { error } = await db.from("orders").insert({
    id: order.id,
    reference: order.reference,
    buyer_id: usuario?.id ?? null,
    buyer_email: order.buyerEmail,
    buyer_name: order.buyerName,
    buyer_company: order.buyerCompany ?? null,
    buyer_phone: order.buyerPhone ?? null,
    subtotal_cop: order.subtotalCop,
    commission_total_cop: order.commissionTotalCop,
    total_cop: order.totalCop,
    status: order.status,
    notes: order.notes ?? null,
    co2_kg_saved: order.impact.co2KgSaved ?? null,
    water_liters_saved: order.impact.waterLitersSaved ?? null,
    waste_kg_reduced: order.impact.wasteKgReduced ?? null,
  });
  if (error) throw new Error(`saveOrder: ${error.code ?? ""} ${error.message}`);

  if (order.items.length > 0) {
    const { error: errorItems } = await db.from("order_items").insert(
      order.items.map((i) => ({
        order_id: order.id,
        listing_id: i.listingId || null,
        provider_id: i.providerId,
        title_snapshot: i.titleSnapshot,
        unit_price_cop: i.unitPriceCop,
        qty: i.qty,
        date: i.date ?? null,
        commission_cop: i.commissionCop,
        commission_rate: i.commissionRate,
      })),
    );
    if (errorItems) {
      await db.from("orders").delete().eq("id", order.id);
      throw new Error(`saveOrder (items): ${errorItems.code ?? ""} ${errorItems.message}`);
    }
  }
  return { reference: order.reference, repetida: false };
}

/**
 * Una orden por su referencia, **si quien mira tiene derecho a verla**.
 *
 * Con el cliente de sesión desde que comprar exige cuenta. Antes usaba la clave
 * de servicio porque un invitado no tenía `auth.uid()` con el que pasar
 * `orders_buyer_read`, y eso convertía la referencia —cuatro caracteres
 * aleatorios sobre una fecha— en la única llave de los datos personales del
 * comprador. Ahora la llave es la sesión: el comprador ve la suya, el proveedor
 * las que traen ítems suyos, un administrador todas, y cualquier otro recibe
 * `undefined` y un 404, que es como niega RLS.
 */
export async function getOrderByReference(
  reference: string,
): Promise<Order | undefined> {
  const db = await createClient();

  const { data, error } = await db
    .from("orders")
    .select("*")
    .eq("reference", reference)
    .maybeSingle();
  if (error) throw new Error(`getOrderByReference: ${error.message}`);
  if (!data) return undefined;

  const { data: items, error: errorItems } = await db
    .from("order_items")
    .select("listing_id, provider_id, title_snapshot, unit_price_cop, qty, date, commission_cop, commission_rate")
    .eq("order_id", data.id);
  if (errorItems) throw new Error(`getOrderByReference (items): ${errorItems.message}`);

  return aOrden(data as FilaOrden, (items ?? []) as FilaItem[]);
}

/**
 * Los pedidos que hizo una persona, lo más reciente primero. Para `/cuenta`.
 *
 * El `eq("buyer_id")` no es la barrera —lo es `orders_buyer_read`—, es lo que
 * separa «lo que compré» de «lo que puedo ver»: a un proveedor o a un
 * administrador RLS le deja ver órdenes que no son suyas, y en su cuenta
 * personal no pintan nada.
 */
export async function getPedidosDe(userId: string, limite = 20): Promise<Order[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("orders")
    .select(
      "*, order_items(listing_id, provider_id, title_snapshot, unit_price_cop, qty, date, commission_cop, commission_rate)",
    )
    .eq("buyer_id", userId)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`getPedidosDe: ${error.message}`);

  return (data as (FilaOrden & { order_items: FilaItem[] | null })[]).map((f) =>
    aOrden(f, f.order_items ?? []),
  );
}

/**
 * Todas las órdenes que quien mira tenga derecho a ver.
 *
 * Con el cliente de sesión: a un administrador le devuelve todas
 * (`orders_admin`), a un proveedor solo las que incluyen ítems suyos
 * (`orders_provider_read`) y a un comprador las suyas. **La misma consulta
 * devuelve conjuntos distintos según quién la haga**, que es exactamente lo que
 * RLS existe para conseguir: aquí no hay un `where` escrito a mano en el que
 * confiar.
 */
export async function listOrders(): Promise<Order[]> {
  const db = await createClient();

  const { data, error } = await db
    .from("orders")
    .select(
      "*, order_items(listing_id, provider_id, title_snapshot, unit_price_cop, qty, date, commission_cop, commission_rate)",
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listOrders: ${error.message}`);

  return (data as (FilaOrden & { order_items: FilaItem[] | null })[]).map((f) =>
    aOrden(f, f.order_items ?? []),
  );
}
