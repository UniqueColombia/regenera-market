# Eliminar la cuenta y cerrar la empresa

- **Fecha:** 2026-10-14
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-baja-de-cuenta-y-empresa` (entrega directa)
- **Fase del roadmap:** — (lo prometía la política de privacidad)

## Qué se hizo

Una persona puede **eliminar su cuenta** desde el final de «Tu cuenta»
(`/cuenta`), con su contraseña, y **cerrar su empresa** desde el final de «Tu
empresa» (`/cuenta/empresa`), escribiendo su nombre. Después de cerrar la
empresa puede dar de alta otra. Migración **0021**: la columna
`providers.cerrada_at` y las funciones `cerrar_mi_empresa()` y
`preparar_baja_de_cuenta()`.

## Por qué así

**Si hay alguien esperando algo, no se puede** (decisión de Jesús). La empresa
no se cierra con un pedido suyo sin pagar, pagado o en preparación, ni con una
cotización abierta a sus ofertas; la cuenta, igual con sus propios pedidos y
cotizaciones. Primero se cumple o se cancela. La primera versión cancelaba
sola los pedidos sin pagar del comprador; se cambió a bloquear, que es lo que
pidió Jesús y lo que no le hace nada a nadie por sorpresa.

**Una empresa que vendió se cierra, no se borra.** Sus ítems vendidos la
referencian y la base no deja borrarla, con razón: sin ella no se puede
auditar, liquidar ni facturar. Cerrada sale del sitio (`suspended`, ofertas a
borrador), nadie la gestiona y queda con `cerrada_at`. **Sin ventas ni
cotizaciones se borra entera**, con sus fotos. En los dos casos se quita el
vínculo de la persona, y eso es lo que la deja crear otra: la regla «una
persona, una empresa» de `postular_proveedor()` mira `provider_members`.

**Una cuenta se borra, sus pedidos no.** `orders.buyer_id` es `on delete set
null` desde la 0001: el pedido queda con nombre, correo y documento congelados,
como exige la ley contable y como ya decía la política. Lo demás cae en
cascada al borrar el usuario.

**Las reseñas se ocultan antes de borrarse**, porque borrar una no tiene
trigger y dejaría al vendedor con sus puntos; ocultarla los revierte
(invariante 30).

**La contraseña, no un clic.** Con la sesión abierta en un computador prestado,
cualquiera llegaría al botón. Se comprueba con el cliente efímero, sin tocar
cookies, como al cambiarla.

**El usuario lo borra la API de administración de Supabase**, no una función
de la base: es la forma que Supabase sostiene, y la que cierra también las
sesiones abiertas en otros aparatos. Es el único paso con clave de servicio,
junto con borrar las fotos de Storage (cuando corre, las políticas de Storage
ya no le reconocen dueño a nadie).

**Un administrador no se puede dar de baja así**: otro le quita el rol
primero. Evita quedarse sin administración.

## Qué quedó pendiente

- [ ] **Aplicar la 0021.** Sin ella las dos secciones no aparecen.
- [ ] **No se probó de punta a punta con una cuenta real**: haría falta crear y
      borrar una cuenta en producción. Lo de la base está probado
      (`supabase/pruebas/baja.test.ts`, 11 casos); la acción (contraseña, API de
      administración, Storage) no. La primera prueba conviene hacerla con una
      cuenta de prueba creada para eso.
- [ ] Una empresa cerrada queda en `/admin/proveedores` como suspendida, sin
      decir que la cerró su dueña. Si el equipo la «aprueba», vuelve al
      catálogo sin nadie que la gestione.
- [ ] Cerrar y volver a abrir con el mismo NIT es posible (no hay unicidad del
      NIT). La empresa nueva empieza de cero —nivel, puntos, reseñas—, así que
      no es una ventaja; pero sí una forma de dejar atrás reseñas malas.

## Qué se rompe si tocas esto

- `cerrada_at` **no se agrega a `src/lib/columnas-ofertas.ts`** mientras nadie
  la pinte: pedirla sin la 0021 rompería cada consulta de proveedores (lo que
  pasó con la 0017). `bajaDisponible()` pregunta por ella aparte.
- `preparar_baja_de_cuenta()` no borra el usuario: si se cambia el orden de
  `eliminarMiCuenta()` (borrar antes de preparar), las reseñas se irían sin
  revertir sus puntos y una empresa con pedidos pendientes quedaría sin nadie.
- Los estados de cotización que cuentan como terminados son una lista
  (`accepted`, `declined`, `cancelled`, `expired`). Un estado nuevo bloquea por
  defecto; si se agrega uno terminado, va en esa lista, en las dos funciones.

## Verificación

- `npm run build`, `tsc`, `eslint`, `npm test` (57) y `npm run test:base` (75).
- Las pruebas de la base cubren: solo la dueña cierra; sin ventas se borra con
  sus ofertas y el rol; con ventas terminadas se cierra, sale del sitio y lo
  vendido queda; con una venta en curso o una cotización abierta no se puede y
  no cambia nada; después de cerrar, la misma persona da de alta otra; un
  administrador no puede; con un pedido sin pagar, pagado o en preparación no
  se puede; con una cotización abierta no se puede; con todo terminado se
  puede y, al borrar el usuario, el pedido se queda sin dueño y con su correo;
  sus reseñas quedan ocultas y su empresa sin ventas, borrada.
- En local contra producción (sin la 0021): portada, catálogo (20 ofertas),
  ficha, `/privacidad` con el texto nuevo, en 200.
