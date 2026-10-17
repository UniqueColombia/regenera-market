# Las plantillas de Supabase salen del repositorio, los legales dejan Vercel y el proveedor cobra después de la entrega

- **Fecha:** 2026-10-17
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-legales-y-correos` (entrega directa, sin tag)
- **Fase del roadmap:** — (correos, legales y propuesta de envíos y pagos)

## Qué se hizo

1. **Las seis plantillas de correo de Supabase, subidas desde el repositorio** con
   un script nuevo, `scripts/plantillas-supabase.mts`, que compara el panel con
   `plantillas-correo/` y sube lo distinto por la API de administración. Leído el
   panel: solo *Confirm sign up* y *Magic link* tenían texto propio, de una versión
   vieja y **sin logo**; las otras cuatro seguían en inglés, de fábrica. El *Site
   URL* pasó de `https://www.seregenera.com/` a `https://seregenera.com`. Después de
   subir, el script confirma que las seis coinciden.
2. **El botón del correo mandaba a `https://0.0.0.0:3000`.** En Hostinger,
   `request.nextUrl.origin` es el del proceso detrás del proxy, no el dominio:
   `curl https://seregenera.com/auth/callback` devolvía
   `Location: https://0.0.0.0:3000/entrar?error=sin-codigo`. La ruta
   `/auth/callback` y la redirección de sesión caducada de `src/proxy.ts` toman
   ahora `NEXT_PUBLIC_SITE_URL`. **Sale con el próximo despliegue.**
3. **Privacidad y términos, vigencia 2026-10-17.** Hostinger en lugar de Vercel,
   que queda nombrado mientras siga el respaldo; la dirección de entrega (que ven
   el proveedor y su transportadora) y las reseñas, que no estaban en la tabla de
   datos; el NIT. Los términos describen el envío como funciona desde la 0017, el
   pago por llave Bre-B o transferencia, y **cuándo se le paga al proveedor**:
   entregado y `DIAS_PARA_RECLAMAR` (5) días hábiles sin reclamo.
4. **Aceptar los términos se dice junto al botón** en el registro y en la cesta, y
   `/vender` tiene una casilla obligatoria aparte de la de datos.
5. **El correo de contacto es `info@seregenera.com`** y la sociedad es Dimension
   Natural SAS, NIT 901812769-8, que dio Jesús. En `CONTACTO`, el pie y el
   `Organization` de la portada (`taxID`).
6. **Los correos del pedido llevan el plazo de entrega** («llega entre 2 y 5 días
   hábiles», el mismo `plazoDeEntrega()` de la cesta) y las formas de pago.
7. **Logo para la foto del remitente (BIMI)**: `public/bimi.svg`, en SVG Tiny PS,
   generado por `scripts/generar-marca.sh`. Faltan los registros DNS
   (`docs/CORREOS.md`, parte D).
8. **`docs/ENVIOS-Y-PAGOS.md`**: qué se copia de MercadoLibre y de Airbnb para el
   envío por cantidad y para pagarle al proveedor después de la entrega, con lo
   legal abierto y las decisiones de los dos. Sale de una investigación sobre sus
   páginas públicas; no hay código.

## Por qué así

**Un script y no pegar a mano.** Pegar en el panel fue la regla desde el
2026-09-11, y un mes después nadie sabía qué había pegado: el correo que más se
manda, el del código, salía sin logo. Con el repositorio como fuente, el script
compara, sube y comprueba las reglas que rompen el acceso sin avisar (`{{ .Token }}`
en registro y acceso, nunca `{{ .ConfirmationURL }}`, el código fuera del asunto).
Se descartó `supabase/config.toml` con `supabase config push`: obliga a versionar
toda la configuración de Auth, y lo que se quería era solo esto.

**`NEXT_PUBLIC_SITE_URL` y no `x-forwarded-host`.** No se sabe qué cabeceras
reenvía el proxy de Hostinger, y comprobarlo exigía desplegar una ruta de
diagnóstico. La variable ya manda sobre el SEO entero y está bien puesta en
producción (`robots.txt` la imprime). Sin ella, en un preview, se usa el origen
de la petición como antes.

**Los términos dicen cuándo cobra el proveedor, aunque la liquidación no esté
programada.** El dinero ya va por ese camino: el comprador paga a la cuenta de la
sociedad y alguien tiene que pagarle al proveedor. Lo que no estaba escrito era
cuándo. Cinco días hábiles es el retracto de la Ley 1480 (art. 47) y el plazo para
pedir la reversión (art. 51), y está entre lo que hace MercadoLibre en Colombia
(2 a 22 días según el envío y la reputación). Es una propuesta que confirma Ivan.

