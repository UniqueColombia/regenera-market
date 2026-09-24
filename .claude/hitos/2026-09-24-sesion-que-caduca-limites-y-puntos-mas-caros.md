# La sesión caduca sola, la Comunidad tiene freno, y el nivel cuesta

- **Fecha:** 2026-09-24
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-sesion-limites-y-puntos` → #<pendiente>
- **Fase del roadmap:** Endurecimiento de la beta — no es una fase nueva

## Qué se hizo

Cinco cosas que comparten un hilo: **todo lo que estaba abierto porque nadie lo
había cerrado todavía.**

1. **La sesión se cierra sola a las 48 horas sin usarse**, y ninguna vive más de
   30 días aunque se use a diario. Antes no caducaba nunca: quien entró una vez
   en el computador de su casa seguía dentro semanas después, y si era
   administrador, el panel también. El reloj lo lleva una cookie `httpOnly`
   firmada y **atada al id de quien la tiene**.
2. **La Comunidad tiene límites de ritmo en la base**: 30 segundos entre
   publicaciones, 3 al día, 10 al mes, 60 reacciones por hora.
3. **Los puntos de experiencia bajaron y aparecieron topes** donde no los había.
   Publicar en la Comunidad pasó de 30 puntos sin tope a 10 con tope de 4 al mes.
4. **Los cuatro caminos públicos de la aplicación cuentan intentos** — entrar,
   registrarse, comprar y postular — y los dos endpoints de `/api` también.
5. **Existe `/legal`**, que reúne términos, privacidad y cookies en una página
   con nombre propio, enlazada desde la columna de plataforma del pie y no solo
   desde la letra pequeña de abajo. Y el sitio manda **cabeceras de seguridad**
   en todas sus respuestas.

## Por qué así

### La caducidad se lleva en una cookie, no en la base

Supabase renueva el token mientras exista un token de refresco válido, y ese
token **no caduca por no usarse**. Supabase tiene un ajuste de «inactivity
timeout» en Authentication → Sessions, pero es de plan pago: hoy no lo tenemos.

Se descartó guardar la última actividad en Postgres. El reloj hay que mirarlo en
**cada petición** —`src/proxy.ts` ya corre en cada petición— y eso sería una
escritura por página vista: más caro que la medición de uso entera.

Queda en una cookie `httpOnly` llamada `sgr_actividad` con el id de su dueño y
dos marcas de tiempo —`inicio` y `ultima`— firmados con HMAC-SHA256
(`SESION_SECRETO`). La firma importa por un motivo concreto: las cookies de
sesión de `@supabase/ssr` **no** son `httpOnly` —el cliente del navegador las
necesita—, así que un XSS puede copiarlas. Con la firma, quien se las lleve no
puede fabricarse la de actividad; y con el id dentro, tampoco le sirve pedir una
prestada a una cuenta suya. El segundo trozo llegó tarde, y por qué está más
abajo.

**Sin `SESION_SECRETO` el corte sigue funcionando, sin firma.** Se degrada en vez
de romperse porque un clon sin credenciales tiene que poder levantar el sitio
(`docs/DEPLOY.md`), y porque el día que la variable se ponga en Vercel lo único
que pasa es que todo el mundo entra otra vez una vez.

### «No hay cookie de actividad» significa «caducada», y no «acaba de entrar»

Es la decisión de la que cuelga todo lo demás. Lo cómodo sería que el proxy
creara la cookie cuando falta, pero entonces la protección se salta borrándola.
Con la regla estricta, la cookie la tienen que crear **los sitios que abren
sesión**, que son cuatro: los tres de `src/app/entrar/actions.ts` (todos pasan
por `confiarEnEsteAparato()`, y por eso la llamada está ahí dentro y no repetida
tres veces) y `src/app/auth/callback/route.ts`.

El riesgo de olvidar un quinto camino es real, pero **el fallo es ruidoso**:
entras, y el proxy te devuelve a `/entrar` en el acto. Se descubre la primera vez
que alguien prueba ese camino, no meses después.

Efecto secundario conocido y aceptado: **al desplegar esto, todo el mundo entra
otra vez una vez**, porque nadie tiene todavía la cookie.

### Los límites van en Postgres; el limitador en memoria es para lo que no puede

La clave anon es pública por diseño, así que un límite escrito en una Server
Action se salta con `curl` contra PostgREST. Por eso los de la Comunidad son dos
triggers `before insert` de la migración `0011`.

`src/lib/ritmo.ts` existe solo para lo que **no puede** vivir en la base: un
formulario que todavía no ha llegado a ella (`/entrar` habla con Supabase Auth,
no con nuestras tablas), los dos endpoints que a propósito no exigen sesión, y el
`checkout`, que se puede disparar sin cuenta. Su cabecera dice sin adornos lo que
no garantiza: **la cuenta vive en memoria de cada instancia**, así que frena a
quien insiste y no a quien reparte. El límite de verdad, cuando el sitio abra a
gente real, es el cortafuegos de Vercel.

### Los puntos: se recortan los valores, no se mueven los umbrales

Raíz sigue en 600 y Bosque en 2.500. Subirlos habría hecho **caer de nivel** a
quien ya lo tiene, y el nivel es la comisión que esa empresa tiene pactada de
hecho — 12 / 10 / 8 %. Bajar a alguien de Raíz a Semilla es subirle la comisión
dos puntos sin avisar.

Por lo mismo **no se recalculó `experience_events`**: es el registro de lo que
pasó, y reescribirlo sería mentir sobre el pasado. Quien ganó 30 puntos por una
publicación de agosto los ganó. Ningún proveedor cambia de nivel con esta
migración.

El criterio del recorte, en una frase: **lo que se hace solo vale menos; lo que
exige que otro te compre vale más.** La tabla completa está en `docs/NIVELES.md`.

### La revisión de seguridad encontró dos cosas, y las dos eran reales

Se pasó un chequeo de seguridad sobre el diff entero antes de abrir el PR. Sacó
dos fallos en el mecanismo nuevo, los dos de gravedad media, y los dos están
corregidos en esta misma rama. Quedan escritos porque son la clase de error que
se vuelve a cometer:

**1. El corte solo cortaba las navegaciones HTML.** `cerrarPorInactividad()`
borraba las cookies de la **respuesta**, no de la petición. Para una navegación
daba igual —hay redirect— pero una acción de servidor o una petición RSC seguían
su camino con la cabecera `cookie` intacta, así que `getUser()` validaba el token
de acceso (que puede tener hasta una hora de vida) y **esa petición corría
autenticada**. Como toda mutación de esta aplicación es una Server Action, el
corte no protegía ninguna de ellas: el primer clic de quien se sentara en el
computador de otro se ejecutaba como esa otra persona.

Arreglo: `request.cookies.delete(...)` **antes** de construir la respuesta, y
esperar a la revocación en vez de dejarla suelta. Con eso hizo falta darle al
cliente que revoca una copia congelada de las cookies — el de arriba las lee en
vivo y se habría quedado sin sesión que revocar.

**2. La cookie de actividad no era de nadie.** Firmada, sí, pero lo firmado eran
dos marcas de tiempo: cualquier `sgr_actividad` válido valía para cualquier
sesión. El ataque no era falsificarla, era **conseguirla**: registrar una cuenta
desechable, entrar, quedarse con la cookie recién firmada por nosotros y pegarla
a unas cookies de sesión robadas. La sesión ajena revivía, y con `inicio` puesto
por el atacante también se saltaba el tope de los 30 días. Coste: una cuenta
gratis.

Arreglo: lo firmado empieza por el id del usuario, `abrirVentanaDeActividad()`
lo exige como argumento, y el proxy lo contrasta con `getUser()`. Una cookie de
actividad solo sirve para su dueño.

De paso, sobre la `0011`: `revoke ... from public` no basta si el proyecto tiene
concesiones explícitas a `anon` o `authenticated` —Supabase trae plantillas de
`alter default privileges` que las ponen—, así que `otorgar_experiencia()` y
`experiencia_topada()` se revocan también de esos dos roles por nombre. Sin eso,
cualquiera con cuenta podría darse experiencia contra PostgREST, que es bajarse
la comisión. El `revoke` va en un `do` que comprueba que el rol exista, para que
la migración siga corriendo en un Postgres sin los roles de Supabase.

### La CSP lleva `'unsafe-inline'` en `script-src`, y hay que decirlo

Next inyecta scripts en línea para hidratar. La única forma de no permitirlos es
un `nonce` por respuesta, que obliga a renderizar cada página en cada petición —
o sea a renunciar al prerenderizado del catálogo y de las fichas, que es de donde
sale la velocidad del sitio. **Con `'unsafe-inline'` esta CSP no es una defensa
contra XSS**, y no se debe presentar como tal. Lo que sí cierra: `frame-ancestors`
(clickjacking), `form-action` (exfiltración por formulario inyectado),
`base-uri`, `object-src` y `connect-src`.

`img-src` acepta cualquier `https:` porque hoy la foto de una oferta es una
dirección de texto que escribe el proveedor y `listing-media.tsx` la pinta con un
`<img>` pelado. El día que subir el archivo sea obligatorio, esa línea se cierra.

## Qué quedó pendiente

- **La `0011` está escrita y sin aplicar.** No obliga a ningún orden respecto al
  despliegue: no toca ninguna tabla, columna ni política.
- **`SESION_SECRETO` no está en Vercel.** Sin ella el corte funciona igual, sin
  firma. Ponerla cierra la sesión de todos una vez.
- **Nadie ha probado el ciclo completo de acceso con esto puesto.** Lo que sí se
  comprobó está abajo, en Verificación; lo que falta es entrar de verdad con una
  cuenta real y ver que la cookie se escribe. **Es lo primero que hay que hacer
  tras desplegar**, porque si `abrirVentanaDeActividad()` fallara, nadie podría
  entrar.
- **El corte por inactividad no revoca en Supabase si la revocación falla.** Se
  espera a `signOut({ scope: "local" })` pero se ignora su error: las cookies se
  van igual, y un token de refresco podría sobrevivir en el servidor de Supabase.
- **Nadie ha comprobado las ACL reales de `otorgar_experiencia()` en la base.**
  La `0011` las revoca de `public`, `anon` y `authenticated`, pero eso solo se
  ve aplicado: `select proname, proacl from pg_proc where proname in
  ('otorgar_experiencia', 'experiencia_topada');` — no debe aparecer `anon=X` ni
  `authenticated=X`.
- **`cotizacion_respondida` sigue sin tener quién lo dispare.** Se le puso tope
  (10 al mes) para no volver a dejar un evento repetible sin él, pero la pantalla
  de respuesta a cotización no existe.
- **`/legal` no está enlazada desde `/cuenta`.** Se llega desde el pie, desde el
  sitemap y desde las dos páginas legales.

## Qué se rompe si tocas esto

- **Si borras la llamada a `abrirVentanaDeActividad()` de
  `confiarEnEsteAparato()`, nadie puede entrar.** El síntoma es un rebote a
  `/entrar` justo después de acceder, sin ningún error.
- **Si quitas del proxy la comparación `user.id !== actividad.sujeto`**, la
  cookie de actividad vuelve a valer para cualquier sesión y el hallazgo 2 de
  arriba se reabre. No es una comprobación redundante aunque lo parezca: la
  firma dice que la cookie la hicimos nosotros, no para quién.
- **Si mueves el borrado de `request.cookies` por debajo de la construcción de
  la respuesta**, el hallazgo 1 se reabre: `NextResponse.next()` fotografía las
  cabeceras en el momento de construirse.
- **Si quitas `src/proxy.ts` o le cambias el `matcher`**, deja de haber corte por
  inactividad **y** deja de renovarse el token — los dos fallos a la vez, y el
  segundo aparece intermitente horas después.
- **Si cambias un número de la migración `0011`, cambia el gemelo de
  `src/lib/niveles.ts`.** Si divergen, `/niveles` promete puntos que la base no
  da, y el proveedor lo nota antes que nosotros.
- **Si cambias un mensaje de excepción de los triggers de ritmo** (`limite-ritmo`,
  `limite-diario`, `limite-mensual`, `limite-reacciones`), cambia el mapa
  `LIMITES` de `src/app/comunidad/actions.ts`: si no coinciden, el usuario ve el
  mensaje genérico y no se entera de que topó.
- **`src/lib/inactividad.ts` no puede importar `next/headers`.** Lo importa el
  proxy, que Next puede ejecutar en el entorno de borde. Por eso la parte que
  escribe la cookie vive aparte, en `src/lib/sesion.ts`.
- **Si esto se muda al VPS propio**, hay que comprobar que Nginx o Caddy
  reescriban `x-forwarded-for`. Si no, `src/lib/ritmo.ts` pasa a contar lo que el
  atacante quiera.

## Verificación

`npm run build`, `npx tsc --noEmit` y `npx eslint .` en limpio (los 94 avisos de
eslint son de `.claude/skills/impeccable/scripts/`, y ya estaban).

Doce comprobaciones de `src/lib/inactividad.ts` compiladas y ejecutadas con
Node, todas en verde: cookie recién sellada vale y dice de quién es · sin cookie
se cierra · firma manipulada se cierra · marca de tiempo alterada sin refirmar se
cierra · sujeto cambiado sin refirmar se cierra · una cookie de otro es válida en
sí misma (la ata el proxy, y la prueba fija ese contrato) · sin firma habiendo
secreto se cierra · sujeto que no es un id se cierra · pasada la inactividad se
cierra · justo dentro vale · pasada la vida máxima se cierra aunque se use ·
marca en el futuro se cierra.

Más un chequeo de seguridad sobre el diff completo, cuyos dos hallazgos están
arriba y corregidos.

Contra el servidor de producción compilado (`next start`, puerto 3111):

```
# Cabeceras: CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy
curl -s -D - -o /dev/null http://localhost:3111/legal

# Sesión sin ventana de actividad → 307 a /entrar?caducada=1&volver=…
# y Set-Cookie borrando la de Supabase y la de actividad
curl -s -D - -o /dev/null -H "Accept: text/html" \
  -H "Cookie: sb-<ref>-auth-token=falso" http://localhost:3111/cuenta/empresa

# Una acción de servidor (POST) NO se redirige: responde 200 sin sesión
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  -H "Cookie: sb-<ref>-auth-token=falso" http://localhost:3111/comunidad

# El tope del latido: veinte 200 y luego 429
for i in $(seq 1 25); do curl -s -o /dev/null -w "%{http_code} " \
  http://localhost:3111/api/latido; done
```

`/legal` renderiza, sale en `sitemap.xml`, y `/entrar?caducada=1` enseña el
aviso.

**Lo que no se comprobó:** nada contra la base real. La migración `0011` no se ha
aplicado, así que los límites de la Comunidad y los puntos nuevos están escritos
y sin ejecutar. Y la revisión visual la hace una persona — aquí no hay navegador.
