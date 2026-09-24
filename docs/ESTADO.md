# Dónde estamos

**Este archivo responde a «¿en qué vamos?».** Es el único que dice qué está a
medias *ahora mismo* y qué sigue. Si acabas de hacer `git pull` y quieres saber
qué hacer, empieza aquí y no en el ROADMAP.

- **Corte:** 2026-09-24 (segunda tanda del día)
- **Producción:** `v0.8.0` en `main` → **https://regenera-market.vercel.app**
- **Fase del roadmap:** 0 cerrada. Bloques 0, 1, 2 y **3** de `docs/BETA.md`
  cerrados y **en producción**.

> ## ⚠️ Sin desplegar: la sesión caduca, la Comunidad tiene freno y los puntos cuestan
>
> Es la tanda del 2026-09-24 por la tarde, y trae **dos cosas que se notan el
> primer día**:
>
> 1. **Al desplegar, todo el mundo entra otra vez.** La sesión ahora caduca a las
>    48 horas sin uso (y a los 30 días pase lo que pase), y el reloj lo lleva una
>    cookie que nadie tiene todavía. No es un fallo: sin cookie de actividad, la
>    sesión se trata como caducada. Quien lo vea aterriza en `/entrar` con el
>    aviso puesto.
> 2. **La migración `0011` ya está aplicada** (Jesús, 2026-09-24). No obligaba a
>    ningún orden: no toca ninguna tabla, columna ni política. Los límites de la
>    Comunidad y los puntos nuevos ya rigen en la base, así que lo que queda es
>    desplegar el código que los traduce a mensajes en español — hasta entonces,
>    quien tope ve el error genérico.
>
> ```sql
> -- Comprobación, si hace falta repetirla: 2 = sí
> select count(*) from pg_trigger
>  where tgname in ('community_posts_ritmo', 'community_reactions_ritmo');
> ```
>
> **Falta poner `SESION_SECRETO` en Vercel** (Production, y de paso Preview).
> Sin ella el corte por inactividad funciona igual, pero la cookie que lo lleva
> va sin firmar y se puede falsificar. Ponerla o cambiarla cierra la sesión de
> todos **una vez**. Se genera con `randomBytes(32).toString("hex")`.
>
> **Lo primero que hay que probar después de desplegar es entrar.** Si
> `abrirVentanaDeActividad()` fallara, nadie podría: el síntoma sería un rebote a
> `/entrar` justo después de acceder. Nadie ha hecho ese ciclo todavía contra la
> base real. El detalle está en
> [el hito](../.claude/hitos/2026-09-24-sesion-que-caduca-limites-y-puntos-mas-caros.md).

> ## La migración `0010` está aplicada: ya hay analíticas
>
> **La aplicó Jesús el 2026-09-24.** Creó `page_views` y las dos funciones,
> `registrar_visita()` y `admin_analiticas()`. Desde que corrió es inmutable como
> las nueve anteriores, y `/admin/analiticas` ya mide de verdad en vez de avisar
> de que falta la migración.
>
> ```sql
> -- Comprobación, si hace falta repetirla
> select to_regclass('public.page_views');   -- null = no
> ```
>
> **El consentimiento de cookies subió a la versión 2**, así que todo el mundo
> ve el aviso otra vez. Es intencional: el «sí» anterior era a una medición que
> no existía. Las cifras de tráfico **solo cuentan a quien acepta**, y por eso
> son un piso y no el total. El detalle está en
> [el hito](../.claude/hitos/2026-09-24-analiticas-propias-y-comunidad-sin-caidas.md).

> ## Resuelto: `/admin/comunidad` daba error (código `301622926`)
>
> `longDate()` recibía una marca de tiempo completa en vez de `AAAA-MM-DD` y
> lanzaba `RangeError` en el servidor. Se corrigió en `src/lib/format.ts`, que
> ahora acepta los dos formatos.

> ## La migración `0009` está aplicada
>
> **La aplicó Jesús el 2026-09-24.** Fue la primera de este repositorio que
> **no** obligaba a un orden: solo reemplaza el cuerpo de `postular_proveedor()`
> y no toca ninguna tabla, dato ni política.
>
> Lo que cambia: **el límite de tres postulaciones por correo al día deja de
> aplicar a quien tiene sesión**. Contaba por correo sin mirar si había cuenta,
> y producía una trampa que se reportó el 2026-09-19 — alguien intenta dar de
> alta su empresa, algo falla, reintenta, y al cuarto intento se queda sin poder
> registrarla hasta el día siguiente. Con sesión el tope no protege de nada: la
> función ya impide que una persona cree dos empresas.
>
> ```sql
> -- Devuelve también provider_id desde esta migración
> select pg_get_function_result(oid) from pg_proc where proname = 'postular_proveedor';
> ```

> ## Resuelto: el alta de empresa fallaba para quien no tuviera página web
>
> **La causa estaba en la validación, no en la base.** El campo de página web
> tenía un `.refine()` que construía `new URL(u)`, y en Zod 4 los refinamientos
> se ejecutan aunque la validación anterior haya fallado. Con el campo vacío,
> `new URL("")` lanzaba, la excepción salía de `safeParse` y la acción reventaba
> antes de tocar la base — sin dejar ni una fila.
>
> **Le pasaba solo a quien dejaba el campo en blanco**, que en este marketplace
> es la mayoría. El alta del 2026-09-18 que sí funcionó llevaba página web, y
> por eso parecía que el camino estaba probado.
>
> Corregido y comprobado ejecutando la acción real de punta a punta. El detalle,
> y **cómo se cazó en tres pasos después de tres intentos fallidos leyendo el
> código**, en
> [el hito](../.claude/hitos/2026-09-20-la-causa-era-un-refine-que-lanzaba.md).
> La regla que queda —un `.refine()` no puede lanzar nunca— está en la skill
> `componentizacion`.

> ## Si alguien reporta «me dio error», hay con qué buscarlo
>
> Un fallo inesperado en el alta de una empresa enseña un **código de seis
> caracteres** en pantalla y escribe ese mismo código en los registros del
> servidor, con el motivo y la traza.
>
> Cuando llegue un reporte así: pide el código y búscalo en los registros de
> Vercel. Las líneas empiezan por `[postular]`, `[postular-rpc]`,
> `[postular-correo]` o `[empresa-imagen]`.
>
> **Y si no aparece nada en los registros, o hace falta acotar dónde falló**,
> estos tres pasos son los que funcionaron el 2026-09-20:
>
> 1. ¿Llegó a la base? `select ... from provider_applications where created_at >
>    now() - interval '1 day'`. Sin filas, el fallo es anterior a la base.
> 2. ¿Salió la petición? Los registros de peticiones de Supabase (panel →
>    Logs → API) dicen si hubo un `POST /rest/v1/rpc/...`. Sin petición, la
>    excepción es anterior a la llamada.
> 3. ¿Cuál es? Una ruta temporal que llame a la acción con el payload exacto y
>    devuelva `e.stack`. Se borra al terminar.

