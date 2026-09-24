# Niveles y experiencia

Por qué el nivel de un proveedor dejó de salir de la evaluación de
sostenibilidad, cómo se gana ahora y qué hay que respetar al tocarlo.

Este documento explica el **porqué y las trampas**. Los valores viven en dos
sitios que son gemelos y hay que mantener de acuerdo:

| Dónde | Qué manda |
|---|---|
| `supabase/migrations/0006_niveles_por_experiencia_y_alta_directa.sql` | Los **umbrales**, y de dónde salió todo esto |
| `supabase/migrations/0011_limites_y_puntos_mas_caros.sql` | **Manda** en los puntos por evento y en los topes: reemplaza `otorgar_experiencia()` |
| `src/lib/niveles.ts` | El espejo en TypeScript, para poder explicarlo en pantalla sin una consulta extra |
| `src/app/niveles/page.tsx` | La página pública. No tiene ni un número escrito a mano: todo sale de `niveles.ts` |

---

## Lo que cambió

Hasta la migración 0005, un proveedor llegaba por `/vender`, su postulación
quedaba en `pending_review` y un administrador la aprobaba a mano. Su nivel
(`tier`) salía del puntaje de la evaluación de sostenibilidad: mientras nadie
aprobara el cuestionario era `unverified`, y así no aparecía en ningún filtro
del catálogo.

Eso convertía a Seregenera en un portero. Nadie entraba hasta que alguien del
equipo revisara, y el coste no era solo la espera: **el equipo se volvía el
cuello de botella de su propio crecimiento**, justo en la fase en la que lo
único que importa es que haya oferta.

Desde la 0006:

1. **Quien postula con sesión queda dado de alta en el acto** — empresa creada,
   vínculo de dueño y rol, todo en una transacción.
2. **El nivel se gana con actividad.** Todos nacen en Semilla y publican el mismo
   día. Publicar, vender, entregar, recibir buenas reseñas y aprobar la
   evaluación suman puntos de experiencia, y los puntos mueven el nivel.
3. **La comisión baja con el nivel**: 12 % → 10 % → 8 %.
4. **La evaluación de sostenibilidad sigue existiendo**, es lo que más puntos da
   y otorga un sello propio que **no es** el nivel.

El control no desapareció: **dejó de ser una puerta y pasó a ser una palanca.**
Cualquiera entra, y un administrador puede suspender — que es reversible y no
bloquea a nadie mientras tanto.

---

## Los tres niveles

| Nivel | Desde | Comisión |
|---|---|---|
| Semilla | el día 1 | 12 % |
| Raíz | 600 puntos | 10 % |
| Bosque | 2.500 puntos | 8 % |

`unverified` sigue existiendo en el `enum` de Postgres por las filas anteriores a
la migración. **`nivel_para_puntos()` no lo devuelve nunca** y ningún proveedor
nuevo lo tiene.

### El nivel no se puede poner a mano

`sync_tier_por_experiencia()` es un trigger `before insert or update of
experience_points, tier`: reescribe `tier` con el valor derivado de los puntos.
Un `update providers set tier = 'bosque'` se pisa solo, **incluso con la clave de
servicio**.

Para subir a alguien se le dan puntos, y para eso está `otorgar_experiencia()`.
Es `security definer` y no tiene permiso para `anon` ni `authenticated`: se
invoca desde los triggers, o a mano contra la base con un rol privilegiado.

```sql
-- Dar puntos a mano (por ejemplo, para compensar algo que pasó fuera de la
-- plataforma). Queda apuntado en experience_events como todo lo demás.
select otorgar_experiencia('<uuid del proveedor>', 'venta_entregada', 'ajuste-2026-09');
```

La `referencia` es lo que lo hace idempotente: el índice único
`(provider_id, clave, coalesce(referencia, ''))` impide sumar dos veces el mismo
hecho. Los eventos que solo pueden pasar una vez en la vida —`primera_venta`,
`perfil_completo`, `evaluacion_aprobada`— van **sin** referencia.

