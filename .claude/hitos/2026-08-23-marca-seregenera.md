# La marca es Seregenera, y el stack de despliegue queda definido

- **Fecha:** 2026-08-23
- **Autor:** Jesús Seiler (`seiler18`), decisión de marca de Jesús Seiler e Ivan Duarte
- **Rama / PR:** `feat/js-marca-seregenera` → #2 (apilado sobre #1)
- **Fase del roadmap:** 0 — Prototipo (habilitante)

## Qué se hizo

Dos cosas que resultaron ser la misma conversación.

**El nombre.** El producto se llama **Seregenera**. El código decía "Regenera
Market" en 19 archivos y `package.json` ya decía `seregenera`: la inconsistencia
salió al preguntar qué dominio comprar. Renombrado todo lo que es marca.

**El despliegue.** Nuevo `docs/DEPLOY.md` con la decisión escrita: GitHub
(código + CI) + Vercel (hosting) + Supabase (Postgres + Auth + Storage), y por
qué se descartaron las tres alternativas que parecían obvias.

## Por qué así

### Vercel y Neon no son alternativas, son capas distintas

La pregunta que originó esto fue si Neon podía reemplazar a Vercel. No: Vercel es
**dónde corre el código**, Neon es **dónde viven los datos**. Hacen falta las
dos. La confusión tiene una raíz real: **Vercel Postgres era Neon con marca
blanca**, y Vercel lo retiró migrando esas bases a Neon en diciembre de 2024. Hoy
Vercel no opera ninguna base de datos.

### Supabase y no Neon

La comparación de verdad. Neon es solo base de datos: sin auth, sin storage.
Medido en este repo: `src/` no importa el SDK de Supabase en ningún archivo, pero
`0001_init.sql` tiene 14 usos de `auth.uid()` y 7 llaves foráneas a `auth.users`
— las ~35 políticas RLS cuelgan enteras del schema `auth`. Y el roadmap las
necesita: Fase 2 es auth, Fase 4 es storage de imágenes.

Cambiar a Neon = reescribir 491 líneas de esquema y sustituir una dependencia por
tres. Lo que cierra la discusión es la Fase 5: el aislamiento entre clientes se
garantiza con RLS en Postgres, no con un `where` en la aplicación.

Se deja anotado lo que Neon hace mejor y conviene envidiar: branching de base de
datos por PR. Supabase lo tiene en plan pago.

### GitHub Pages no puede servir esta app

Comprobado, no supuesto: dos server actions (`carrito/actions.ts`,
`vender/actions.ts`), cuatro rutas dinámicas en el build, ningún
`generateStaticParams`. Un `output: "export"` obligaría a mover el cálculo de
precios al navegador — que es exactamente el bug que la invariante #1 de
`dominio-regenera` evita a propósito.

### Se puede desplegar antes de tener base de datos

El MVP levanta con `.env.local` vacío y el CI lo verifica en cada PR. Así que hay
URL para mostrarle a un hotel sin esperar la Fase 1. Con la contrapartida escrita
en `DEPLOY.md`: las órdenes viven en memoria y mueren en cada redeploy — sirve
para demostrar, no para operar.

### Qué NO se renombró, y por qué

- **`regenera` como verbo.** Los tagline "Turismo que regenera" y "proveedores
  que regeneran el territorio" se quedan. No son la marca, y con el nombre nuevo
  el juego de palabras funciona mejor: *Seregenera* / *turismo que regenera*.
- **Los hitos anteriores.** `2026-08-23-mvp-navegable.md` sigue diciendo
  "Regenera Market" porque así se llamaba cuando se escribió, y `hitos/` es
  append-only. La fila del índice tampoco cambia: su texto es el título del
  archivo inmutable. Este hito es el que explica la diferencia — que es
  precisamente para lo que existe la regla.
- **La skill `dominio-regenera`.** El slug se queda. Renombrarla dejaría
  referencias colgando en los hitos, que no se pueden editar.
- **El repositorio.** Sigue siendo `UniqueColombia/regenera-market`. Renombrarlo
  requiere permiso de admin: es de Ivan. GitHub mantiene la redirección del URL
  antiguo, así que es de bajo riesgo, pero no es mi decisión.

### Dos cambios que van más allá de reemplazar un texto

**`RM-` → `SR-` en las referencias de orden** (`generateReference()`). El
comprador escribe esa referencia en la descripción de una transferencia
bancaria; que no coincida con la marca genera confusión justo donde confundirse
cuesta dinero. Reversible en una línea si Ivan prefiere conservar `RM-`.

**`regenera.cart.v1` → `seregenera.cart.v1`** (clave de `localStorage`). Esto
**vacía el carrito de cualquier visitante que tenga uno guardado**. Aceptable
hoy: no hay usuarios reales y las órdenes ni se persisten. Después del
lanzamiento no lo sería — el sufijo `.v1` existe justo para versionar este tipo
de cambio. Es el momento correcto para hacerlo.

## Qué quedó pendiente

- [ ] **Decidir y comprar el dominio.** Es lo que bloquea `NEXT_PUBLIC_SITE_URL`
      en Production.
- [ ] **Ivan: renombrar el repositorio** a `seregenera` si está de acuerdo.
      Requiere admin.
- [ ] **Ivan: conectar Vercel** — checklist completo en `docs/DEPLOY.md`.
- [ ] Favicon y OG image con la marca nueva. `src/app/favicon.ico` sigue siendo
      el de `create-next-app`, y no hay imagen de OpenGraph: hoy el sitio
      compartido en WhatsApp se ve sin previsualización.
- [ ] Confirmar el prefijo `SR-` o volver a `RM-`.

## Qué se rompe si tocas esto

- **`STORAGE_KEY` en `src/components/cart.ts`:** cambiarlo otra vez vacía los
  carritos. Después del lanzamiento, subir el sufijo (`.v2`) y migrar, no
  renombrar.
- **`generateReference()` en `src/lib/payments.ts`:** el prefijo aparece en
  transferencias bancarias reales. Cambiarlo cuando ya existan órdenes obliga a
  soportar los dos formatos en la conciliación.
- **`docs/DEPLOY.md`:** sus fuentes se consultaron el 2026-08-23. Vercel y Neon
  ya cambiaron de estrategia una vez (Vercel Postgres); si una fuente contradice
  el documento, gana la fuente y se escribe un hito.
- **Los hitos anteriores usan el nombre viejo.** No es un error pendiente de
  corregir. Es el historial.

## Verificación

```bash
npm run build        # ✓
npx tsc --noEmit     # ✓
npx eslint .         # ✓
```

Revisado a mano el texto resultante en las 13 cadenas visibles al usuario
(metadata, header, footer, títulos de página y la pregunta del cuestionario de
sostenibilidad): ninguna quedó con fraseo roto por el reemplazo. Confirmado que
no queda ningún "Regenera Market" fuera de `hitos/`, y que los usos de `regenera`
como verbo siguen intactos.