> ## Los despliegues de vista previa responden 500, y no es de esta tanda
>
> **Production está bien.** `NEXT_PUBLIC_SITE_URL` está puesta —comprobado el
> 2026-09-19: la portada de producción resuelve `og:image` contra
> `https://regenera-market.vercel.app` y no contra `localhost`—, así que el
> sitemap, el `robots.txt` y las canónicas que entran con esta tanda van a salir
> con el dominio correcto. Después de desplegar conviene verlo en claro:
>
> ```bash
> curl -s https://regenera-market.vercel.app/robots.txt | grep -E "Host|Sitemap"
> ```
>
> **El entorno Preview es otra historia.** Se descubrió al revisar el despliegue
> del PR #51: las páginas que consultan la base responden **500** y
> `/robots.txt` declara `Host: http://localhost:3000`. O sea que Preview no
> tiene ni las variables de Supabase ni `NEXT_PUBLIC_SITE_URL`.
>
> No lo causó esta tanda —producción, con el mismo código anterior, responde
> 200— y lleva ahí desde que existen las variables, pero hasta ahora nadie
> miraba un preview. La consecuencia práctica es que **el despliegue de vista
> previa de un PR no sirve para revisar nada que toque datos**, que es casi
> todo: quien revise un PR tiene que levantarlo en local.
>
> Se arregla copiando las cuatro variables al entorno Preview desde el panel de
> Vercel. Lo tiene que hacer Ivan, que es quien administra el proyecto: la
> cuenta de Jesús no lo ve desde la API.

> ## La migración `0008` está aplicada
>
> **La aplicó Jesús el 2026-09-19**, por el editor SQL del panel y antes de
> desplegar, que era el orden obligatorio. Desde que corrió es inmutable como
> las siete anteriores.
>
> ```sql
> -- 2 = los dos buckets existen y son públicos
> select count(*) from storage.buckets
>  where id in ('avatares', 'logos') and public;
>
> -- 0 filas = ningún contador de reacciones miente
> select p.id, p.reaction_count, count(r.*) as real
>   from community_posts p
>   left join community_reactions r on r.post_id = p.id
>  group by p.id, p.reaction_count
> having p.reaction_count <> count(r.*);
> ```
>
> Con eso **queda cerrada la auditoría del contador de reacciones** que este
> archivo tenía abierta. La respuesta no fue comprobarlo una vez: el contador
> dejó de llevarse a `+1` / `-1` y ahora se recuenta desde las filas, así que no
> puede separarse de la verdad más de una transacción. Si la segunda consulta
> devuelve filas alguna vez, entonces sí hay algo que mirar.
>
> Lo que sigue sin comprobar nadie, y solo se comprueba a mano: **subir una foto
> de perfil desde un teléfono**. El recorte ocurre en el navegador
> (`src/components/selector-imagen.tsx`) y Safari viejo ignora WebP en
> `toBlob`; hay una rama que reintenta en JPEG que nadie ha ejecutado.

> ## El 2026-09-19, también: el sitio ya tiene lo legal y lo que un buscador necesita
>
> Auditoría de 23 puntos. Once ya estaban bien —alt, favicon, Open Graph, idioma,
> un solo `<h1>` por página, errores en los formularios, paquete de JavaScript
> sano, cero mapas de código publicados— y doce se construyeron. Todo en
> [el hito](../.claude/hitos/2026-09-19-auditoria-seo-legal-y-errores.md), y lo
> que hay que hacer en cada página nueva a partir de ahora, en la skill
> `seo-y-legal`.
>
> Lo que conviene saber sin abrirlo:
>
> - **`/privacidad` y `/terminos`** existen, enlazadas desde el pie. Están
>   escritas desde el esquema real, no desde una plantilla. **Las tiene que
>   revisar un abogado** antes de que esto sea una beta abierta, y falta el NIT
>   y la dirección física de la sociedad — anotados como pendientes en
>   `src/lib/legal.ts` y **no inventados**.
> - **`robots.txt`, `sitemap.xml` y `/llms.txt` se generan**, no son archivos.
>   El sitemap sale de la base: hoy 41 URLs.
> - **Se bloquean los robots de entrenamiento de IA y se dejan pasar los de
>   búsqueda.** Son dos grupos distintos: los primeros no devuelven nada, los
>   segundos traen visitas citando la fuente. El porqué está en
>   `src/app/robots.ts`.
> - **Hay aviso de cookies**, con el consentimiento versionado y guardado en una
>   cookie —no en `localStorage`— para que lo pueda leer el servidor el día que
>   haya analítica. Hoy no hay ninguna, y el aviso lo dice.
> - **Hay 404 y dos límites de error.** Antes no había ninguno: una ruta
>   inexistente daba la pantalla por defecto de Next.
> - **Datos estructurados** en portada, ficha de oferta y ficha de proveedor.

> ## El 2026-09-19, en la misma tanda: cinco reacciones, fotos, y un agujero de privilegios cerrado
>
> Sin desplegar todavía. Lo que trae, y lo que conviene saber sin abrir
> [el hito](../.claude/hitos/2026-09-19-reacciones-fotos-y-nivel-propio.md):
>
> - **Las reacciones pasan de una a cinco** y se pueden marcar varias a la vez.
>   La semilla se queda y las que ya existían siguen siendo suyas.
> - **Cada persona pone su foto en `/cuenta` y cada empresa su logo en
>   `/cuenta/empresa`.** Se guardan en Supabase Storage por
>   `src/lib/almacenamiento.ts`, que es una interfaz con su implementación
>   detrás — **el plan es mudarlo al VPS propio cuando cierre el MVP**, y ese
>   día se escribe una implementación más y se cambia una línea.
> - **`/cuenta/empresa` es nueva**: el proveedor ve su nivel, cuánto le falta
>   para el siguiente, cuánto bajaría su comisión y **de dónde salió cada
>   punto**. Hasta ahora el nivel decidía la comisión y no había dónde mirarlo.
> - **`perfil_completo` (80 puntos) deja de ser teoría**, como pasó con los dos
>   de la Comunidad en la tanda anterior: existía en `otorgar_experiencia()`
>   desde la `0006` y no había forma de dispararlo. Ahora lo otorga un trigger
>   cuando la ficha tiene logo, titular, descripción y contacto.
> - **Un proveedor ya no puede subirse el nivel él solo.** `providers_member_update`
>   (de la `0001`) deja a cualquier miembro actualizar **cualquier** columna de
>   su empresa, y desde la `0006` eso incluye `experience_points`, del que sale
>   el nivel y por tanto la comisión: con la clave anon —pública por diseño— y
>   una sesión normal se pasaba del 12 % al 8 %. Nunca se explotó porque ninguna
>   ruta escribía en `providers` desde una sesión de proveedor; esta tanda
>   estrena la primera, así que se cerró antes. Lo cierra un trigger, no una
>   política: una política de Postgres no distingue columnas.

