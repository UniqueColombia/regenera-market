/**
 * Las reglas que viven dos veces, en TypeScript y en SQL, tienen que dar lo
 * mismo. Hasta ahora eso lo sostenía un comentario («si cambias uno, cambia el
 * otro»); aquí se comprueba con los dos lados de verdad.
 *
 * - `priceLine()`/`totalsFor()` ↔ `crear_orden()` (invariantes 2–7 y 10b)
 * - `TRANSICIONES` ↔ trigger `orders_transicion` (10c)
 * - `puedeResenar()` ↔ `puede_resenar()` (23)
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRANSICIONES } from "@/lib/order-status";
import { puedeResenar } from "@/lib/envios";
import { priceLine, totalsFor } from "@/lib/pricing";
import type { Listing, OrderStatus } from "@/lib/types";
import { baseNueva, comprar, crearEmpresa, crearOferta, crearUsuario, falla, type Nivel, type Sql } from "./arnes";

let sql: Sql;
let cerrar: () => Promise<void>;
beforeAll(async () => ({ sql, cerrar } = await baseNueva()));
afterAll(() => cerrar());

/** Generador con semilla: los mismos casos en cada corrida, para que un fallo se pueda repetir. */
function azar(semilla: number) {
  let s = semilla;
  return (max: number) => {
    s = (s * 1_103_515_245 + 12_345) % 2 ** 31;
    return s % max;
  };
}

describe("gemelo de precios", () => {
  it("crear_orden() cobra lo mismo que priceLine()/totalsFor() en 60 cestas al azar", async () => {
    const r = azar(20261012);
    const niveles: Nivel[] = ["semilla", "raiz", "bosque"];
    const empresas: string[] = [];
    for (const tier of niveles) empresas.push(await crearEmpresa(sql, { tier }));

    for (let caso = 0; caso < 60; caso++) {
      const comprador = await crearUsuario(sql);
      const lineas: { listing: Listing; tier: Nivel; qty: number }[] = [];
      for (let i = 0, n = 1 + r(4); i < n; i++) {
        const t = r(3);
        const kind = (["product", "product", "service"] as const)[r(3)];
        // Precios que no siempre son múltiplos de 10, para que la comisión
        // tenga que redondear (con 10 % y un subtotal impar aparece el .5).
        const priceCop = 1 + r(250_000);
        const conMayorista = r(2) === 0;
        const wholesaleMinQty = conMayorista ? 2 + r(8) : undefined;
        const wholesalePriceCop = conMayorista ? Math.max(1, priceCop - 1 - r(priceCop)) : undefined;
        const envioCop = kind === "product" ? [0, 5_000, 12_345][r(3)] : undefined;
        const quoteOnly = r(10) === 0;
        const id = await crearOferta(sql, empresas[t], {
          kind,
          priceCop,
          wholesalePriceCop: wholesalePriceCop ?? null,
          wholesaleMinQty: wholesaleMinQty ?? null,
          envioCop: envioCop ?? null,
          quoteOnly,
        });
        lineas.push({
          tier: niveles[t],
          qty: 1 + r(12),
          listing: {
            id,
            providerId: empresas[t],
            kind,
            priceCop,
            wholesalePriceCop,
            wholesaleMinQty,
            quoteOnly,
            impact: {},
            envio: envioCop !== undefined ? ({ costoCop: envioCop } as Listing["envio"]) : undefined,
          } as Listing,
        });
      }

      const esperado = totalsFor(lineas.map((l) => priceLine({ listingId: l.listing.id, qty: l.qty }, l.listing, l.tier)));
      if (esperado.purchasable.length === 0) continue;

      const orden = await comprar(
        sql,
        comprador,
        lineas.map((l) => ({ listing_id: l.listing.id, qty: l.qty })),
      );
      const { rows } = await sql.query(
        `select subtotal_cop, commission_total_cop, envio_total_cop, total_cop from orders where id = $1`,
        [orden.id],
      );
      expect(rows[0], `caso ${caso}`).toEqual({
        subtotal_cop: esperado.subtotalCop,
        commission_total_cop: esperado.commissionTotalCop,
        envio_total_cop: esperado.envioTotalCop,
        total_cop: esperado.totalCop,
      });

      const items = await sql.query(
        `select listing_id, unit_price_cop, commission_cop, envio_cop from order_items where order_id = $1`,
        [orden.id],
      );
      for (const p of esperado.purchasable) {
        const fila = items.rows.find((i) => i.listing_id === p.listing.id);
        expect(fila, `caso ${caso}`).toEqual({
          listing_id: p.listing.id,
          unit_price_cop: p.unitPriceCop,
          commission_cop: p.commissionCop,
          envio_cop: p.envioCop,
        });
      }
    }
  });
});

describe("gemelo de transiciones", () => {
  const ESTADOS = Object.keys(TRANSICIONES) as OrderStatus[];

  it("el trigger permite exactamente los saltos de TRANSICIONES", async () => {
    // Una orden de un servicio: sin stock ni envío que estorbe a los saltos.
    const servicio = await crearOferta(sql, await crearEmpresa(sql), { kind: "service" });
    const comprador = await crearUsuario(sql);

    for (const desde of ESTADOS) {
      for (const hasta of ESTADOS) {
        if (desde === hasta) continue;
        const orden = await comprar(sql, comprador, [{ listing_id: servicio, qty: 1 }]);
        // Se pone la orden en `desde` saltándose el trigger, que es lo que se prueba después.
        await sql.query(`alter table orders disable trigger user`);
        await sql.query(`update orders set status = $2 where id = $1`, [orden.id, desde]);
        await sql.query(`alter table orders enable trigger user`);
        await sql.query(`update orders set created_at = now() - interval '1 day' where id = $1`, [orden.id]);

        const e = await falla(sql.query(`update orders set status = $2 where id = $1`, [orden.id, hasta]));
        const permitido = TRANSICIONES[desde].includes(hasta);
        expect(e === null, `${desde} → ${hasta}: ${e?.message ?? "pasó"}`).toBe(permitido);
        // Que el límite de pedidos por comprador no frene el bucle.
        await sql.query(`delete from orders where id = $1`, [orden.id]);
      }
    }
  });
});

describe("gemelo de reseñas", () => {
  it("puede_resenar() y puedeResenar() responden igual en todos los casos", async () => {
    const ESTADOS: OrderStatus[] = ["pending_payment", "paid", "in_progress", "fulfilled", "cancelled", "refunded"];
    const ENVIOS = [undefined, "pendiente", "despachado", "entregado"] as const;
    const { rows } = await sql.query(`select (now() at time zone 'America/Bogota')::date::text hoy`);
    const hoy: string = rows[0].hoy;
    const FECHAS = [undefined, "2020-01-01", hoy, "2099-12-31"];

    for (const estado of ESTADOS) {
      for (const envio of ENVIOS) {
        for (const fecha of FECHAS) {
          const { rows: r } = await sql.query(`select puede_resenar($1::order_status, $2, $3::date) as si`, [
            estado,
            envio ?? null,
            fecha ?? null,
          ]);
          expect(r[0].si, `${estado} / ${envio} / ${fecha}`).toBe(puedeResenar(estado, envio, fecha, hoy));
        }
      }
    }
  });
});
