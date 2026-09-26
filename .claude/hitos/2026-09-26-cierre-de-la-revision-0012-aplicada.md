# La `0012` está aplicada y la compra quedó probada con una cuenta real

- **Fecha:** 2026-09-26
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `docs/js-cierre-revision-0012`
- **Fase del roadmap:** 1 y 2 — cierre de la revisión del 2026-09-26

Cierra lo que dejó abierto
[el hito de la tanda](2026-09-26-empresas-publican-compra-con-cuenta-y-categorias.md).

## Qué se hizo

- **Jesús aplicó la `0012`** en el editor SQL de Supabase, sobre producción
  con `v0.10.0` ya desplegada. Fue la primera migración con columnas nuevas que
  no obligaba a un orden: el código funcionó antes y funciona después.
- **Se probó una compra de punta a punta con una cuenta real.** La orden quedó
  guardada con su comprador, sus ítems y la tasa de comisión congelada. Era lo
  que el hito anterior dejaba como «lo primero que hay que hacer».

## Por qué así

Las dos decisiones que el hito anterior dejaba abiertas se cerraron hablando,
no con código:

- **El tope de giros por nivel queda como está** (Semilla 2, Raíz 3, Bosque
  todos). Lo confirmaron Ivan y Jesús; ya no es una propuesta.
- **El impacto ambiental se va a repensar.** Lo que hay —texto de lo que aporta
  y lo que cuesta, más la huella de CO₂— es un primer paso. Cómo se mide y cómo
  se presenta necesita un análisis aparte, y hasta entonces no se construye
  nada encima.

## Qué quedó pendiente

- **Las cinco `SMTP_*` en Vercel.** Es lo siguiente. Sin ellas no llega ningún
  correo de la aplicación: ni la bienvenida, ni el del pedido, ni el respaldo de
  una postulación.
- **El análisis del impacto ambiental**, ver arriba.
- De la tanda anterior siguen en pie: el stock se comprueba pero no se
  descuenta, cancelar una orden no devuelve el cupo, y las fechas de las
  experiencias las carga el equipo.

## Qué se rompe si tocas esto

Nada nuevo. Lo que vale es la sección homónima del hito de la tanda. Con la
`0012` aplicada en la única base que existe, `sondeo0012` en `src/lib/repo.ts`
responde «sí» siempre; se puede quitar cuando no quede ningún entorno sin ella.

## Verificación

Contra producción, el 2026-09-26, después de aplicar la migración:

- `/catalogo?category=agua`, `territorio` y `consultoria` devuelven ofertas: las
  categorías viejas se convirtieron.
- `limite_de_giros('raiz')` devuelve 3: las funciones de la `0012` existen.
- La consulta de solo lectura de las últimas órdenes devuelve la de la prueba,
  en `pending_payment`, con `buyer_id` puesto y su ítem.