> ## El 2026-09-19 entró el release `v0.6.0`: existe la Comunidad, y el registro dejó de pedir la clave dos veces
>
> Una revisión de uso dejó ocho observaciones; siete eran arreglos y una era una
> sección entera que faltaba. Todo está en
> [el hito](../.claude/hitos/2026-09-19-comunidad-y-ocho-observaciones-de-beta.md).
>
> Lo que conviene saber sin abrirlo:
>
> - **`/comunidad`**: muro donde publica cualquiera con cuenta, a título personal
>   o firmando con una empresa que gestione. Solo lo que firma una empresa suma
>   experiencia. Se modera desde `/admin/comunidad`, que es la **séptima**
>   pantalla del panel.
> - **`articulo_publicado` (30) y `articulo_destacado` (80) dejaron de ser
>   teoría.** Estaban en `otorgar_experiencia()` desde la `0006` sin tener dónde
>   ocurrir, y `/niveles` los escondía con una lista `AUN_NO` que ya no existe.
> - **El registro termina en `/registro/listo`**, no en `/cuenta/clave`. Quien
>   acaba de elegir contraseña no debe volver a elegirla. `/entrar` no cambió:
>   ahí `necesitaClave` sigue haciendo lo que debe.
> - **La cláusula de datos de `/vender` ya no es colombiana.** Redacción general
>   más la norma del país elegido, desde `PAISES[].proteccionDatos`.
> - **En el móvil ya se llega a la cuenta.** `MenuUsuario` es `hidden sm:block`,
>   así que por debajo de 640 px la única opción era salir.
> - **Tres skills nuevas o ampliadas**: `redaccion-producto`, `acceso-y-registro`
>   y una sección de paridad móvil en `diseno-visual`.
> - **Se reescribieron los textos de medio sitio.** Dos rondas de observaciones:
>   la primera quitó las frases que decían lo que *no* pasa; la segunda, las que
>   describían la sección en tercera persona en vez de hablarle a quien lee. De
>   paso cayeron seis textos que además eran **falsos desde la `0006`**, porque
>   seguían diciendo que el nivel sale de la evaluación de sostenibilidad.

> ## El 2026-09-17 entró el release `v0.5.0`: el proveedor entra solo
>
> **Cambia el modelo de negocio, no solo el código.** Quien postula desde
> `/vender` con sesión abierta queda dado de alta en el acto, y su nivel se gana
> con actividad en vez de salir de la evaluación de sostenibilidad; la comisión
> baja con el nivel: 12 / 10 / 8 %. El porqué y las trampas, en
> [`docs/NIVELES.md`](NIVELES.md) y en
> [el hito](../.claude/hitos/2026-09-17-niveles-por-experiencia-y-alta-directa.md).
>
> **La migración `0006` se aplicó el 2026-09-17**, por el editor SQL del panel de
> Supabase y **antes** de desplegar, que era el orden obligatorio: el código lee
> columnas que hasta entonces no existían, así que al revés el catálogo entero
> habría respondido 500. Desde que corrió es inmutable como las cinco anteriores.
>
> ```sql
> -- 2 = las dos funciones existen. Es lo que se comprobó al aplicarla.
> select count(*) from pg_proc
>  where proname in ('postular_proveedor', 'otorgar_experiencia');
> ```
>
> **Salió sin el visto bueno de Ivan sobre la comisión, y ya lo tiene.** La tasa
> pasó de un 12 % fijo a 12 / 10 / 8 % según el nivel, que es negocio y no
> código; se lanzó sin confirmar para no frenar el release, y **Ivan lo confirmó
> el 2026-09-24**. Queda cerrado: 12 / 10 / 8 % es la comisión acordada.
> Cambiarla algún día es editar `NIVELES[].comision` en `src/lib/niveles.ts` y
> nada más — las órdenes ya emitidas no se tocan, porque cada ítem guarda la tasa
> con la que se cobró.
>
> **Lo único que quedó pendiente de esta tanda:** las cinco variables `SMTP_*` de
> `.env.example` en Vercel. Sin ellas el alta funciona igual y el correo de
> respaldo de cada postulación solo se escribe en la consola del servidor — nadie
> lo recibe, y no hay ningún error que lo delate.

> **El 2026-09-13 entró el release `v0.4.0`** (PR #42 → `staging`, #43 →
> `main`): acceso con contraseña y segundo factor por dispositivo, panel de
> administración de seis pantallas, órdenes y postulaciones en Postgres, y el
> latido diario contra la pausa de Supabase.
>
> Comprobado contra producción al desplegar: `/api/latido` responde `ok`,
> `/catalogo` 200, `/entrar` pide contraseña, `/admin` sin sesión redirige. El
> workflow `Latido` se disparó a mano y terminó en verde.

> **Antes de creerle a este archivo, comprueba que no está viejo.** Es el único
> documento del repositorio que caduca.
>
> ```bash
> git log --oneline $(git tag -l --sort=-v:refname | head -1)..origin/main
> ls .claude/hitos/ | tail -3
> ```
>
> Si hay commits o hitos posteriores al corte de arriba y este archivo no los
> menciona, está desactualizado: **gana el hito**. Quien avance un bloque
> actualiza este archivo en el mismo PR.

---

## ✅ Producción está configurada — y por qué eso hay que cuidarlo

**Resuelto el 2026-09-07** con el release `v0.3.0`. Las cuatro variables están en
el entorno **Production** de Vercel y el sitio sirve el catálogo desde Postgres.
Ver [el hito](../.claude/hitos/2026-09-07-release-v0-3-0-en-produccion.md).

Desde que `src/lib/repo.ts` consulta Postgres, **la aplicación ya no funciona sin
credenciales.** Es un cambio irreversible de propiedad: antes el catálogo vivía
en `src/data/` y el sitio se levantaba con `.env.local` vacío; ahora no.

Falla de forma ruidosa y con un mensaje que dice qué hacer, que es lo que se
quería — un sitio que sirviera datos de demostración en silencio sería peor.

**El verde del CI no protege de esto.** El build compila sin las variables: las
páginas que leen datos están marcadas `force-dynamic` y `getUser()` devuelve
anónimo cuando no hay Supabase configurado, para que un clon recién bajado
compile. Lo que falla sin ellas es el runtime. Corolario: **borrar o renombrar
cualquiera de las cuatro tumba el sitio en el siguiente despliegue y ningún check
te avisa.**

| Variable | Production | Preview |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | ✅ el dominio real | — (se queda en Production) |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | ❌ **falta** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | ❌ **falta** |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | ❌ **falta** |

`NEXT_PUBLIC_SITE_URL` es **por entorno**: en Production el dominio real, en
`.env.local` `http://localhost:3000`. Copiar el de local a Vercel deja el
`og:image` apuntando a localhost.

> `SUPABASE_SERVICE_ROLE_KEY` **jamás** lleva prefijo `NEXT_PUBLIC_`. El job
> `secretos` del CI falla si aparece en el código, y hace bien: esa clave en el
> bundle del navegador es acceso total a la base saltándose RLS.

