# El proveedor entra solo, y el nivel se gana con actividad

- **Fecha:** 2026-09-17
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-niveles-por-experiencia` → #46
- **Fase del roadmap:** 1 y 2 — cambia el alta del proveedor y el origen del nivel

## Qué se hizo

Quien manda el formulario de `/vender` con sesión abierta **queda dado de alta en
el acto**: `postular_proveedor()` crea la empresa, el vínculo de dueño y el rol
en una sola transacción, y puede publicar el mismo día. Sin sesión, la
postulación se guarda en `pending_review` y `/admin/postulaciones` sigue siendo
el camino para esas.

El **nivel deja de salir de la evaluación de sostenibilidad**. Ahora se deriva de
`providers.experience_points`, que suben con hechos —publicar, vender, entregar,
recibir reseñas, aprobar la evaluación— anotados uno por uno en
`experience_events`. Semilla → Raíz (600) → Bosque (2.500), y **la comisión baja
con el nivel**: 12 / 10 / 8 %.

Con eso entraron: `src/lib/niveles.ts` (el gemelo en TypeScript de la tabla de
Postgres), la página `/niveles`, `src/lib/correo/` con el respaldo de la
postulación por SMTP, `src/lib/paises.ts` para que el formulario deje de ser
colombiano, y la separación visible entre el **nivel** y el **sello de evaluación
verificada** en la portada, en `/verificacion` y en la ficha del proveedor.

La migración es `0006_niveles_por_experiencia_y_alta_directa.sql`, y de paso
cierra tres agujeros de RLS que venían de `0001`: `providers_insert` permitía a
cualquiera con cuenta meter una empresa **aprobada** en el catálogo,
`quotations_insert` dejaba cotizar a nombre de otra persona, y `quotation_items`
no tenía política de inserción.

## Por qué así

**El equipo era el cuello de botella de su propio crecimiento.** Nadie entraba al
catálogo hasta que alguien revisara, y el nivel dependía de un cuestionario de 16
preguntas que casi nadie iba a llenar el primer día. El control no desapareció:
dejó de ser una puerta y pasó a ser una palanca — cualquiera entra y un
administrador puede suspender, que es reversible y no bloquea a nadie mientras
tanto.

**El alta vive en Postgres y no en la Server Action.** Son cuatro escrituras que
tienen que pasar juntas o ninguna (postulación, `providers`, `provider_members`,
`user_roles`). Desde el código serían cuatro llamadas sin transacción, y un fallo
en la tercera deja una empresa sin dueño: sin `provider_members`,
`manages_provider()` devuelve falso y el proveedor no puede tocar nada de lo suyo
sin que el síntoma apunte a la causa. Era el cabo suelto que ya estaba anotado en
[la migración a Postgres](2026-09-11-la-migracion-a-postgres-dejo-dos-cabos-sueltos.md).

**El nivel lo escribe un trigger.** `tier` se lee desde el catálogo público; si lo
escribiera la aplicación, bastaría un camino que se olvidara de hacerlo para
dejar el filtro mintiendo y nada lo detectaría. Efecto colateral buscado: ya no
se puede poner un nivel a mano ni con la clave de servicio. Para subir a alguien
se le dan puntos.

**Los puntos no bajan nunca.** Restar por inactividad castiga al taller que
produce por temporada —justo a quien esta plataforma existe para incluir— y
obliga a explicarle a un proveedor, con un cliente suyo delante, por qué «bajó de
nivel». Si algún día hace falta distinguir «activo» de «lo fue», eso es otra
señal y no este número.

**La evaluación de sostenibilidad no se tocó, se separó.** Sigue siendo lo que
más puntos da (300) y es lo único que otorga el sello. Un proveedor puede llegar
a Bosque vendiendo sin haberla pasado: tendrá el nivel y no tendrá el sello. Las
invariantes 13, 14 y 15 de `dominio-regenera` siguen en pie — cambió **qué mueve
el `tier`**, no quién escribe el puntaje.

**`order_items` guarda la tasa aplicada, no solo el monto.** La tasa depende del
nivel y el nivel sube con el tiempo: recalcularla contra el nivel de hoy daría un
número distinto del que se cobró, y una orden de hace seis meses sería imposible
de auditar.

**Se descartaron tres cosas**, y conviene que consten:

- **Cinco niveles en vez de tres.** `tier` es un `enum` de Postgres y agregar
  valores obliga a partir la migración en dos archivos (ver `docs/NIVELES.md`).
  Se puede; no se hizo porque tres escalones con una diferencia real de comisión
  comunican mejor que cinco casi iguales.
- **Calcular los puntos en la aplicación.** Un evento de experiencia nace de un
  hecho de la base y tiene que apuntarse en la misma transacción, o se pierde el
  día que una ruta falle a mitad y nadie se entera hasta que un proveedor
  reclame.
- **Un captcha en `/vender`.** El formulario lleva campo trampa y umbral de
  tiempo, que frenan al robot genérico sin pedirle nada a nadie. Lo que de verdad
  importa —que nadie lea postulaciones ajenas— lo impide RLS, y un captcha le
  habría puesto un peaje de Google a una cooperativa que llega desde un enlace.

## Qué quedó pendiente

- **La migración no está aplicada en ningún entorno.** Es el punto 0 de «Lo que
  sigue» de `docs/ESTADO.md`, y **va antes** de desplegar este código: `/vender`
  llama a una función que todavía no existe.
- **Las cinco `SMTP_*` no están en Vercel.** Sin ellas el correo de respaldo se
  escribe en la consola del servidor y nadie lo recibe, sin ningún error que lo
  delate.
- **El proveedor no ve sus puntos.** `progresoDe()` existe para pintar la barra;
  la pantalla que la use es el panel de proveedor (Bloque 4).
- **`perfil_completo` y `cotizacion_respondida` no los dispara nadie**: los
  puntos están definidos, el hecho que los otorga no existe todavía.
- **Los dos eventos de la Comunidad están en la base y ocultos en `/niveles`**
  (`AUN_NO` en `src/app/niveles/page.tsx`), porque la Comunidad no existe y
  prometer puntos por publicar en un sitio donde no se puede publicar es prometer
  de más.
- **Los 13 proveedores sembrados se quedan con el `tier` que ya tenían** hasta
  que algo escriba sus puntos. `scripts/seed.mts` no escribe ni `tier` ni
  `experience_points` a propósito.

## Qué se rompe si tocas esto

- **`src/lib/niveles.ts` y la migración 0006 son gemelos.** Umbrales, puntos por
  evento y topes están escritos en los dos. Manda la base; el de TypeScript
  existe para poder explicarlo en pantalla sin una consulta. Si divergen, la
  pantalla le promete al proveedor puntos que nunca le llegan.
- **`searchListings` filtra por `provider_tier` y ya no por `provider_score`.**
  Eran lo mismo mientras el nivel salía del puntaje; comparar contra
  `TIERS[x].min` ahora mezcla dos escalas. Por eso `TIERS` perdió el campo `min`:
  un número a mano que ya no manda es lo que hace que alguien vuelva a filtrar
  por él.
- **`priceLine()` necesita el nivel del proveedor.** Quien valorice un carrito
  tiene que resolverlo antes con `getProviderTiers()`. Si se le pasa `undefined`
  se cobra la tasa base, que es la más alta — deliberado: ante la duda, se cobra
  de más.
- **`otorgar_experiencia()` no tiene política de inserción y no se le dio
  `execute` a nadie.** Si se le concede a `authenticated`, un proveedor puede
  regalarse experiencia contra PostgREST y bajarse la comisión él solo. Es
  dinero, no una medalla.
- **La idempotencia de los puntos la da la `referencia`**, con el índice único
  `(provider_id, clave, coalesce(referencia, ''))`. Un evento repetible sin
  referencia solo se puede otorgar una vez en la vida del proveedor; uno que
  debía ocurrir una sola vez con referencia se otorga tantas veces como
  referencias distintas lleguen.
- **`src/lib/correo/` solo se importa desde el servidor.** Arrastra `nodemailer`,
  que usa `net`, `tls` y `dns`; un `"use client"` que lo importe rompe la
  compilación con un error que habla de `fs` y no de esto.

## Verificación

```
npm run build     OK
npx tsc --noEmit  OK
npx eslint .      OK — 0 errores
```

**Lo que no se verificó, y hay que decirlo:** nada de esto se ejecutó contra una
base con la 0006 aplicada, porque no hay ninguna. El camino de
`postular_proveedor()` está revisado línea a línea y no probado. El envío de
correo tampoco: sin `SMTP_*`, la aplicación usa el enviador de consola.

Queda comprobado cuando, con la migración corrida y las variables cargadas:

1. Una cuenta de prueba manda el formulario de `/vender` y su empresa aparece en
   `/proveedores` con nivel Semilla.
2. Llega el correo de respaldo con el enlace a la ficha.
3. `/niveles` responde 200 y sus números coinciden con los de la base:
   `select nivel_para_puntos(600);` devuelve `raiz`.
