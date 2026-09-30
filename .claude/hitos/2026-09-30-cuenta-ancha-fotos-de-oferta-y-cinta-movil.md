# 2026-09-30 — Cuenta a todo el ancho, fotos de oferta subidas desde el dispositivo y cinta móvil

- **Quién:** Jesús Seiler (`js`), con Claude Code.
- **Rama:** `feat/js-cuenta-ancha-imagenes-oferta` → `staging` → `main`.

## Qué se hizo

- **Cinta de navegación inferior en el celular** (`nav-inferior.tsx`): Inicio,
  Catálogo, Cesta (con contador), Comunidad y Cuenta/Entrar. Solo `md:hidden`;
  no aparece en admin, entrar, registro, auth ni orden. Los avisos flotantes
  suben sobre ella con `--nav-inferior`.
- **Páginas de cuenta a todo el ancho en escritorio**: `/cuenta`,
  `/cuenta/empresa`, `/cuenta/empresa/ofertas` (+ nueva/editar) y `/orden/…`
  dejaron de ser una columna de 672 px. Ahora van en dos columnas desde `lg`.
  Las listas de administración pasan a dos columnas desde `xl`.
- **Fotos de la oferta**: el campo «una dirección por línea» se cambió por
  `ImagenesOferta` (elegir fotos del dispositivo, recorte 4:3 en el navegador,
  hasta 6, la primera es la principal). Se suben al elegirlas a
  `logos/<provider_id>/oferta-<uuid>.webp`, sin migración: la política
  `logos_escritura` ya comprueba la primera carpeta. El administrador sube con
  el cliente de servicio tras `requireAdmin()`.
- **Formulario de oferta**: «Unidad» pasó a «El precio es por…» con ejemplos y
  sugerencias; el aviso de errores ahora **nombra los campos** que faltan y
  lleva la vista al primero (antes decía «campos marcados en rojo» y el campo
  estaba más abajo, fuera de pantalla). `verticals` ahora puede mostrar su error.
- **Menú de categorías del encabezado**: se cierra al elegir una categoría. El
  cierre por cambio de ruta no bastaba porque `/catalogo` → `/catalogo?category=x`
  no cambia el `pathname`.

## Qué queda

- Las fotos subidas y no guardadas quedan huérfanas en Storage (kilobytes).
- No se comprobó en navegador con sesión: la revisión visual la hace quien usa el sitio.
