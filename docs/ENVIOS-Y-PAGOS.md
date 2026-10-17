# Envíos por cantidad y pago al proveedor: qué se copia de MercadoLibre y de Airbnb

**Estado (2026-10-17):** propuesta. **No hay nada programado.** Ya está hecho, el
mismo día: los términos dicen cuándo se le paga al proveedor, y `/vender` pide
aceptar los términos aparte (ver «Términos para proveedores»). Las decisiones
que faltan son de los dos socios, y algunas de un contador o un abogado: están
juntas en la última sección.

Sale de lo que Jesús e Ivan apuntaron para atacar:

- Al crear un producto, diferenciar un envío pequeño de un envío por cantidad:
  llevar un ítem pequeño es fácil, llevar cincuenta es otra cosa.
- Copiar el costo de envío de MercadoLibre (buscar sus APIs) y la dirección de
  destino.
- Pago en línea en el que el cliente paga, Seregenera cobra su comisión y el
  proveedor recibe lo suyo **solo cuando el producto se entregó**, como hace
  Airbnb.
- Que cada proveedor firme los términos y condiciones.

**Cómo se investigó.** El formulario `/publicar` de MercadoLibre exige sesión, así
que no se recorrió. Se leyeron sus páginas públicas de ayuda y de desarrolladores
(que exponen los mismos campos que el formulario), el centro de ayuda de Airbnb y
la documentación de pasarelas y transportadoras colombianas. Las fuentes están al
final; lo que no se pudo confirmar está marcado como tal. Si hace falta ver el
formulario tal cual, lo útil son capturas de cada paso desde una cuenta de
vendedor.

---

## 1. Envío

### Lo que hace MercadoLibre en Colombia

- **El vendedor declara el embalaje, no el producto**: peso en gramos y medidas en
  centímetros del paquete listo para despachar. MercadoLibre lo vuelve a medir al
  despachar; si no coincide, corrige el costo de las ventas siguientes.
- **Peso facturable** = el mayor entre el real y el volumétrico, y el volumétrico es
  largo × ancho × alto ÷ **4.505** (ejemplo oficial: 30×31×25 ÷ 4.505 = 5,1 kg).
- **Límites de un paquete normal**: 50 kg, 250 cm sumando las tres medidas, 130 cm
  en el lado más largo. Lo que se pasa va por otra logística (ME1, la del vendedor)
  o por «acordar con el vendedor».
- **El costo es una tabla nacional** de tramos de peso por tramos de precio del
  producto. **No mira el destino.** Hasta 0,3 kg, un producto de más de $60.000 le
  cuesta al vendedor $8.000 (reputación verde).
- **Envío gratis obligatorio** en productos nuevos desde $60.000, y lo paga el
  vendedor.
- **Con muchas unidades, multiplica**: «el costo se calcula por unidad y si envías
  más de una, debes multiplicar el costo de envío por la cantidad». Físicamente el
  carrito de un mismo vendedor sale en un solo paquete, pero se cobra por unidad.
- **Precios por cantidad** (hasta cinco tramos, solo para compradores empresa):
  existen en Brasil, México, Chile y Argentina, **no en Colombia**.

### Lo que hace Seregenera hoy

- El proveedor declara si lo lleva él o una transportadora que elige, una tarifa
  dentro de su departamento, una al resto del país y **lo que suma cada unidad
  adicional** (migración 0017). Peso y medidas existen, opcionales, y no se usan.
- La cesta pide departamento, ciudad, dirección e indicaciones, y cobra el envío
  según el destino antes de confirmar. **La dirección de destino ya está.**
- El precio mayorista ya existe: un precio por unidad a partir de N unidades
  (invariante 4 de `dominio-regenera`). Es lo que MercadoLibre no tiene en
  Colombia.

**Lo que falla con 50 unidades:** la parte por unidad crece en línea recta (50 ×
$2.000 = $98.000 de adicionales) aunque las 50 quepan en dos cajas, y nada impide
comprar 500 unidades de algo que pide un camión.

### Lo que se propone: pequeño, por cantidad y carga

**No copiar a MercadoLibre en la cantidad**, que multiplica por unidad: copiar su
idea del paquete y sus límites.

