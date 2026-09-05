# El sitio responde al toque, la paleta pasa AA, y el andamiaje de Supabase queda puesto

- **Fecha:** 2026-09-05
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `fix/js-auditoria-visual` → #23
- **Fase del roadmap:** 0 — Prototipo (cierre) · habilita la 1 y la 2

## Qué se hizo

Tres cosas que llegaron juntas por una auditoría del sitio completo.

**Interacción táctil.** El sitio no daba ninguna señal al tocarlo en un teléfono:
ni el logo, ni los botones, ni las tarjetas. Ahora sí.

**Contraste.** Tres pares de color de la paleta no pasaban AA. Se corrigieron en
el tema, y se agregaron dos pasos nuevos: `clay-700` y `control`.

**Andamiaje de Supabase.** Los tres clientes, el proxy de sesión, los helpers de
autorización y la migración `0002_auth.sql`. Nada de esto necesita que la base
exista, así que se escribió por adelantado para que el Bloque 0 de `docs/BETA.md`
no bloqueara a nadie. **Ninguna migración se ha aplicado todavía contra ninguna
base.**

## Por qué así

**El hover no se "arregla" en táctil.** La causa raíz no era el logo: Tailwind 4
compila *todos* los `hover:` dentro de `@media (hover: hover)`. Se verificó en el
CSS compilado — las 28 reglas de hover del sitio estaban las 28 ahí dentro. Se
descartó forzar el hover en táctil: se queda pegado después del toque, que es
peor que no tenerlo. Se usa `:active`, que es lo único que existe ahí.

La regla vive en `globals.css` y no clase por clase porque son más de cuarenta
elementos interactivos y el próximo que se agregue debe heredarla sin que nadie
se acuerde. Los componentes que quieren algo más expresivo agregan su `active:`.

**Un detalle que costó pensar:** en `listing-card.tsx` el grupo con nombre
`/foto` cuelga del enlace y no del `<article>`. `:active` en táctil solo es
fiable sobre el elemento que se toca; colgarlo del artículo dependería de que el
navegador propague `:active` a los ancestros, y iOS no lo garantiza.

**El token `control` es una decisión, no un ajuste.** `hairline` da 1.34:1 sobre
blanco. Sirve para separar superficies, pero un input es un componente de
interfaz y su borde es lo único que dice dónde empieza el campo: WCAG 1.4.11
pide 3:1. Se agregó un token aparte en vez de oscurecer `hairline`, porque
oscurecer `hairline` habría ensuciado todas las tarjetas del catálogo. Ahora hay
dos bordes con dos trabajos distintos y hay que elegir el correcto.

**El proxy se llama `proxy.ts`, no `middleware.ts`.** `docs/BETA.md` pedía
`middleware.ts`; Next 16 deprecó esa convención y la renombró. Se comprobó en los
docs del paquete instalado (`node_modules/next/dist/docs/…/middleware.md`, que
dice literalmente *deprecated … renamed to proxy.js*), no de memoria. `BETA.md`
quedó corregido en el mismo PR. Es exactamente la trampa que `AGENTS.md` avisa:
cualquier tutorial de Supabase que se encuentre por ahí está escrito para Next 15.

**Los clientes fallan al llamarlos, nunca al importarlos.** `config.ts` devuelve
`null` en vez de lanzar, y el proxy no hace nada si no hay Supabase configurado.
Es lo que mantiene viva la propiedad de `docs/DEPLOY.md`: `npm run dev` con
`.env.local` vacío levanta una app navegable, y el job `verificar` del CI compila
sin credenciales. Si un módulo de arranque lanzara al importarse, las dos se caen.

**`metadataBase` era un bug con efecto en producción, no un aviso.** El build lo
venía diciendo en cada compilación y se leía como ruido: Next resolvía
`opengraph-image.jpg` contra `http://localhost:3000`, así que un enlace de
Seregenera compartido en WhatsApp o LinkedIn salía sin imagen.

## Qué quedó pendiente

- **La revisión visual.** No hay navegador automatizado aquí. El cambio de
  bordes de formulario (`control`) es el más visible de todos y no está aprobado
  con los ojos de nadie.
- **El Bloque 0 entero.** No existe proyecto de Supabase, no se ha aplicado
  `0001_init.sql` ni `0002_auth.sql`, y no hay SMTP configurado.
- **`src/lib/auth.ts` está inerte:** redirige a `/entrar`, que todavía no existe
  (es el Bloque 2). Nada lo llama aún.
- **`scripts/politica-de-ramas.sh` sigue sin aplicarse.** Verificado hoy:
  `branches/main/protection` responde 404, y `seiler18` tiene `admin: false`, así
  que solo Ivan puede correrlo.
- **El proyecto de Vercel no aparece.** Con el CLI autenticado, el único scope
  visible es `Seiler Projects` y no tiene proyectos. O la invitación al Vercel de
  Ivan está en otra cuenta, o el sitio no está desplegado todavía.
- El hero de la portada y `HeroBanner` ya se habían desincronizado (`/55` contra
  `/60`) antes de unificarlos. Quedaron en `/60`.

## Qué se rompe si tocas esto

- **Si borras `src/proxy.ts`**, el síntoma no es un error: son sesiones que
  expiran solas a mitad de una compra. `src/lib/supabase/server.ts` se traga a
  propósito la excepción de "no puedo escribir cookies" *porque* el proxy existe.
  Los dos comentarios se apuntan entre sí; no quites uno sin leer el otro.
- **Entre `createServerClient()` y `getUser()` en el proxy no va nada.** Ese
  `getUser()` es lo que dispara el refresco del token. Cualquier lógica
  intercalada que retorne antes deja la sesión sin renovar, y el fallo aparece
  intermitente y horas después.
- **Las cabeceras del segundo argumento de `setAll` no son opcionales.** Marcan
  la respuesta como no cacheable. Si un CDN guardara una respuesta con cookies de
  sesión, le serviría la sesión de una persona a otra.
- **`src/lib/supabase/admin.ts` se salta RLS.** Importarlo desde una página
  expone la base entera. Tiene una guarda de navegador, pero la guarda no cubre
  un Server Component.
- **`0001_init.sql` es inmutable en cuanto se aplique** a cualquier base. A
  partir de ahí todo es `0003_`.
- **`hairline` y `control` no son intercambiables.** El primero separa
  superficies, el segundo dibuja el borde de un control.

## Verificación

`npm run build`, `npx tsc --noEmit` y `npx eslint .` en limpio, en ese orden. El
aviso de `metadataBase` desapareció del build.

Contrastes calculados con la fórmula de luminancia relativa de WCAG 2.1, no a
ojo. Los tres que fallaban: `muted` sobre `sand` 4.48 → 5.20; `clay-600` sobre
`clay-100` 3.92 → 5.74; blanco sobre `clay-500` 3.35 → 4.57.

Que el hover estaba encerrado en `@media (hover: hover)` se comprobó localizando
los rangos de esos bloques en el CSS compilado y verificando que cada selector
caía dentro.

Con el servidor compilado corriendo y **sin `.env.local`**: `/`, `/catalogo`,
`/proveedores`, `/carrito`, `/vender` y `/verificacion` responden 200;
`/oferta/no-existe` responde 404. El build registra `ƒ Proxy (Middleware)`.

Los dos chequeos del job `secretos` del CI se corrieron en local y pasan.

**Lo visual no se verificó.** Aquí no hay navegador.
