# La migración a Postgres dejó dos cabos sueltos: el enlace del correo y la cesta fantasma

- **Fecha:** 2026-09-11
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `fix/js-enlace-correo-token-hash` → #36 · `fix/js-carrito-fantasma` → #38
- **Fase del roadmap:** 1 y 2 — corrección sobre los Bloques 1, 2 y 3 ya cerrados

Continúa [2026-09-07-release-v0-3-0-en-produccion.md](2026-09-07-release-v0-3-0-en-produccion.md).

## Qué se hizo

Dos correcciones de cosas que solo se ven con la aplicación en producción y
usándola de verdad, no leyendo el diff. Ninguna de las dos aparece en el
`docs/BETA.md`: son deuda que dejó el paso del catálogo a Postgres y que nadie
había pisado todavía porque nadie se había registrado ni había comprado.

1. **El enlace del correo de acceso no llevaba a ninguna parte** (`v0.3.1`).
2. **La cesta contaba artículos que por dentro no existían** (`v0.3.2`).

## Por qué así

### El correo: el problema estaba en el panel, no en el código

El síntoma era que el correo trae un enlace y `/entrar` pide seis dígitos. La
lectura fácil —«el código de acceso está mal implementado»— es falsa:
`signInWithOtp` + `verifyOtp({ type: "email" })` es exactamente el flujo que la
documentación de Supabase describe, y sirve tanto para quien ya tiene cuenta como
para quien se registra. `src/app/entrar/actions.ts` no se tocó.

Lo que faltaba era `{{ .Token }}` en las plantillas de correo. Las de fábrica
solo traen `{{ .ConfirmationURL }}`, y **eso es configuración del panel de
Supabase, no del repositorio**: no hay `supabase/config.toml` aquí, así que no
existe forma de versionarlo ni de que el CI lo detecte. Por eso vive en las
«Trampas vigentes» de `docs/ESTADO.md` y no en un archivo de configuración.

Son **dos** plantillas y no una. `signInWithOtp` manda *Magic Link* si el usuario
existe y *Confirm signup* si no. Arreglar solo una deja la mitad de los casos
rota de una forma especialmente confusa, porque depende de a quién le pase.

Y lo segundo, que sí era código: `/auth/callback` solo entendía `?code=` (PKCE).
Se descartó apoyarse en `{{ .ConfirmationURL }}`, que es lo que hace todo tutorial
que uno encuentra: esa variable apunta al `/auth/v1/verify` de Supabase, que
verifica allá y devuelve al *Site URL* con el token en el fragmento `#`. Un
fragmento no viaja al servidor. El usuario aterrizaba en la portada, sin sesión y
sin ningún error visible — el peor fallo posible, porque no parece un fallo.

El enlace de la plantilla apunta ahora a
`{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email`, y la ruta
canjea eso con `verifyOtp`. `type` se contrasta contra una lista fija porque
llega de la barra de direcciones y el tipo `EmailOtpType` de la librería incluye
`(string & {})`, o sea que como filtro no sirve de nada.

De paso, `/entrar` recibía `?error=` desde esa ruta y no lo mostraba. La frase se
elige en la página contra una tabla y **no viaja en la URL**: si viajara,
cualquiera podría escribir el mensaje que ve la víctima armando un enlace.

### La cesta: subir la versión de la clave, y arreglar lo que había debajo

Síntoma: el contador de la cabecera marcaba 4 y `/carrito` decía «tu cesta está
vacía». Llevaba días así.

La causa de fondo es que **los identificadores cambiaron de forma** con la
migración: en `src/data/` eran cadenas como `l-amenities-organicos` y en la base
son uuid generados (`scripts/seed.mts`). Un carrito guardado antes no está
desactualizado, es **intraducible**. `getListingsByIds` ya descartaba lo que no
fuera uuid —si no, Postgres rechaza la consulta entera— y devolvía cero ofertas.

