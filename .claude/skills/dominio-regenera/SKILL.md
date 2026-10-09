---
name: dominio-regenera
description: Invariantes de negocio y seguridad de Seregenera. Cárgala ANTES de escribir código que toque precios, carrito, comisiones, órdenes, checkout, pagos, roles de usuario, verificación de proveedores o puntaje de sostenibilidad. Estas reglas no son estilo — violarlas produce un bug de dinero, de auditoría o de privilegios.
---

# Invariantes del dominio

Seregenera es un marketplace **multi-proveedor con comisión**: en una misma
orden hay dinero de varias empresas distintas. Eso convierte varias decisiones
que parecen de estilo en decisiones de auditoría. Cada regla de abajo tiene un
modo de fallo concreto; si tu cambio la rompe, no es refactor, es un bug.

## Dinero

**1. El cliente nunca calcula un precio.** El carrito guarda solo `listingId` +
`qty` (`src/components/cart.ts`); el servidor lo valoriza contra el catálogo en
cada cambio (`src/app/carrito/actions.ts` → `src/lib/pricing.ts`).
*Si lo rompes:* un carrito guardado hace un mes compra al precio de hace un mes,
o un comprador edita `localStorage` y compra a lo que quiera.

**2. La comisión se guarda por ítem, nunca sobre el total.** `priceLine()`
devuelve `commissionCop` por línea. `COMMISSION_RATE = 0.12` en
`src/lib/pricing.ts`.
*Por qué:* una orden se reparte entre varios proveedores y cada uno debe poder
auditar exactamente lo que se le descontó a *sus* ítems.
*Si algún día la comisión se diferencia por tipo de oferta* (está previsto: las
experiencias soportan más que los productos físicos, que ya cargan logística),
el cambio va en `priceLine()`, y la orden debe guardar la tasa aplicada, no
solo el monto.

**3. La comisión sale de lo que recibe el proveedor, no se suma al comprador.**
Por eso en `totalsFor()`: `totalCop === subtotalCop + envioTotalCop`. No
"corrijas" eso sumando la comisión: cambiaría el precio que ve el comprador
respecto al de la ficha. **El envío (desde la 0014) sí se suma, y no lleva
comisión**: es plata del vendedor para pagar la transportadora.

**4. El precio mayorista es un umbral por cantidad, no un descuento.**
`unitPriceFor()` aplica `wholesalePriceCop` solo si
`qty >= wholesaleMinQty`. Se evalúa por línea, nunca sobre el total del carrito.

**5. Todo el dinero es entero en pesos colombianos (COP).** No hay centavos.
`Math.round()` al peso, nunca `toFixed(2)`. Un float en dinero es un descuadre
esperando fecha.

**6. Título y precio se congelan en la orden.** La orden guarda su propia copia,
no un join contra el catálogo. Si el proveedor sube el precio mañana, la orden
histórica sigue diciendo lo que el comprador aceptó.

**7. Los ítems `quoteOnly` no entran en ningún total.** `totalsFor()` los separa
en `quotable` y los excluye de `subtotalCop`, de la comisión y del impacto. Una
cotización no es una venta.

## Órdenes y pagos

**8. La aplicación nunca habla directo con una pasarela.** Todo pasa por
`PaymentGateway` en `src/lib/payments.ts`. Hoy `getGateway()` devuelve
`ManualGateway` (transferencia + confirmación humana). Wompi se agrega
implementando la misma interfaz — ver la skill `nueva-integracion`.

**9. Una confirmación de pago no la escribe el cliente.** Hoy la confirma un
humano; cuando exista el webhook de Wompi, **hay que validar la firma con
`WOMPI_EVENTS_SECRET` antes de tocar el estado de la orden**. Un webhook sin
verificar es un botón de "marcar como pagado" abierto a internet.

