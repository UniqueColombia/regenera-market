# Niveles y experiencia

Por qué el nivel de un proveedor dejó de salir de la evaluación de
sostenibilidad, cómo se gana ahora y qué hay que respetar al tocarlo.

Este documento explica el **porqué y las trampas**. Los valores viven en dos
sitios que son gemelos y hay que mantener de acuerdo:

| Dónde | Qué manda |
|---|---|
| `supabase/migrations/0006_niveles_por_experiencia_y_alta_directa.sql` | **Manda.** Umbrales, puntos por evento y topes |
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
| Qué otorga | Menos comisión, mejor orden en el catálogo | El distintivo público y 300 puntos |

Se pueden tener por separado y **se muestran por separado a propósito**
(`/proveedor/[slug]` tiene una tarjeta para cada uno). Un proveedor puede llegar
a Bosque vendiendo mucho sin haber pasado la evaluación: tendrá el nivel y no
tendrá el sello.

`PUNTAJE_MINIMO_SELLO` (`src/lib/sustainability.ts`) es el criterio con el que el
equipo aprueba, y es una promesa pública de `/verificacion` — **no lo impone la
base**: quien aprueba es un administrador y el trigger marca el sello mire el
número que mire.

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

## Lo que todavía no está

- **El proveedor no ve sus puntos.** `progresoDe()` existe en `niveles.ts` para
  pintar la barra, y la pantalla que la use es el panel de proveedor (Bloque 4).
  Hoy los puntos solo se ven en `/proveedor/[slug]` como un número.
- **La Comunidad no existe**, así que `articulo_publicado` y
  `articulo_destacado` están en la base pero `/niveles` los oculta (`AUN_NO` en
  `src/app/niveles/page.tsx`). El día que exista, se borra esa lista.
- **`perfil_completo` y `cotizacion_respondida` no los dispara nadie todavía**:
  no hay pantalla de perfil ni de respuesta a cotización. Los puntos están
  definidos; el hecho que los otorga, no.
