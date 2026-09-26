# Las empresas publican lo suyo, comprar exige cuenta y es una transacción, y el catálogo se agrupa por lo que resuelve

- **Fecha:** 2026-09-26
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-catalogo-ventas-animaciones` → PR contra `staging`
- **Fase del roadmap:** 1 y 2 — Bloque 4 (panel de proveedor) empezado, y compra endurecida

## Qué se hizo

Once observaciones de una revisión de uso, en una sola tanda:

1. **Panel de administración:** las pestañas de arriba se veían cortadas.
2. **Animaciones:** aviso al entrar y al salir, transición entre páginas (del
   catálogo a proveedores, por ejemplo), esqueletos de carga, entrada
   escalonada de tarjetas y confirmaciones animadas.
3. **Las empresas crean sus ofertas** desde `/cuenta/empresa/ofertas`:
   productos, experiencias y servicios. El equipo las revisa antes de publicar.
4. **Consultoría e implementación** es una categoría **avanzada**: solo la
   ofrece quien tiene el sello verificado por Seregenera.
5. **El giro de la empresa** (qué es y qué ofrece): se elige al darla de alta y
   se cambia en `/cuenta/empresa`. Cuántos giros caben depende del nivel.
6. **Comprar exige cuenta**, a nombre propio o de una empresa.
7. **El error de compra (`3014714994`)** y la confirmación «¡Listo! Compraste…»,
   con el pedido registrado, validado y sin duplicados.
8. **Impacto en las dos direcciones:** cada oferta declara lo que aporta y lo
   que cuesta al ambiente.
9. **Correo de bienvenida** al registrarse.
10. **Categorías nuevas** —Agua, Energía, Residuos, Habitación y hospitalidad,
    Gastronomía sostenible, Territorio y regeneración, Movilidad sostenible,
    Consultoría e implementación—, con subcategorías y una descripción que se
    lee al pasar por encima.
11. **Comunidad:** acceso rápido a los niveles y a cómo se gana cada punto.
12. **Verificación:** el sello pasa a llamarse **Green Watching** y la página
    explica que solo lo otorga Seregenera, tras un estudio y el pago de una
    licencia.

Todo lo que toca la base está en **`supabase/migrations/0012_ofertas_de_empresa_giros_y_compra_atomica.sql`**.

## Por qué así

### El error `3014714994`: lo que se sabe y lo que no

Ese número es el `digest` de Next: un error del servidor que salió de una
Server Action sin capturar. **No se pudo leer en los registros de Vercel**: la
cuenta de Jesús no ve el proyecto desde la API (`list_teams` devuelve vacío).

Lo que sí se comprobó:

- **La tabla `orders` estaba vacía** (consulta de solo lectura, 2026-09-26). O
  sea que la compra falló **antes o durante** el `insert`, no al pintar la
  confirmación: con una orden guardada, `/orden/…` la habría encontrado.
- **`saveOrder()` era el único sitio de toda la aplicación que usaba la clave de
  servicio en producción.** Si `SUPABASE_SERVICE_ROLE_KEY` está mal puesta en
  Vercel —con comillas, que es la trampa documentada en `docs/ESTADO.md`, o
  vencida—, lo único que se rompe es comprar, y nada más en el sitio lo delata.
  Es la hipótesis principal, **sin confirmar**.

En vez de adivinar, se cambió el diseño para que la pregunta deje de importar:
la compra ya no usa la clave de servicio (ver abajo), y si algo falla la
persona ve un **código de incidencia** que aparece en los registros como
`[checkout]` — el mismo patrón de `src/lib/incidencias.ts` que ya usaba el alta
de empresa.

### Comprar es `crear_orden()`, en Postgres

Antes: dos `insert` sin transacción, con la clave de servicio, sin descontar
cupo y sin idempotencia. Ahora una función `security definer` que en una sola
transacción crea la orden, sus ítems y **descuenta el cupo de las
experiencias** —la invariante 10 de `dominio-regenera`, anotada como la deuda
más peligrosa desde el principio—.

- **Los precios los calcula la función contra el catálogo.** Es lo que antes
  obligaba a usar la clave de servicio: RLS no sabe expresar «los totales los
  calculó mi código». Una función que recibe solo identificadores y cantidades
  sí lo sabe. Es el gemelo de `src/lib/pricing.ts`, como la 0006 lo es de
  `src/lib/niveles.ts`; `checkout()` compara los dos totales y apunta si
  divergen.
- **La idempotencia la da el `id` de la orden**, que genera el navegador una vez
  por cesta y reenvía en cada intento. Un doble clic o un reintento tras un
  corte de red devuelve la misma orden.
- **Se descartó** una columna `idempotency_key` aparte: el `id` ya es único y ya
  es un `uuid`, y una segunda llave es una segunda cosa que mantener.

### Comprar exige cuenta

Lo pidió la revisión, y además era lo que hacía falta para lo anterior: con
sesión, `buyer_id` sale de `auth.uid()` y no de un correo escrito a mano,
`/orden/…` se lee por RLS y no con la clave de servicio —la referencia deja de
ser la llave de los datos personales del comprador, que era el punto flojo
anotado en `src/lib/orders.ts`— y el pedido aparece en **«Tus pedidos»**
(`/cuenta#pedidos`).

