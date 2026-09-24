# Analíticas propias con permiso previo, y `/admin/comunidad` deja de caerse

- **Fecha:** 2026-09-24
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `fix/js-admin-comunidad-y-analiticas` → #57
- **Fase del roadmap:** 1 y 2 — corrección y medición

## Qué se hizo

1. **`/admin/comunidad` vuelve a cargar.** Se reportó con el código
   `301622926`.
2. **Hay medición de uso**, propia y solo si la persona la acepta en el aviso
   de cookies. Se guarda en `page_views` (migración `0010`).
3. **Hay un panel `/admin/analiticas`** con visitas, visitantes distintos,
   visitas por día, páginas, orígenes, aparatos y países, comparados con el
   periodo anterior. Debajo, cuatro cifras del negocio: cuentas nuevas,
   postulaciones, órdenes y publicaciones.
4. **La política de privacidad y cookies se actualizó**: el dato nuevo, la
   cookie `sgr_visitante`, qué se mide y qué no, y la retención de trece meses.

## Por qué así

**El fallo de Comunidad era una fecha.** `longDate()` le pegaba `T12:00:00Z` a
lo que recibía, y la página le pasaba `created_at` completo. El resultado era
`2026-09-19T14:22:10+00:00T12:00:00Z`: en el navegador eso pinta «Invalid
Date», pero en el servidor `Intl.DateTimeFormat.format()` lanza `RangeError` y
tumba la página. `getApplications()` ya había esquivado lo mismo con
`soloFecha()`. Esta vez se arregló en el formateador, para que la tercera
página que lo use no tenga que acordarse.

**Medición propia en vez de Vercel Analytics, Plausible o Google Analytics.**
Cualquiera de esas sería un encargado nuevo del tratamiento, con su propia
transferencia internacional y, en la mayoría, un costo. Decidir eso le toca a
un humano (`CLAUDE.md`, «Límites duros»). La propia resuelve lo que pide el
panel sin decidirlo: los datos se quedan en Supabase, que la política ya
declaraba. Si algún día se quiere una herramienta de terceros, se agrega detrás
del mismo `medicion` del consentimiento, y la política dice cuál.

**El permiso se comprueba dos veces en el servidor.** El layout no manda
`<MedicionUso>` al navegador sin permiso, y `/api/medicion` vuelve a leer la
cookie antes de guardar. La primera comprobación evita que el código viaje. La
segunda es la barrera de verdad, porque cualquiera puede disparar la petición a
mano.

**Se descartó guardar la IP, la query y las páginas privadas.** Para las cifras
del panel basta con el país, que resuelve Vercel. Lo que alguien busca es
asunto suyo. Y una orden lleva su referencia en la ruta.

**Se descartó un contador sin cookie** (un hash diario de IP y navegador, como
hace Plausible). Contar visitantes sin cookie obliga a procesar la IP de todo
el mundo, **también de quien dijo que no**. Con la cookie, a quien dice que no
no se le procesa nada.

**El consentimiento subió a la versión 2.** El «sí» de la versión 1 era a una
medición que no existía, y un sí a algo abstracto no vale como sí a algo
concreto.

**`VIGENCIA_LEGAL` se partió en dos.** Cambió la política y no los términos, y
mover la fecha de un documento que no cambió es decir que cambió. `legal.ts` ya
preveía el caso.

## Qué quedó pendiente

- **Aplicar la `0010`** en la base de producción. Sin ella, la medición falla en
  silencio y el panel dice que falta.
- **Nada de esto se probó contra una base.** No había credenciales en la
  máquina: ni la SQL de la `0010` ni el panel con datos reales. Lo primero,
  después de aplicarla, es aceptar la medición en el sitio, navegar dos
  páginas y abrir el panel.
- **La política promete avisar por correo** si cambia *para qué* se usan los
  datos. No se avisó. El uso de los datos que ya había no cambia, y lo nuevo
  solo se recoge con permiso previo. Si el equipo prefiere avisar igual, queda
  por decidir.
- **Las cifras de tráfico son un piso.** Quien no acepta no cuenta.

## Qué se rompe si tocas esto

- **`registrar_visita()` puede llamarse con la clave anon.** Lo peor que
  consigue alguien es ensuciar las cifras. Si algún día eso importa, la salida
  es un tope por visitante en la función, no quitarle el `grant` a `anon`: sin
  él, quien no tiene sesión no se mide.
- **Si agregas una ruta privada** en `src/lib/rutas.ts`, revisa `NO_SE_MIDE` en
  `src/app/api/medicion/route.ts`. Son listas distintas a propósito:
  `/carrito` es privada para el buscador, pero sí se mide.
- **Si cambias qué se mide**, sube `VERSION_CONSENTIMIENTO` y
  `VIGENCIA_PRIVACIDAD`, y actualiza `/privacidad`.
- **`sgr_visitante` es `httpOnly`.** El navegador no puede borrarla: la borra
  `DELETE /api/medicion`, y eso lo llama el aviso cuando alguien elige «Solo
  las necesarias».

## Verificación

- `npm run build`, `npx tsc --noEmit` y `npx eslint .` en limpio.
- La causa del fallo, reproducida en Node con la misma cadena: antes daba
  `Invalid time value` y ahora `19 de septiembre de 2026`.
- Con `next start` en local y sin base:
  - `/api/medicion` responde 204 con y sin permiso.
  - `DELETE` manda la cookie `sgr_visitante` vencida.
  - Una cookie de consentimiento de la versión 1 vuelve a mostrar el aviso y
    una de la versión 2 no.
  - `/privacidad` muestra la vigencia del 24 de septiembre y `/terminos`
    conserva la del 19.
