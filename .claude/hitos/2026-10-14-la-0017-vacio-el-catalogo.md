# La 0017 vació el catálogo: la vista congela su `*`

- **Fecha:** 2026-10-14
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `fix/js-vista-del-catalogo` (entrega directa)
- **Fase del roadmap:** — (corrección)
- Corrige lo que dejó [2026-10-14-fotos-excel-contactar-pagos-y-envios.md](2026-10-14-fotos-excel-contactar-pagos-y-envios.md)

## Qué se hizo

Al aplicar las migraciones 0016 a 0019 en producción, **la portada empezó a
responder 500, el catálogo salió vacío y las fichas dejaron de cargar**
(código de fallo `1867463543`, reportado por Jesús al entrar). Se arregló en el
código en minutos, y la migración 0020 recrea la vista para volver a encender
el envío por zona.

## Por qué pasó

`listings_publicos` es `select l.*, …` y **Postgres expande el `*` al crear la
vista**: las columnas que se agregan después a `listings` no aparecen en ella.
La 0012 y la 0014 lo sabían y recrearon la vista; la 0017 agregó seis columnas
y no lo hizo.

`enviosPorZonaDisponible()` preguntaba a la **tabla** si la columna existía, la
tabla dijo que sí, y `columnas()` se las pidió a la **vista**, que no las tenía:
`42703 column listings_publicos.envio_local_cop does not exist` en cada consulta
del catálogo. Los avisos `42703` que Jesús vio en el panel *antes* de aplicar
eran otra cosa, y esperada: el sondeo preguntando una vez por minuto.

**Ninguna prueba lo vio** porque ninguna consultaba la vista con las columnas
que pide `repo.ts`: las de la base prueban funciones y políticas, y en local se
probó contra producción cuando la 0017 todavía no estaba aplicada (el sondeo
decía «no» y no se pedían).

## El arreglo

1. **El sondeo pregunta a la vista** (`listings_publicos`), que es a quien se le
   piden las columnas. Si la vista no las tiene, el sitio sigue con la tarifa
   fija en vez de caerse. Esto solo devolvió el sitio sin tocar la base.
2. **0020** recrea la vista, igual que la 0014 (`drop` + `create`: las columnas
   nuevas quedan en medio de `l.*`, y `create or replace` solo agrega al final).
3. **`supabase/pruebas/vista-del-catalogo.test.ts`** compara las columnas que
   pide el código —ahora en `src/lib/columnas-ofertas.ts`, para poder
   importarlas— con las que tienen la vista, la tabla y `providers`. Se comprobó
   que **falla sin la 0020** (lista las seis columnas que faltan) y pasa con ella.

## Qué quedó pendiente

- [ ] **Aplicar la 0020.** Hasta entonces el envío por zona está apagado: el
      formulario no pregunta la tarifa local ni la de cada unidad, y todo se
      cobra con la tarifa fija (la `crear_orden()` de la 0017 da lo mismo
      mientras ninguna oferta tenga esos valores).

## Qué se rompe si tocas esto

- **Toda migración que agregue una columna a `listings` y quiera leerla en el
  catálogo tiene que recrear la vista.** La prueba nueva lo exige, siempre que
  la columna se agregue a `src/lib/columnas-ofertas.ts`, que es donde el código
  la pide.
- Un sondeo de migración pregunta **al mismo objeto al que después se le piden
  las columnas**, no a otro que «debería» tenerlas.

## Verificación

- `npm run build`, `tsc`, `eslint`, `npm test` (57) y `npm run test:base` (64).
- En local contra la base de producción (con la 0017 y sin la 0020): portada
  200, catálogo con sus 20 ofertas, ficha del Cacao Arhuaco con su título.
- En producción después del despliegue: lo mismo, más `/proveedores`,
  `/vender`, `/comunidad` y `/carrito` en 200.
