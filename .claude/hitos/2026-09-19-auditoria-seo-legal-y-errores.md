# Auditoría de 23 puntos: lo legal, lo que ve un buscador y lo que se ve cuando algo falla

- **Fecha:** 2026-09-19
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-reacciones-fotos-y-nivel` → #51
- **Fase del roadmap:** 1 y 2 — cierre de pendientes previos a la beta abierta

## Qué se hizo

Se auditaron 23 puntos de una lista de revisión de sitio. **Once ya estaban
resueltos** y se dejaron como estaban; los otros doce se construyeron en esta
tanda.

Lo que existe ahora y antes no:

- **`/privacidad` y `/terminos`.** Escritas desde el esquema real, no desde una
  plantilla: cada dato que enumeran existe en `supabase/migrations/` y cada
  encargado que nombran es un servicio que el repositorio usa.
- **`robots.txt` y `sitemap.xml` generados**, no estáticos. El sitemap sale de
  la base: 41 URLs en el momento de escribir esto, de las cuales 32 son ofertas
  y proveedores.
- **`/llms.txt`**, generado desde `taxonomy.ts` y `niveles.ts`.
- **Datos estructurados** (`Organization`, `WebSite`, `Product`, `Offer`,
  `BreadcrumbList`) en portada, ficha de oferta y ficha de proveedor.
- **Canónicas** en todas las páginas públicas.
- **Aviso de cookies** con su infraestructura de consentimiento versionado.
- **`not-found.tsx`, `error.tsx` y `global-error.tsx`.** No había ninguno.
- **Metadatos donde faltaban**: portada, `/carrito` (vía layout, por ser página
  de cliente) y descripciones en todas las públicas.

Y dos correcciones de accesibilidad en formularios que la auditoría destapó de
paso: el mensaje de error de `campo-clave.tsx` no estaba atado al campo con
`aria-describedby`, y el error general de `paso-codigo.tsx` no tenía
`role="alert"`, así que aparecía sin que un lector de pantalla lo anunciara.

## Por qué así

### Lo que ya estaba bien, y por qué se dejó quieto

Conviene que conste, porque la tentación en una auditoría es tocarlo todo:

| Punto | Estado |
|---|---|
| Compresión de imágenes | 27 de 38 archivos ya en WebP, y todo pasa por `next/image` |
| Texto alternativo | Todas las imágenes lo tienen; tres lo llevan vacío **a propósito**, por decorativas |
| Favicon | `icon.png`, `apple-icon.png` y `favicon.ico`, por convención de Next |
| Imagen de Open Graph | `opengraph-image.jpg` y `twitter-image.jpg` con `metadataBase` resuelto |
| Atributo de idioma | `<html lang="es-CO">` |
| Mapas de código | Cero en `.next/static`. Se escribió explícito de todas formas |
| Paquete de JavaScript | 1,1 MB sin comprimir **entre todas las rutas**; el mayor trozo son 224 kB |
| Uso de `<h1>` | Exactamente uno por página. Lo pone `HeroBanner` en las siete que lo usan |
| Estados de error en formularios | Los seis formularios ya los tenían, con `aria-invalid` y `role="alert"` |
| Dirección de contacto | Real en el pie; el correo cambiará al del dominio propio en el VPS |

### El sitemap se genera; no es un archivo

Porque el catálogo cambia cuando un proveedor publica, no cuando alguien se
acuerda de regenerar un archivo. Un sitemap escrito a mano nace desactualizado y
**nadie se entera**, porque un sitemap viejo no falla: simplemente deja fuera lo
nuevo.

No lleva ningún filtro de estado escrito a mano. Sale de `searchListings()` y
`getApprovedProviders()`, que consultan con el cliente de sesión y por tanto
pasan por RLS y por la vista `listings_publicos`. Duplicar el filtro aquí daría
la falsa impresión de que este archivo protege algo — lo protege la base
(invariante 17).

Si la base no responde, devuelve las rutas fijas y registra el fallo. Un sitemap
corto es un problema de posicionamiento; uno que responde 500 hace que el
buscador deje de pedirlo durante días.

### Bloquear «la IA» en bloque habría sido tirar piedras al propio tejado

La petición decía «robots.txt bloqueando la IA», y esa frase junta dos cosas
distintas:

- **Robots de entrenamiento** (`GPTBot`, `ClaudeBot`, `Google-Extended`,
  `CCBot`…): leen el sitio para entrenar modelos. No devuelven nada — ni una
  visita, ni una mención, ni un enlace.
- **Robots de búsqueda** (`OAI-SearchBot`, `PerplexityBot`, `ChatGPT-User`…):
  leen el sitio para responderle a alguien que preguntó, y **citan la fuente con
  su enlace**.

Se bloquean los primeros y se dejan pasar los segundos. Quien busca «proveedor
de amenities biodegradables en Colombia» hoy se lo pregunta a un asistente antes
que a un buscador, y ese es exactamente el tráfico que este marketplace
necesita. El argumento habitual para bloquearlos a todos —«se llevan mi obra
original»— aquí no aplica: el contenido público son fichas de producto. Lo que
sí es nuestro y no queremos regalar son los datos de las empresas, y esos no
están en el HTML: están detrás de RLS.

### El consentimiento de cookies va en una cookie, no en `localStorage`

Porque la decisión la tiene que poder leer **el servidor**. El día que haya
analítica, quien decide si su script se manda al navegador es el layout, antes
de pintar nada. Con `localStorage` el script ya habría viajado y se apagaría
después — que es la forma habitual de incumplir un aviso de cookies sin querer:
se pide el consentimiento y el seguimiento ya ocurrió.

Efecto secundario que se nota: el layout sabe si hay decisión antes de
renderizar, así que **el aviso no parpadea**.

**Hoy el sitio no mide nada.** El aviso informa de las cookies necesarias —que
no requieren consentimiento— y pregunta por una medición que todavía no existe.
Suena a exceso y no lo es: la maquinaria hay que tenerla antes de que llegue la
primera etiqueta de analítica. Si no, lo que pasa es lo de siempre: se agrega la
herramienta, se deja el aviso para «más adelante», y el sitio pasa meses
midiendo sin haber preguntado.

Las dos opciones tienen el mismo peso visual, y eso tampoco es estética: un
«aceptar» grande junto a un «rechazar» gris invalida el consentimiento que dice
recoger. Si hay que esforzarse para decir que no, la respuesta no es libre.

### Las páginas legales no son una plantilla

Una política de privacidad genérica enumera datos que no se recogen y omite los
que sí. Eso es peor que no tenerla: describe mal el tratamiento, que es
literalmente lo que la ley pide describir bien.

La tabla de «qué recogemos» salió de leer el esquema tabla por tabla. Incluye
cosas que una plantilla nunca habría puesto —que **quién reaccionó a qué solo lo
ve esa persona**, que el identificador del dispositivo de confianza se guarda
cifrado, que la fecha de autorización se guarda porque sin ella el
consentimiento no se puede acreditar— y no incluye nada que no exista.

Sobre citar la ley colombiana: la regla 5 de `redaccion-producto` prohíbe citar
una ley concreta sin el país delante, porque el sitio acepta proveedores de
dieciocho países. Aquí la ley colombiana **sí manda**, y no por el país de quien
lee sino porque el responsable del tratamiento es una sociedad colombiana. Se
dice así —«la sociedad que responde está en Colombia y por eso se rige por…»— y
se reconoce a continuación que quien esté en otro país conserva los derechos de
su propia normativa.

En los términos, la decisión que no conviene diluir: **Seregenera es
intermediaria**. El contrato de compraventa es entre comprador y proveedor.
Escribirlo de otra forma convertiría a la sociedad en responsable solidaria de
la calidad de lo que produce un tercero.

### Tres estados de error, no uno

`not-found.tsx` conserva encabezado y pie. `error.tsx` también, y además ofrece
`reset()` sin recargar, que es lo que arregla el fallo más común: el
transitorio. `global-error.tsx` no conserva nada porque lo que falló fue el
layout, y por eso trae su propio `<html>` y sus enlaces son `<a>` — el enrutador
de React es justo lo que acaba de morir.

Ninguno enseña `error.message`. Sí enseñan `digest`, que permite que alguien
diga «me salió este código» y que eso baste para encontrarlo en los registros.

## Qué quedó pendiente

- **Las dos páginas legales las tiene que revisar un abogado.** Están escritas
  desde el funcionamiento real del sistema y con criterio, pero quien firma
  Dimension Natural SAS no es quien las escribió. **No es un trámite
  aplazable**: un término mal redactado se descubre en la primera disputa.
- **Falta el NIT y la dirección física de la sociedad.** Los dos son
  obligatorios en una factura y convenientes en la política. Están anotados como
  pendientes en `src/lib/legal.ts` y **no se inventaron**: un dato legal falso es
  peor que uno ausente.
- **`NEXT_PUBLIC_SITE_URL` en producción.** De ahí salen el sitemap, el
  `robots.txt`, las canónicas y las imágenes de Open Graph. Si falta, el sitio
  le dice al mundo que vive en `localhost:3000`. Se comprueba abriendo
  `/robots.txt` en producción: imprime el dominio en claro.
- **Registrar el sitio en Search Console** y mandarle el sitemap. Nada de esto
  se indexa solo el primer día.
- **La revisión en un teléfono real.** Aquí no hay navegador automatizado, y las
  páginas legales llevan tablas, que es lo que peor se comporta en 375 px.
- **No hay analítica**, y por tanto no hay forma de saber si algo de esto sirve.
  La categoría `medicion` del consentimiento existe para cuando la haya.

## Qué se rompe si tocas esto

- **`src/lib/rutas.ts` alimenta `robots.txt` y el sitemap a la vez.** Si se
  agrega una zona privada y no se agrega ahí, sus rutas se indexan.
- **Una página con `index: false` no puede estar en `RUTAS_PUBLICAS`.** Es
  mandarle dos señales contrarias al mismo rastreador. Por eso `/entrar` y
  `/registro` no están.
- **`src/lib/legal.ts` es la única copia de los datos de la empresa.** Están en
  el pie, en las dos legales, en los datos estructurados y en `/llms.txt`.
- **Si agregas un dato personal, una cookie o un servicio externo, la política
  de privacidad es parte del cambio.** La skill `seo-y-legal` lo tiene como
  lista de comprobación.
- **Lo que se declara en JSON-LD tiene que estar visible en la página.** Por eso
  no hay `aggregateRating` (no hay reseñas a la vista) y los ítems de cotización
  no llevan `offers` (no tienen precio hasta que se acepta uno).
- **`/carrito` lleva sus metadatos en un `layout.tsx`** porque la página es de
  cliente y no puede exportarlos. Si alguien "limpia" ese layout por parecer
  vacío, el carrito vuelve a indexarse.

## Verificación

```bash
npm run build        # limpio
npx tsc --noEmit     # limpio
npx eslint src --max-warnings 0   # limpio
```

Y contra el servidor de producción local (`npx next start -p 3123`):

| Ruta | Respuesta |
|---|---|
| `/`, `/catalogo`, `/privacidad`, `/terminos` | 200 |
| `/robots.txt`, `/sitemap.xml`, `/llms.txt` | 200, con el contenido esperado |
| `/ruta-que-no-existe` | **404**, no 200 |

Comprobado además en el HTML servido: `<html lang="es-CO">`,
`<meta name="robots" content="index, follow">`, `<link rel="canonical">` en
portada, ficha de oferta y ficha de proveedor, dos bloques JSON-LD en la portada
y dos en cada ficha, el aviso de cookies presente y los enlaces legales en el
pie. El sitemap devolvió 41 URLs. `find .next/static -name "*.map"` → 0.

**Lo que no se comprobó:** cómo se ve todo esto en un teléfono y en un lector de
pantalla de verdad. La revisión visual la hace una persona.