**10. Cupos e inventario necesitan transacción de base de datos.** La orden la
crea `crear_orden()`, que descuenta **el cupo y, desde la 0014, el stock** en
la misma transacción, con la condición dentro del `update` (`where stock >=
qty`, `where slots_taken + qty <= slots_total`): dos compradores de la última
unidad se turnan en la fila y el segundo no la encuentra. Cancelar o devolver
una orden **devuelve el stock y el cupo una sola vez** (trigger
`orders_liberar_reservas` con las marcas `stock_descontado` y
`cupo_descontado`), reabrirla los vuelve a reservar o falla, y un pedido sin
pagar **vence a las 72 horas** (`vencer_pedidos_sin_pago()`). Cualquier camino
nuevo que cree órdenes pasa por esa función, nunca por dos `insert` desde la
aplicación.

**10b. Comprar exige cuenta, y la orden es idempotente.** Desde el 2026-09-26.
`buyer_id` sale de `auth.uid()` dentro de `crear_orden()`, no de un correo del
formulario, y la orden se lee por RLS (`orders_buyer_read`). El `id` de la orden
lo genera el navegador una vez por cesta, **lo guarda en `sessionStorage`**
(sobrevive a recargar la página) y es la llave de idempotencia: el mismo
intento devuelve la misma orden. **Los precios de la orden los calcula la
función contra el catálogo** — es el gemelo SQL de `pricing.ts`; si cambias uno,
cambia el otro. El envío también: `envioCop` de `priceLine()` y `_envio` de
`crear_orden()`.

**10c. Una orden solo se mueve por los saltos permitidos.** `TRANSICIONES` en
`src/lib/order-status.ts` pinta los botones; el trigger `orders_transicion`
(0014) es la barrera. Cualquier `update` de estado lleva además
`.eq("status", desde)`: si no encuentra la fila, otro la movió primero.

**11. La referencia legible no garantiza unicidad.** La genera `crear_orden()`
(y `generateReference()` en el camino viejo). Es
`SR-AAMMDD-<4 chars aleatorios>`, legible para poner en una transferencia. Cuando
las órdenes se persistan, la unicidad la impone un `UNIQUE` en la base y un
reintento, no la aleatoriedad.

## Permisos y verificación

**12. Los roles viven en su propia tabla, no en el perfil.** Si el usuario
pudiera actualizar su fila de perfil, se autoasignaría `admin`. Ninguna política
RLS debe leer un rol desde una tabla que el propio usuario puede escribir.

**12b. Una empresa escribe sus ofertas; no las publica.** Desde la 0012,
`listings_proteger_proveedor` pisa `status`, `featured` y `provider_id` cuando
escribe una sesión de proveedor, y editar una oferta publicada la devuelve a
`pending_review`. La categoría `consultoria` y el giro del mismo nombre exigen
el sello (`sustainability_verified_at`, «Green Watching»). Y cuántos giros
declara una empresa lo decide su nivel (`limite_de_giros()`), no el formulario.

**13. El puntaje de sostenibilidad lo escribe un trigger, no el proveedor.** El
proveedor responde el cuestionario; el puntaje se deriva. Nunca aceptes
`sustainabilityScore` ni `tier` desde un formulario o una API pública.

**14. El puntaje es auditable punto por punto.** `scoreProvider()` en
`src/lib/sustainability.ts`: cinco dimensiones ponderadas (ambiental 25, local
20, circularidad 20, comunidad 15, gobernanza 10) más certificaciones (10, con
tope). Cada punto sale de una respuesta concreta. No agregues bonificaciones
"a criterio".

**15. Las certificaciones tienen tope a propósito.** Un taller pequeño sin
plata para certificarse tiene que poder llegar a Raíz por prácticas reales, y
una certificación comprada no puede bastar sola. No subas ese tope sin
discutirlo en el PR: es una decisión de producto, no un número.

**16. El filtro por nivel es acumulativo hacia arriba.** Quien busca Raíz
también quiere ver Bosque (`matches()` en `src/lib/repo.ts`). No lo conviertas
en igualdad exacta.

