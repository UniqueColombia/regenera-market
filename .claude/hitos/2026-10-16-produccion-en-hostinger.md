# Producción pasa a Hostinger, se despliega por tag, y el correo sale de `info@seregenera.com`

- **Fecha:** 2026-10-16
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `chore/js-build-webpack`, `chore/js-dependencias-seguridad` y la de esta documentación (entrega directa); tags `v0.11.0` y `v0.11.1`
- **Fase del roadmap:** — (infraestructura: vía B-1 de `ROADMAP-MIGRACION.md`)

## Qué se hizo

`https://seregenera.com` sirve la aplicación desde una *Node.js Web App* en el
plan Business de Ivan en Hostinger, contra la misma base de Supabase. Hasta hoy
producción era `regenera-market.vercel.app`, que queda encendido como respaldo.

1. **Tags y despliegue.** `v0.11.0` (todo `main` al día) y `v0.11.1` (build con
   webpack, Next 16.3.8 y dependencias de seguridad). Cada versión se empaqueta
   con `git archive`, se sube a `public_html` por hPanel y se compila con el MCP
   de Hostinger. El procedimiento es la skill nueva `desplegar-hostinger`.
2. **`npm run build` es `next build --webpack`.** El primer build en Hostinger
   reventó en Turbopack (ver abajo).
3. **Las 14 vulnerabilidades del escáner de Hostinger, corregidas:** `next`
   16.3.5 → 16.3.8 (una crítica, ejecución remota en `next/og`, y seis
   moderadas), `sharp` 0.35.5 y `brace-expansion` 1.1.21 / 5.0.12. Tras
   desplegar `v0.11.1`, el escáner sale vacío.
4. **Correo propio.** Buzón `info@seregenera.com` en el correo de Hostinger. Es
   el remitente de Supabase (SMTP Settings) y de la app (`SMTP_*` en Hostinger).
   En Supabase, *Site URL* y *Redirect URLs* pasaron a `https://seregenera.com`.
5. **Regla nueva de tags** (de Jesús): los cambios importantes llevan tag y se
   despliegan; los menores no y salen con el siguiente. Cambia lo que decía
   `entrega-directa` («nunca un tag sin orden expresa»). Y del zip de cada
   versión se conserva solo el último, en `outputs/despliegue/`.

## Por qué así

**B-1 y no VPS ni MySQL.** El plan de Ivan no trae VPS, y PostgreSQL en Hostinger
solo existe en VPS. Pasar a MySQL era reescribir el producto (79 políticas RLS,
97 funciones). Así que la app se muda y la base se queda en Supabase:
`ROADMAP-MIGRACION.md` tiene la comparación completa.

**Por zip y no por Git.** Hostinger compila desde GitHub solo si la conexión con
GitHub vive en la cuenta dueña del sitio, que es la de Ivan, y no hay ninguna.
Subir el zip del tag tiene una ventaja que se quería igual: producción es
exactamente un tag, nunca la punta de una rama.

**Webpack y no actualizar dependencias.** El análisis automático de Hostinger
proponía actualizar Next y Tailwind. El registro decía otra cosa: Turbopack
procesa el CSS en un proceso de Node aparte y ese proceso «terminó antes de que
pudiera conectarse», en el entorno de build de Hostinger. Webpack hace lo mismo
dentro de su propio proceso y compila igual en local. Primero se probó con la
variable `IS_WEBPACK_TEST=1`, un flag interno de Next que solo elige el
empaquetador, sobre el `v0.11.0` ya subido. Después se pasó al script, porque un
flag interno puede desaparecer en cualquier versión.

**Correo de Hostinger y no Google Workspace.** La guía anterior
(`2026-10-05-correos-del-pedido-y-las-ofertas-y-guia-de-workspace.md`) proponía
un remitente de Workspace en `@uniquecolombia.com`. El dominio ya tenía `MX`,
SPF, DKIM y DMARC de Hostinger, y el plan incluye el buzón: sale del dominio del
producto, sin licencia aparte. Reemplaza a esa guía; `docs/CORREOS.md` está
reescrita.

**Las contraseñas no pasaron por el agente.** El buzón lo creó Jesús en hPanel, y
la contraseña la escribió él en el `.env`, en Hostinger y en Supabase. La API de
correo de Hostinger tampoco ve la cuenta de Ivan, y el token de administración de
Supabase del `.env` estaba vencido.

## Qué quedó pendiente

- [ ] **La página de privacidad** (`src/app/privacidad/page.tsx`) nombra a
      Vercel como encargado del tratamiento. Es una obligación legal (skill
      `seo-y-legal`).
- [ ] **`APP_ENV` en lugar de `VERCEL_ENV`** en `src/lib/payments.ts`, antes de
      encender BOLD en Hostinger. Mientras tanto, `BOLD_MODO_PRUEBAS` vacía.
- [ ] Variables de pago (BOLD y `PAGO_*`) en Hostinger, y el webhook de BOLD a
      `https://seregenera.com/api/webhooks/bold`.
- [ ] `.github/workflows/latido.yml` al dominio nuevo.
- [ ] Borrar `IS_WEBPACK_TEST` de las variables de Hostinger: sobra desde `v0.11.1`.
- [ ] El país de la visita: `x-vercel-ip-country` no existe fuera de Vercel.
- [ ] Apagar Vercel tras ≥ 2 semanas estables.
- [ ] `npm audit` todavía marca `braces` (a través del plugin de ESLint de Next):
      no hay versión corregida publicada y solo se usa al revisar el código.

## Qué se rompe si tocas esto

- **Quitar el `--webpack` de `build`** hace fallar el siguiente despliegue en
  Hostinger.
- **Cambiar las variables con el MCP** (`hosting_nodejs_replace-environment-variables`)
  borra todas las que no se manden, incluida `SMTP_PASSWORD`, que el agente no
  conoce. Se cambian en el panel.
- **Pegar el `.env` entero en el panel de Hostinger**, como pasó la primera vez,
  sube llaves que la app no usa (token de Supabase, credenciales de Hostinger).
  Se limpiaron el mismo día.
- **Borrar el sitio en hPanel** deja el dominio aparcado. Se hizo una vez a
  propósito, para recrearlo como Web App.

## Verificación

- Builds `v0.11.0` y `v0.11.1` completados en Hostinger (registro: «Next.js
  16.3.8 (webpack)», «Deployment completed»).
- `curl`: `/`, `/catalogo`, `/proveedores`, `/entrar`, `/registro`,
  `/api/latido` y `/robots.txt` en 200; el catálogo enlaza las mismas 20 ofertas
  que Vercel; están CSP, HSTS y `X-Frame-Options`; `robots.txt` dice
  `https://seregenera.com`.
- `hosting_nodejs_list-vulnerabilities` vacío tras `v0.11.1`.
- Correo: login SMTP aceptado; un código de acceso pedido a Supabase (`/otp`,
  respuesta 200) y un correo de la app llegaron a la bandeja de entrada (no a
  spam), los dos desde `info@seregenera.com`.
- En local, antes de cada tag: `npm run build`, `npx tsc --noEmit`,
  `npx eslint .` (0 errores) y `npm test` (61 pruebas) en limpio.