---

## Por qué los puntos no bajan

Un sistema que resta por inactividad castiga al taller que produce por temporada,
que es justo a quien esta plataforma existe para incluir. Y obliga a explicarle a
un proveedor —con un cliente suyo delante— por qué «bajó de nivel».

El nivel sube y se queda. Si algún día hace falta distinguir «activo» de «lo
fue», eso es **otra señal**, no este número.

---

## El nivel y el sello son cosas distintas

| | Nivel | Sello de evaluación verificada |
|---|---|---|
| De dónde sale | `experience_points` | Evaluación aprobada por un administrador |
| Qué columna | `providers.tier` | `providers.sustainability_verified_at` |
| Qué mide | Oficio: publicar, entregar, cumplir | Sostenibilidad, con evidencia revisada |
| Qué otorga | Menos comisión, mejor orden en el catálogo | El distintivo público y 250 puntos |

Se pueden tener por separado y **se muestran por separado a propósito**
(`/proveedor/[slug]` tiene una tarjeta para cada uno). Un proveedor puede llegar
a Bosque vendiendo mucho sin haber pasado la evaluación: tendrá el nivel y no
tendrá el sello.

`PUNTAJE_MINIMO_SELLO` (`src/lib/sustainability.ts`) es el criterio con el que el
equipo aprueba, y es una promesa pública de `/verificacion` — **no lo impone la
base**: quien aprueba es un administrador y el trigger marca el sello mire el
número que mire.

---

## Dónde lo ve el proveedor

`/cuenta/empresa`, desde la `0008`. Tres cosas en una pantalla: en qué nivel
está, cuánto le falta para el siguiente y **cuánto bajaría su comisión al
llegar**, y el historial de `experience_events` línea por línea.

El historial no es adorno: es la invariante 14 de `dominio-regenera` —el puntaje
tiene que poder seguirse punto por punto— puesta donde la ve el interesado.
Hasta entonces los eventos se apuntaban y no había dónde mirarlos, así que el
nivel era un número que subía solo, que es la forma más rápida de que se lea
como arbitrario.

Los eventos con una clave que `EXPERIENCIA` no conoce se muestran igual.
`migracion_0006` acreditó a cada proveedor el nivel que ya tenía cuando el modelo
cambió; esconderlo haría que la suma de la lista no cuadrara con el total, que es
justo lo que una auditoría tiene que poder comprobar.

`/niveles` sigue siendo otra cosa y no sobra: explica el sistema a quien todavía
no está dentro.

---

## Si hay que tocar algo

### Cambiar cuántos puntos da un evento

Se cambia en **los dos sitios**: el `case` de `otorgar_experiencia()` y la tabla
`EXPERIENCIA` de `src/lib/niveles.ts`. Si divergen, la pantalla le promete al
proveedor puntos que la base no le da, y lo va a notar antes que nosotros.

Los puntos ya otorgados **no se recalculan**: `experience_events` guarda los
puntos con los que se anotó cada hecho. Es lo correcto — cambiar la regla no
puede reescribir el pasado de nadie.

### Cambiar un umbral o una comisión

Umbral: `nivel_para_puntos()` y `NIVELES[].minPuntos`. Después hay que forzar el
recálculo de las filas existentes, porque el trigger solo corre al escribir:

```sql
update providers set experience_points = experience_points;  -- dispara el trigger
```

Comisión: `NIVELES[].comision` y nada más — la comisión no vive en la base. **Las
órdenes ya emitidas no cambian**: `order_items.commission_rate` congela la tasa
que se aplicó, que es lo que permite auditar una orden de hace seis meses
(invariante 2 y 6 de `dominio-regenera`).

### Agregar un cuarto nivel — la trampa del enum

