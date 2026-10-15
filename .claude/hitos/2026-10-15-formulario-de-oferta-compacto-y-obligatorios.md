# Formulario de oferta: obligatorios a la vista, impacto opcional y en tarjetas

- **Fecha:** 2026-10-15
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-formulario-oferta-compacto` (entrega directa)
- **Fase del roadmap:** 3 (proveedores reales); sigue a [la carga masiva a un clic](2026-10-15-carga-masiva-mas-a-la-mano.md)

## Qué se hizo

Tres pedidos de Jesús sobre `FormularioOferta` (lo usan la empresa y el panel):

1. **Qué es obligatorio, y que se vea.** Cada campo obligatorio lleva `*` (con el
   texto «obligatorio» para lectores de pantalla) y una línea arriba dice que lo
   demás es opcional. La lista sale del esquema: título, categoría, precio y «el
   precio es por…»; el proveedor en el panel; y, en un producto con envío que no
   es solo cotización, quién lo lleva, el costo del envío y los días máximos (y
   la transportadora si elige una). Esos tres se marcan según el estado de la
   casilla «Solo cotización», que ahora es controlada.
2. **El impacto ambiental ya no es obligatorio para las empresas.** Era una
   regla solo del esquema (`CamposOfertaEmpresa`, mínimo 20 caracteres); la base
   nunca lo exigió. Hoy es opcional también en la plantilla de Excel. En el
   formulario va en un bloque de ancho completo, plegado y con la etiqueta
   «Opcional», que se abre solo si la oferta ya trae algo o si uno de sus
   campos falla.
3. **Maquetación.** «Envío» e «Impacto ambiental» salían pegados a una raya:
   era un `fieldset` con `border-t`, y el navegador pinta el `legend` encima del
   borde. Ahora cada bloque es una tarjeta (`Tarjeta`), sin rayas. Dos columnas
   en escritorio, con las dos terminando casi a la misma altura en un producto
   (2.219 px de alto el formulario, antes 2.541), «Departamento, ciudad y
   certificaciones» sacados del impacto a su propia tarjeta «Origen», y «El
   precio es por…» junto al precio.

## Por qué así

**Tarjetas en vez de arreglar el `legend`.** El truco habitual (`float` en el
`legend`) funciona, pero deja el separador como raya. Con tarjetas el problema
desaparece y el formulario gana jerarquía.

**El impacto plegado y no oculto.** Es parte de lo que vende Seregenera, así que
no se quita: se deja a un clic, con una línea que dice para qué sirve. Los campos
siguen dentro del `<form>` aunque el bloque esté cerrado.

**No se exige que, si se cuenta una cara del impacto, se cuente la otra.** El
texto del bloque lo pide («en las dos direcciones») pero no lo impone. Si se
quiere imponer, va en `reglasDeOferta()` solo para el modo empresa.

## Qué se rompe si tocas esto

- **Los `*` son a mano.** Si se agrega una regla a `CamposOferta` o a
  `reglasDeOferta()` (`src/lib/ofertas.ts`), hay que marcar el campo aquí con
  `requerido`; si no, el formulario dirá que es opcional y el servidor lo
  rechazará.
- **Los envoltorios de columna son `contents` en el teléfono** y cada tarjeta
  lleva su `order`: así el orden móvil (qué se vende, fotos, precio, envío,
  origen) no depende de las columnas. Si una tarjeta nueva no lleva `order`, se
  va al final del teléfono.
- **`CAMPOS_DE_IMPACTO`** lista los campos que abren el bloque al fallar. Un
  campo nuevo dentro del impacto tiene que entrar ahí, o su error quedaría
  oculto dentro del bloque plegado.
- **`CamposOfertaEmpresa` es hoy igual a `CamposOferta`** y se conserva por si
  vuelve una regla solo de empresa.

## Verificación

- `npm run build`, `npx tsc --noEmit`, `npx eslint .` (0 errores) y `npm test`
  (61; una nueva comprueba que una empresa publica sin impacto y que la plantilla
  no lo marca como obligatorio).
- Con Playwright y una página temporal con acciones de mentira (ya borrada):
  escritorio, experiencia, servicio, panel y móvil; 9 asteriscos en un producto
  y 6 si es solo cotización; un error en el impacto abre el bloque; la casilla
  de solo cotización llega bien al envío; sin desbordes a 390, 768 y 1024 px;
  orden móvil correcto; modo oscuro revisado.
- **No verificado**: con sesión real de empresa o de administrador, ni el
  guardado contra la base.
