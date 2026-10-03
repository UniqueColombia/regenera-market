# El sitio tiene modo oscuro, a elección de quien lo visita

- **Fecha:** 2026-10-03
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-animaciones-tematicas` → entrega directa (sin PR)
- **Fase del roadmap:** —

## Qué se hizo

Un botón de luna / sol en el encabezado cambia el sitio entero a oscuro y
vuelta, con un círculo que crece desde el botón. La elección se guarda en la
cookie `sgr_tema` y el servidor pinta la página ya en ese tema.

| Pieza | Archivo |
|---|---|
| Paleta oscura y transición | `src/app/globals.css` (bloque «Modo oscuro») |
| Botón (barra desde `sm`, fila del menú por debajo) | `src/components/selector-tema.tsx`, montado en `site-header.tsx` |
| Cookie y lectura | `src/lib/tema.ts`; `layout.tsx` pone `data-tema` en el `<html>` |
| Declaración pública de la cookie | `src/app/privacidad/page.tsx` |

## Por qué así

**Revierte una decisión escrita.** La skill `diseno-visual` decía «el sitio no
tiene modo oscuro y esa es una decisión de producto: los productos se juzgan
por su foto y su ficha». Jesús pidió el modo oscuro el 2026-10-03. Se mantuvo
lo que defendía esa decisión: **el claro sigue siendo el tema por defecto**,
y el oscuro solo aparece si alguien lo elige. Las fotos de producto no se
tocan en ninguno de los dos.

- **Tokens remapeados, no variantes `dark:`.** Hay unos 2.000 usos de color en
  cien archivos. Todas las utilidades de Tailwind 4 leen `var(--color-…)`, así
  que en oscuro se redefinen las variables en `body`: neutros oscuros y escala
  `brand` invertida (el texto `brand-700` se vuelve verde claro, el tinte
  `brand-50` verde muy oscuro). Ningún componente cambió para verse en oscuro.
- **Las superficies que ya eran oscuras recuperan la paleta original** (hero,
  pie, botones verde o terracota, tapices con degradado). Sin eso, un botón
  `bg-brand-700 text-white` se volvería verde claro con letra blanca. Se hace
  redefiniendo las variables en esos elementos con los valores originales, que
  `html` guarda en `--orig-*`.
- **Cookie y no `localStorage`**: la lee el servidor, así que no hay destello
  claro al cargar en oscuro. No se crea hasta que alguien pulsa el botón, es una
  preferencia pedida por la persona y no necesita consentimiento previo; aun
  así está en la tabla de `/privacidad`.
- **No sigue la preferencia del sistema** (`prefers-color-scheme`). Se descartó
  para no cambiar, sin que nadie lo pida, el tema con el que se diseñó el
  sitio. Si se quiere, es una regla CSS más en el mismo bloque.
- **En el teléfono el botón va en el menú.** En la barra, a 375 px, partía en
  dos el lema del logo. Las dos copias se sincronizan con un evento.

## Qué quedó pendiente

- **Contarle a Ivan.** La decisión anterior era de producto y el repositorio es
  de los dos.
- Revisar en oscuro las páginas que no se recorrieron: el panel de
  administración, `/cuenta` y `/cuenta/empresa` con sesión, y el carrito con
  productos. Las recorridas están en «Verificación».
- Los correos (`src/lib/correo/plantillas.ts`) siguen en claro: van a un cliente
  de correo, que decide su propio tema.

## Qué se rompe si tocas esto

- **Una superficie oscura nueva** cuya clase no esté en la lista de la «capa 3»
  de `globals.css` heredará la paleta invertida: se verá clara con letra blanca.
  Agrega su clase a la lista o ponle `data-tema-fijo`.
- **No escribas `dark:`.** No hay variante `dark` configurada; quedaría muerta.
- **Un color de Tailwind que no esté remapeado** (otro rojo, un azul) se verá
  igual en los dos temas. Si se usa, agrega su valor oscuro en el bloque de
  `body`.
- `--color-white` cambia de valor según dónde se lea: superficie elevada en la
  interfaz, blanco en las superficies oscuras. Es a propósito; ver el bloque.

## Verificación

- `npm run build`, `npx tsc --noEmit` y `npx eslint src` en limpio.
- `curl` con la cookie `sgr_tema=oscuro` devuelve `<html data-tema="oscuro">`;
  sin cookie, sin atributo.
- Playwright contra `next start`:
  - el botón pone el tema, la cookie y el fondo oscuro, y vuelve a claro;
  - en oscuro, sin desborde ni errores, en `/`, `/catalogo`, una oferta,
    `/proveedores`, un proveedor, `/vender`, `/verificacion`, `/niveles`,
    `/comunidad`, `/privacidad`, `/entrar` y `/carrito` (vacío);
  - a 375 px: logo en una línea, el tema se cambia desde el menú y el icono
    de la barra lo refleja al ensanchar la ventana.
- Revisión visual con capturas: portada, ficha de oferta, `/entrar`, menú
  móvil. **Falta el visto bueno en un navegador real.**