| Caso | Cuándo | Cómo se cobra |
|---|---|---|
| **Pequeño** | Todo cabe en una caja | Como hoy: la tarifa local o la nacional |
| **Por cantidad** | Varias unidades, varias cajas | Tarifa + (cajas − 1) × adicional por caja |
| **Carga** | Más unidades de las que el proveedor despacha por paquetería, o una caja que pasa los límites | No se cobra en la cesta: se pide cotización al proveedor |

1. **«Unidades por caja»** en la ficha, con 1 por defecto. Cajas = redondeo hacia
   arriba de cantidad ÷ unidades por caja, y lo que hoy es «por unidad adicional»
   pasa a ser «por caja adicional». Con 1 por defecto, **todas las ofertas de hoy
   cobran exactamente lo mismo**.

   Ejemplo: tarifa nacional $12.000, $4.000 por caja adicional, 10 por caja.
   50 unidades = 5 cajas = $12.000 + 4 × $4.000 = **$28.000**. Con la regla de hoy
   y $4.000 por unidad adicional serían $208.000.

2. **«Máximo por envío»**, opcional: cuántas unidades despacha el proveedor por
   paquetería en un pedido. Por encima, la cesta no deja cerrar la compra de esa
   línea y ofrece **pedir cotización** (el flujo de cotización ya existe).

3. **Peso y medidas del embalaje, obligatorios cuando despacha una transportadora.**
   Sin ellos no se sabe cuándo un envío deja de ser pequeño, y la Ley 1480
   (art. 50, modificado por la Ley 2439 de 2024) pide informar peso y medidas en el
   comercio electrónico. Opcionales si lo lleva el propio vendedor.

4. **Los límites de MercadoLibre como tope de una caja**: 50 kg facturables, 250 cm
   sumando medidas, 130 cm de lado. Una caja que los pasa es «carga». El divisor del
   volumétrico se guarda en un solo sitio y se cambia por el de la transportadora
   que se integre (MercadoLibre usa 4.505; es habitual 5.000).

**Qué tocaría** (alrededor de un día): una migración `0023` con dos columnas
(`unidades_por_caja`, `maximo_por_envio`), `envio_de_linea()` en SQL y su gemela
`envioDeLinea()` en `src/lib/envios.ts` (las compara `supabase/pruebas/gemelos.test.ts`),
`crear_orden()` rechazando la línea que pasa el máximo, dos campos en el
formulario de oferta y el aviso en la cesta.

### ¿Y el costo de envío de MercadoLibre por API?

**No se puede usar.** Todos sus endpoints de envío exigen el token de un usuario de
MercadoLibre, y la documentación dice que están hechos «para operar solo con ítems
publicados» en su marketplace. La calculadora pública antigua responde 404, y no
existe un servicio de Mercado Envíos para tiendas de fuera (Mercado Shops cerró).
Sus tarifas además son negociadas y subsidiadas por MercadoLibre: no son lo que
cobraría una transportadora a Seregenera. Lo que se copia es el **modelo**.

Para cotizar el precio real hay APIs colombianas, como mejora posterior:

| Servicio | API pública | Cotiza | Guía | Nota |
|---|---|---|---|---|
| **Mipaquete** | Sí (Postman público) | Varias transportadoras, por código DANE, **cantidad**, medidas, peso y valor declarado | Sí | Elige por precio, tiempo o calificación. Servientrega, Coordinadora, Envía, TCC |
| **Envia.com** | Sí | Una transportadora por petición | Sí | Funciona con saldo |
| **Aveonline** | No publicada (por WhatsApp) | Más de 5 transportadoras | Sí | Es con la que hay conversación de convenio (punto 8 de «Para conversar con Ivan» en `docs/ESTADO.md`) |
| Coordinadora, Servientrega | Con credenciales de cliente | La suya | Sí | Sin documentación pública |

La cotización entraría detrás de una interfaz (skill `nueva-integracion`) y
reemplazaría la tarifa que declara el proveedor; las cajas y los límites de arriba
siguen sirviendo igual.

---

## 2. Pago al proveedor después de la entrega

### Lo que hacen ellos

