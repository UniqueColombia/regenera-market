# Nadie se beneficia a sí mismo, todo va por páginas y el dólar como referencia

- **Fecha:** 2026-10-12
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-paginacion-dolar-y-autocompra` → entrega directa (sin PR)
- **Fase del roadmap:** — (transversal)
- **Sigue a:** [2026-10-12-pruebas-de-la-base-y-0015.md](2026-10-12-pruebas-de-la-base-y-0015.md)

## Qué se hizo

Jesús resolvió tres de las decisiones que dejó abiertas el hito anterior y
aplicó la `0015`:

1. **Moneda:** todo sigue en COP, con un «≈ US$» al lado del precio en la ficha
   y del total en la cesta, sacado de una fuente oficial y sin efecto en nada.
2. **Autocompra:** bloquearla, «y si encuentras algo más similar que se pueda
   explotar, bloquéalo también».
3. **Paginación:** implementarla, «y revisa que se implemente BIEN».

| Qué | Dónde |
|---|---|
| «≈ US$» con la TRM de la Superintendencia Financiera (datos.gov.co, sin credenciales) | `src/lib/tipo-de-cambio.ts`, `src/components/aprox-usd.tsx`, ficha y cesta |
| Migración `0016` (escrita y probada, **sin aplicar**) | `supabase/migrations/0016_sin_autobeneficio_y_resumen_de_ordenes.sql` |
| Catálogo por páginas de 24 | `buscarOfertas()` en `repo.ts`, `/catalogo` |
| `/admin/ordenes` por páginas de 20, con filtro por estado y cifras de la base | `listarOrdenes()`, `resumenDeOrdenes()` en `orders.ts` |
| `/admin/ofertas` por páginas de 40, con filtro por estado | `getOfertasParaAdmin()` en `repo.ts` |
| Barra de páginas y funciones puras de paginación | `src/components/paginacion.tsx`, `src/lib/paginacion.ts` |
| Pruebas: 11 de autobeneficio contra Postgres, 7 de paginación, 3 del dólar | `supabase/pruebas/autobeneficio.test.ts`, `src/lib/*.test.ts` |

### Lo que bloquea la 0016

La auditoría recorrió todo lo que da puntos, nivel, sello o reputación. Cada
caso se reprodujo contra las 15 migraciones antes de escribir el arreglo.

| Hueco | Gravedad |
|---|---|
| Una empresa **se aprobaba sola su evaluación** de sostenibilidad: insertaba `status = 'approved', score = 100` y el trigger le daba el sello «Green Watching» y 250 puntos | Crítica |
| Una empresa **publicaba certificaciones como verificadas** insertándolas con `verified_at` | Crítica |
| Comprarse, marcar la entrega y reseñarse: 200 puntos y promedio 5,0 | Alta (la pidió Jesús) |
| El vendedor marcaba «entregado» lo que iba por transportadora, cerrando el pedido | Media |
| Devolver una venta dejaba `primera_venta`, `resena_positiva` y la reseña en el promedio | Media |
| Ocultar una reseña (o bajarla de 5 a 1) no quitaba sus puntos | Media |
| Despublicar un artículo de la Comunidad no quitaba sus puntos | Baja |

Descartado tras verificar: reacciones (no dan puntos), repetir una venta
reabriéndola (referencias únicas), `oferta_publicada` y `perfil_completo`
(topes y una sola vez), comprar a nombre de una empresa (no cambia comisión),
escribir puntos o nivel a mano (`providers_proteger_derivados`), hacerse miembro
de una empresa (solo el equipo).

## Por qué así

**La TRM y no una API de cambio comercial.** Es la tasa oficial colombiana,
certificada por la Superintendencia Financiera y publicada como dato abierto. No
pide credenciales ni tiene límite de uso pagado. Cambia una vez por día hábil,
así que se guarda en caché seis horas (`next: { revalidate }`; el proyecto no
usa Cache Components). Si la fuente falla, no se muestra nada: un dato de
cortesía no puede tumbar una ficha.

**«≈ US$» en la ficha y la cesta, no en las tarjetas del catálogo.** En una
rejilla de 24 precios, otros 24 en dólares son ruido. Donde se decide comprar
sí ayuda. El `title` dice la fuente, la fecha y que se paga en pesos: un número
en dólares sin esa aclaración se lee como un precio en dólares.

**Bloquear la compra propia entera, no saltar la línea.** Saltarla en silencio
cobraría algo distinto de lo que la persona vio en la cesta. Con
`manages_provider()` el bloqueo alcanza a todos los miembros de la empresa, no
solo a quien la creó.

**Reseña de una compra devuelta: se oculta, no se borra.** Así sale del
promedio y pierde sus puntos por el mismo camino que la moderación, y el
autor la sigue viendo (no la reescribe creyendo que se perdió).

**Paginación por número en la URL, no «cargar más».** Es lo que pide la
invariante 19 (filtros por GET, URLs compartibles), funciona sin JavaScript y
deja volver atrás. Lo que la hace correcta y no solo funcional, en
`src/lib/paginacion.ts`:

- **Desempate por `id`** al final de todo orden. El orden por defecto del
  catálogo (`featured`, `provider_score`) empata entre ofertas del mismo
  proveedor. Sin desempate, Postgres puede repetir una oferta en dos páginas y
  saltarse otra.
- **Totales de la base**, no de la página: «por cobrar» se calcula sobre todas
  las órdenes (`admin_resumen_ordenes()`), no sobre las 20 visibles.
- **Una página que no existe lleva a la última** con los mismos filtros. PostgREST
  responde `PGRST103` a un rango fuera de límite; se trata como «vacía» y el total
  sale de pedir la fila 0.
- **Filtro por estado en los paneles.** Sin él, una orden por cobrar podía
  quedar en la página 4.
- Cambiar un filtro o una categoría vuelve a la página 1, porque esos enlaces y
  el formulario no llevan `pagina`.
- La canónica del catálogo sigue siendo `/catalogo` en todas las páginas, igual
  que con los filtros (`seo-y-legal`). Las fichas se descubren por el sitemap,
  que sigue listando todas (`searchListings()` no pagina).

## Qué quedó pendiente

- **Aplicar la `0016`.** Antes, correr las consultas del final del archivo, que
  dicen si alguien usó los dos huecos críticos o ya se compró a sí mismo.
- **Reservar todo el stock de un competidor** con pedidos sin pagar: una cuenta
  puede bloquear las unidades de un rival 72 horas, gratis, y repetirlo. Es
  abuso contra otro, no a favor de uno, y cualquier tope también limita a
  compradores reales. Opciones, de menos a más cambio:
  - un tope de unidades sin pagar por comprador y oferta;
  - un vencimiento más corto para pedidos que reservan mucho stock;
  - reservar el stock al confirmar el pago, aceptando el riesgo de sobreventa.

  **Decisión de producto pendiente.**
- `/admin/proveedores` y `/admin/postulaciones` siguen trayendo todo. Son
  cientos como mucho; se paginan con el mismo patrón cuando haga falta.
- El inicio de `/admin` suma en la aplicación las órdenes sin pagar. Tienen tope
  por comprador y vencen a las 72 horas.
- Nada de esto se vio en el navegador. Ver «Verificación».

## Qué se rompe si tocas esto

- **Toda consulta paginada termina en `.order("id")`.** Si se quita, se repiten
  y se pierden filas entre páginas sin que ninguna prueba lo note con pocos
  datos.
- `searchListings()` sin paginar es del sitemap. El catálogo usa
  `buscarOfertas()`.
- `revertir_experiencia()` es el gemelo de `otorgar_experiencia()`. Un evento de
  puntos nuevo necesita los dos caminos (invariante 30).
- Las funciones de la `0016` copian los cuerpos de la `0014`. El próximo cambio a
  `crear_orden()`, `calificar()` o `confirmar_entrega()` parte de la `0016`.
- `AproxUsd` recibe la cotización como prop. Solo las páginas llaman a
  `getFuenteDeCambio()`. Un componente de cliente que la llamara haría el
  `fetch` desde el navegador, y la CSP no deja `datos.gov.co` en `connect-src`.

## Verificación

- `npm run build`, `npx tsc --noEmit`: limpios. `npx eslint .`: 0 errores, los 94
  avisos de siempre.
- `npm run test:todo`: 77 pruebas en verde, entre ellas cada hueco de la tabla
  como ataque que ahora falla.
- Contra producción, con el build local y la clave pública:
  - `/catalogo` muestra «19 ofertas encontradas» en una sola página, sin barra;
  - `?pagina=2` y `?pagina=999` redirigen a la última página válida;
  - `?pagina=abc` muestra la primera;
  - la ficha `test-de-expriencia` muestra «≈ US$ 6,26» con la TRM del 10 de
    octubre.
- Contra el PostgREST de producción, en páginas de 5: 19 ofertas únicas en 4
  páginas, sin repetidas; `PGRST103` fuera de rango, y el total se recupera con
  la fila 0.
- **No probado:** `/admin/ordenes` y `/admin/ofertas` con sesión de
  administrador (necesitan entrar), ni nada en el navegador.
