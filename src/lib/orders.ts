import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";
import { getUser } from "./auth";
import { COMMISSION_RATE } from "./pricing";
import { logisticaDisponible } from "./repo";
import type {
  DestinoEnvio,
  Despacho,
  EnvioEstado,
  Order,
  OrderItem,
  OrderStatus,
} from "./types";

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
  /** Desde la 0014: llegan `undefined` mientras no esté aplicada. */
  envio_total_cop?: number | null;
  envio_departamento?: string | null;
  envio_ciudad?: string | null;
  envio_direccion?: string | null;
  envio_indicaciones?: string | null;
}

interface FilaItem {
  id?: string;
  listing_id: string | null;
  provider_id: string;
  title_snapshot: string;
  unit_price_cop: number;
  qty: number;
  date: string | null;
  commission_cop: number;
  /** Puede llegar null en las órdenes anteriores a los niveles de proveedor. */
  commission_rate: number | string | null;
  /** Desde la 0014. */
  envio_cop?: number | null;
  despacho?: Despacho | null;
  transportadora?: string | null;
  entrega_dias_min?: number | null;
  entrega_dias_max?: number | null;
  envio_estado?: EnvioEstado | null;
  guia?: string | null;
  despachado_at?: string | null;
  entregado_at?: string | null;
}

const COLUMNAS_ITEM_BASE =
  "listing_id, provider_id, title_snapshot, unit_price_cop, qty, date, commission_cop, commission_rate";
const COLUMNAS_ITEM_0014 =
  "id, envio_cop, despacho, transportadora, entrega_dias_min, entrega_dias_max, envio_estado, guia, despachado_at, entregado_at";

/** Las columnas de `order_items` que existen, según si la 0014 está aplicada. */
async function columnasItem(): Promise<string> {
  return (await logisticaDisponible())
    ? `${COLUMNAS_ITEM_BASE}, ${COLUMNAS_ITEM_0014}`
    : COLUMNAS_ITEM_BASE;
}

function numero(v: number | string | null): number | undefined {
  if (v === null) return undefined;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : undefined;
}

function aItem(i: FilaItem): OrderItem {
  return {
    id: i.id,
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
    envioCop: i.envio_cop ?? undefined,
    despacho: i.despacho ?? undefined,
    transportadora: i.transportadora ?? undefined,
    entregaDiasMin: i.entrega_dias_min ?? undefined,
    entregaDiasMax: i.entrega_dias_max ?? undefined,
    envioEstado: i.envio_estado ?? undefined,
    guia: i.guia ?? undefined,
    despachadoAt: i.despachado_at ?? undefined,
    entregadoAt: i.entregado_at ?? undefined,
  };
}

function aDestino(f: {
  envio_departamento?: string | null;
  envio_ciudad?: string | null;
  envio_direccion?: string | null;
  envio_indicaciones?: string | null;
}): DestinoEnvio | undefined {
  return f.envio_direccion && f.envio_ciudad && f.envio_departamento
    ? {
        departamento: f.envio_departamento,
        ciudad: f.envio_ciudad,
        direccion: f.envio_direccion,
        indicaciones: f.envio_indicaciones ?? undefined,
      }
    : undefined;
}

