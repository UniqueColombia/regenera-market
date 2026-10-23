/**
 * Comprar en el modo MySQL: `crear_orden` y lo que la base hace sola después
 * (stock, cupos, transiciones, puntos, reseñas). La referencia son
 * `supabase/pruebas/compras.test.ts`, `concurrencia.test.ts` y
 * `envios-y-resenas.test.ts`: mismas reglas, por la capa compatible.
 *
 *   npm run test:mysql
 */
import { afterAll, describe, expect, it } from "vitest";
import { cerrarPool, crearEmpresa, crearOferta, crearPersona, HAY_MYSQL, leer, limpiar, servicio, type Persona } from "./arnes";

const CONTACTO = { _nombre: "Ana Compradora", _telefono: "3001234567" };
const DESTINO = { _departamento: "Boyacá", _ciudad: "Tunja", _direccion: "Calle 10 # 5-20" };

async function comprar(quien: Persona, lineas: unknown[], extra: Record<string, unknown> = {}) {
  return quien.db.rpc("crear_orden", { _id: crypto.randomUUID(), _lineas: lineas, ...CONTACTO, ...DESTINO, ...extra });
}

async function pagar(orden: string) {
  const admin = await crearPersona({ admin: true });
  return admin.db.from("orders").update({ status: "paid" }).eq("id", orden).select("status");
}

async function ordenPorReferencia(ref: string) {
  const r = await servicio().from("orders").select("*, order_items(*)").eq("reference", ref).single();
  return r.data as Record<string, unknown> & { order_items: Record<string, unknown>[] };
}

