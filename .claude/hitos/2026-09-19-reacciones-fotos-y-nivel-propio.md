# Cinco reacciones, fotos que sube su dueño, y el nivel se puede mirar

- **Fecha:** 2026-09-19
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-reacciones-fotos-y-nivel` → pendiente
- **Fase del roadmap:** 1 y 2 — sobre la Comunidad (Bloque 3) y los niveles

## Qué se hizo

Tres cosas que se pidieron y una cuarta que apareció por el camino.

1. **Las reacciones de la Comunidad pasan de una a cinco** —🌱 me sirve, 👍 me
   gusta, 🏅 bien hecho, 💡 me dio una idea, 🤝 cuenta conmigo— y una persona
   puede marcar varias en la misma publicación. El contador **dejó de sumarse de
   uno en uno y ahora se recuenta** desde las filas.
2. **Cada persona pone su foto de perfil en `/cuenta`** y **cada empresa su logo
   en `/cuenta/empresa`**, en vez del monograma de iniciales. Se recortan a
   cuadrado en el navegador y se guardan en Supabase Storage.
3. **`/cuenta/empresa` es nueva.** El proveedor ve su nivel, cuánto le falta para
   el siguiente, cuánto bajaría su comisión al llegar, y el historial completo de
   de dónde salió cada punto.
4. **Se cerró un agujero de privilegios** que llevaba abierto desde la `0006`:
   un proveedor podía escribirse sus propios puntos de experiencia y con ellos su
   nivel, que es su comisión.

Todo el SQL va en `supabase/migrations/0008_reacciones_y_fotos.sql`, que **está
escrita y no aplicada**.

## Por qué así

### El contador se recuenta en vez de incrementarse

El síntoma reportado fue «le da clic otro usuario y al parecer no se suma», y
`docs/ESTADO.md` ya tenía la misma duda anotada como lo primero que había que
probar en producción. Auditando el camino aparecieron **dos defectos reales y
demostrables, ninguno de ellos en el trigger que se sospechaba**:

- La acción devolvía `{ ok: boolean }` y **el botón no lo miraba**. Cualquier
  fallo —sesión caducada, RLS negando, la red— se veía idéntico a un éxito
  seguido de un cambio de opinión: `useOptimistic` subía el número y lo devolvía
  a su sitio al llegar la respuesta. Sin error en ninguna parte. Ese es
  exactamente el síntoma que se describió.
- Un `insert` que chocaba con la clave primaria se trataba como éxito. Estaba
  bien tratarlo así —un doble toque no es un error del usuario— pero combinado
  con el punto anterior producía la misma imagen: pulsar y que no pase nada.

La marca `app.derivados` de la `0007`, que era la sospecha principal, **está
bien**: una función con cláusula `SET` abre un nivel de GUC propio, pero el valor
sigue siendo visible para los triggers que corren dentro de su transacción.

Aun así el contador cambió de estrategia, y el motivo no es el fallo concreto:
mientras el número se lleve a `+1` / `-1` **no existe ningún sitio donde pueda
contradecirse con la verdad**, así que una escritura perdida queda mintiendo para
siempre y en silencio. Recontar desde `count(*)` sobre las reacciones de una
publicación cuesta un índice y hace que el número se corrija solo. La consulta de
auditoría pasa a ser trivial, y va en `docs/ESTADO.md`.

Lo que sí hubo que hacer con cuidado es el orden **bloquear → contar → escribir**:
sin el `for update` sobre la publicación, dos personas reaccionando a la vez
cuentan cada una sin ver la fila de la otra y la segunda escribe un total al que
le falta una. La versión incremental no tenía esa carrera porque el `update`
serializaba solo.

### Varias reacciones a la vez, y no una entre cinco

Era la pregunta de producto: elegir una de cinco (como LinkedIn) o marcar las que
quieras (como Slack). Se eligió lo segundo. De una publicación útil la gente
quiere decir dos cosas a la vez, y obligar a renunciar a «me sirve» para poder
decir «me dio una idea» hace que la señal valga menos, no más.

La clave primaria pasa de `(post_id, user_id)` a `(post_id, user_id, kind)`. Lo
que sigue siendo único es **cada reacción de cada persona**, así que el doble
toque desde un teléfono con mala señal sigue sin contar dos — que era la razón
original de esa clave.

Los tipos van en una columna de texto con `check`, no en un enum, por lo mismo
que `community_posts.topic`: agregar la sexta reacción no debe obligar a partir
una migración en dos archivos. El desglose va en un `jsonb`
(`reaction_counts`) y no en cinco columnas, por la misma razón. `reaction_count`
se queda como total porque es por lo que se ordena el muro, y ordenar por una
clave de un `jsonb` es la consulta que se vuelve lenta justo cuando la sección
empieza a usarse.

### Las imágenes, detrás de una interfaz

Hoy se guardan en Supabase Storage; **el plan declarado es mudarlas al VPS propio
cuando cierre el MVP**. Por eso `src/lib/almacenamiento.ts` es el patrón de
`src/lib/payments.ts`: una interfaz que habla de guardar imágenes y no de
Supabase, una implementación real, una de respaldo que funciona sin credenciales,
y un único `getAlmacen()` que decide. Ese día se escribe `AlmacenVps` y se cambia
una línea.

Se guarda la **URL** en `profiles.avatar_url` y `providers.logo_url`, no la ruta.
Al migrar habrá que reescribir las que apunten a Supabase con un `update`, y eso
es más barato que la alternativa: componer la URL en cada render obligaría a que
toda la aplicación supiera qué almacén está activo, que es justo lo que la
interfaz existe para evitar.

**El recorte se hace en el navegador**, y no por estética: una foto de un teléfono
pesa entre 3 y 8 MB y el límite del cuerpo de una Server Action es 1 MB. Sin
reducir a 512 px no falla a veces, falla siempre. El servidor vuelve a comprobar
tipo y peso de todas formas — lo del navegador es comodidad, no una barrera.

Dos buckets y no uno porque las políticas son distintas: la carpeta de un avatar
la manda `auth.uid()` y la de un logo `manages_provider()`. Con un bucket único,
cada política tendría además que mirar el prefijo de la ruta, y una condición de
más en una política de escritura es una condición que algún día se escribe al
revés.

### La foto de otra persona no se copia en la publicación

La `0007` resolvió el mismo problema con el nombre copiándolo en
`community_posts.author_name`, con el argumento de que quien firma algo lo firma
con el nombre que tenía ese día. **Con la foto ese argumento no vale**: quien
cambia su foto espera que cambie en todas partes, y copiarla obligaría además a
reescribir todas sus publicaciones cada vez.

Se lee en vivo con `avatares_publicos()`, una función `security definer` que
devuelve **solo la foto** de los ids que se le pidan. `profiles` sigue siendo
privada: por ahí no sale un teléfono, un correo ni un documento tributario.

### El agujero de privilegios

`providers_member_update`, de la `0001`, dice
`for update using (manages_provider(id))`. Una política de Postgres **no
distingue columnas**, así que quien gestiona una empresa puede actualizar la fila
entera — y desde la `0006` esa fila incluye `experience_points`, del que un
trigger deriva `tier`, del que sale la comisión. Con la clave anon (pública por
diseño) y una sesión normal de proveedor, un `PATCH` a PostgREST con
`experience_points: 99999` daba nivel Bosque y bajaba la comisión del 12 % al
8 %. Es la invariante 13 de `dominio-regenera`, abierta desde el 2026-09-17.

Nunca se explotó porque **ninguna ruta de la aplicación escribía en `providers`
desde una sesión de proveedor**. Esta tanda estrena la primera (el logo), así que
se cerró en la misma migración en lugar de abrir la puerta con el agujero dentro.

Lo cierra un trigger `before update` que devuelve los campos derivados a su valor
anterior, que es la misma solución que la `0007` usó para `reaction_count`. La
diferencia está en **cómo distingue quién escribe**: por `current_user`, no por
una marca de transacción. Las escrituras de una sesión del sitio llegan como
`anon` o `authenticated`; las que hace la propia base (`otorgar_experiencia()`,
`sync_provider_score()`, las dos `security definer` de `postgres`) y las de una
tarea con la clave de servicio llegan con otro rol. **Eso es lo que evitó tener
que reescribir las funciones de la `0006`** para que se marcaran: ninguna cambia.

Por eso esa función concreta **no** es `security definer` — dentro de una,
`current_user` sería siempre `postgres` y la comprobación no valdría nada.

### `perfil_completo` deja de ser teoría

Existía en `otorgar_experiencia()` desde la `0006` y en `src/lib/niveles.ts`, y
no lo otorgaba nadie: no había pantalla donde completar el perfil. Es el caso de
la regla 6 de `redaccion-producto`, y se resuelve al revés que entonces — ahora
que la pantalla existe, el evento se ata a su hecho con un trigger.

## Qué quedó pendiente

- **Aplicar la `0008`.** Está escrita y no ha corrido contra ninguna base. Va por
  el editor SQL del panel y **antes** de desplegar, como la `0006` y la `0007`:
  el código lee columnas y buckets que hoy no existen. Las consultas de
  comprobación están al final del archivo y en `docs/ESTADO.md`.
- **Probar la subida desde un teléfono.** Safari viejo ignora WebP en
  `canvas.toBlob` y hay una rama que reintenta en JPEG que nadie ha ejecutado.
  Aquí no hay navegador automatizado: esto lo comprueba una persona.
- **El proveedor todavía no edita el resto de su ficha.** Descripción, titular,
  ubicación y contacto siguen saliendo de la postulación y corrigiéndose desde
  administración. Como `perfil_completo` exige titular y descripción con
  sustancia, una empresa cuya postulación viniera corta **no puede llegar a esos
  80 puntos hoy**, ni siquiera subiendo el logo. El formulario que falta va en
  `/cuenta/empresa` y sus reglas ya están escritas en `empresa/actions.ts`.
- **Quien gestione varias empresas solo ve la primera.** Hoy no puede pasar:
  `postular_proveedor()` enlaza a lo sumo una por persona. El día que pase, el
  selector va en `getMiEmpresa()`.
- **El archivo huérfano.** Quitar una foto borra la columna, no el objeto de
  Storage. Son kilobytes y la siguiente subida lo sobrescribe, porque la ruta es
  siempre la misma.

## Qué se rompe si tocas esto

- **`src/lib/comunidad.ts` es el gemelo del `check` de `community_reactions.kind`.**
  Agregar una reacción son los dos sitios: sin el de la base rebota con un error
  de restricción; sin el de TypeScript la base acepta un valor que la pantalla no
  sabe dibujar.
- **El orden dentro de `recontar_publicacion()`.** Bloquear, contar, escribir. Si
  alguien mueve el `count` antes del `for update`, vuelve la carrera entre dos
  personas reaccionando a la vez y el contador se queda corto.
- **La primera carpeta de la ruta en Storage es parte del control de acceso.** Si
  algún día se guarda en `logos/<slug>/…` en vez de `logos/<id>/…`, las políticas
  de la sección 4 de la `0008` dejan de proteger nada.
- **`providers_proteger_derivados()` no puede ser `security definer`.** Distingue
  quién escribe por `current_user`, y dentro de una función `security definer`
  ese valor es siempre el dueño.
- **Los nombres de los triggers de `providers` importan.** Los del mismo momento
  corren en orden alfabético, y «proteger» tiene que ir antes que «tier»: primero
  se devuelven los puntos a su valor y después se deriva el nivel de los puntos
  ya corregidos.
- **`next.config.ts` deriva el dominio de imágenes de `NEXT_PUBLIC_SUPABASE_URL`.**
  Si se muda el almacén, hay que añadir el dominio nuevo ahí o `next/image` niega
  las fotos sin decir por qué.

## Verificación

Lo que se pudo comprobar aquí:

```bash
npm run build     # limpio
npx tsc --noEmit  # limpio
npx eslint .      # 0 errores (94 avisos, todos de un script vendido en .claude/skills/impeccable)
```

Lo que **no** se comprobó y solo se comprueba con la base delante: nada del SQL
de la `0008` ha corrido. La migración no se aplicó contra ninguna base, así que
ni las políticas de Storage, ni el recuento, ni el trigger de protección se han
ejecutado una sola vez. La comprobación de que el trigger de protección **niega**
—que es como se valida una política, no demostrando que permite— está escrita
como consulta al final de la migración y está sin correr.