`tier` es un `enum` de Postgres creado en `0001_init.sql`. Agregarle un valor y
usarlo **no cabe en la misma migración**: Postgres rechaza usar un valor de enum
dentro de la transacción en la que se agregó, y `nivel_para_puntos()` es una
función `language sql`, cuyo cuerpo sí se valida al crearla. En el editor SQL de
Supabase, que envuelve el script entero en una transacción, falla siempre. El
síntoma es

```
ERROR: unsafe use of new value "<nuevo>" of enum type tier
```

Así que son dos archivos, en dos corridas:

1. `00NN_nivel_nuevo_enum.sql` — solo
   `alter type tier add value if not exists '<nuevo>';`
2. `00NN+1_nivel_nuevo.sql` — el nuevo `case` de `nivel_para_puntos()`, y el
   `update providers set experience_points = experience_points;` que recalcula.

Y después `NIVELES` en `src/lib/niveles.ts`, que es lo único que hay que tocar en
el código: `nivelParaPuntos()`, `nivelesDesde()` y `/niveles` salen de esa tabla.

**No se hizo con cinco niveles a propósito.** Tres escalones con una diferencia
real de comisión comunican mejor que cinco casi iguales.

---

## El alta directa

`postular_proveedor()` (sección 7 de la migración) hace todo el alta en una
transacción: postulación, `providers`, `provider_members` y `user_roles`. Está en
Postgres y no en la Server Action porque son cuatro escrituras que tienen que
pasar juntas o ninguna — un fallo en la tercera dejaría **una empresa sin dueño**,
y sin `provider_members` la función `manages_provider()` devuelve falso y el
proveedor no puede tocar nada de lo suyo, sin que el síntoma apunte a la causa.

Devuelve json para que `/vender` pueda decir la verdad en vez de un «recibido»:

```json
{ "application_id": "…", "activado": true,  "provider_slug": "…" }
{ "application_id": "…", "activado": false, "motivo": "sin-sesion" }
```

**`activado: false` no es un fallo.** Quien postula sin cuenta deja la postulación
guardada en `pending_review` y recibe un correo que le pide registrarse con ese
mismo correo; el camino viejo —que un administrador la apruebe desde
`/admin/postulaciones`— sigue existiendo y es el que atiende esos casos.

Quien ya es dueño de una empresa no crea otra: la postulación se enlaza a la que
ya tiene. Sin eso, mandar el formulario dos veces deja a la misma persona con dos
fichas en el catálogo.

---

## Lo que el proveedor no puede escribir

**Desde la migración `0008`, y antes sí podía.** `providers_member_update` (de la
`0001`) dice `for update using (manages_provider(id))`, y una política de
Postgres **no distingue columnas**: quien gestiona una empresa podía actualizar
la fila entera, incluida `experience_points`. Como el nivel sale de ahí y la
comisión sale del nivel, con la clave anon —que es pública por diseño— y una
sesión normal de proveedor se pasaba del 12 % al 8 %. No hacía falta ninguna
clave privada.

Lo cierra el trigger `providers_proteger_derivados`, que devuelve a su valor
anterior `experience_points`, `tier`, `sustainability_score`,
`sustainability_verified_at`, `status` y `slug` cuando quien escribe es una
sesión normal. Dos detalles que hay que saber antes de tocarlo:

- **Distingue por `current_user`, no por una marca de transacción.** Una sesión
  del sitio llega como `anon` o `authenticated`; la propia base
  (`otorgar_experiencia()`, `sync_provider_score()`) y las tareas con la clave de
  servicio llegan con otro rol y pasan. Eso es lo que evitó tener que reescribir
  las funciones de la `0006`.
- **Por eso no es `security definer`.** Dentro de una, `current_user` sería
  siempre el dueño de la función y la comprobación no valdría nada.

Si algún día hay un panel donde el proveedor edite su ficha, **esas seis columnas
no entran en el formulario**. No porque el trigger las vaya a rechazar —las va a
rechazar— sino porque un formulario que manda campos que la base deshace en
silencio es un formulario que miente.

