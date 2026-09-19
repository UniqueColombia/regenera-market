# La Comunidad existe, y el registro deja de pedir la contraseña dos veces

- **Fecha:** 2026-09-19
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-comunidad-y-arreglos-de-beta` → #<n>
- **Fase del roadmap:** 1 y 2 — Comunidad, y corrección de ocho observaciones de uso

## Qué se hizo

Una revisión de uso de la beta produjo ocho observaciones. Siete eran arreglos y
una era una sección entera que faltaba.

**La Comunidad** (migración `0007_comunidad.sql`, `/comunidad`,
`/admin/comunidad`): un muro donde cualquiera con cuenta publica —a título
personal o firmando con una empresa que gestiona—, con una reacción única por
persona («me sirve») y moderación posterior desde el panel. Los tres últimos
posts asoman en la portada.

Con ella dejan de ser teoría los dos eventos de experiencia que llevaban desde la
`0006` definidos sin tener dónde ocurrir: `articulo_publicado` (30) y
`articulo_destacado` (80). `/niveles` los escondía con una lista `AUN_NO` que ya
no existe.

Las otras siete, en una línea cada una:

| Observación | Qué se hizo |
|---|---|
| El registro pedía la contraseña otra vez tras el código | `PasoCodigo` recibe `origen`; desde el registro termina en `/registro/listo` |
| `/vender` decía lo que **no** pasa en vez de qué ofrece | Las seis tarjetas nombran servicios concretos; se quitaron cinco frases en negativo |
| El formulario de proveedor pedía «tu nombre» a quien ya tenía cuenta | Pasa a «nombre del representante legal», prellenado desde la sesión |
| La cláusula citaba solo la Ley 1581 de 2012 (Colombia) | Redacción general + la norma del país elegido, desde `PAISES[].proteccionDatos` |
| «Tu ficha ya existe… no hay nada que aprobar» | Reescrito: qué quedó hecho y qué hacer ahora |
| En el móvil solo se podía salir, no ver el perfil | El menú de móvil repite las filas de la cuenta |
| El sello y el nivel se confundían | `/niveles` describe el sello como el estudio que es, y el nivel incluye la Comunidad |

Y tres skills recogen lo aprendido: **`redaccion-producto`** (nueva),
**`acceso-y-registro`** (nueva) y una sección de paridad móvil en
**`diseno-visual`**.

## Por qué así

**La Comunidad se publica al instante, con moderación posterior.** Es la misma
decisión que tomó la [`0006`](2026-09-17-niveles-por-experiencia-y-alta-directa.md)
con los proveedores: el control es una palanca reversible (ocultar), no una
puerta (aprobar). Se descartó la cola de revisión previa por lo de siempre —el
equipo se vuelve el cuello de botella— y porque un muro con latencia de días no
es un muro.

**Sin comentarios, con una reacción.** Se eligió entre tres alcances. Los
comentarios anidados harían falta moderar hilo a hilo y hoy no hay herramienta
para eso; una deuda de moderación se paga en público. La reacción única basta
para ordenar lo útil arriba y cuesta una tabla con clave primaria compuesta.

**Solo suma experiencia lo que firma una empresa.** Una entrada personal no tiene
a quién darle puntos, y el nivel mide actividad de la empresa. Lo impone el
trigger, no la aplicación.

**`author_name` se copia en la fila.** `profiles` solo lo puede leer su dueño
(`profiles_own`), así que un visitante anónimo vería «alguien» en cada tarjeta.
Se descartó abrir `profiles` a lectura pública —lleva teléfono— y se descartó
aceptar el nombre del formulario, que convertiría el muro en un suplantador: lo
sella un trigger desde `profiles`.

**El arreglo del registro no tocó `necesitaClave`.** Esa bandera hace lo correcto
en `/entrar`: cubre a las cuentas que nacieron sin contraseña y a las que crea un
administrador. Lo que estaba mal era aplicarla al registro, donde la persona
acaba de elegir una. Por eso el cambio es un parámetro `origen` en `PasoCodigo` y
no una modificación de `requireUser()`, que habría desprotegido las cuentas
viejas de verdad.

**La ley se nombra, no se sustituye.** Se consideró quitar toda referencia
concreta y remitir solo a la política de privacidad. Se descartó: nombrar la
norma bajo la que se otorga es lo que le da fuerza a una autorización. La
redacción que manda es general y `proteccionDatos` solo añade la del país cuando
la sabemos. Cuando no, no se inventa ninguna.

**El panel de moderación no estaba pedido y se hizo igual.** `status =
'suspended'` y `featured` existían en la base sin ninguna forma de usarlos, y
`/niveles` anuncia 80 puntos por «que destaquemos tu artículo». Publicar eso sin
un botón que lo haga posible es exactamente lo que la skill `redaccion-producto`
prohíbe dos párrafos más arriba.

## Qué quedó pendiente

- **La migración `0007` NO está aplicada.** Hay que correrla por el editor SQL
  del panel de Supabase **antes** de desplegar: `/comunidad` consulta
  `community_posts` y sin la tabla responde error.
- **Las `SMTP_*` siguen sin estar en Vercel.** Viene de la tanda anterior y sigue
  sin resolverse: nadie recibe el correo de su postulación.
- Sin paginación en `/comunidad`: trae 30 y el panel 200. Con volumen real hará
  falta cursor por `created_at`.
- Sin imágenes en las publicaciones, por lo mismo que las ofertas: subir archivos
  está fuera de la beta a propósito.
- Sin notificación a nadie cuando se publica algo. El panel hay que ir a mirarlo.
- La comisión por nivel (12/10/8 %) **sigue sin el visto bueno de Ivan**. Viene
  de la `0006` y no lo desbloquea este trabajo.

## Qué se rompe si tocas esto

- **`community_recontar_reacciones()` y `community_proteger_derivados()` están
  acopladas por la marca `app.derivados`.** El protector de derivados revierte
  `reaction_count` para quien no es administrador; el contador se identifica con
  esa marca de transacción para que no deshaga su propio incremento. Si quitas la
  marca, el contador se queda clavado en cero **sin que nada falle**.
- **El panel de Comunidad no puede usar la clave de servicio.** `is_admin()` se
  evalúa contra `auth.uid()`, que con la service role key es nulo: el trigger
  revertiría el cambio en silencio y la pantalla diría que funcionó. Va con el
  cliente de sesión, como el resto del panel.
- **`articulo_destacado` es dinero.** Da 80 puntos, los puntos bajan la comisión
  y no bajan nunca. `experience_events` impide sumarlo dos veces por la misma
  publicación; quitar el destacado no lo devuelve.
- **`EXPERIENCIA` en `src/lib/niveles.ts` sigue siendo el gemelo de
  `otorgar_experiencia()`.** No cambió en esta tanda, pero ahora dos de sus
  claves tienen trigger propio en la `0007`.
- **`PasoCodigo` lo usan `/entrar` y `/registro`.** Cambiar su destino sin mirar
  `origen` rompe uno de los dos caminos.
- **`TEMAS` se exporta desde `src/components/tarjeta-publicacion.tsx`** y lo usan
  el formulario y el panel. Es el único sitio donde se traducen los temas.

## Verificación

Lo verificable en este repositorio, que es lo que hay: no hay navegador
automatizado y **la revisión visual la hace el usuario**.

```bash
npm run build      # ✅ compila; /comunidad y /admin/comunidad en el manifiesto
npx tsc --noEmit   # ✅ limpio
npx eslint src     # ✅ limpio (los 94 avisos del repo son de
                   #    .claude/skills/impeccable/scripts/live-browser.js)
```

**Sin comprobar contra una base real**, porque la `0007` no se ha aplicado. Queda
por probar, en este orden y una vez aplicada:

1. Publicar con sesión, a título personal → aparece en `/comunidad` y en la
   portada.
2. Publicar firmando con una empresa → `experience_events` gana una fila
   `articulo_publicado` y `providers.experience_points` sube 30.
3. Reaccionar y quitar la reacción → `reaction_count` sube y baja. **Es la
   comprobación que importa**: si se queda en cero, la marca `app.derivados` no
   está haciendo su trabajo.
4. Con otra cuenta, intentar publicar firmando con una empresa ajena → lo niega
   `community_posts_insert`.
5. Ocultar una publicación desde `/admin/comunidad` → desaparece del muro y su
   autor la sigue viendo.
6. Registrarse de cero → tras el código de seis dígitos se aterriza en
   `/registro/listo`, **no** en `/cuenta/clave`.
7. A 375 px de ancho, con sesión → el menú lleva a «Tu cuenta».
