# 2026-09-30 — Comunidad: eliminar (admin), editar y eliminar lo propio

- **Quién:** Jesús Seiler (`js`), con Claude Code.
- **Migración nueva:** `0013_comunidad_edicion.sql` (hay que aplicarla en Supabase).

## Qué se hizo

- **Administración:** junto a «Destacar» y «Ocultar», ahora «Eliminar»
  (`eliminarPublicacionAdmin`), con confirmación. Borra la publicación y sus
  reacciones, sin rastro. Ocultar sigue siendo la opción reversible.
- **Autor:** `AccionesPublicacion` en la tarjeta del muro (solo si quien mira es
  el autor) para editar título, texto y tema, o eliminarla.
- **Historial de edición:** `community_posts.edited_at`, sellado por el trigger
  `community_proteger_derivados` solo si cambió título, texto o tema. La tarjeta
  dice «· editada el 12 de mayo». No se guardan las versiones anteriores.
- El autor ya no puede cambiar `provider_id` en un update (antes se saltaba la
  comprobación de `manages_provider` del insert).

## Decisiones

- **Eliminar no deja rastro**, como se pidió. Las políticas `delete_own` y
  `community_posts_admin` ya lo permitían: no hizo falta tocar RLS.
- **Sin la 0013 el muro sigue funcionando** (`edicionDisponible()` sondea la
  columna, como `sondeo0012`), pero editar se rechaza con un aviso en vez de
  editar sin dejar marca.
- **Borrar resta los puntos que la publicación dio** (actualiza la decisión
  «los puntos no bajan»: es deshacer el hecho, no castigar inactividad). Trigger
  `community_revertir_experiencia`; el nivel se recalcula y puede bajar. Antes de
  borrar, tanto el autor como el administrador ven un aviso con el número de
  puntos (`puntosEnJuego()` + `avisoDeEliminar()`).
- **Borrar no libera cupo.** Los topes (30 s, 3 al día, 10 al mes) pasaron a
  contar `community_post_log`: una fila (autor y hora, sin contenido) por
  publicación creada, podada a los 30 días. Si borra una de tres, le quedan dos.
  Un administrador no tiene topes, como antes.

## Verificación

`tsc`, `eslint` y `build` en limpio. No se probó contra la base: la edición solo
se puede ver con la 0013 aplicada y una sesión real.