La cesta **no** exige cuenta: vive en el navegador y se arma igual. Se pide al
confirmar, y se avisa antes en la ficha, en letra pequeña.

### El giro y el nivel

La revisión decía que para ofrecer turismo, alojamiento, restaurante,
transporte y tours a la vez, una empresa «debe ser Bosque». Se tradujo a un tope
de giros por nivel: **Semilla 2, Raíz 3, Bosque todos**. Los números son una
decisión de producto que **tiene que confirmar Ivan** en el PR; cambiarlos es
editar `GIROS_POR_NIVEL` en `src/lib/taxonomy.ts` y `limite_de_giros()` en la
0012 — los dos, o la pantalla ofrece lo que la base rechaza.

### El sello Green Watching es el que ya había

La revisión preguntaba si «Green Watching» era lo que ya existía como
verificación. Lo es: `providers.sustainability_verified_at`, que escribe
`sync_provider_score()` cuando un administrador aprueba la evaluación y que
`providers_proteger_derivados` impide escribir desde una sesión de proveedor.
No se creó un segundo sello. Lo nuevo es el nombre y la explicación del
proceso (estudio → licencia → sello), y que **la categoría y el giro de
consultoría exigen tenerlo**.

**No existe todavía el cobro de la licencia en la aplicación.** La página lo
explica; el pago se coordina por fuera, como el de las órdenes.

### Las ofertas de las empresas pasan por revisión

Con el alta directa (0006) una empresa entra sola; con esta tanda publica sola
también, pero **la publica el equipo**. El trigger `listings_proteger_proveedor`
impide que una empresa se apruebe, se destaque o mude una oferta a otra empresa
—`listings_provider_write` (0001) le dejaba escribir cualquier columna—, y
**editar una oferta publicada la devuelve a revisión**: lo revisado fue un texto
y unas cifras concretas. Es lo que sostiene la frase «cifras declaradas por el
proveedor y revisadas por nuestro equipo» del certificado del comprador.

### El código tolera que la 0012 no esté aplicada

Hasta ahora, una migración con columnas nuevas obligaba a aplicarla antes de
desplegar (la 0006 lo exigió). `src/lib/repo.ts` ahora **pregunta** si la 0012
está aplicada —una consulta barata, recordada— y, si no, lee las columnas de
antes. Sin ella el sitio funciona como hasta hoy: catálogo, fichas y compra por
el camino viejo (`saveOrder()`, ahora al menos idempotente). Lo que depende de
las columnas nuevas —publicar desde la empresa, el giro— falla con código de
incidencia sin tumbar nada más.

### Animaciones: `<ViewTransition>` de React, no una librería

