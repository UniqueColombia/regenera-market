# Envíos que decide el vendedor, reseñas de quien compró, y ninguna operación que cuente dos veces

- **Fecha:** 2026-10-09
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-envios-resenas-idempotencia` → entrega directa (sin PR)
- **Fase del roadmap:** adelanta la interfaz de reseñas (Fase 4) y abre la logística, que no estaba en ninguna fase

## Qué se hizo

Lo pidió Ivan después de probar la beta (proceso de pago, logística, destino,
tiempos de entrega, calificaciones «como Mercado Libre»), y Jesús fijó las
decisiones el mismo día. Todo depende de la migración **`0014_envios_resenas_y_concurrencia.sql`**,
que **está escrita y probada pero no aplicada** en Supabase.

| Qué | Dónde |
|---|---|
| El vendedor dice cómo llega cada producto: lo lleva él o una transportadora que elige, costo del envío (0 = gratis), días hábiles | `formulario-oferta.tsx` (sección «Envío»), `listings.despacho/transportadora/envio_cop/entrega_dias_*` |
| La ficha dice cuánto cuesta el envío, en cuántos días llega y desde dónde sale | `oferta/[slug]/page.tsx` |
| La cesta cobra el envío (sin comisión) y pide a dónde mandarlo si hay productos físicos | `cesta.tsx`, `pricing.ts`, `crear_orden()` |
| El vendedor ve qué despachar, con la dirección, carga la guía y marca lo que entrega en mano | `/cuenta/empresa/pedidos` → `despachar_item()`, `confirmar_entrega()` |
| El comprador ve el estado y la guía, confirma «ya me llegó» y reseña | `/orden/[reference]` → `calificar()` |
| Correo «tu pedido va en camino» con la guía | `correoPedidoDespachado()` |
| Reseñas con promedio en la ficha, en el perfil del proveedor y en los datos estructurados | `calificaciones_oferta`, `calificaciones_proveedor` |
| El equipo oculta reseñas | `/admin/resenas` |
| **El stock se descuenta al comprar** (antes solo se comprobaba) y cancelar devuelve stock y cupo una vez | `crear_orden()`, `orders_liberar_reservas` |
| Los pedidos sin pagar vencen a las 72 horas | `vencer_pedidos_sin_pago()` + `pg_cron` cada hora |

Y una auditoría completa de idempotencia y concurrencia de todas las escrituras
del proyecto, con sus arreglos (sección «Por qué así»).

## Por qué así

**Envío: tarifa fija del vendedor, sumada al total y sin comisión.** Jesús eligió
esto frente a «incluido en el precio» (mismo precio a Bogotá que a Leticia) y
«contraentrega» (el comprador no sabe cuánto paga). Se cobra **una vez por línea**,
no por unidad: un pedido de 50 jabones es una caja. Es el gemelo exacto entre
`priceLine()` y `crear_orden()` (invariante 1).

**Aveonline queda como transportadora sugerida, sin integración.** Un convenio con
API de cotización y guías reemplazaría la tarifa fija por una cotización según el
destino; entra detrás de una interfaz (`nueva-integracion`) y no cambia ninguna
pantalla. Hace falta el convenio y sus credenciales: no se escribió nada contra un
API que no se ha visto.

**El pedido se cierra solo cuando todo es físico y está entregado.** Las
experiencias y los servicios no se «entregan» por este camino; esos pedidos los
sigue cerrando el equipo.

**Reseña quien recibió, no quien pagó.** La política de la 0001 dejaba reseñar con
el pedido pagado, antes de recibir nada. Ahora la escribe `calificar()`, que mira
el estado del envío; las políticas de escritura directa se borraron.

**Vistas y no columnas para el promedio.** Una columna en `listings` que cambia con
cada reseña haría que `listings_proteger_proveedor` viera la oferta «editada» y la
mandara a revisión, y subiría su `version` debajo del formulario de quien la edita.

### La auditoría de idempotencia y concurrencia

Se revisaron todas las acciones, rutas, funciones y triggers. Lo que se encontró y
cómo quedó:

| Problema | Arreglo |
|---|---|
| Dos compradores se llevaban la última unidad (el stock no se descontaba) | `update … where stock >= qty` dentro de `crear_orden()` |
| Recargar la cesta tras un corte creaba un segundo pedido (la llave vivía en un `ref`) | La llave vive en `sessionStorage` |
| Cancelar no devolvía el cupo; los pedidos sin pagar lo retenían para siempre | `orders_liberar_reservas` + vencimiento a 72 h + corrección de los cupos ya cancelados |
| Peticiones paralelas se saltaban el límite de pedidos | Candado consultivo por comprador en `crear_orden()` |
| Cestas cruzadas se interbloqueaban | Líneas en orden de oferta y fecha |
| Dos administradores confirmaban y cancelaban la misma orden; llegaban los dos correos | `.eq("status", desde)` + trigger `orders_transicion` |
| Aprobar una oferta publicaba cambios que nadie revisó, o la volvía a publicar tras retirarla | Aprobar exige el estado y la `version` que se vieron |
| Un formulario abierto hace rato pisaba precio, stock o retiro | `listings.version` + `escribirOferta()` |
| Doble envío de una oferta o de una publicación creaba dos | Llave del navegador como clave primaria |
| Dos aprobaciones de una postulación creaban dos empresas | `aprobar_postulacion()` con `for update` |
| Postular dos veces daba dos empresas o dos postulaciones y dos correos | Candado y deduplicación de 10 minutos en `postular_proveedor()` |
| Dos administradores se quitaban el rol mutuamente y no quedaba ninguno | Trigger `user_roles_ultimo_admin` |
| Una venta devuelta conservaba sus puntos (y la comisión baja) | `experiencia_por_orden` los revierte |
| Los topes de puntos y de la Comunidad se pasaban en paralelo | Candado por proveedor y por autor |
| Dos reacciones simultáneas a la misma publicación se interbloqueaban | `for no key update` en `recontar_publicacion()` |
| «Oferta en revisión» en cada guardado; bienvenida doble | Solo cuando el estado cambia; la marca antes del envío |
| `getMiEmpresa()` le daba a un administrador la empresa de otro | `.eq("user_id", …)` |

Las reglas para código nuevo quedaron en `dominio-regenera`, invariantes 24 a 27.

## Qué quedó pendiente

- **Aplicar la `0014` en Supabase** (SQL Editor, el archivo entero). Hasta entonces
  el sitio funciona como antes: el código pregunta si está (`logisticaDisponible()`)
  y apaga lo nuevo. Si el proyecto no tiene `pg_cron`, la migración lo avisa con un
  `notice` y los pedidos vencen al abrir `/admin/ordenes`; se puede activar luego en
  Database → Extensions y volver a correr ese bloque.
- **Probar con cuentas reales** el ciclo entero: publicar un producto con envío,
  comprarlo, confirmar el pago, despacharlo con guía, recibir el correo, «ya me
  llegó», reseñar, verlo en la ficha y ocultarlo desde `/admin/resenas`.
- **Que los proveedores ya publicados declaren su envío.** Sus productos quedan con
  «Envío a coordinar con el vendedor» y no cobran envío hasta que lo editen; editar
  una oferta publicada la manda a revisión.
- Convenio con Aveonline (cotización por destino y generación de guías).
- No hay respuesta del vendedor a una reseña.

## Qué se rompe si tocas esto

- `priceLine()`/`totalsFor()` y `crear_orden()` son gemelos también en el envío.
- `TRANSICIONES` y `orders_transicion`; `puedeResenar()` y `puede_resenar()`:
  gemelos.
- Un `update` a `listings` sube su `version`. Quien edite una oferta tiene que
  mandar la versión que leyó, o pierde la protección contra escrituras perdidas.
- `stock_descontado` y `cupo_descontado` son lo que hace que devolver sea una sola
  vez: no se escriben a mano.
- `despachar_item()` y `confirmar_entrega()` toman candado sobre la orden y después
  sobre el ítem. Código nuevo que toque ítems de una orden, en ese mismo orden.

## Verificación

- `npm run build`, `npx tsc --noEmit`, `npx eslint .`: limpios.
- Las 14 migraciones aplicadas sobre un Postgres 16 desechable con lo mínimo de
  Supabase simulado (roles, `auth.uid()`, `storage`), y la 0014 aplicada dos veces
  seguidas sin error.
- 14 pruebas funcionales en SQL: compra con envío y stock, idempotencia, sin stock,
  sin destino, cancelar devuelve una vez y reabrir reserva, transición inválida,
  despachar (y repetirlo), entregar y cerrar, reseñas (una por ítem, editable, puntos
  una vez, nombre abreviado), devolución revierte puntos, vencimiento devuelve cupo y
  stock, último administrador, postulaciones repetidas, versión.
- 5 pruebas de concurrencia con dos sesiones a la vez: la última unidad (una compra,
  la otra «sin stock»), el mismo pedido enviado dos veces (una orden), dos entregas
  de la misma orden (se cierra), pago contra cancelación (gana el primero) y dos
  administradores que se quitan el rol (queda uno).
- Las pruebas no están en el repositorio: necesitan el Postgres local simulado. Lo
  que verifican está descrito aquí para repetirlo contra un proyecto de Supabase de
  pruebas.
