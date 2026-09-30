# 2026-09-30 — Desborde horizontal en móvil y cinta inferior que se corría

- **Quién:** Jesús Seiler (`js`), con Claude Code.
- **Rama:** `fix/js-movil-categorias-cinta-desborde` → `staging` → `main`.

## Qué pasaba

En el catálogo, la tarjeta «Consultoría e implementación» no cabía en media
pantalla: «implementación» no se parte y el escudo de «solo verificados» quedaba
fuera de la tarjeta. Eso ensanchaba la página (sw 398 sobre 360 medido), se podía
arrastrar de lado y la cinta inferior —`fixed` respecto al ancho ya ensanchado—
parecía moverse o cortarse.

## Qué se hizo

- Categorías del catálogo: una por fila bajo 480 px (dos desde ahí), con el
  nombre en `min-w-0 break-words`.
- `html, body { overflow-x: clip }` como red de seguridad (no rompe `sticky`).
- Auditoría por CDP con Chrome headless a 320/360/390/414/768/900/1024/1280/1440 px
  en las rutas que se pueden renderizar sin base de datos: dos hallazgos más.
  - A 768–1023 px el menú de escritorio del encabezado se salía (hasta 841 px):
    el corte pasó de `md` a `lg`, y la cinta inferior con él.
  - En el pie, el correo de contacto y la barra legal desbordaban entre 640 y
    1023 px.
- Aviso de cookies más compacto en móvil (ocupaba casi la mitad de la pantalla).

## Qué no se pudo auditar

Las páginas que leen de Supabase (catálogo con datos, fichas, cuenta, admin) dan
error sin base local, así que sus datos reales no se midieron. Conviene mirarlas
en el teléfono.