- **MercadoLibre** retiene la plata del vendedor y la libera después de la entrega.
  En Colombia: 2 días con su envío y buena reputación, 6 sin reputación; con envío
  propio, 5 días si el vendedor avisa la entrega y el comprador confirma, y 22 si no
  avisa.
- **Airbnb** cobra al huésped al confirmarse la reserva, **paga al anfitrión 24 horas
  después del check-in** y le descuenta su comisión de ese pago. A un anfitrión
  nuevo le puede retener hasta 30 días.

En los dos, la garantía es la misma: el comprador sabe que el vendedor no cobra si
no cumple, y el vendedor sabe que la plata ya está pagada y esperando.

### Lo que pasa hoy en Seregenera

**El dinero ya va por ese camino.** El comprador paga el 100 % a la cuenta de
Dimension Natural SAS (llave Bre-B o transferencia; BOLD, cuando se encienda,
también deposita ahí), cada ítem de la orden guarda su comisión, y la entrega
queda marcada («Ya me llegó», o el proveedor si lo entregó en mano).

**Lo que no existe es la liquidación:** nada registra cuánto se le debe a cada
proveedor, cuándo se le pagó ni a qué cuenta, ni hay dónde abrir un reclamo que
frene ese pago.

### Lo que se propone

**La regla ya está en los términos** (vigencia 2026-10-17): el ítem entregado y
**cinco días hábiles** sin reclamo (`DIAS_PARA_RECLAMAR` en `src/lib/legal.ts`) se
pagan al proveedor, precio y envío menos la comisión de su nivel. Con un reclamo
abierto, ese pago espera; si la venta se cancela o se devuelve, la plata vuelve al
comprador y no hay comisión. Cinco no es arbitrario: es el retracto de la Ley 1480
(art. 47) y el plazo para pedir la reversión de un pago (art. 51).

**Fase A, sin pasarela nueva** (alrededor de dos o tres días):

1. **La cuenta de cobro del proveedor** (banco, tipo, número, titular, documento),
   que solo ven quienes gestionan la empresa y el equipo. Es un dato nuevo: entra
   en la política de privacidad (skill `seo-y-legal`).
2. **El reclamo**: un botón en la página del pedido, solo dentro del plazo, que deja
   el ítem retenido hasta que el equipo lo resuelva.
3. **La liquidación**: una función en la base que calcula qué ítems ya se pueden
   pagar y cuánto, y `/admin/liquidaciones` con lo que se le debe a cada proveedor y
   un «marcar pagada» con la referencia de la transferencia. Al marcarla, un correo
   al proveedor («te pagamos tu venta») y, en «Tu empresa», lo que tiene por cobrar
   y lo cobrado.
4. **Los días hábiles** necesitan los festivos de Colombia. O una tabla de festivos,
   o contar de lunes a viernes y sumar margen: a decidir al programarlo.

**Fase B, pagos automáticos.** La transferencia de «marcar pagada» la hace la
pasarela:

| Opción | Qué resuelve | Qué no |
|---|---|---|
| **Wompi Payouts** (Bancolombia) | Paga por API a cualquier banco, Nequi, Daviplata o llave Bre-B. El proveedor no necesita cuenta en Wompi. Desde el saldo de Wompi: $1.849 + 0,4 % + IVA por pago | Hay que cobrar también por Wompi, o fondear su saldo |
| **Mercado Pago Split 1:1** | Disponible en Colombia: la comisión se separa sola al cobrar | **No retiene**: el proveedor recibe según los plazos de su propia cuenta, no cuando Seregenera decide. Cada proveedor necesita cuenta verificada en Mercado Pago. La versión con retención (1:N) es solo para cuentas con ejecutivo comercial |
| **ePayco «pagos divididos»** | Divide al cobrar | Exige modelo agregador, el alta de cada proveedor, y no documenta retención |
| **BOLD** | Cobra | No documenta split ni pagos a terceros: sirve para cobrar, no para pagar al proveedor |

Para «pagar solo cuando se entregó», **lo que encaja es cobrar todo y pagar
después** (fase A, y Wompi Payouts en la B). Un split al momento del cobro reparte
la plata antes de la entrega, que es justo lo que se quiere evitar.

