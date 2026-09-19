---
name: seo-y-legal
description: Lo que toda página de Seregenera tiene que declarar para un buscador y lo que el sitio tiene que tener por ley — metadatos, canónica, datos estructurados, sitemap, robots, cookies, páginas legales y estados de error. Úsala al crear cualquier página nueva en src/app/, al agregar un dato personal a una tabla, al conectar un servicio externo que trate datos de personas, o cuando alguien pida "una auditoría del sitio".
---

# SEO, legal y estados de error

Salió de la auditoría del 2026-09-19 sobre 23 puntos. La mitad ya estaba
resuelta; lo que faltaba se construyó entonces. Esta skill existe para que lo
que faltaba no vuelva a faltar en la página 31.

## La regla que resume todo

**Una página nueva no está terminada cuando se ve bien.** Está terminada cuando
además declara quién es para un buscador, dice si quiere ser indexada, y no
miente sobre nada de lo que declara.

## Al crear una página en `src/app/`

```tsx
export const metadata: Metadata = {
  title: "Título propio",              // sin "| Seregenera": lo pone el template
  description: descripcion("…"),       // 120-160 caracteres
  ...publica("/la-ruta"),              // o ...privada() si no debe indexarse
};
```

| | Pública | Privada |
|---|---|---|
| Ejemplos | catálogo, ficha, legales, Comunidad | `/cuenta`, `/admin`, `/carrito`, `/orden`, `/entrar` |
| Metadatos | `publica("/ruta")` | `privada()` |
| ¿En `RUTAS_PUBLICAS`? | sí, si es fija | **no** |
| ¿En `robots.txt`? | permitida | su prefijo va en `RUTAS_PRIVADAS` |

**Las dos listas viven en `src/lib/rutas.ts`.** Están ahí porque `robots.txt` y
el sitemap necesitan la misma información, y dos listas que hay que mantener
iguales acaban distintas. La primera vez que pasa, la orden de un comprador sale
en Google.

**Nunca metas en el sitemap una página con `index: false`.** Es mandarle dos
señales contrarias al mismo rastreador, y Search Console lo reporta como error.
Si se decide que una página noindex debe indexarse, se quitan las dos cosas o
ninguna.

### Una página de cliente no puede exportar `metadata`

Next la lee en el servidor. Si la página lleva `"use client"` —como `/carrito`—
los metadatos van en un `layout.tsx` hermano que no pinta nada. No es un apaño:
es el patrón de Next para ese caso.

### La canónica no es opcional en un sitio con filtros por GET

Los filtros del catálogo son un formulario GET a propósito (invariante 19 de
`dominio-regenera`). Eso significa que `/catalogo`,
`/catalogo?vertical=hoteles` y `/catalogo?utm_source=x` son tres URLs con el
mismo contenido. Sin canónica, el buscador reparte la autoridad entre las tres
en vez de sumarla en una.

Se declara con la **ruta**, nunca con el dominio: `publica()` lo resuelve contra
`metadataBase`, que sale de `NEXT_PUBLIC_SITE_URL`. Una canónica con el dominio
escrito a mano hace que el entorno de pruebas le diga al buscador que indexe
producción.

## Datos estructurados: la regla que evita la penalización

**Todo lo que se declara en JSON-LD tiene que estar también en la página,
visible.** Declarar un precio que la ficha no muestra, o una valoración que no
existe, es describirle al robot algo distinto de lo que ve una persona — y eso
es exactamente lo que los buscadores penalizan.

Corolarios que ya están aplicados en `src/components/datos-estructurados.tsx`:

- **No hay `aggregateRating`.** El sitio todavía no muestra reseñas. El día que
  las muestre, se agrega; antes no.
- **Los ítems de cotización no llevan `offers`.** No tienen precio hasta que se
  acepta uno (invariante 7), y declarar uno inventado describe una compra que el
  sitio no permite hacer.
- **`Organization` va solo en la portada**, no en el layout. Repetirla en treinta
  rutas obliga al rastreador a reconciliar treinta declaraciones de la misma
  entidad.
- **Se escapa el `<` al serializar.** `JSON.stringify` no escapa `</script>`, y
  el título de una oferta lo escribe un proveedor. Sin eso es un XSS de manual.

## Cuando tocas datos de personas

**Si agregas una columna con un dato personal, una cookie o un servicio externo
que trate datos, `src/app/privacidad/page.tsx` es parte del cambio.** No es
burocracia: la política enumera dato por dato lo que se recoge, y una política
que describe mal el tratamiento es peor que no tenerla — describe mal justo lo
que la ley pide describir bien.

La lista de comprobación, cuando algo de eso cambia:

