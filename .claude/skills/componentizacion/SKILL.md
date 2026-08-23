---
name: componentizacion
description: Cuándo extraer un componente en Seregenera, dónde ponerlo, y cómo decidir entre Server Component y Client Component. Úsala antes de crear cualquier archivo en src/components/ o de agregar "use client" a algo, y cuando una página empiece a pasar de ~150 líneas de JSX.
---

# Componentización

## La regla del repositorio

**Server Component por defecto.** `"use client"` solo cuando el componente
necesita una de estas cuatro cosas, y ninguna otra razón vale:

1. Estado o efectos (`useState`, `useEffect`, `useRef` sobre el DOM)
2. Un manejador de eventos del navegador (`onClick`, `onSubmit`)
3. Una API del navegador (`localStorage`, `matchMedia`, `IntersectionObserver`)
4. Un hook del propio repo que ya sea cliente (`useCartCount` en
   `src/components/cart.ts`)

Si dudas, mira el componente terminado: si no tiene ni estado ni handlers, es
servidor. `src/components/listing-card.tsx` es el ejemplo canónico — renderiza
una tarjeta completa con enlaces y datos, y no es cliente.

## Empujar el `"use client"` hacia abajo

Cuando una página necesita un pedazo interactivo, **no se marca la página**: se
extrae el pedazo. `src/app/oferta/[slug]/page.tsx` es servidor y trae los datos;
`src/components/add-to-cart.tsx` es el único cliente y recibe el `listingId` ya
resuelto. Igual con `sustainability-quiz.tsx` dentro de `/verificacion`.

Marcar la página entera como cliente cuesta el renderizado en servidor de toda
la ficha: el catálogo dejaría de indexarse, y el SEO fue una de las dos razones
por las que este proyecto existe en Next.js (ver el hito
[MVP navegable](../../../hitos/2026-08-23-mvp-navegable.md)).

**Todo lo que marques como cliente viaja al navegador.** `sustainability-quiz.tsx`
es cliente e importa `DIMENSIONS` y `scoreProvider`, así que la rúbrica completa
—dimensiones, preguntas y puntajes— está en el bundle público. Es una decisión
tomada, no un descuido; pero antes de marcar cliente algo que importe de
`src/lib/`, pregúntate si su contenido puede ser público. Ver la skill
`dominio-regenera`.

## Cuándo extraer

Extrae cuando se cumple **una** de estas:

- **Se repite en dos rutas.** Dos usos reales, no dos usos imaginados. La
  abstracción prematura sale más cara que la duplicación.
- **Es una isla de interactividad** dentro de una página de servidor.
- **La página pasó de ~150 líneas de JSX** y hay un bloque con nombre propio
  ("la cabecera de la ficha", "el resumen del carrito").
- **Tiene lógica de presentación con reglas** — `tier-badge.tsx` traduce nivel a
  color y etiqueta; esa tabla no debe vivir suelta en tres páginas.

No extraigas para "ordenar visualmente" un archivo. Un componente de un solo uso
sin estado y sin reglas es una indirección que hay que perseguir para leer.

## Dónde va cada cosa

| Va en | Cuándo |
|---|---|
| `src/components/` | Se usa en dos o más rutas |
| Junto a la página (`src/app/vender/application-form.tsx`) | Solo la usa esa ruta |
| `src/lib/` | Lógica pura sin JSX: cálculo, formato, tipos, acceso a datos |

Lógica de negocio **nunca** dentro de un componente. Precio efectivo, comisión e
impacto se calculan en `src/lib/pricing.ts`; el componente solo pinta el
resultado. Si un componente hace una multiplicación con plata de por medio, está
en el archivo equivocado — y rompe los invariantes de dinero de la skill
`dominio-regenera`.

## Props

- Se tipan con los tipos del dominio (`Listing`, `Provider` de
  `src/lib/types.ts`), no con formas inventadas por el componente.
- Se pasa el objeto entero cuando el componente ya depende de tres o más de sus
  campos; campos sueltos cuando son uno o dos.
- Lo opcional se marca opcional (`provider?: Provider`) y el componente decide
  qué hacer sin él — el catálogo pinta tarjetas de ofertas cuyo proveedor puede
  no haberse cargado.
- Nada de `any`. `npx tsc --noEmit` tiene que pasar limpio.

## Antes de cerrar

Un componente nuevo está terminado cuando:

- [ ] No tiene `"use client"` a menos que cumpla uno de los cuatro criterios
- [ ] Los interactivos tienen `aria-label` o texto accesible, y foco visible
      (el `:focus-visible` global de `globals.css` lo cubre si no se pisa)
- [ ] Usa tokens de marca, no colores literales — ver la habilidad
      `diseno-visual`
- [ ] `npm run build`, `npx tsc --noEmit` y `npx eslint .` pasan, **en ese
      orden**: sin build previo, `tsc` falla con `TS2304` porque Next genera
      `PageProps` y `LayoutProps` durante la compilación