---

## 3. Términos para proveedores («que cada uno firme»)

**Desde el 2026-10-17**, `/vender` tiene una casilla aparte, obligatoria, para
aceptar los términos para vender, separada de la autorización de datos (que por la
Ley 1581 no puede ir atada a un contrato). La fecha queda en `consent_at` del mismo
envío, y la versión es la `VIGENCIA_TERMINOS` de ese día. El registro y la cesta
dicen junto al botón que se aceptan los términos.

**Lo que falta:** los proveedores que ya se dieron de alta nunca aceptaron nada, y
cuando cambie la versión nadie la vuelve a aceptar. La propuesta es una tabla de
aceptaciones (quién, qué empresa, qué versión, cuándo) y que `/cuenta/empresa` pida
aceptar la versión vigente antes de seguir, cada vez que cambie. Aceptar con un clic
es una firma electrónica válida en Colombia (Ley 527 de 1999 y Decreto 2364 de
2012), a confirmar por el abogado.

**Ivan revisa el texto** (punto 3 de «Para conversar con Ivan» en
`docs/ESTADO.md`).

---

## 4. Lo legal, para un abogado y un contador

No es asesoría legal: son las preguntas que la investigación dejó abiertas, con la
norma de donde salen.

- **Quién factura.** Si Seregenera recauda como mandataria del proveedor, el
  art. 1.6.1.4.9 del Decreto 1625 de 2016 (sustituido por el Decreto 442 de 2023)
  dice que **las facturas las expide el mandatario**, diferenciando lo del mandante,
  y el art. 1.2.4.11 pide identificar en la contabilidad los ingresos recibidos para
  terceros. Es lo contrario de lo que decían los términos («la factura la emite el
  proveedor»). Desde el 2026-10-17 los términos no prometen ni lo uno ni lo otro.
  **Hay que decidirlo ya, no al encender la pasarela**: el cobro por llave y
  transferencia a la cuenta de la sociedad ocurre hoy.
- **Seregenera puede responder como proveedor.** La SIC trató a Rappi como proveedor
  y no como portal de contacto porque participa en el pago, cobra un porcentaje y
  tramita la reversión, «con independencia de lo que digan sus términos» (2019, y
  sanciones del 26-03-2026). Si Seregenera recauda, conviene asumir que puede
  responder por garantía, retracto y reversión. **Pregunta para el abogado:** si
  un hotel que compra para su operación es «consumidor» en el sentido de la
  Ley 1480, que es lo que decide si todo esto aplica.
- **Retracto y devolución.** Cinco días hábiles desde la entrega (art. 47); en
  comercio electrónico el dinero se devuelve en máximo 15 días calendario (Ley 2439
  de 2024). Reversión del pago: queja dentro de cinco días hábiles (art. 51 y
  Decreto 587 de 2016).
- **Entrega.** En el plazo informado o, si no se informó, en máximo 30 días; si no,
  se devuelve el dinero (art. 50).
- **Registro de cada vendedor** consultable por el comprador: razón social,
  documento, dirección física y teléfonos (art. 53). La ficha pública del
  proveedor hoy no los muestra todos.
- **Factura electrónica al consumidor.** Las plataformas de comercio electrónico
  deben poner a disposición de sus usuarios un servicio para expedirla
  (art. 1.6.1.4.19, en las condiciones que fije la DIAN).

---

## 5. Lo que hay que decidir

