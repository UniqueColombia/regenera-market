# Un documento tributario, una empresa

- **Fecha:** 2026-10-14
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-un-documento-una-empresa` (entrega directa)
- **Fase del roadmap:** —
- Cierra dos pendientes de [2026-10-14-eliminar-cuenta-y-cerrar-empresa.md](2026-10-14-eliminar-cuenta-y-cerrar-empresa.md)

## Qué se hizo

Migración **0022**. Cada empresa tiene una **clave tributaria** (país + documento
normalizado) y no puede haber dos empresas con la misma:

- **La misma persona que cerró su empresa** y la da de alta otra vez con su
  documento **la recupera tal como estaba**: nivel, puntos, reseñas, ventas.
  Sus ofertas siguen en borrador hasta que las manda a revisión.
- **Cualquier otro caso** (la cerró otra persona, sigue activa, la suspendió el
  equipo) no crea nada: la solicitud queda **en revisión** con una nota que
  dice de qué empresa es el documento. El equipo, al aprobarla, reabre la
  empresa cerrada con esa persona como dueña, o le dice que ya hay una activa.
- **El panel dice «Cerrada por su dueña el …»** y no ofrece «Aprobar»; la base
  tampoco lo deja (`empresa-cerrada`).

## Por qué así

Jesús lo pidió para que nadie escape de sus malas reseñas cerrando y
reabriendo. Al mirarlo apareció un hueco más simple: **dos cuentas podían dar
de alta dos empresas con el mismo NIT**, sin cerrar ninguna, porque la base no
comparaba documentos. La regla cubre los dos.

**La clave entiende cómo se escribe un NIT.** `900.123.456-7`, `900123456-7`,
`9001234567` y `900123456` son la misma: se quitan los signos y el dígito de
verificación, que se reconoce con la fórmula de la DIAN aunque venga pegado
(solo con el prefijo de una sociedad, 8 o 9, o el de una persona con cédula de
diez, 1, para no recortarle un dígito a una cédula a la que le cuadre por
casualidad). Fuera de Colombia se quitan los signos y nada más.

**No se reactiva sola para un desconocido**, aunque traiga el mismo NIT. Quien
gestiona una empresa ve los nombres, teléfonos y direcciones de sus
compradores, y un NIT ajeno se saca del RUES en un minuto. Por eso solo la
reabre sola quien la cerró (`cerrada_por`); a los demás los decide el equipo.
`cerrada_por` no tiene clave foránea a propósito: si esa persona borra su
cuenta, nadie puede volver a reabrirla sola.

**Sin índice único sobre la clave**: en la base ya puede haber dos empresas con
el mismo documento, y un índice único haría fallar la migración entera. La
regla la imponen las dos funciones de alta, con un candado por clave para que
dos altas simultáneas se turnen.

**Una empresa que nunca vendió se sigue borrando al cerrarla** (0021): sin
reseñas ni ventas, no hay historia de la que escapar, y empezar de cero no le
da ninguna ventaja.

## Qué quedó pendiente

- [ ] **Aplicar la 0021 y la 0022, en ese orden** (la 0022 usa la columna y
      redefine la función de la 0021). Una empresa cerrada entre las dos queda
      sin `cerrada_por`, y su dueña tendría que pasar por el equipo para
      reabrirla: conviene aplicarlas juntas.
- [ ] Después de aplicarla, correr la consulta del final de la 0022 que lista
      las empresas que **ya** comparten documento. Si sale alguna, el equipo
      decide cuál vale.
- [ ] Los términos no dicen todavía que una empresa queda ligada a su
      documento. Si se agrega, sube `VIGENCIA_TERMINOS`.
- [ ] Al reabrir, sus ofertas quedan en borrador y no vuelven a como estaban
      (el cierre no guarda su estado anterior). Es a propósito: lo que vuelve
      al catálogo pasa otra vez por revisión.

## Qué se rompe si tocas esto

- **`postular_proveedor()` y `aprobar_postulacion()` aplican la misma regla.**
  Si se agrega una tercera forma de crear empresas (un script, el panel de
  ofertas), tiene que pasar por `clave_tributaria()` y el candado `nit:`, o la
  regla tiene un agujero.
- **`clave_tributaria()` alimenta una columna generada.** Cambiar cómo
  normaliza cambia la clave de todas las empresas existentes en la siguiente
  migración que la redefina, y dos que antes eran distintas pueden pasar a
  coincidir (o al revés).
- `reactivar_empresa()` no tiene permisos para la aplicación: solo la llaman
  las dos funciones de alta.

## Verificación

- `npm run build`, `tsc`, `eslint`, `npm test` (57) y `npm run test:base` (85,
  10 nuevas en `supabase/pruebas/documento.test.ts`):
  - el mismo NIT en cuatro formas da la misma clave; una cédula de diez dígitos
    no pierde su último dígito; Chile y Perú, solo sin signos;
  - quien cerró su empresa con una reseña de 1 estrella y 700 puntos la da de
    alta otra vez con otro nombre y el NIT con guion, y vuelve **la misma**
    empresa, aprobada, con su reseña, sus puntos y su nombre de antes;
  - otra persona con ese NIT no la reabre: su solicitud queda en revisión;
  - una segunda cuenta con el NIT de una empresa activa no crea otra;
  - el equipo, al aprobar esa solicitud, reabre la empresa cerrada con la nueva
    dueña; si la del NIT está activa, no crea otra;
  - un administrador no puede aprobar desde el panel una empresa cerrada.
- **No verificado en pantalla**: los mensajes nuevos de `/vender` y del panel
  necesitan sesión.
