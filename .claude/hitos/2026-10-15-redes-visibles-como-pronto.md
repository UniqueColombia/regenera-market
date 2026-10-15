# Los íconos de las redes se ven ya, como «pronto»

- **Fecha:** 2026-10-15
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-redes-visibles` (entrega directa)
- **Fase del roadmap:** —; corrige una decisión de [el hito del 14-10](2026-10-14-fotos-excel-contactar-pagos-y-envios.md) (punto 2)

## Qué se hizo

Jesús notó que las redes, de las que se había hablado, no aparecían en ningún
lado. No era un error: el 14-10 se decidió no pintar ningún ícono mientras
`REDES` (`src/lib/legal.ts`) estuviera vacío. Ahora:

- **Pie:** debajo de la descripción, los seis íconos (Instagram, Facebook,
  LinkedIn, TikTok, YouTube, WhatsApp) y «Nuestras redes abren pronto».
- **Encabezado, desde 640 px:** un botón «Síguenos» con un desplegable que
  lista las redes y, mientras no haya ninguna, deja el correo de contacto.
- **Menú del teléfono:** una fila «Síguenos» al final, porque el botón del
  encabezado es `hidden sm:block` (paridad móvil de `diseno-visual`).

Las piezas viven en `src/components/redes-sociales.tsx` (`FilaRedes`,
`ListaRedes`, `hayRedesActivas`), y los datos en `redesParaMostrar()`.

## Por qué así

**El motivo de esconderlas sigue en pie, y se respeta de otra forma.** Se
escondían para no llevar a una cuenta que no existe o a la de otra empresa con
el mismo nombre. Un ícono sin dirección ahora **no es un enlace**: es un
`<span role="img">` que dice «Instagram: pronto», más apagado y sin reacción al
puntero. El día que se escriba la dirección en `REDES`, ese mismo ícono pasa a
ser un enlace sin tocar nada más.

**El `sameAs` de la portada y el pie de los correos no cambian:** siguen con
`redesActivas()`, solo las que tienen dirección. Un buscador o un correo no
tienen cómo decir «pronto».

**Un botón y no seis íconos en la barra.** No caben a 1024 px. Aun el botón
partía en dos el lema del logo entre 1024 y 1100 px; se resolvió con `px-3` en
los enlaces del menú hasta `xl` (antes `px-3.5`), medido con Playwright.

## Qué se rompe si tocas esto

- **No pongas `href="#"` a un ícono pendiente** para que «parezca» enlace:
  lleva al principio de la página y es justo lo que se quiso evitar.
- **Si agregas una red**, va en `RedSocial`, `REDES`, `NOMBRE_RED` y su trazo en
  `iconos-redes.tsx`. La fila del pie tiene sitio para unas siete a 1280 px.
- **Si agregas otra acción al encabezado**, mide el lema del logo a 1024 px: es
  lo primero que se parte.

## Verificación

- `npm run build`, `npx tsc --noEmit`, `npx eslint .` (0 errores) y `npm test`.
- Con Playwright sobre `/terminos` (no necesita la base): seis íconos en el pie
  y ningún enlace; el desplegable abre y cierra con Escape; sin desbordes a
  1024 y 390 px; el lema del logo en una línea a 1024 px; menú del teléfono con
  su fila.