| # | Decisión | Quién | Recomendación |
|---|---|---|---|
| 1 | Días entre la entrega y el pago al proveedor | Los dos | 5 hábiles, lo que dicen hoy los términos |
| 2 | ¿Menos días para los niveles altos, como MercadoLibre con la reputación? | Los dos | Sí más adelante; 5 para todos mientras no haya historial |
| 3 | Mandato con factura del mandatario, u otra figura en la que factura el proveedor | Contador y abogado | Antes de cualquier otra cosa: el cobro ya ocurre |
| 4 | Pasarela para cobrar y para pagar | Los dos | Fase A manual ya; para la B, Wompi (cobro y Payouts). BOLD solo si no se van a pagar proveedores desde la pasarela |
| 5 | ¿Envío gratis subsidiado desde cierto monto? MercadoLibre lo obliga desde $60.000 y lo paga el vendedor | Los dos | No por ahora: el proveedor ya puede declarar envío gratis |
| 6 | Unidades por caja y máximo por envío: ¿se programan? | Los dos | Sí: no cambia nada de lo publicado y resuelve el caso de las 50 unidades |
| 7 | Qué pasa por encima del máximo | Los dos | Cotización con el proveedor (ya existe), no un estado nuevo del pedido |
| 8 | Si hay una devolución después de pagar al proveedor, ¿se descuenta de sus pagos siguientes? | Los dos, y entra en los términos | Sí, y escribirlo |
| 9 | Cotizar el envío real: Mipaquete o Envia.com, o esperar el convenio con Aveonline | Ivan (el convenio) | Mipaquete si Aveonline no trae API: es la única con documentación pública y cotiza por cantidad |
| 10 | Que los proveedores existentes acepten los términos al entrar | Los dos | Sí, con la tabla de aceptaciones |

---

## Fuentes

Consultadas el 2026-10-17.

**MercadoLibre**

- Envío ME2 y campos del ítem: https://developers.mercadolibre.com.co/en_us/mercadoenvios-mode-2
- Modos de envío: https://developers.mercadolibre.com.co/en_us/ship-products
- Dimensiones del paquete: https://developers.mercadolibre.com.co/en_us/items-shipping-attributes-and-dimensions
- Peso volumétrico (÷ 4.505) y cobro por venta: https://www.mercadolibre.com.co/ayuda/4420
- Límites de un paquete: https://www.mercadolibre.com.co/ayuda/dimensiones-maximas-permitidas-mexico_3163
- Tabla de costos (reputación verde): https://www.mercadolibre.com.co/ayuda/40538
- Costo por unidad: https://www.mercadolibre.com.co/ayuda/costos-envios-gratis_3287
- Envío gratis desde $60.000: https://www.mercadolibre.com.co/ayuda/16467
- Precio por cantidad (no en Colombia): https://developers.mercadolibre.com.co/es_ar/precio-por-cantidad
- APIs de costos (solo ítems publicados): https://developers.mercadolibre.com.co/en_us/management-of-shippin-fees
- Cuándo se libera el dinero: https://www.mercadopago.com.co/ayuda/cuando-usar-dinero-disponibilidad_275

**Airbnb**

- Cuándo se cobra: https://www.airbnb.com/help/article/85
- Cuándo se paga al anfitrión: https://www.airbnb.com/help/article/43
- Comisiones: https://www.airbnb.com/help/article/1857

**Pasarelas y transportadoras**

- Mercado Pago Split 1:1: https://www.mercadopago.com.co/developers/es/docs/split-payments/split-1-1/overview
- Requisitos y 1:N: https://www.mercadopago.com.co/developers/es/docs/split-payments/split-1-1/prerequisites
- Wompi Payouts: https://wompi.com/es/co/soluciones/payouts
- ePayco pagos divididos: https://docs.epayco.com/docs/split-descripcion
- BOLD: https://developers.bold.co/pagos-en-linea
- Mipaquete: https://api.documentacion.mipaquete.com/
- Envia.com: https://docs.envia.com/docs/faqs
- Aveonline: https://aveonline.co/servicios/integraciones/

**Normas**

- Decreto 1625 de 2016 (arts. 1.2.4.11, 1.6.1.4.9, 1.6.1.4.19): https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=83233
- Ley 1480 de 2011: http://www.secretariasenado.gov.co/senado/basedoc/ley_1480_2011_pr001.html
- Ley 2439 de 2024: http://www.secretariasenado.gov.co/senado/basedoc/ley_2439_2024.html
- Decreto 587 de 2016 (reversión): https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=69037
- SIC sobre Rappi (2019): https://www.sic.gov.co/Sic-ordena-a-Rappi-S.A.S.-cumplir-con-normatividad-de-comercio-electr%C3%B3nico-y-formula-pliego-de-cargos
- Sanciones a Rappi (2026): https://www.perezllorca.com/es-co/actualidad/boletin/sic-impone-sanciones-a-rappi/
