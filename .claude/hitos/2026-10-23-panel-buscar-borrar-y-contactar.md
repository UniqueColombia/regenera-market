# El panel busca, borra órdenes, postulaciones y cuentas, y «Contactar» enseña el correo real

- **Fecha:** 2026-10-23
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-panel-contactar-busqueda-borrar` (entrega directa, sin PR)
- **Fase del roadmap:** —

## Qué se hizo

**Contactar proveedores.** La planilla del prospector
(`outputs/prospectos-proveedores-2026-08-29.xlsx`) ya se importaba tal cual: se
probó y da 30 empresas con contacto (17 con correo), saltando 262 «descartar» y
7.063 sin correo ni teléfono. Lo nuevo:

- **El formato en blanco** se descarga desde el importador
  (`/api/plantilla-prospectos`, `src/lib/plantilla-prospectos.ts`).
- **La vista previa es el correo real**, con logo, botón y pie de baja: la arma
  el servidor con el mismo `correoDeCampana()` que lo envía
  (`vistaPreviaCorreo`, en un `iframe` sin permisos). Antes era solo el texto.
- **Botón «Correo» en cada fila**: deja esa empresa sola y abre el editor, con
  el texto ya redactado y editable.

**Buscadores** en Ofertas, Órdenes, Proveedores, Usuarios, Postulaciones,
Reseñas y Comunidad (Contactar ya tenía). `src/app/admin/buscador.tsx` es un
formulario GET (`?q=`); `src/lib/busqueda.ts` reúne `normalize()` y `patron()`,
que salieron de `repo.ts`, y `coincide()` para las listas que se cargan enteras.

**Eliminar** desde el panel, con el mismo botón (`src/app/admin/boton-eliminar.tsx`):

- **Órdenes**, solo las que nunca se cobraron (`ORDENES_BORRABLES`: esperando
  pago o canceladas) y sin fila en `pagos`. La que espera pago se cancela antes
  de borrarla, para que devuelva stock y cupo.
- **Postulaciones**, cualquiera: borra el formulario, no la empresa que creó.
- **Cuentas**, salvo la propia y la de un administrador.
  `admin_preparar_baja_de_usuario()` (nueva, en `rpc.ts`) aplica las reglas de
  la baja propia y la acción borra el usuario.

## Por qué así

- **Una orden cobrada no se borra.** Es el registro de la comisión, del pago al
  proveedor y de la plata que entró. La base ya lo impedía para las que tienen
  pago (`pagos_order_id_fkey`, `on delete restrict`); el panel ni lo ofrece.
- **Borrar una orden esperando pago sin cancelarla dejaba el stock descontado
  para siempre**: lo devuelve el trigger de la cancelación, no el `delete`.
- **La baja de una cuenta ajena reutiliza la propia** (`prepararBaja()`, que
  sale de `preparar_baja_de_cuenta`), en vez de copiar sus reglas.
  `cerrarMiEmpresa()` recibe ahora a la dueña para poder cerrar en su nombre.
- **No se borra a quien firmó revisiones** (postulaciones, evaluaciones,
  certificados): esas columnas no tienen `on delete`, y la base lo impediría
  después de haber cerrado su empresa. Se comprueba antes de tocar nada.
- **Al eliminar una cuenta desde el panel no se manda correo**: casi siempre es
  limpiar pruebas. Quien pide su baja la hace desde «Mi cuenta», que deja la
  constancia.
- **La búsqueda de órdenes no ignora tildes**: nombre, empresa y correo no
  tienen columna normalizada. Ofertas y proveedores sí (`busqueda`).

## Qué quedó pendiente

- `admin_preparar_baja_de_usuario` solo existe en el modo MySQL; en Supabase
  (ya retirado) no hay gemela.
- Las pruebas de la RPC nueva (`mysql/pruebas/funciones.test.ts`) corren en el
  CI; en el PC no hay MariaDB.

## Qué se rompe si tocas esto

- Los títulos de `plantilla-prospectos.ts` tienen que seguir en `ALIAS` de
  `prospectos.ts`, o el formato que se descarga deja de leerse. Lo comprueba
  `plantilla-prospectos.test.ts`.
- Esa planilla no lleva hoja «Ejemplo» con títulos: el importador lee todas las
  hojas y la importaría.

## Verificación

Build, `tsc`, `eslint` y `npm test` (107) en limpio; la planilla real se leyó
con el importador en una prueba temporal. Lo visual y los borrados, en el
navegador de Jesús.