- [ ] La tabla de «Qué recogemos y para qué» incluye el dato nuevo
- [ ] Si es una cookie, está en la tabla de cookies con su duración
- [ ] Si es un servicio externo, está en «Con quién los compartimos»
- [ ] `VIGENCIA_LEGAL` en `src/lib/legal.ts` sube a la fecha del cambio
- [ ] Si el cambio afecta a **para qué** se usan los datos, hay que avisar por
      correo antes de que aplique — lo promete la propia política

**Los datos de la empresa se escriben una vez**, en `src/lib/legal.ts`. Están en
el pie, en las dos legales, en los datos estructurados y en `/llms.txt`; escritos
cinco veces, el que quede viejo será el de la política de privacidad, que es el
único que alguien usa cuando tiene un problema.

## Cookies

El consentimiento se guarda **en una cookie, no en `localStorage`**, y el motivo
no es preferencia: el día que haya una herramienta de medición, quien decide si
su script se manda es el servidor, antes de pintar. Con `localStorage` el script
ya viajó y se apaga después — que es la forma habitual de incumplir un aviso de
cookies sin querer.

`VERSION_CONSENTIMIENTO` sube cuando cambian las categorías. Una decisión tomada
sobre la versión anterior no vale para la nueva.

Y el aviso no usa patrones oscuros: **las dos opciones tienen el mismo peso
visual**. Un «aceptar» grande junto a un «rechazar» gris invalida el
consentimiento que dice recoger — si hay que esforzarse para decir que no, la
respuesta no es libre.

## Estados de error

Los tres existen y cada uno cubre algo distinto. Si alguien "simplifica"
borrando uno, esto es lo que se pierde:

| Archivo | Cuándo aparece | Qué conserva |
|---|---|---|
| `not-found.tsx` | ruta inexistente o `notFound()` | encabezado y pie |
| `error.tsx` | excepción dentro de una página | encabezado y pie; ofrece `reset()` |
| `global-error.tsx` | excepción en el **layout** | nada: trae su propio `<html>` |

En `global-error.tsx` los enlaces son `<a>` y no `<Link>`, con su
`eslint-disable` explicado: el enrutador de React es justo lo que acaba de
morir.

**Nunca se enseña `error.message`.** Sí se enseña `digest`: es el identificador
con el que ese fallo concreto se encuentra en los registros, y permite que
alguien diga «me salió este código» y que eso baste.

## Las trampas que ya se pisaron

- **`NEXT_PUBLIC_SITE_URL` manda sobre el SEO entero.** Sitemap, `robots.txt`,
  canónicas y las imágenes de Open Graph salen de ahí. Si falta en Vercel, el
  sitio le dice al mundo que vive en `localhost:3000`. Se comprueba mirando
  `/robots.txt` en producción, que imprime el dominio en claro.
- **Bloquear «la IA» en bloque es tirar piedras al propio tejado.** Los robots de
  entrenamiento y los de búsqueda son dos grupos distintos: los primeros se
  llevan el contenido sin devolver nada, los segundos traen visitas citando la
  fuente. `src/app/robots.ts` bloquea los primeros y deja pasar los segundos, y
  explica por qué.
- **Un `<h1>` por página, y en este sitio lo pone `HeroBanner`.** Una página que
  usa el banner y además escribe su propio `<h1>` tiene dos. Comprobado el
  2026-09-19: ninguna lo hace. Si agregas uno, mira primero si el banner ya lo
  puso.
- **`overflow-wrap: anywhere` en las celdas de tabla.** A 375 px una palabra
  larga en una tabla no desborda la tabla: desborda **la página entera**, y el
  síntoma es que todo el sitio se desplaza en horizontal.
- **Las imágenes pesadas no son un problema de entrega.** Los `hero-*.webp`
  rondan los 700 kB en el repositorio y eso está bien: `next/image` sirve
  versiones redimensionadas en AVIF o WebP desde el CDN. Lo que sí importa es
  que se sirvan **a través de `next/image`** y con `sizes` puesto.

## Auditar el sitio entero

```bash
npm run build && npx next start -p 3123 &

# Rutas que tienen que responder
for r in / /robots.txt /sitemap.xml /llms.txt /privacidad /terminos /noexiste; do
  printf "%-16s %s\n" "$r" "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3123$r)"
done   # la última tiene que dar 404, no 200

# Ninguna página sin metadatos
for f in $(find src/app -name page.tsx); do
  grep -q "metadata\|generateMetadata" "$f" || echo "SIN METADATA: $f"
done

# El dominio que el sitio declara (tiene que ser el real, no localhost)
curl -s http://localhost:3123/robots.txt | grep Host

# Mapas de código publicados: tiene que dar 0
find .next/static -name "*.map" | wc -l
```

La revisión visual y la de un teléfono real **las hace una persona**: aquí no
hay navegador automatizado, y decir que algo se ve bien sin haberlo visto es
justo lo que `CLAUDE.md` prohíbe.