**Los términos dejan de decir quién factura.** Decían que la factura la emite el
proveedor. La investigación encontró que, en un mandato, el art. 1.6.1.4.9 del
Decreto 1625 de 2016 la pone en el mandatario. Entre prometer algo que puede ser
falso y no prometer nada hasta que lo decida un contador, lo segundo.

**No copiar a MercadoLibre en la cantidad.** Su costo de envío se multiplica por
unidad: con 50 unidades cobra 50 envíos. Lo que se propone es «unidades por
caja», que con 1 por defecto cobra lo mismo que hoy.

**Su API de costos no sirve fuera de MercadoLibre**: exige el token de un usuario y
opera solo con ítems publicados allí. Se copia el modelo (peso facturable, límites
de una caja, retención hasta la entrega), no la tarifa.

**Las aceptaciones sin migración, por ahora.** La fecha ya existe (la cuenta, la
orden, `consent_at` de la postulación) y la versión es la `VIGENCIA_TERMINOS` de
ese día, que queda en el historial. Que los proveedores de antes acepten exige una
tabla nueva: está propuesta.

## Qué quedó pendiente

- [ ] **Desplegar** (tag): el arreglo del botón del correo está solo en el código.
      Antes, que Ivan lea los términos.
- [ ] Ivan: confirmar `DIAS_PARA_RECLAMAR`, leer los términos y poner los dos
      registros DNS de la parte D2 de `docs/CORREOS.md` en hPanel.
- [ ] Un contador: quién factura con el pago recaudado (ya aplica hoy).
- [ ] La foto del remitente en Gmail: la cuenta de Google con `info@` (parte D1).
- [ ] `NEW_SUPABASE_ACCESS_TOKEN` del `.env` de Jesús: renombrarla a
      `SUPABASE_ACCESS_TOKEN` (la de ese nombre está vencida).
- [ ] Que `www.seregenera.com` redirija a `seregenera.com`: hoy sirve el sitio en
      los dos, y una sesión abierta en uno no vale en el otro.
- [ ] Las decisiones de `docs/ENVIOS-Y-PAGOS.md`, y después programar la fase A
      (liquidación) y las cajas.
- [ ] Los proveedores de antes del 2026-10-17 no aceptaron los términos para
      vender: la tabla de aceptaciones.

## Qué se rompe si tocas esto

- **Volver a `request.nextUrl.origin` o a `request.url`** para construir una
  redirección: en Hostinger lleva a `0.0.0.0:3000`. Vale para cualquier ruta
  nueva que redirija con una URL absoluta.
- **Editar una plantilla en el panel de Supabase** sin pasar por el repositorio: el
  script la va a marcar como distinta, y un `--aplicar` la pisa con la del
  archivo.
- **Poner `www` o la barra final en el *Site URL*.** El script avisa.
- **Mover `public/bimi.svg`**: lo enlazará un registro DNS, y el logo desaparece sin
  que nada falle.
- **Cambiar `DIAS_PARA_RECLAMAR`** cambia lo que dicen los términos: es mover
  `VIGENCIA_TERMINOS` también.

## Verificación

- `node --env-file=.env scripts/plantillas-supabase.mts` antes de subir: seis
  plantillas distintas y el aviso del *Site URL*. Con `--aplicar --site-url
  https://seregenera.com`: «Subido: 13 campos». Repetido sin `--aplicar`: las seis
  «el panel ya coincide», nada que subir.
- `curl -s -o /dev/null -w "%{redirect_url}" https://seregenera.com/auth/callback`
  devolvía `https://0.0.0.0:3000/entrar?error=sin-codigo` (el arreglo se comprueba
  igual después de desplegar: tiene que decir `https://seregenera.com/entrar…`).
- `public/bimi.svg` rasterizado con ImageMagick: el isotipo crema sobre verde,
  dentro del círculo. El fragmento de `generar-marca.sh` reproduce el archivo byte
  a byte.
- `npm run build`, `npx tsc --noEmit`, `npx eslint .` (0 errores) y `npm test`
  (61 pruebas) en limpio.
- No comprobado: cómo se ven los correos en un buzón real después de subir las
  plantillas. Es el paso A5 de `docs/CORREOS.md`.