describe.skipIf(!HAY_MYSQL)("comprar en el modo MySQL", () => {
  afterAll(async () => {
    await limpiar();
    await cerrarPool();
  }, 180_000);

  it("una compra descuenta stock, cobra el precio mayorista, la comisión del nivel y el envío por zona", async () => {
    const empresa = await crearEmpresa({ puntos: 700, departamento: "Boyacá" }); // raíz: 10 %
    const oferta = await crearOferta(empresa, {
      stock: 10, price_cop: 10000, wholesale_price_cop: 8000, wholesale_min_qty: 5, department: "BOYACÁ",
      envio_cop: 15000, envio_local_cop: 5000, envio_adicional_cop: 1000, co2_kg_saved: "1.25",
    });
    const ana = await crearPersona();
    const r = await comprar(ana, [{ listing_id: oferta.id, qty: 5 }]);
    expect(r.error).toBeNull();
    const pedido = r.data as { reference: string; total_cop: number; envio_cop: number; repetida: boolean };
    // 5 × 8.000 = 40.000; envío local —el departamento de la oferta y el del destino son el mismo, aunque uno
    // venga en mayúsculas— 5.000 + 4 × 1.000
    expect(pedido).toMatchObject({ repetida: false, total_cop: 49000, envio_cop: 9000 });
    expect((await leer("listings", oferta.id, "stock")).stock).toBe(5);
    const orden = await ordenPorReferencia(pedido.reference);
    expect(orden).toMatchObject({ status: "pending_payment", subtotal_cop: 40000, commission_total_cop: 4000, co2_kg_saved: 6.25, buyer_email: ana.email });
    expect(orden.order_items[0]).toMatchObject({ unit_price_cop: 8000, qty: 5, commission_rate: 0.1, stock_descontado: true, envio_estado: "pendiente" });
  });

  it("el envío a otro departamento es la tarifa nacional", async () => {
    const empresa = await crearEmpresa({ departamento: "Nariño" });
    const oferta = await crearOferta(empresa, { envio_cop: 15000, envio_local_cop: 5000, department: "Nariño" });
    const r = await comprar(await crearPersona(), [{ listing_id: oferta.id, qty: 1 }], { _departamento: "Antioquia" });
    expect((r.data as { envio_cop: number }).envio_cop).toBe(15000);
    const local = await comprar(await crearPersona(), [{ listing_id: oferta.id, qty: 1 }], { _departamento: "narino" });
    expect((local.data as { envio_cop: number }).envio_cop).toBe(5000);
  });

  it("el mismo pedido mandado dos veces (misma clave) es uno solo", async () => {
    const oferta = await crearOferta(await crearEmpresa(), { stock: 3 });
    const ana = await crearPersona();
    const clave = crypto.randomUUID();
    const datos = { _id: clave, _lineas: [{ listing_id: oferta.id, qty: 1 }], ...CONTACTO, ...DESTINO };
    const primera = await ana.db.rpc("crear_orden", datos);
    const segunda = await ana.db.rpc("crear_orden", datos);
    expect((segunda.data as { repetida: boolean; reference: string })).toMatchObject({ repetida: true, reference: (primera.data as { reference: string }).reference });
    expect((await leer("listings", oferta.id, "stock")).stock).toBe(2);
    const beto = await crearPersona();
    expect((await beto.db.rpc("crear_orden", datos)).error?.message).toBe("clave-ajena");
  });

  it("sin stock no se vende, y el error dice de qué producto", async () => {
    const oferta = await crearOferta(await crearEmpresa(), { stock: 1 });
    const r = await comprar(await crearPersona(), [{ listing_id: oferta.id, qty: 2 }]);
    expect(r.error).toMatchObject({ code: "P0001", message: "sin-stock", hint: oferta.title });
    expect((await leer("listings", oferta.id, "stock")).stock).toBe(1);
  });

  it("dos compras a la vez por la última unidad: una entra, la otra no", async () => {
    const oferta = await crearOferta(await crearEmpresa(), { stock: 1 });
    const [a, b] = await Promise.all([
      comprar(await crearPersona(), [{ listing_id: oferta.id, qty: 1 }]),
      comprar(await crearPersona(), [{ listing_id: oferta.id, qty: 1 }]),
    ]);
    expect([a.error?.message, b.error?.message].filter(Boolean)).toEqual(["sin-stock"]);
    expect((await leer("listings", oferta.id, "stock")).stock).toBe(0);
  });

  it("una empresa no se compra a sí misma, y los productos piden destino", async () => {
    const yo = await crearPersona();
    const oferta = await crearOferta(await crearEmpresa({ miembro: yo }));
    expect((await comprar(yo, [{ listing_id: oferta.id, qty: 1 }])).error?.message).toBe("compra-propia");
    const ajena = await crearOferta(await crearEmpresa());
    const r = await (await crearPersona()).db.rpc("crear_orden", { _id: crypto.randomUUID(), _lineas: [{ listing_id: ajena.id, qty: 1 }], ...CONTACTO });
    expect(r.error?.message).toBe("falta-destino");
  });

  it("lo que es solo a cotización no se compra, y una cesta vacía tampoco", async () => {
    const oferta = await crearOferta(await crearEmpresa(), { quote_only: true });
    expect((await comprar(await crearPersona(), [{ listing_id: oferta.id, qty: 1 }])).error?.message).toBe("nada-comprable");
    expect((await comprar(await crearPersona(), [])).error?.message).toBe("cesta-invalida");
    expect((await comprar(await crearPersona(), [{ listing_id: oferta.id, qty: 0 }])).error?.message).toBe("cantidad-invalida");
  });

  it("una experiencia descuenta el cupo de su fecha", async () => {
    const oferta = await crearOferta(await crearEmpresa(), { kind: "experience" });
    const fecha = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    await servicio().from("listing_availability").insert({ listing_id: oferta.id, date: fecha, slots_total: 2 });
    const ok = await comprar(await crearPersona(), [{ listing_id: oferta.id, qty: 2, date: fecha }], { _departamento: null, _ciudad: null, _direccion: null });
    expect(ok.error).toBeNull();
    const lleno = await comprar(await crearPersona(), [{ listing_id: oferta.id, qty: 1, date: fecha }]);
    expect(lleno.error).toMatchObject({ message: "sin-cupo", hint: oferta.title });
    expect((await comprar(await crearPersona(), [{ listing_id: oferta.id, qty: 1 }])).error?.message).toBe("falta-fecha");
  });

  it("sin fechas abiertas, quien compra elige el día; nunca uno pasado (2026-10-22)", async () => {
    const oferta = await crearOferta(await crearEmpresa(), { kind: "experience" });
    const dia = (n: number) => new Date(Date.now() - 5 * 3600000 + n * 86400000).toISOString().slice(0, 10);
    const sinDestino = { _departamento: null, _ciudad: null, _direccion: null };
    const ok = await comprar(await crearPersona(), [{ listing_id: oferta.id, qty: 3, date: dia(20) }], sinDestino);
    expect(ok.error).toBeNull();
    const orden = await ordenPorReferencia((ok.data as { reference: string }).reference);
    expect(String(orden.order_items[0].date).slice(0, 10)).toBe(dia(20));
    expect(orden.order_items[0].cupo_descontado).toBeFalsy();

    const pasada = await comprar(await crearPersona(), [{ listing_id: oferta.id, qty: 1, date: dia(-1) }], sinDestino);
    expect(pasada.error).toMatchObject({ message: "fecha-pasada", hint: oferta.title });
    const rara = await comprar(await crearPersona(), [{ listing_id: oferta.id, qty: 1, date: "2026-02-30" }], sinDestino);
    expect(rara.error?.message).toBe("cesta-invalida");

    // Con fechas abiertas, una que ya pasó tampoco se vende aunque le quede cupo.
    const fija = await crearOferta(await crearEmpresa(), { kind: "experience" });
    await servicio().from("listing_availability").insert({ listing_id: fija.id, date: dia(-2), slots_total: 5 });
    const vieja = await comprar(await crearPersona(), [{ listing_id: fija.id, qty: 1, date: dia(-2) }], sinDestino);
    expect(vieja.error?.message).toBe("fecha-pasada");
    expect((await servicio().from("listing_availability").select("slots_taken").eq("listing_id", fija.id).single()).data).toEqual({ slots_taken: 0 });
  });

  it("lo que se aparta sin pagar tiene tope (2026-10-22)", async () => {
    // Más de 20 unidades, solo hasta la mitad de lo que queda.
    const oferta = await crearOferta(await crearEmpresa(), { stock: 100 });
    expect((await comprar(await crearPersona(), [{ listing_id: oferta.id, qty: 50 }])).error).toBeNull();
    const grande = await comprar(await crearPersona(), [{ listing_id: oferta.id, qty: 30 }]);
    expect(grande.error).toMatchObject({ message: "cantidad-maxima", hint: oferta.title });
    expect((await comprar(await crearPersona(), [{ listing_id: oferta.id, qty: 20 }])).error).toBeNull();
    expect((await leer("listings", oferta.id, "stock")).stock).toBe(30);

    // Tres pedidos sin pagar a la vez.
    const ana = await crearPersona();
    const otra = await crearOferta(await crearEmpresa(), { stock: 50 });
    for (let i = 0; i < 3; i++) expect((await comprar(ana, [{ listing_id: otra.id, qty: 1 }])).error).toBeNull();
    expect((await comprar(ana, [{ listing_id: otra.id, qty: 1 }])).error?.message).toBe("demasiados-pendientes");

    // Quince ofertas distintas apartadas.
    const empresa = await crearEmpresa();
    const ofertas = [];
    for (let i = 0; i < 16; i++) ofertas.push(await crearOferta(empresa, { stock: 5 }));
    const beto = await crearPersona();
    const r = await comprar(beto, ofertas.map((o) => ({ listing_id: o.id, qty: 1 })));
    expect(r.error?.message).toBe("demasiadas-reservas");
    expect((await comprar(beto, ofertas.slice(0, 15).map((o) => ({ listing_id: o.id, qty: 1 })))).error).toBeNull();
  });

  it("los puntos vienen de compradores que cuentan: cuenta con 7 días, otro teléfono, uno cada 90 días (2026-10-22)", async () => {
    const vendedora = await crearPersona();
    const empresa = await crearEmpresa({ miembro: vendedora });
    // Un servicio: sin despacho de por medio, el equipo lo da por cumplido.
    const oferta = await crearOferta(empresa, { price_cop: 600000, kind: "service" });
    const base = Number((await leer("providers", empresa, "experience_points")).experience_points);
    const puntos = async () => Number((await leer("providers", empresa, "experience_points")).experience_points) - base;
    const admin = await crearPersona({ admin: true });
    const venderA = async (quien: Awaited<ReturnType<typeof crearPersona>>) => {
      const r = await comprar(quien, [{ listing_id: oferta.id, qty: 1 }]);
      const orden = await ordenPorReferencia((r.data as { reference: string }).reference);
      await pagar(orden.id as string);
      await admin.db.from("orders").update({ status: "in_progress" }).eq("id", orden.id);
      await admin.db.from("orders").update({ status: "fulfilled" }).eq("id", orden.id);
      return orden;
    };
    // Una cuenta recién creada: la venta existe, los puntos no.
    await venderA(await crearPersona());
    expect(await puntos()).toBe(0);
    // Una cuenta con antigüedad: sí (venta 40 + primera 120 + un tramo de volumen 10).
    const ana = await crearPersona({ antiguedadDias: 30 });
    await venderA(ana);
    expect(await puntos()).toBe(170);
    // La misma compradora otra vez, dentro de 90 días: no suma.
    await venderA(ana);
    expect(await puntos()).toBe(170);
  });

  it("cancelar devuelve el stock; reabrir lo vuelve a tomar; y no se salta de estado", async () => {
    const oferta = await crearOferta(await crearEmpresa(), { stock: 4 });
    const r = await comprar(await crearPersona(), [{ listing_id: oferta.id, qty: 3 }]);
    const orden = await ordenPorReferencia((r.data as { reference: string }).reference);
    const admin = await crearPersona({ admin: true });
    expect((await admin.db.from("orders").update({ status: "fulfilled" }).eq("id", orden.id)).error?.message).toBe("transicion-invalida");
    await admin.db.from("orders").update({ status: "cancelled" }).eq("id", orden.id);
    expect((await leer("listings", oferta.id, "stock")).stock).toBe(4);
    await admin.db.from("orders").update({ status: "pending_payment" }).eq("id", orden.id);
    expect((await leer("listings", oferta.id, "stock")).stock).toBe(1);
  });

  it("nadie se marca como pagado su propio pedido", async () => {
    const ana = await crearPersona();
    const r = await comprar(ana, [{ listing_id: (await crearOferta(await crearEmpresa())).id, qty: 1 }]);
    const orden = await ordenPorReferencia((r.data as { reference: string }).reference);
    const intento = await ana.db.from("orders").update({ status: "paid" }).eq("id", orden.id).select("id");
    expect(intento.data).toHaveLength(0);
    expect((await leer("orders", orden.id as string, "status")).status).toBe("pending_payment");
  });

  it("despachar, entregar, completar: el pedido se cumple y la empresa gana puntos; la reseña da más", async () => {
    const vendedora = await crearPersona();
    const empresa = await crearEmpresa({ miembro: vendedora });
    const oferta = await crearOferta(empresa, { price_cop: 600000, despacho: "transportadora" });
    // Publicar la oferta aprobada ya dio sus puntos (`oferta_publicada`): se cuenta desde aquí.
    const base = Number((await leer("providers", empresa, "experience_points")).experience_points);
    const puntos = async () => Number((await leer("providers", empresa, "experience_points")).experience_points) - base;
    const ana = await crearPersona({ nombre: "ana maría pérez", antiguedadDias: 30 });
    const r = await comprar(ana, [{ listing_id: oferta.id, qty: 1 }]);
    const orden = await ordenPorReferencia((r.data as { reference: string }).reference);
    const item = orden.order_items[0].id as string;

    expect((await vendedora.db.rpc("despachar_item", { _item_id: item })).error?.message).toBe("orden-no-despachable");
    await pagar(orden.id as string);
    expect((await vendedora.db.rpc("despachar_item", { _item_id: item })).error?.message).toBe("falta-guia");
    expect((await ana.db.rpc("despachar_item", { _item_id: item, _guia: "X" })).error?.message).toBe("item-ajeno");
    const despacho = await vendedora.db.rpc("despachar_item", { _item_id: item, _guia: "GUIA-123", _transportadora: "Envía" });
    expect(despacho.data).toMatchObject({ cambiado: true, estado: "despachado" });
    expect((await leer("orders", orden.id as string, "status")).status).toBe("in_progress");

    // Lo que va por transportadora lo confirma quien lo recibe.
    expect((await vendedora.db.rpc("confirmar_entrega", { _item_id: item })).error?.message).toBe("entrega-del-comprador");
    const entrega = await ana.db.rpc("confirmar_entrega", { _item_id: item });
    expect(entrega.data).toMatchObject({ cambiado: true, orden_completada: true });
    expect((await leer("orders", orden.id as string, "status")).status).toBe("fulfilled");
    // venta_entregada 40 + primera_venta 120 + 1 tramo de volumen (600.000) 10
    expect(await puntos()).toBe(170);

    expect((await vendedora.db.rpc("calificar", { _order_item_id: item, _rating: 5 })).error?.message).toBe("item-ajeno");
    const resena = await ana.db.rpc("calificar", { _order_item_id: item, _rating: 5, _comentario: "  Muy bueno  " });
    expect(resena.data).toMatchObject({ nueva: true });
    const fila = await leer("reviews", (resena.data as { id: string }).id, "autor_nombre, body, rating");
    expect(fila).toEqual({ autor_nombre: "Ana P.", body: "Muy bueno", rating: 5 });
    expect(await puntos()).toBe(200);
    const otra = await ana.db.rpc("calificar", { _order_item_id: item, _rating: 3 });
    expect(otra.data).toMatchObject({ nueva: false });
    // Bajar a 3 quita los puntos de la reseña positiva.
    expect(await puntos()).toBe(170);

    // Devolver la compra quita los puntos de la venta.
    const admin = await crearPersona({ admin: true });
    await admin.db.from("orders").update({ status: "refunded" }).eq("id", orden.id);
    expect(await puntos()).toBe(0);
  });
});