### Cárgalas por el panel, no por el CLI

`https://vercel.com/uniquecolombias-projects/regenera-market/settings/environment-variables`

Se intentó con `vercel env add` y hay dos trampas que cuestan una hora:

1. **Guarda las comillas literalmente.** Un `NEXT_PUBLIC_SUPABASE_URL="https://…"`
   copiado de `.env.local` queda almacenado *con* las comillas, y ninguna
   petición a Supabase funciona. El CLI lo avisa con
   `! Value includes surrounding quotes`, en medio de mucho ruido.
2. **`vercel env add <nombre> preview` abre un prompt interactivo** (`? Git
   branch?`) que no se puede contestar si el valor llega por tubería. Los `add`
   de Preview se quedan colgados sin guardar nada.

Además, `vercel env add` **falla en silencio si la variable ya existe**: hay que
`vercel env rm <nombre> <entorno> --yes` antes de reintentar. Si el `created` del
`env ls` no cambia, no se guardó nada.

Y **al agregar una variable, los despliegues existentes no la toman**: hace falta
un build nuevo.

### Aparte del CLI y de las variables

- **Supabase → Authentication → URL Configuration.** ✅ hecho. El dominio de
  producción en *Site URL*, y `…/auth/callback` + `…/**` en *Redirect URLs*. Es
  independiente de `NEXT_PUBLIC_SITE_URL`: si ahí solo estuviera `localhost`, el
  código de seis dígitos falla en producción sin dejar claro por qué.
- **Vercel → Settings → Node.js Version.** El CI usa 22
  (`.github/workflows/ci.yml`); si no coinciden, el CI pasa en verde y producción
  falla.