---

## Lo que todavía no está

- **El proveedor no edita el resto de su ficha.** Descripción, titular, ubicación
  y contacto siguen saliendo de la postulación y corrigiéndose desde
  administración. Consecuencia práctica: una empresa cuya postulación viniera
  corta **no puede llegar a los 40 puntos de `perfil_completo` hoy**, porque el
  trigger exige titular y descripción con sustancia y no hay dónde escribirlos.
- **`cotizacion_respondida` no lo dispara nadie todavía**: no hay pantalla de
  respuesta a cotización. Los puntos están definidos; el hecho que los otorga,
  no. Es el mismo caso que tuvieron `articulo_publicado` (resuelto por la `0007`)
  y `perfil_completo` (resuelto por la `0008`).
- ✅ **El tope de `articulo_publicado` ya existe** (migración 0011): 4 al mes, y
  la publicación vale 10 puntos en vez de 30. Lo que se cerró con eso está en la
  sección siguiente.

---

## El recorte del 2026-09-24 (migración 0011)

### Qué estaba roto

La tabla original era demasiado generosa, y con la Comunidad en producción se
volvió explotable sin mala intención: `articulo_publicado` daba **30 puntos sin
tope**, así que nueve publicaciones en una tarde eran 270. Con el perfil completo
(80) y diez ofertas (250) se llegaba a los 600 de Raíz **sin haberle vendido nada
a nadie**. Raíz son dos puntos menos de comisión: el agujero no era de
reputación, era de dinero.

### El criterio

**Lo que se hace solo vale menos; lo que exige que otro te compre vale más.**

| clave | antes | ahora | tope |
|---|---|---|---|
| `perfil_completo` | 80 | **40** | una vez |
| `oferta_publicada` | 25 | **10** | 5 al mes (antes 10) |
| `primera_venta` | 150 | **120** | una vez |
| `venta_entregada` | 50 | **40** | — |
| `volumen_vendido` | 10 / 200.000 | 10 / **500.000** | 50 tramos por orden |
| `resena_positiva` | 40 | **30** | — |
| `cotizacion_respondida` | 15 | **5** | **10 al mes** (antes ninguno) |
| `evaluacion_aprobada` | 300 | **250** | una vez |
| `certificacion_verificada` | 100 | **80** | 3 en total |
| `articulo_publicado` | 30 | **10** | **4 al mes** (antes ninguno) |
| `articulo_destacado` | 80 | **50** | — |

El mismo esfuerzo de antes —perfil, diez ofertas, nueve publicaciones— da ahora
130 puntos en vez de 600, porque además los topes mensuales cortan a 5 ofertas y
4 publicaciones.

### Lo que NO se tocó, y por qué

- **Los umbrales.** Raíz sigue en 600 y Bosque en 2.500. Subirlos habría hecho
  **caer de nivel** a quien ya lo tiene, y el nivel es la comisión que esa
  empresa tiene pactada de hecho. Lo que se encarece es ganar los puntos.
- **Los puntos ya otorgados.** `experience_events` es el registro de lo que
  pasó; reescribirlo sería mentir sobre el pasado. Quien ganó 30 por una
  publicación de agosto los ganó. Ningún proveedor cambia de nivel con esta
  migración.
- **`articulo_destacado` se quedó sin tope**, y no es un olvido: lo pulsa el
  equipo desde `/admin/comunidad`, así que el tope somos nosotros.

### El otro lado del mismo problema

Encarecer el evento no basta si el evento se puede repetir a máquina. La misma
migración pone límites de ritmo en la Comunidad —30 segundos entre
publicaciones, 3 al día, 10 al mes, 60 reacciones por hora— con dos triggers
`before insert`. Están en la base y no en la Server Action por lo de siempre: la
clave anon es pública, así que un límite escrito en TypeScript se salta con
`curl`.
