---
name: verificacion-de-cambios
description: Cómo comprobar que un cambio en Regenera Market realmente funciona antes de darlo por terminado — tipos, lint y humo sobre las rutas reales. Úsala antes de decir que algo está listo, antes de commitear y antes de abrir un PR.
---

# Verificación de cambios

El proyecto **no tiene pruebas automatizadas**. Eso significa que la verificación
es manual y que saltársela no la sustituye nada. Nunca declares un cambio
terminado sin haber corrido al menos los dos primeros pasos.

## 1. Tipos y lint

```bash
npx tsc --noEmit
npx eslint .
```

Ambos tienen que salir limpios. No se silencia un error con `any`, con
`@ts-expect-error` ni con `eslint-disable` sin una razón escrita en la línea de
arriba.

## 2. Humo sobre las rutas

Levanta el servidor (`npm run dev`) y pide las rutas que el cambio pudo tocar.
Una ruta que responde 200 no garantiza que esté bien, pero una que responde 500
garantiza que está mal, y en Next.js un error de servidor no se ve hasta que se
pide la página.

```powershell
foreach ($p in @(
  "/", "/catalogo", "/catalogo?kind=experience", "/catalogo?vertical=restaurantes",
  "/catalogo?q=guadua", "/catalogo?tier=bosque&sort=impact",
  "/oferta/ruta-del-cacao-regenerativo", "/proveedores",
  "/proveedor/coco-pacifico", "/verificacion", "/vender", "/carrito"
)) {
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:3000$p" -UseBasicParsing -TimeoutSec 120
    "OK  $($r.StatusCode)  $p"
  } catch { "ERR $($_.Exception.Message)  $p" }
}
```

Las rutas dinámicas (`/oferta/[slug]`, `/proveedor/[slug]`, `/orden/[reference]`)
necesitan un slug real de `src/data/`; un slug inventado da 404 legítimo y no
prueba nada.

## 3. Lo que hay que mirar con los ojos

Automatizar el 200 es fácil; lo que se rompe en silencio es otra cosa. Revisa a
mano cuando el cambio toque:

- **Precios y comisión** — que el total del carrito coincida con la suma de los
  ítems y que la comisión por ítem cuadre. El dinero mal no da error, da un
  número equivocado.
- **Filtros del catálogo** — que la URL refleje el filtro y que recargar esa URL
  devuelva el mismo resultado. Son un formulario GET a propósito.
- **Móvil a 375 px** — el menú, el carrito y las tarjetas.
- **Teclado** — recorrer con Tab lo que agregaste; foco visible, `Escape` cierra
  los desplegables.

## 4. Antes del commit

- [ ] `npx tsc --noEmit` limpio
- [ ] `npx eslint .` limpio
- [ ] Rutas afectadas responden 200
- [ ] `git status` sin archivos sueltos que no eran del cambio
- [ ] Si el cambio es un hito, está escrito en `.claude/hitos/` (habilidad
      `registro-de-hitos`)

## Al reportar

Di el estado real. Si algo quedó sin probar, dilo con esas palabras. Si un
comando falló, pega la salida. El `README.md` del proyecto tiene una sección
«Qué falta» escrita sin adornos; el mismo estándar aplica a cómo se reporta un
cambio.