Se descartó migrar los carritos viejos. El puente id-viejo → uuid solo existe
dentro de `scripts/seed.mts` y habría que reconstruirlo en el navegador para
rescatar cestas de una beta que no ha tenido un solo comprador. `STORAGE_KEY`
sube a `.v2` y los descarta todos de golpe, sin consultar al servidor y para
cualquiera que tuviera uno abierto.

**Pero subir la clave sola habría tapado el bug de verdad.** Existía ya una
limpieza automática —`droppedIds`— que debía haber resuelto esto sin que nadie se
enterara, y no lo hizo: devolvía identificadores sueltos y el cliente llamaba
`removeLine(id)` sin la fecha, mientras `sameLine` compara **también** la fecha.
Una línea con fecha, o sea una experiencia reservada, no empareja nunca con
`date === undefined`: sobrevive a toda limpieza, se queda sumando en el contador
y la página la declara inexistente. Es inmortal.

`dropped` lleva ahora la identidad completa. Sin ese arreglo, el siguiente retiro
de una oferta con fecha reproduce el mismo síntoma y el `.v2` no habría servido
de nada.

## Qué quedó pendiente

- **Las plantillas de Supabase siguen sin pegar** en el momento de escribir esto.
  Hasta que estén, el registro no funciona para nadie: el correo llega sin código
  y con un enlace que no apunta a `/auth/callback`. Es el único paso que separa a
  la beta de poder recibir a una persona real, junto con el SMTP.
- **Nada de esto se probó de punta a punta con un correo real**, por lo mismo.
  Lo verificado es el comportamiento de las rutas, no el viaje completo.
- **Sin revisión visual.** Ni `/entrar` con el mensaje de error puesto, ni la
  cesta después del `.v2`.
- Sigue pendiente todo lo de `docs/ESTADO.md`: SMTP de Workspace, las tres
  variables de Supabase en *Preview*, y que alguien sea admin.

## Qué se rompe si tocas esto

- **`STORAGE_KEY` en `src/components/cart.ts`.** Subir la versión **tira el
  carrito de todo el mundo**. Se hace cuando lo guardado deja de poder
  resolverse, no cuando cambia la forma de la vista. Bajarla no recupera nada.
- **`sameLine` compara `listingId` y `date`.** Cualquier función nueva que quite
  o busque una línea tiene que pasar las dos cosas. Pasar solo el id compila, no
  falla, y deja líneas inmortales — que es exactamente este bug.
- **La plantilla de correo no puede volver a `{{ .ConfirmationURL }}`.** Si
  alguien la «arregla» a lo que dice cualquier tutorial, `/auth/callback` deja de
  recibir visitas y el enlace vuelve a no hacer nada, en silencio.
- **`src/app/entrar/actions.ts` está bien.** El síntoma del correo apunta hacia
  ahí y no es ahí. Antes de tocarlo, mirar las plantillas del panel.
- **`middleware.ts` no existe aquí, es `src/proxy.ts`** — sigue vigente, y sigue
  siendo lo primero que rompe quien copie un tutorial de Supabase para Next 15.

## Verificación

`npm run build`, `npx tsc --noEmit` y `npx eslint .` en limpio en las dos ramas, y
los checks de CI en verde antes de cada merge.

Contra producción, después de desplegar `v0.3.1`:

| Prueba | Esperado | Obtenido |
|---|---|---|
| `/catalogo` | 200 y 18 ofertas | 200, 18 |
| `/admin` sin sesión | 307 | 307 |
| `og:image` | el dominio real | el dominio real |
| `/auth/callback` sin parámetros | 307 a `/entrar?error=sin-codigo` | igual |
| `/auth/callback?token_hash=falso&type=email&next=https://ejemplo.com` | no sale del dominio | 307 a `/entrar?error=codigo-invalido` |
| `/entrar?error=codigo-invalido` | muestra el mensaje | lo muestra |

La última fila fue además la señal de que el despliegue había aterrizado: el
mensaje no existía en `v0.3.0`.

Lo de la cesta **no se comprobó contra producción antes de escribir esto** — se
comprueba abriendo el sitio con el carrito viejo todavía en el navegador y viendo
el contador en cero, sin vaciar nada a mano.
