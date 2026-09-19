# El release `v0.6.0` sale a producción con la `0007` ya aplicada

- **Fecha:** 2026-09-19
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-comunidad-y-arreglos-de-beta` → #49 → `staging` → `main`
- **Fase del roadmap:** 1 y 2 — Comunidad en producción

Continúa a
[La Comunidad existe, y el registro deja de pedir la contraseña dos veces](2026-09-19-comunidad-y-ocho-observaciones-de-beta.md),
que se escribió con la migración todavía sin aplicar. **Ese hito sigue siendo
válido en todo lo demás**; lo único que caducó de él es su primer pendiente.

## Qué se hizo

**La `0007_comunidad.sql` se aplicó** el 2026-09-19 por el editor SQL del panel
de Supabase, **antes** de desplegar — el orden obligatorio, igual que con la
`0006`: el código consulta `community_posts`, y al revés `/comunidad`, la portada
y `/admin/comunidad` habrían respondido error. Desde que corrió es inmutable.

Con la base lista, el PR #49 entró a `staging` y de ahí a `main`, etiquetado
`v0.6.0`. Sube el `MINOR` porque entra una sección nueva del producto.

Entre el hito anterior y este hubo **una segunda ronda de observaciones, toda de
texto**, y está recogida en el mismo PR: los textos que la primera ronda dejó
«sin decir lo que no pasa» seguían sonando a ficha técnica. Se reescribieron los
encabezados y entradillas de `/comunidad`, la portada, `/catalogo`,
`/proveedores`, `/niveles`, `/vender` y `/verificacion`, más los dos correos de
postulación.

## Por qué así

**El release se etiqueta aunque la funcionalidad esté sin probar con datos
reales.** No hay navegador automatizado en este repositorio y la revisión visual
la hace una persona; esperar a tenerla probada para etiquetar dejaría producción
y `main` describiendo cosas distintas durante días, que es peor. Lo honesto es
etiquetar y **decir en `docs/ESTADO.md` qué no se ha probado**, que es lo que se
hizo.

**Se escribió un hito nuevo en vez de corregir el anterior.** Un hito no se edita
ni se borra: cuando se escribió, la `0007` estaba de verdad sin aplicar. Lo que
hace este es continuarlo.

**La segunda ronda de texto descubrió seis errores de hecho, no de estilo.** Al
repasar frase por frase aparecieron textos que seguían diciendo que el nivel sale
del puntaje de la evaluación de sostenibilidad — falso desde la `0006`, que
separó las dos cosas. Estaban en la entradilla de `/proveedores`, en dos pasos y
el párrafo de las dimensiones de `/verificacion`, y en los metadatos de tres
páginas. **Una revisión de redacción encontró lo que tres revisiones de código no
habían encontrado**, y conviene recordarlo: el texto visible es documentación del
modelo de negocio y caduca con él.

## Qué quedó pendiente

La lista con la que se retoma está en `docs/ESTADO.md`, sección «0. Cerrar lo que
quedó a medias de los `v0.5.0` y `v0.6.0`», con una tabla de quién puede hacer
qué. En resumen:

1. **Las cinco `SMTP_*` en Vercel** (solo Ivan). Viene arrastrándose desde el
   `v0.5.0`: sin ellas nadie recibe el correo de su postulación, y no hay error
   que lo delate.
2. **Probar el alta de proveedor en producción.** Nunca se ha ejecutado.
3. **Probar la Comunidad en producción**, y dentro de eso una cosa por encima de
   las demás: **reaccionar y quitar la reacción**. Si el contador no se mueve, la
   marca `app.derivados` no está funcionando y el fallo es silencioso.
4. **El OK de Ivan a la comisión 12/10/8 %**, pendiente desde el `v0.5.0`.
5. Lo que dejó abierto la Comunidad: paginación, imágenes, avisos al equipo,
   denuncia de una publicación y el tope de `articulo_publicado` — ninguno
   bloquea nada hoy, todos anotados en `ESTADO.md`.

## Qué se rompe si tocas esto

Lo de la Comunidad sigue igual que en el hito anterior y no se repite aquí. Lo
propio de un release:

- **`main` es producción.** El siguiente cambio no va directo: rama, PR contra
  `staging`, y de ahí un PR de release.
- **La etiqueta es lo que permite responder «qué había en producción el
  viernes».** Los merges de `staging` a `main` se ven todos iguales en el log.
  `git tag --points-at origin/main` vacío significa release sin etiquetar.
- **`docs/ESTADO.md` es el único documento que caduca**, y ahora dice
  `v0.6.0`. Quien cierre uno de los pendientes de arriba lo actualiza en el
  mismo PR.

## Verificación

```bash
npm run build      # ✅
npx tsc --noEmit   # ✅
npx eslint src     # ✅
```

CI en verde en el PR #49: `verificar`, `secretos` y los dos de Vercel.

Contra producción, después de desplegar:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://regenera-market.vercel.app/comunidad
#   200 = la tabla community_posts existe y RLS deja leer el muro vacío
curl -s -o /dev/null -w "%{http_code}\n" https://regenera-market.vercel.app/catalogo
#   200 = la 0007 no rompió nada de lo anterior
```

**Lo que esto NO prueba:** que publicar funcione, que los puntos de experiencia
se otorguen, ni que el contador de reacciones suba y baje. Eso necesita una
sesión real y está en la lista de pendientes.