function aOrden(fila: FilaOrden, items: FilaItem[]): Order {
  return {
    id: fila.id,
    reference: fila.reference,
    buyerId: fila.buyer_id ?? undefined,
    buyerEmail: fila.buyer_email,
    buyerName: fila.buyer_name,
    buyerCompany: fila.buyer_company ?? undefined,
    buyerPhone: fila.buyer_phone ?? undefined,
    buyerProviderId: fila.buyer_provider_id ?? undefined,
    buyerTaxId: fila.buyer_tax_id ?? undefined,
    items: items.map(aItem),
    subtotalCop: fila.subtotal_cop,
    commissionTotalCop: fila.commission_total_cop,
    envioTotalCop: fila.envio_total_cop ?? 0,
    totalCop: fila.total_cop,
    status: fila.status,
    destino: aDestino(fila),
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
  | "demasiados-pendientes"
  /** Desde la 0014: hay productos físicos y falta a dónde mandarlos. */
  | "falta-destino";

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
  "falta-destino",
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
  /** Desde la 0014. Obligatorio si hay productos físicos: la base lo exige. */
  destino?: DestinoEnvio;
}): Promise<ResultadoCrearOrden> {
  const db = await createClient();
  const comunes = {
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
  };

  // Con la 0014 la función recibe también el destino. Sin ella, esos cuatro
  // parámetros no existen y PostgREST no encuentra la firma: se vuelve a llamar
  // con la de la 0012, que no cobra envío ni pide destino — igual que antes.
  let { data, error } = await db.rpc("crear_orden", {
    ...comunes,
    _departamento: datos.destino?.departamento ?? null,
    _ciudad: datos.destino?.ciudad ?? null,
    _direccion: datos.destino?.direccion ?? null,
    _indicaciones: datos.destino?.indicaciones ?? null,
  });
  if (error && (error.code === "PGRST202" || error.code === "42883")) {
    ({ data, error } = await db.rpc("crear_orden", comunes));
  }

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
    .select(await columnasItem())
    .eq("order_id", data.id);
  if (errorItems) throw new Error(`getOrderByReference (items): ${errorItems.message}`);

  return aOrden(data as FilaOrden, (items ?? []) as unknown as FilaItem[]);
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
    .select(`*, order_items(${await columnasItem()})`)
    .eq("buyer_id", userId)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`getPedidosDe: ${error.message}`);

  return (data as unknown as (FilaOrden & { order_items: FilaItem[] | null })[]).map((f) =>
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
    .select(`*, order_items(${await columnasItem()})`)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listOrders: ${error.message}`);

  return (data as unknown as (FilaOrden & { order_items: FilaItem[] | null })[]).map((f) =>
    aOrden(f, f.order_items ?? []),
  );
}

// ---------------------------------------------------------------------------
// Despachar, entregar y reseñar (migración 0014)
//
// Las tres decisiones viven en funciones de la base que toman candado sobre la
// orden: ahí es donde se resuelve que dos personas no despachen el mismo ítem,
// que el último ítem entregado cierre el pedido aunque dos lleguen a la vez, y
// que una reseña repetida no se duplique. Aquí solo se traduce lo que dicen.
//
// **`cambiado` es lo que decide si se avisa por correo.** Repetir una operación
// devuelve `cambiado: false`, y quien llama no vuelve a mandar nada: es la
// mitad de la idempotencia que la base no puede hacer por nosotros.
// ---------------------------------------------------------------------------

/** Por qué la base no despachó, no entregó o no guardó la reseña. */
export type MotivoEnvio =
  | "sin-sesion"
  | "item-ajeno"
  | "sin-envio"
  | "orden-no-despachable"
  | "falta-guia"
  | "calificacion-invalida"
  | "oferta-retirada"
  | "todavia-no";

const MOTIVOS_ENVIO: readonly MotivoEnvio[] = [
  "sin-sesion",
  "item-ajeno",
  "sin-envio",
  "orden-no-despachable",
  "falta-guia",
  "calificacion-invalida",
  "oferta-retirada",
  "todavia-no",
];

export type ResultadoEnvio =
  | { ok: true; cambiado: boolean; ordenId: string; ordenCompletada: boolean }
  | { ok: false; motivo: MotivoEnvio };

function motivoEnvio(nombre: string, error: { code?: string; message: string }): MotivoEnvio {
  const motivo = MOTIVOS_ENVIO.find((m) => error.message.includes(m));
  if (motivo) return motivo;
  throw new Error(`${nombre}: ${error.code ?? ""} ${error.message}`);
}

/** El vendedor marca un ítem como despachado, con su guía si va por transportadora. */
export async function despacharItem(
  itemId: string,
  transportadora?: string,
  guia?: string,
): Promise<ResultadoEnvio> {
  const db = await createClient();
  const { data, error } = await db.rpc("despachar_item", {
    _item_id: itemId,
    _transportadora: transportadora ?? null,
    _guia: guia ?? null,
  });
  if (error) return { ok: false, motivo: motivoEnvio("despacharItem", error) };
  const r = data as { cambiado: boolean; orden_id: string };
  return { ok: true, cambiado: r.cambiado, ordenId: r.orden_id, ordenCompletada: false };
}

/** El comprador («ya me llegó») o el vendedor (lo entregó en mano) cierran un ítem. */
export async function confirmarEntrega(itemId: string): Promise<ResultadoEnvio> {
  const db = await createClient();
  const { data, error } = await db.rpc("confirmar_entrega", { _item_id: itemId });
  if (error) return { ok: false, motivo: motivoEnvio("confirmarEntrega", error) };
  const r = data as { cambiado: boolean; orden_id: string; orden_completada: boolean };
  return {
    ok: true,
    cambiado: r.cambiado,
    ordenId: r.orden_id,
    ordenCompletada: r.orden_completada,
  };
}

/**
 * Guarda la reseña de un ítem comprado. Repetirla la corrige, no la duplica
 * (`unique (order_item_id)` + `on conflict`).
 */
export async function calificarItem(
  itemId: string,
  rating: number,
  comentario: string,
): Promise<{ ok: true; nueva: boolean } | { ok: false; motivo: MotivoEnvio }> {
  const db = await createClient();
  const { data, error } = await db.rpc("calificar", {
    _order_item_id: itemId,
    _rating: rating,
    _comentario: comentario,
  });
  if (error) return { ok: false, motivo: motivoEnvio("calificarItem", error) };
  return { ok: true, nueva: (data as { nueva: boolean }).nueva };
}

/**
 * Cancela los pedidos sin pagar de más de 72 horas, lo que devuelve su stock y
 * su cupo (trigger `orders_liberar_reservas`). La corre `pg_cron` cada hora;
 * el panel de órdenes la llama además al abrirse por si el proyecto no tiene
 * `pg_cron`. Nunca lanza: un panel que no carga por esto sería peor que un
 * pedido que vence una hora tarde.
 */
export async function vencerPedidosSinPago(): Promise<number> {
  try {
    if (!(await logisticaDisponible())) return 0;
    const db = await createClient();
    const { data, error } = await db.rpc("vencer_pedidos_sin_pago");
    if (error) {
      console.error(`[ordenes] vencer_pedidos_sin_pago: ${error.message}`);
      return 0;
    }
    return (data as number) ?? 0;
  } catch (e) {
    console.error("[ordenes] vencer_pedidos_sin_pago", e);
    return 0;
  }
}

/** Un ítem que vende la empresa de quien mira, con lo que hace falta para despacharlo. */
export interface ItemDeEmpresa extends OrderItem {
  orderId: string;
  reference: string;
  orderStatus: OrderStatus;
  createdAt: string;
  buyerName: string;
  buyerPhone?: string;
  destino?: DestinoEnvio;
}

/**
 * Lo que una empresa vendió: sus ítems, con el pedido al que pertenecen y a
 * dónde van. Para `/cuenta/empresa/pedidos`.
 *
 * Con el cliente de sesión: `order_items_read` deja ver solo los ítems de la
 * empresa (no los de otras empresas en el mismo pedido) y `orders_provider_read`
 * solo las órdenes que los incluyen. El `eq("provider_id")` no es la barrera:
 * separa la empresa que se mira de otras que la misma persona pudiera gestionar.
 *
 * Solo pedidos pagados en adelante: uno sin pagar no se prepara (puede vencer o
 * cancelarse), y enseñarlo invita a despachar algo que nadie pagó.
 */
export async function getPedidosDeEmpresa(providerId: string): Promise<ItemDeEmpresa[]> {
  if (!(await logisticaDisponible())) return [];
  const db = await createClient();
  const { data, error } = await db
    .from("order_items")
    .select(
      `${COLUMNAS_ITEM_BASE}, ${COLUMNAS_ITEM_0014},
       orders!inner(id, reference, status, created_at, buyer_name, buyer_phone,
                    envio_departamento, envio_ciudad, envio_direccion, envio_indicaciones)`,
    )
    .eq("provider_id", providerId)
    .in("orders.status", ["paid", "in_progress", "fulfilled"])
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`getPedidosDeEmpresa: ${error.message}`);

  type Fila = FilaItem & {
    orders: {
      id: string;
      reference: string;
      status: OrderStatus;
      created_at: string;
      buyer_name: string;
      buyer_phone: string | null;
      envio_departamento: string | null;
      envio_ciudad: string | null;
      envio_direccion: string | null;
      envio_indicaciones: string | null;
    };
  };

  return (data as unknown as Fila[]).map((f) => ({
    ...aItem(f),
    orderId: f.orders.id,
    reference: f.orders.reference,
    orderStatus: f.orders.status,
    createdAt: f.orders.created_at,
    buyerName: f.orders.buyer_name,
    buyerPhone: f.orders.buyer_phone ?? undefined,
    destino: aDestino(f.orders),
  }));
}
