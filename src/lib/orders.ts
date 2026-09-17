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
 * La excepción es `getOrderByReference()` — ver su comentario.
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

/**
 * Guarda la orden y sus ítems.
 *
 * Se enlaza al usuario cuando hay sesión (`buyer_id`), aunque el formulario no
 * lo pida: es lo que permitirá que «mis pedidos» sea una consulta por RLS y no
 * una búsqueda por correo, que sería confiar en un campo de texto.
 *
 * **No es una transacción.** Si falla el insert de los ítems queda una orden
 * huérfana sin líneas. Se acepta hoy porque el pago es manual y una orden vacía
 * salta a la vista en el panel; cuando entre la pasarela, esto y el descuento de
 * cupo tienen que irse juntos a una función de Postgres — es la invariante 10 de
 * `dominio-regenera`, la deuda más peligrosa que hay anotada.
 */
export async function saveOrder(order: Order): Promise<void> {
  const usuario = await getUser();
  const db = createAdminClient();

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
  if (error) throw new Error(`saveOrder: ${error.message}`);

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
    if (errorItems) throw new Error(`saveOrder (items): ${errorItems.message}`);
  }
}

/**
 * Una orden por su referencia.
 *
 * **Usa la clave de servicio, y es el punto flojo conocido de este archivo.**
 * Quien compra sin cuenta tiene que poder abrir `/orden/SR-260913-A1B2` desde el
 * correo, y por RLS no vería nada: `orders_buyer_read` compara con
 * `auth.uid()`, que en un invitado no existe. O sea que **la referencia hace de
 * llave**.
 *
 * Y no es una buena llave: `generateReference()` son cuatro caracteres
 * aleatorios sobre una fecha (invariante 11), o sea que se puede adivinar a
 * fuerza de intentos. Lo que se ve con una referencia acertada es el nombre, el
 * correo y el teléfono de quien compró — datos personales, no dinero.
 *
 * Se deja así hoy porque el flujo de compra como invitado es más importante para
 * la beta que ese riesgo, y porque arreglarlo bien es darle a la orden un token
 * largo propio para el enlace, no estrechar la referencia legible que la gente
 * copia en la transferencia. Está anotado en `docs/ESTADO.md`.
 */
export async function getOrderByReference(
  reference: string,
): Promise<Order | undefined> {
  const db = createAdminClient();

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