**17. Solo se muestra lo aprobado.** `repo.ts` filtra
`status === "approved"` para ofertas y proveedores. Una oferta pendiente de
revisión no aparece en catálogo, ni en búsqueda, ni en "relacionados", ni en las
cifras del home.

## Datos

**18. `src/lib/repo.ts` es la única puerta a los datos.** Sus funciones son
`async` a propósito, aunque hoy lean de memoria: cuando entre Supabase se
reemplaza el cuerpo y **ninguna página cambia**. No importes `src/data/*`
directamente desde un componente o una página — ver la skill `supabase-schema`.

**19. Los filtros del catálogo son un formulario GET.** Cada combinación es una
URL compartible e indexable. No los conviertas en estado de cliente.

**20. La búsqueda normaliza tildes.** "Amazonía" se encuentra con "amazonia"
(`normalize()` en `repo.ts`). Cualquier búsqueda nueva usa la misma función.

**21. `src/data/` es semilla de demostración.** Proveedores ficticios. No los
presentes como reales en copy, ni en material comercial, ni en un hito.

## Envíos y reseñas (desde la 0014)

**22. Despacha quien vende, y lo decide al publicar.** Decisión del 2026-10-09:
el producto dice si lo lleva el vendedor o va por una transportadora que él
elige (Aveonline, Servientrega…), cuánto cuesta el envío (tarifa fija por
línea, 0 = gratis) y en cuántos días hábiles llega. Seregenera no despacha:
cobra el envío, se lo pasa entero y le da al comprador la guía. Todo eso se
congela en `order_items` como el precio (invariante 6). El día que haya
convenio con Aveonline, su cotización reemplaza la tarifa fija detrás de una
interfaz (`nueva-integracion`); ninguna pantalla cambia.

**23. Solo reseña quien compró, y cuando ya tiene lo que compró.** Un producto
entregado, una experiencia cuya fecha pasó o un pedido cumplido —
`puede_resenar()` en la base, `puedeResenar()` en `src/lib/envios.ts`, gemelas.
Una reseña por ítem comprado, corregible; la escribe `calificar()`, nunca un
`insert` directo (no hay política de escritura). El equipo oculta, no edita.

## Idempotencia y concurrencia

**Idempotencia**: repetir la misma operación —doble clic, reintento tras un
corte, otra pestaña— la aplica una sola vez. **Concurrencia**: dos operaciones
distintas sobre el mismo recurso a la vez no se pisan. Las dos se verificaron en
todo el proyecto el 2026-10-09 (hito de esa fecha). Para código nuevo:

**24. Una creación lleva llave del navegador.** El `id` lo genera el cliente una
vez por intento (`crypto.randomUUID()`, en el manejador, no en el render) y el
servidor lo usa como clave primaria: el segundo `insert` choca y se devuelve lo
creado. Así funcionan la orden, la oferta (`escribirOferta()`) y la publicación
de la Comunidad.

**25. Leer y después escribir no protege de nada.** Una comprobación en la
aplicación la pasan las dos peticiones que llegan a la vez. La condición va
**dentro** de la escritura (`update ... where status = $visto`, `where stock >=
qty`, `where version = $editada`) o en la base con candado (`for update`,
`pg_advisory_xact_lock`). Si el `update` no encuentra fila, se relee para decir
por qué: ya estaba hecho (no es error) o alguien llegó antes (sí lo es).

**26. Un efecto secundario solo lo dispara quien hizo el cambio.** Correos y
puntos se mandan cuando la operación **cambió** algo (`cambiado: true`,
`repetida: false`, una fila afectada), nunca por el solo hecho de que se llamó.
Los puntos además llevan `referencia` única en `experience_events`.

**27. Los candados se toman siempre en el mismo orden.** Orden antes que ítem;
líneas por `listing_id, date`; proveedores por `provider_id`. Dos operaciones
que toman las mismas filas en orden cruzado se interbloquean.