Next 16 trae `ViewTransition` de React sin configurar nada. `src/app/template.tsx`
envuelve cada página —el layout no sirve: no se vuelve a montar al navegar— y
el encabezado queda fijo con su propio `view-transition-name`. Donde el
navegador no las soporta, la página entra con un fundido CSS. Todo respeta
`prefers-reduced-motion`. Se descartó `framer-motion`: una dependencia entera
para lo que el navegador ya hace.

El aviso de «entraste» / «saliste» va por una cookie de un minuto que deja la
acción y lee la pantalla siguiente. Un parámetro en la URL se habría quedado en
el historial y en el enlace que la persona copia.

## Qué quedó pendiente

- **Aplicar la 0012** en el editor SQL del panel de Supabase. Hasta entonces, las
  categorías nuevas salen vacías (las ofertas siguen con la etiqueta vieja), no
  se puede publicar desde la empresa y la compra va por el camino viejo.
- **Las `SMTP_*` en Vercel.** Sin ellas **ni el correo de bienvenida ni el del
  pedido le llegan a nadie**: se escriben en la consola del servidor. Es por lo
  que la revisión vio «solo llega el código»: ese lo manda Supabase con su
  propio SMTP. La bienvenida se marca como enviada **solo si salió por SMTP**,
  así que las cuentas de esta semana la recibirán en su próximo acceso con
  código cuando se pongan.
- **Confirmar la causa del `3014714994`** en los registros de Vercel (Ivan).
- **El stock se comprueba pero no se descuenta**, y **cancelar una orden no
  devuelve el cupo** que `crear_orden()` descontó. Hay que ajustarlo a mano
  desde la base hasta que exista esa acción.
- **Las fechas con cupo de una experiencia** siguen sin pantalla: las carga el
  equipo. El formulario de la empresa lo dice.
- **El cobro de la licencia del sello** se coordina por fuera.
- **Un aviso al equipo cuando una empresa manda una oferta a revisión.** Hoy hay
  que mirar `/admin/ofertas`.

## Qué se rompe si tocas esto

- **`crear_orden()` y `src/lib/pricing.ts` calculan lo mismo en dos lenguajes.**
  Precio mayorista, comisión por nivel, redondeo al peso, cotizaciones fuera. Si
  cambias uno, cambia el otro; `[checkout] total distinto` en los registros es
  la señal de que divergieron.
- **`comision_para_nivel()` es el tercer gemelo de la comisión** (con
  `NIVELES[].comision` y `COMISION_POR_NIVEL`).
- **`listings.category` guarda el `id`** («agua»), no la etiqueta. La etiqueta
  se pinta con `categoriaLabel()`, que devuelve el valor tal cual si no lo
  conoce.
- **`IconoCategoria` y no `const Icono = TABLA[id]`**: lo segundo es crear un
  componente durante el render para el compilador de React, y `eslint` lo
  rechaza.
- **`sondeo0012` en `repo.ts`**: cuando todas las bases tengan la 0012, se puede
  quitar junto con las columnas «base». No antes.
- **El trigger `providers_limitar_giros` lee el nivel viejo (`old.tier`)**, a
  propósito: `providers_proteger_derivados` corre después por orden alfabético.

## Verificación

- `npm run build`, `npx tsc --noEmit` y `npx eslint src scripts`: en limpio.
- En local contra la base real **sin** la 0012: portada, catálogo (con y sin
  categoría), proveedores, Comunidad, vender, cesta y verificación responden
  200; `/admin` y `/orden/…` sin sesión redirigen a `/entrar`. El servidor avisa
  una vez `[repo] la migración 0012 no está aplicada`.
- **No se probó una compra de punta a punta**: crear una orden de prueba en la
  base de producción se descartó sin el visto bueno de su dueño. Queda como lo
  primero que hay que hacer después de aplicar la 0012.
- **La revisión visual la hace quien usa el sitio**: las animaciones, el menú
  de categorías y las descripciones flotantes no se comprobaron en un
  navegador.