### Cómo se comprueba que producción está viva

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://regenera-market.vercel.app/catalogo
#   200 = la base responde; 500 = faltan las claves de Supabase
curl -s https://regenera-market.vercel.app | grep -o '<meta property="og:image"[^>]*>'
#   si dice localhost:3000, falta NEXT_PUBLIC_SITE_URL
curl -s https://regenera-market.vercel.app/catalogo | grep -o 'href="/oferta/[a-z0-9-]*"' | sort -u | wc -l
#   18 = el catálogo sale de Postgres (repo.ts ya no importa src/data/)
```

---

## En una frase

Todo lo que hacía falta para operar la beta **está en producción**: el catálogo
sale de Postgres, el acceso pide contraseña con el código de seis dígitos como
segundo factor en dispositivos nuevos, el panel de administración tiene seis
pantallas —incluido el CRUD de ofertas, que permite cambiar el catálogo sin
desplegar—, las órdenes y las postulaciones se persisten, y hay dos
administradores. **Lo que falta ya no es construir la plataforma: es meterle
datos reales y proveedores reales.**

Y desde el 2026-09-17 **cayó el último portero**: el proveedor se da de alta solo
y el nivel se gana vendiendo, no esperando a que alguien apruebe su evaluación
([`docs/NIVELES.md`](NIVELES.md)). Queda una cosa de esa tanda sin poner: las
`SMTP_*` en Vercel, sin las cuales nadie recibe el correo de su postulación.

El 2026-09-24 se cerraron cuatro cosas que este archivo arrastraba desde hacía
una semana: **las once migraciones están aplicadas** —ninguna escrita sin
correr, por primera vez—, **el alta de proveedor y la Comunidad están probadas
en producción con datos reales**, e **Ivan confirmó la comisión 12 / 10 / 8 %**.
Lo que sigue abierto son las `SMTP_*` y desplegar la tanda de endurecimiento
(`v0.9.0`).

---

## Lo que ya está

| | Estado |
|---|---|
| Sitio navegable, identidad visual, interacción táctil, contraste AA | ✅ en producción |
| Prospector de proveedores (RUES → Excel) | ✅ |
| Proyecto de Supabase | ✅ ref `mgsrzlqellphmfbhpdoj`, región `us-east-2` |
| `0001_init.sql`, `0002_auth.sql`, `0003_busqueda.sql` | ✅ **aplicadas**, inmutables |
| `scripts/seed.mts` — catálogo sembrado | ✅ idempotente |
| `src/lib/repo.ts` contra Postgres | ✅ **Bloque 1 cerrado** |
| Registro y acceso por código (`/entrar`, `/registro`) | ✅ **Bloque 2 cerrado**, probado de punta a punta |
| SMTP propio y plantillas con `{{ .Token }}` | ✅ Gmail personal de Jesús, provisional |
| Vercel Production configurado y verificado | ✅ `v0.3.2`, **https://regenera-market.vercel.app** |
| `0004_clave_dispositivos_y_postulaciones.sql` | ✅ **aplicada** el 2026-09-13, inmutable |
| `0005_recursion_ordenes_y_cotizaciones.sql` | ✅ **aplicada** el 2026-09-13, inmutable |
| Que alguien sea admin | ✅ Jesús e Ivan, con `scripts/crear-admin.mts` |
| Contraseña + segundo factor por dispositivo | ✅ en producción desde `v0.4.0` |
| Las seis pantallas de `/admin` | ✅ en producción; falta `/admin/evaluaciones` |
| La séptima, `/admin/comunidad` | ✅ en producción desde `v0.6.0` |
| Órdenes y postulaciones en Postgres | ✅ en producción |
| Latido diario contra la pausa de Supabase | ✅ corriendo, 12:10 UTC |
| `0006_niveles_por_experiencia_y_alta_directa.sql` | ✅ **aplicada** el 2026-09-17, inmutable |
| `0007_comunidad.sql` | ✅ **aplicada** el 2026-09-19, inmutable |
| Comunidad: `/comunidad`, la sección de la portada y `/admin/comunidad` | ✅ en producción desde `v0.6.0`, **probada con datos reales** el 2026-09-24 |
| Niveles por experiencia y comisión por nivel (12/10/8 %) | ✅ en producción desde `v0.5.0` |
| Alta directa del proveedor (`postular_proveedor()`) | ✅ en producción; con sesión, postular crea la empresa en el acto |
| `/niveles` y la ficha con nivel y sello separados | ✅ en producción |
| Correo transaccional de la aplicación (`src/lib/correo/`) | 🟡 desplegado, **sin credenciales**: faltan las `SMTP_*` en Vercel |
| El OK de Ivan a la comisión por nivel | ✅ dado el 2026-09-24. Se había lanzado sin él, a conciencia |
| Alta de proveedor probada de punta a punta en producción | ✅ el 2026-09-24 |
| `0009`, `0010` y `0011` | ✅ **aplicadas** el 2026-09-24, inmutables |
| `/admin/evaluaciones` | ❌ la quinta pantalla de `docs/BETA.md` |
| Subir imágenes de una oferta | ❌ fuera de la beta a propósito |
| Fechas con cupo de una experiencia desde el panel | ❌ solo por script |
| Vercel Preview | ❌ faltan las tres de Supabase |
| Panel de proveedor | ❌ **Bloque 4, sin empezar** |
| Servidor propio (VPS) en vez de Vercel + Supabase | ❌ decidido, sin fecha |
| Caducidad de sesión por inactividad (48 h) y tope de vida (30 días) | 🟡 escrito y probado en local, **sin desplegar**; falta `SESION_SECRETO` en Vercel |
| Límites de ritmo en la Comunidad y puntos más caros | 🟡 migración `0011` **aplicada**; falta desplegar el código que traduce los topes a mensajes |
| Límites por IP en entrar, registro, checkout, postular y `/api` | 🟡 escrito, **sin desplegar**. En memoria de cada instancia: frena a quien insiste, no a quien reparte |
| Cabeceras de seguridad (CSP, HSTS, `frame-ancestors`, …) | 🟡 escrito y comprobado en local, **sin desplegar** |
| `/legal` — políticas y términos en una página | 🟡 escrito, **sin desplegar** |

---

## Lo que falta, y quién puede hacerlo

### ✅ Resuelto el 2026-09-11: el correo de acceso

**El registro funciona de punta a punta.** Se deja escrito aquí porque costó tres
hallazgos encadenados y porque la configuración vive en el panel, donde el
repositorio no la ve.

Lo que hubo que hacer, en este orden — **y el orden importa, no es opcional**:

1. **Un SMTP propio.** No es un muro de plan, no hace falta Pro: desde el 3 de
   junio de 2026 los proyectos gratuitos que usan el enviador por defecto de
   Supabase tienen las plantillas **bloqueadas**, y configurar un SMTP propio las
   desbloquea. De paso quita el límite de 2 correos/hora del enviador por
   defecto. Hoy está el Gmail personal de Jesús, provisional.
2. **`{{ .Token }}` en las dos plantillas**, *Confirm signup* y *Magic Link*.
3. **`Email OTP Length` en 6** (Authentication → Sign In / Providers → Email).
   Estaba en **8**, y la aplicación pedía seis.

**Se descartó el _Send Email hook_.** No desbloquea las plantillas: las
*reemplaza*, obligando a escribir el correo en código. Y una función de Postgres
no puede mandar un correo —Postgres no habla SMTP—, así que el ejemplo oficial
solo encola en una tabla y todavía hacen falta `pg_cron`, un proceso que la vacíe
y un proveedor externo. Se acaba necesitando el proveedor igual, más código
propio que mantener.

#### Cómo quedó configurado, para poder reproducirlo

**Authentication → Emails → Templates**, las dos plantillas con el mismo cuerpo.
`signInWithOtp` elige una u otra según el usuario exista, así que poner
`{{ .Token }}` en una sola deja la mitad de los casos rota según a quién le
toque. El enlace de cortesía apunta a
`{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email`, **nunca** a
`{{ .ConfirmationURL }}` — ver «Trampas vigentes».

Las plantillas van sin imágenes a propósito: Gmail bloquea las remotas hasta que
el destinatario las pide y no admite SVG, que es el único formato en que existe
el isotipo. La marca la llevan Georgia y el verde `#1b5b3d`, así que llegan
iguales siempre.

**Authentication → SMTP Settings.** El remitente tiene que ser la misma cuenta
que autentica: Gmail reescribe o rechaza un `From` que no sea suyo ni un alias
verificado.

**Las plantillas sobreviven al cambio de SMTP.** Son configuración aparte, así
que cambiar las credenciales al Workspace de Ivan no toca ni una línea de ellas.

Nada de esto está en el repositorio: aquí no hay `supabase/config.toml`, así que
ni se versiona ni el CI lo detecta. **Si alguien recrea el proyecto de Supabase,
esta sección es lo único que queda.**

Prueba de que sigue bien: registrarse en `/registro` con un correo real y
comprobar que el mensaje trae los seis dígitos **y** el enlace, y que los dos
entran.

### 🟠 Solo Ivan (`UniqueColombia`)

**1. SMTP de Google Workspace — el remitente definitivo.** Authentication → SMTP
Settings: `smtp.gmail.com`, puerto 587, con contraseña de aplicación de una
cuenta `@uniquecolombia` (exige verificación en dos pasos activa). Remitente tipo
`no-responder@uniquecolombia.com`, nombre visible «Seregenera».

**Ya no bloquea la beta.** El acceso funciona hoy con el Gmail personal de
Jesús; esto solo cambia quién aparece como remitente y sube el techo de envío a
~2.000 al día. Pero **hay que hacerlo antes de abrir a gente real**: un correo de
acceso que llega desde un Gmail personal no se sostiene frente a un hotel, y el
techo de una cuenta personal es de ~500 al día.

Prueba de que quedó: registrarse con un correo limpio y mirar el remitente.

**2. Integración de Supabase con GitHub.** Jesús es colaborador con permiso
`write`, no `admin`, así que al seleccionar el repositorio no le aparece
`regenera-market`. **No bloquea nada:** sirve para branching de base por PR, que
además es de plan pago.

**3. `bash scripts/politica-de-ramas.sh`.** Requiere admin. Comprobado el
2026-09-05: `admin: false` para `seiler18` y la protección sigue sin aplicarse.
Lo único que impone es que no se pueda borrar `main`.

```bash
gh api repos/UniqueColombia/regenera-market/branches/main/protection >/dev/null 2>&1 \
  && echo "aplicada" || echo "SIN aplicar"
```

### 🟠 Cualquiera con acceso a Vercel

**4. Las tres variables de Supabase en el entorno *Preview*.** Las de Production
ya están (desde el release `v0.3.0`). **No bloquea producción:** lo que hace es que los
despliegues de preview de cada PR compilen verde y luego fallen en runtime, o
sea que las previews no sirven para revisar nada que toque datos.

Se hace en el panel, editando cada una de las tres y marcando *Preview* además de
Production. `NEXT_PUBLIC_SITE_URL` se queda solo en Production. Ver arriba por
qué el CLI no sirve para esto.

**4b. `SESION_SECRETO`, con la que se firma el reloj de inactividad de la
sesión.** En Production y en Preview, con el mismo valor o con dos distintos —
da igual, no viajan entre entornos. **No bloquea nada:** sin ella la sesión
caduca igual a las 48 horas, pero la cookie va sin firmar y quien copie las
cookies de sesión de otro puede fabricársela. Ponerla cierra la sesión de todos
una vez, y por eso conviene hacerlo en el mismo despliegue que estrena la
caducidad, cuando de todos modos va a pasar.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 🟡 Cualquiera, una sola vez

**5. ✅ Resuelto el 2026-09-13: hay dos administradores.** Se hicieron con
`scripts/crear-admin.mts`, que crea la cuenta si no existe y asigna el rol en la
misma pasada. Los correos no se escriben aquí: el repositorio es público.

```bash
node --env-file=.env.local scripts/crear-admin.mts --listar
node --env-file=.env.local scripts/crear-admin.mts correo@ejemplo.com --nombre "Nombre Apellido" --avisar
```

**El arranque en frío era real y ahora está roto por diseño, no por accidente.**
La política `user_roles_admin_write` solo deja escribir roles a quien ya es
admin, así que el primero no se puede crear desde la aplicación: el script usa la
clave de servicio, que es uno de sus tres usos legítimos. A partir del segundo,
lo normal es usar `/admin/usuarios` y dejar que RLS conceda el permiso.

Una cuenta creada así **no tiene contraseña**: entra con código y la aplicación
le exige ponerse una antes de dejarla usar el panel.

**6. Rotar la contraseña de la base.** Settings → Database → *Reset database
password*. La que se usó para aplicar las migraciones pasó por un chat.

---

## Lo que sigue, por orden

### 0. Lo que quedaba a medias de los `v0.5.0` y `v0.6.0`

**Casi todo está cerrado.** De los seis puntos que arrastraba esta lista, cuatro
se resolvieron el 2026-09-24 y quedan dos, ninguno de los cuales bloquea nada
hoy.

| # | Qué | Quién | Bloquea |
|---|---|---|---|
| 1 | Las cinco `SMTP_*` en Vercel | Ivan | Que alguien reciba su correo |
| 2 | Paginar `/comunidad` | Agente | Nada hoy. Sí con volumen |
| 3 | `/admin/evaluaciones` | Agente | Aprobar evaluaciones sin SQL |
| ✅ | Probar el alta de proveedor en producción | — | Hecho el 2026-09-24 |
| ✅ | Probar la Comunidad en producción | — | Hecho el 2026-09-24 |
| ✅ | El OK de Ivan a la comisión 12/10/8 % | — | Dado el 2026-09-24 |

1. ✅ **Las once migraciones están aplicadas.** Las `0006` y `0007` el 2026-09-17
   y el 2026-09-19, antes de su despliegue porque lo exigían; la `0008` el
   2026-09-19; y las `0009`, `0010` y `0011` el 2026-09-24, que no exigían orden.
   **No queda ninguna migración escrita sin aplicar**, que es la primera vez que
   este archivo puede decir eso.
2. **Las cinco `SMTP_*` en Vercel** (Production, y de paso Preview). Las mismas
   credenciales que ya tiene Supabase en Authentication → SMTP Settings. Sin
   ellas nadie recibe el correo de respaldo de su postulación, y no hay ningún
   error que lo delate: se escribe en la consola del servidor y ya. **Viene
   arrastrándose desde el `v0.5.0`** y es lo único de esta lista que bloquea algo.
3. ✅ **El alta de proveedor está probada de punta a punta en producción** —
   Jesús, 2026-09-24. Era el camino que se había revisado línea a línea sin
   ejecutarlo nunca.
4. ✅ **La Comunidad está probada en producción** — Jesús, 2026-09-24. Incluida
   la reacción y su retirada, que era la que importaba porque fallaba en
   silencio. **El contador ya no es una promesa.**
5. ✅ **Ivan confirmó la comisión** 12 / 10 / 8 % el 2026-09-24. Había salido a
   producción sin su visto bueno para no frenar el lanzamiento.

### 0b. Lo que dejó abierto la Comunidad

Ninguno bloquea nada hoy. Están aquí para que no se pierdan.

- **Paginar `/comunidad`.** Hoy trae 30 publicaciones y el panel 200, sin
  cursor. Con volumen real hace falta uno por `created_at`.
- **Sin imágenes en las publicaciones**, por lo mismo que las ofertas: subir
  archivos está fuera de la beta. Es lo primero que se va a pedir.
- **A nadie le llega un aviso cuando se publica algo.** `/admin/comunidad` hay
  que ir a mirarlo. Si el muro se llena, esto pasa a ser lo primero.
- **Sin denuncia de una publicación.** Moderar depende de que un administrador
  la vea; un lector que encuentre algo fuera de sitio no tiene cómo avisar.
- ✅ **`articulo_publicado` ya tiene tope** (migración `0011`, aplicada): 4 al
  mes, y vale 10 puntos en vez de 30. De paso bajaron todos los demás valores y
  `cotizacion_respondida` también se topó. La tabla de antes y después está en
  [`docs/NIVELES.md`](NIVELES.md). **Los puntos ya otorgados no se
  recalcularon**, así que ningún proveedor cambia de nivel.
- ✅ **El muro ya no se puede inundar** (misma migración): 30 segundos entre
  publicaciones, 3 al día, 10 al mes y 60 reacciones por hora, impuestos por dos
  triggers `before insert`. Los mensajes que ve quien topa están en
  `src/app/comunidad/actions.ts`.

### 1. Abrir a proveedores reales

La plataforma ya hace lo que tenía que hacer. El siguiente paso no es código:

1. **El SMTP definitivo** (solo Ivan, punto 1 de arriba). Hoy el correo de acceso
   sale del Gmail personal de Jesús, con techo de ~500 al día. No se sostiene
   frente a un hotel.
2. **Cargar proveedores de verdad** desde `/admin/ofertas` y `/admin/usuarios`.
   Los 13 sembrados son ficticios y no se pueden presentar como reales —
   invariante 21.
3. **Ya no hace falta aprobar a nadie para que entre.** Con la 0006, quien
   postula con sesión queda dado de alta solo, con su empresa, su vínculo de
   dueño y su rol. `/admin/postulaciones` sigue existiendo para las que llegan
   **sin cuenta**, que son las únicas que quedan en `pending_review`.
4. **Enlazar con una persona a los proveedores viejos** (`/admin/usuarios`): los
   sembrados no tienen `provider_members`, y mientras una empresa no tenga a
   nadie, solo un administrador puede tocarla.

### 2. Lo que quedó fuera del Bloque 3, a conciencia

- **`/admin/evaluaciones`** — la quinta pantalla de `docs/BETA.md`. Las
  evaluaciones de sostenibilidad se siguen aprobando por SQL. No bloquea la beta
  mientras ningún proveedor haya llenado el cuestionario, que es hoy.
- **Las fechas con cupo de una experiencia** (`listing_availability`) solo se
  siembran con el script. Una experiencia creada desde el panel se puede comprar
  sin fecha.
- **Subir imágenes**: el formulario pide direcciones de texto. Estaba fuera de la
  beta a propósito, pero es lo primero que va a pedir un proveedor real.
- **Los dos secretos del latido** (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) los tiene
  que crear alguien con permiso de administración del repositorio — o sea Ivan;
  `seiler18` tiene `write` y no puede. **Sin ellos el latido funciona igual**: lo
  que se pierde es poder distinguir «se cayó Vercel» de «se pausó Supabase», que
  desde fuera se ven igual.

### 3. El Bloque 4 — panel de proveedor

Mismo patrón que `/admin` aplicado al otro rol. Depende del cabo suelto de arriba
(`provider_members`): mientras nadie se convierta en `provider`, no hay a quién
enseñarle ese panel.

### 4. Mudarse a servidor propio, y dejar de depender de Supabase

**Decidido, sin fecha: arranca cuando Ivan compre el VPS de Hostinger.** El
destino es que todo lo que hoy vive en Vercel y Supabase corra en una máquina
nuestra, **con el mismo comportamiento y con código nuestro**.

Esto no es un cambio de despliegue, es **cambiar de dueño a media docena de cosas
que hoy no escribimos nosotros**. Lo que hay que sustituir, y lo que cuesta cada
una:

| Hoy lo da | Hay que reemplazarlo por | Dificultad real |
|---|---|---|
| Vercel (build, CDN, TLS, despliegue por push) | Node en el VPS, Nginx o Caddy delante, TLS con Let's Encrypt, despliegue por CI | Media. Es trabajo conocido |
| Postgres gestionado de Supabase | Postgres en el VPS | Media — **lo caro no es instalarlo, son las copias de seguridad**. Hoy las hace Supabase y no pensamos en ellas |
| Supabase Auth (`signInWithOtp`, `verifyOtp`, sesión, cookies) | Autenticación propia | **Es la pieza grande.** Ver abajo |
| **RLS de Postgres** | Nada equivalente — pasa a ser código | **Es el riesgo grande.** Ver abajo |
| Almacenamiento de Supabase | Disco del VPS o S3 compatible | Baja, hoy casi no se usa |
| SMTP | No cambia: es un SMTP externo igual | Ninguna |

**Las dos que hay que mirar de frente antes de decidir la fecha:**

**La autenticación no es «un login».** Hoy Supabase nos da emisión y verificación
de códigos, expiración, límite de intentos, rotación de tokens, refresco de
sesión, cookies `httpOnly` bien puestas y `src/proxy.ts` apoyándose en todo eso.
Escribirlo nosotros es posible y está resuelto en la industria, pero es donde los
fallos no se ven hasta que alguien entra en la cuenta de otro. Conviene apoyarse
en una librería probada y no en código a mano.

**RLS es la barrera de verdad, y en un VPS deja de existir gratis.** Toda la
seguridad de datos del proyecto está hoy en políticas dentro de Postgres: un bug
en una ruta no da acceso porque la base dice que no. `dominio-regenera` lo
sostiene como invariante. Postgres propio **sí** tiene RLS —no se pierde por
mudarse—, pero deja de estar conectado a un `auth.uid()` que alguien mantenga por
nosotros: hay que emitir y propagar esa identidad a cada conexión. Si en la
mudanza se sustituye por comprobaciones en el código de la aplicación, el modelo
de seguridad del proyecto cambia entero y hay que reescribir `dominio-regenera`.

**Qué hay que decidir antes de empezar, y no durante:**

1. ¿Se conserva RLS con Postgres propio, o se pasa la autorización a la
   aplicación? *(Recomendación: conservarla. Es la decisión más barata de
   respetar y la más cara de deshacer.)*
2. ¿Quién responde a las 3 de la mañana si el VPS se cae? Vercel y Supabase se
   reinician solos; una máquina nuestra no.
3. ¿Cuál es la política de copias, dónde viven y **cuándo se prueba una
   restauración**? Una copia que nadie restauró no es una copia.
4. ¿Se migran los datos que existan, o se parte de cero? Depende de si para
   entonces hay proveedores y órdenes reales.
5. ¿Se va todo de golpe o primero la aplicación y después la base?

**Y algo que afecta al trabajo diario desde el primer día:** hoy cada PR tiene
despliegue de vista previa automático. Con VPS propio eso hay que construirlo o
perderlo, y perderlo cambia cómo revisamos el trabajo del otro — que es el único
momento en que cada uno ve lo que hizo el agente del otro. Está en `flujo-git`.

**Cuando se haga, `docs/DEPLOY.md` se reescribe entero** y este bloque se
convierte en un hito.

---

## Trampas vigentes

- **Las plantillas de correo de Supabase no mandan el código si no se lo pides.**
  Las de fábrica solo traen `{{ .ConfirmationURL }}`: llega un enlace y la
  aplicación pide seis dígitos. El que los renderiza es `{{ .Token }}`, y hay que
  ponerlo en **dos** plantillas — *Magic Link* para quien ya tiene cuenta y
  *Confirm signup* para quien se registra por primera vez; `signInWithOtp` usa una
  u otra según exista el usuario, y arreglar solo una deja la mitad rota.
- **`{{ .ConfirmationURL }}` no pasa por `/auth/callback`.** Apunta al
  `/auth/v1/verify` de Supabase, que devuelve al *Site URL* con el token en el
  fragmento `#`, y un fragmento no llega al servidor. El enlace del correo tiene
  que ser
  `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email`.
- **`sameLine` del carrito compara `listingId` **y** `date`.** Quitar o buscar una
  línea pasando solo el id compila, no falla y no empareja con una experiencia
  reservada: la línea se vuelve inmortal, suma en el contador de la cabecera y la
  página declara la cesta vacía. Fue exactamente el bug de `v0.3.2`.
- **Subir `STORAGE_KEY` en `src/components/cart.ts` tira el carrito de todo el
  mundo.** Se hace cuando lo guardado deja de poder resolverse —como cuando los
  ids pasaron de cadena a uuid—, no cuando cambia la vista. Bajarla no recupera
  nada.
- **`middleware.ts` no existe aquí, es `src/proxy.ts`.** Next 16 deprecó esa
  convención. Cualquier tutorial de Supabase que encuentres crea `middleware.ts`
  porque está escrito para Next 15.
- **`unaccent` es `stable` y una columna generada exige `immutable`.** Por eso
  existe `public.sin_tildes()` en `0003`, con el diccionario fijado por
  `::regdictionary`. Si tocas la búsqueda, esa es la trampa.
- **`public.sin_tildes()` y `normalize()` de `repo.ts` tienen que hacer lo
  mismo.** Una alimenta la columna indexada y la otra normaliza lo que escribe el
  usuario; si divergen, la búsqueda deja de encontrar cosas que sí están.
- **Las escrituras de administración van con el cliente de sesión, no con la
  clave de servicio.** Si se cambian a `admin.ts`, el permiso pasa a concederlo el
  código en vez de RLS, y cualquier fallo en `requireAdmin` se vuelve escritura
  libre.
- **RLS no da error cuando niega: devuelve cero filas.** Toda escritura tiene que
  comprobar el resultado, o un intento denegado se ve como éxito.
- **El plan gratuito de Supabase pausa los proyectos inactivos**, y lo que cuenta
  como actividad es una petición **desde fuera**: un `pg_cron` dentro de Postgres
  correría todos los días sin evitar la pausa. Por eso el latido lo dispara
  GitHub Actions (`.github/workflows/latido.yml`, 12:10 UTC = 07:10 en Colombia)
  contra `/api/latido`. **Y GitHub desactiva los `schedule` de un repositorio
  tras 60 días sin actividad**, avisando por correo: si el proyecto se queda
  quieto dos meses, hay que reactivarlo a mano en la pestaña Actions — justo
  cuando más falta hace.
- **`supabase.auth.signOut()` sin argumentos cierra la sesión en TODOS los
  dispositivos de esa persona.** El valor por defecto de `scope` es `global` y
  revoca todos sus tokens. En los tres sitios donde se llama va
  `signOut({ scope: "local" })`: sin eso, entrar desde un computador nuevo —o
  simplemente escribir bien tu contraseña actual para cambiarla— echaría a la
  persona de su teléfono y de su portátil. El síntoma sería «se me cierra la
  sesión sola», sin nada que lo relacione con la causa.
- **El contexto `secrets` no existe en el `if` de un paso de GitHub Actions.**
  Solo están `github`, `needs`, `job`, `runner`, `env`, `vars`, `steps`, `inputs`
  y `matrix`. Un `if: ${{ secrets.X != '' }}` no se evalúa como falso: revienta el
  workflow entero con «Unrecognized named-value». El secreto se copia al `env` del
  job y la condición mira la copia — así está hecho en `latido.yml`.
- **El cliente de `src/lib/supabase/efimero.ts` es lo que hace real el segundo
  factor.** Comprueba la contraseña **sin escribir cookies**. Si alguien cambia
  `entrarConClave()` para usar el de `server.ts`, la sesión queda abierta en
  cuanto la contraseña resulta correcta y el código posterior no protege de nada:
  basta cerrar la pestaña. Todo seguiría funcionando de cara al usuario y ninguna
  prueba lo detectaría.
- **`user_metadata.tiene_clave` es la única forma de saber si una cuenta tiene
  contraseña.** Supabase no lo dice: `user.identities` trae el proveedor `email`
  tanto si hay contraseña como si la cuenta nació de un enlace mágico. Si se deja
  de escribir esa marca, se le exigirá crear contraseña a gente que ya la tiene.
- **`requireUser()` redirige a `/cuenta/clave` a quien no tenga contraseña**, y
  el corte del bucle es el parámetro `destino`: esa misma página llama a
  `requireUser("/cuenta/clave")`. Copiar la llamada ahí sin el argumento deja el
  sitio en un bucle de redirecciones.
- **Un archivo `"use server"` solo puede exportar funciones asíncronas.** Por eso
  las tablas de estados de una orden viven en `src/lib/order-status.ts` y no
  junto a la acción que las usa. Exportar una constante desde un `"use server"`
  rompe la compilación con un error que no dice eso.
- **La cookie del dispositivo (`sgr_dispositivo`) no lleva el prefijo
  `__Host-`.** Ese prefijo exige `secure`, y en `localhost` sobre http el
  navegador la descartaría en silencio: el síntoma sería «el código se pide
  siempre» en desarrollo, sin ninguna pista de por qué.
- **Una política que consulta otra tabla protegida cuyas políticas consultan la
  primera produce `42P17: infinite recursion`, y no lo detecta nada más que
  ejecutarla.** Pasó con `orders` ↔ `order_items`: estaba mal desde `0001` y no
  se vio en tres semanas porque las órdenes vivían en memoria y ninguna consulta
  llegaba a la tabla. Lo arregló `0005`. **Regla práctica:** si una política
  necesita mirar otra tabla protegida, la pregunta se responde con una función
  `security definer` con `set search_path = public` —como `is_admin()`—, nunca
  con un `exists (...)` dentro de la política.
- **El nivel de un proveedor no se puede escribir a mano, ni con la clave de
  servicio.** Desde la 0006, un trigger `before insert or update` lo deriva de
  `experience_points` y pisa cualquier valor. Un `update providers set tier =
  bosque` parece funcionar y no cambia nada. Para subir a alguien se le dan
  puntos con `otorgar_experiencia()` — ver `docs/NIVELES.md`.
- **Los puntos y los umbrales están escritos dos veces**: en la 0006 y en
  `src/lib/niveles.ts`. Manda la base; el de TypeScript existe para poder
  pintarlo sin una consulta. Si divergen, la pantalla le promete al proveedor
  puntos que nunca le llegan.
- **La comisión ya no es una constante.** Depende del nivel de quien vende, así
  que valorizar el carrito necesita leer el nivel de cada proveedor
  (`getProviderTiers`). Un proveedor que no se pueda leer paga la tasa base, que
  es la más alta: ante la duda se cobra de más, porque cobrar de menos es plata
  que se pierde sin que ningún error lo diga.
- **`order_items.commission_rate` congela la tasa aplicada.** No se recalcula
  nunca contra el nivel de hoy: el nivel sube con el tiempo y una orden de hace
  seis meses dejaría de cuadrar consigo misma.
- **`0001` … `0006` son inmutables.** Las seis corrieron contra la base. Todo
  cambio posterior es `0007_`.
- **Vercel Hobby es para proyectos no comerciales.** El día que entre dinero real
  son 20 USD/mes de Pro.
- **`hairline` y `control` no son intercambiables.** El primero separa
  superficies; el segundo dibuja el borde de un control, donde WCAG pide 3:1.
- **La longitud del código de acceso vive en el panel, no en el código.**
  Authentication → Sign In / Providers → Email → *Email OTP Length*, entre 6 y
  10. Está en **6**, que es lo que dice la pantalla de `/entrar`. La validación
  acepta el rango entero a propósito: si alguien sube ese ajuste y el código
  exigiera seis exactos, **nadie podría entrar** y el mensaje de error diría que
  el código está mal cuando el correcto es el que tiene delante. Ya pasó con el
  panel en 8.

---

## Comprobar el estado sin preguntarle a nadie

```bash
git fetch origin --prune && git log --oneline origin/main -5
git tag --points-at origin/main          # vacío = release sin etiquetar
gh pr list                               # qué hay abierto
ls .claude/hitos/                        # la historia; lo último al final
grep -rn "@/data/" src/lib/repo.ts       # vacío = el Bloque 1 terminó
```

Y contra la aplicación corriendo:

```bash
npm run build && npm run start
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/catalogo   # 200 = la base responde
curl -s -o /dev/null -w "%{redirect_url}\n" localhost:3000/admin   # /entrar = el guardia funciona
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/niveles    # 200 = la tanda de niveles está desplegada
curl -s -o /dev/null -w "%{http_code}" localhost:3000/legal        # 200 = la página de políticas está desplegada
curl -sI localhost:3000/ | grep -i content-security-policy         # vacío = faltan las cabeceras de seguridad
```

Para comprobar que el corte por inactividad está vivo sin esperar dos días: una
petición con cookie de sesión y **sin** la de actividad tiene que responder 307
hacia `/entrar?caducada=1`. Basta con inventarse la cookie de sesión — no hace
falta que sea válida, porque el corte ocurre antes de mirarla.

```bash
curl -s -o /dev/null -w "%{redirect_url}" -H "Accept: text/html"   -H "Cookie: sb-<ref>-auth-token=lo-que-sea" localhost:3000/cuenta
```

Y si lo que quieres saber es qué tiene la **base**, eso no está en el
repositorio: se pregunta en el editor SQL del panel de Supabase, con la consulta
del bloque del principio de este archivo.
