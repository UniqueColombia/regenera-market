# Todas las fotos, carga desde Excel, «Contactar proveedores», BOLD y envío por zona

- **Fecha:** 2026-10-14
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-catalogo-proveedores-pagos` (entrega directa, cinco commits)
- **Fase del roadmap:** — (adelanta la 3 y la 4: proveedores reales y cobro)

## Qué se hizo

Siete pedidos de Jesús en una tanda, entregados en cinco commits:

1. **Las fotos.** La tarjeta del catálogo y la ficha enseñaban solo `images[0]`:
   el Cacao Arhuaco tenía seis fotos y se veía una. Ahora la ficha tiene una
   galería deslizable (`GaleriaOferta`) y la tarjeta turna las fotos con un
   fundido (`FundidoTarjeta`). Las fotos subidas entran también al JSON-LD.
2. **Redes de Seregenera**, en el pie, en el pie de los correos y en el `sameAs`
   de la portada, leídas de `REDES` en `src/lib/legal.ts`. **Vacías**: no hay
   enlaces todavía, y vacías no se pinta nada.
3. **Envío por zona y por unidad (migración 0017).** `envío = (local si el
   destino es el departamento de origen, si no nacional) + adicional ×
   (unidades − 1)`. Peso y medidas opcionales. Gemela SQL/TS comparada en
   `gemelos.test.ts`.
4. **Carga masiva desde Excel**: plantilla descargable (`/api/plantilla-ofertas`)
   con listas desplegables, instrucciones y ejemplos; la empresa la sube en
   `/cuenta/empresa/ofertas/importar` y el equipo en `/admin/ofertas/importar`
   (el caso «el proveedor nos mandó su portafolio»).
5. **«Contactar proveedores» (migración 0018)**: `/admin/contactar`. Prospectos
   en la base, importados del Excel del prospector o a mano; invitación o
   noticia por correo a muchos a la vez, en lotes y con tope diario; WhatsApp
   uno a uno; baja de un clic; `/vender?invitacion=…` llega prellenado.
6. **Pagos (migración 0019)**: BOLD en línea, apagado hasta tener las llaves;
   llave Bre-B y transferencia con datos copiables, desde el entorno.

## Por qué así

**Fotos: fundido en la tarjeta, galería en la ficha.** El fundido era la idea
de Jesús y se quedó, con cuatro cosas que la hacen soportable en una rejilla de
24: solo turnan las tarjetas que se ven, cada una con su desfase (si cambian
todas a la vez se lee como un fallo), solo se pasa a una foto ya cargada (si no,
parpadea la de abajo) y con el ratón encima la foto la elige la posición del
puntero. En la ficha, donde se decide la compra, una galería con `scroll-snap`
y no un carrusel que cambia el `src`: el gesto de deslizar es el del navegador
y todas las fotos están en el HTML.

**Envío: zona + unidad, no tabla por tamaño ni cotización en vivo.** Entre tres
opciones Jesús eligió esta. Una tabla de tamaños (S/M/L × zonas) es más precisa
pero es la que un proveedor pequeño no llena; la cotización con transportadora
exige el convenio con Aveonline, que no existe. Peso y medidas se piden ya
para que, el día que exista, no haya que volver a pedírselos a cada proveedor.
`envio_cop` sigue siendo la nacional: un producto anterior a la 0017 cobra
exactamente lo mismo que antes, con una unidad o con cien.

**Excel: lector propio y en el navegador.** Mismo criterio que
`scripts/exportar-excel.mts`: un `.xlsx` es un ZIP de XML, y la librería
habitual (SheetJS) tiene la versión de npm con avisos de seguridad abiertos.
Se lee en el navegador (`DecompressionStream`) porque así el archivo no choca
con el límite de cuerpo de una Server Action, la revisión fila por fila es
instantánea, y al servidor solo llegan filas que pasan por **la misma acción
del formulario**. La llave de cada oferta sale del proveedor y el título: subir
dos veces la misma planilla no duplica nada. **Word no se lee**: no tiene
estructura de la que sacar filas; el portafolio en Word o PDF se pasa a la
plantilla (a mano, o pidiéndoselo al agente en una sesión).

**Prospectos en la base, no en el repositorio.** La idea de partida era subir
al repo «solo los datos no sensibles». El `CLAUDE.md` lo prohíbe con nombre
propio y por una razón que no cambia con la sensibilidad del dato: un repo
público con contactos agregados y puntuados. En la base, con RLS de
administrador, además hay estado por empresa, bajas y registro de envíos, que
es lo que el módulo necesita.

**Correo en bloque con frenos, WhatsApp a mano.** Tope de 300 correos de
campaña al día, porque salen por el mismo remitente que los de acceso y los de
los pedidos y Gmail corta la cuenta que manda cientos a desconocidos. Lotes de
10 por llamada para mostrar avance y no acercarse al tiempo máximo de una
función. Un mismo correo no llega dos veces a la misma empresa (clave
(campaña, prospecto)). Baja visible en el pie y en las cabeceras
`List-Unsubscribe` (el botón de Gmail hace `POST /api/baja`), y la página
`/baja` pide confirmar con un botón porque los antivirus corporativos abren los
enlaces. **WhatsApp no se automatiza**: sus términos lo prohíben desde una
cuenta normal y bloquean el número; el enlace abre el chat con el texto puesto.

**BOLD detrás de la interfaz, y la confirmación por dos caminos.** El webhook es
el camino principal; la vuelta del comprador al pedido pregunta a BOLD y
confirma si está aprobado, de respaldo. Los dos pasan por
`registrarPagoEnLinea()`: idempotente, compara el monto con el total guardado y
los correos salen después de responder (BOLD corta a los dos segundos). Los
datos bancarios y la llave van en variables de entorno y no en el código:
publicados en un repositorio público, son la materia prima de una página de
pago falsa.

## Qué quedó pendiente

- [ ] **Aplicar 0016, 0017, 0018 y 0019, en ese orden** (la 0017 reemplaza la
      `crear_orden()` de la 0016). El código funciona sin ellas y se enciende
      solo con cada una.
- [ ] **Lo de Ivan** (ver «Para conversar con Ivan» en `docs/ESTADO.md`):
      llaves de BOLD y su webhook, datos de la llave Bre-B y de la cuenta,
      enlaces de las redes, las `SMTP_*` (sin ellas no sale ningún correo de
      campaña), a qué buzón llegan las respuestas de las invitaciones.
- [ ] Al encender BOLD, actualizar «Pedidos, pago y entrega» de `/terminos` y
      `VIGENCIA_TERMINOS`: hoy dicen que el pago se coordina por transferencia.
- [ ] **El flujo de BOLD no se ha probado contra BOLD**: no hay llaves. Está
      probado lo que se puede sin ellas (firma de integridad y del webhook según
      su documentación, en `payments.test.ts`; la tabla `pagos` en
      `pagos.test.ts`). La primera prueba real es con las llaves de pruebas en
      Preview y `BOLD_MODO_PRUEBAS=1`.
- [ ] **Un pago aprobado después de que el pedido venció** (72 h) no se
      confirma: queda en `pagos` y en el registro como «reabrir o devolver», y
      hay que hacerlo a mano en `/admin/ordenes`.
- [ ] El panel de órdenes no enseña todavía el número de transacción de BOLD
      (está en la tabla `pagos`).
- [ ] Solo 17 de los 2.827 prospectos del Excel del prospector tienen correo.
      El módulo sirve para ir completando; conseguir los contactos es trabajo
      del subagente `prospector-proveedores`.

## Qué se rompe si tocas esto

- **`envio_de_linea()` (0017) y `envioDeLinea()` (`src/lib/envios.ts`) son
  gemelas.** La primera cobra; la segunda pinta la cesta. Si cambias una,
  cambia la otra y corre `npm run test:base`.
- **El origen del envío local es `listings.department`**, no el del
  proveedor. Una oferta sin departamento nunca cobra la tarifa local, y el
  formulario y la planilla exigen el departamento si se declara una.
- **La planilla se reconoce por los títulos de las columnas** (`COLUMNAS` en
  `src/lib/plantilla-ofertas.ts`). Cambiar un título sin dejar el anterior
  como alias hace que las planillas ya descargadas dejen de leerse.
- **La llave de una oferta importada es determinista** (`llaveDeOferta()` en
  `importar-ofertas.tsx`). Si se cambia por una al azar, subir dos veces la
  misma planilla duplica el catálogo.
- **Una baja no se deshace**: el trigger `prospectos_tocar` la conserva y
  `eliminarProspectos()` no borra a quien la pidió. No «arregles» eso: es lo
  que impide volver a escribirle cuando su nombre llegue en otra planilla.
- **`leerNotificacion()` verifica la firma sobre el cuerpo en Base64**, como
  dice BOLD, no sobre el JSON. Y `BOLD_MODO_PRUEBAS` se ignora en Production a
  propósito.
- **`/api/webhooks/bold` usa la clave de servicio.** Cualquier cambio ahí tiene
  que seguir verificando la firma antes de tocar la base.

## Verificación

- `npm run build`, `npx tsc --noEmit`, `npx eslint .` (sin errores; los avisos
  son de scripts de terceros en `.claude/skills/impeccable`), `npm test` (57) y
  `npm run test:base` (60, contra las 19 migraciones).
- Galería y fundido vistos en local contra la base de producción (solo
  lectura), con capturas de Playwright a 1280 y 390 px sobre
  `/oferta/cacao-arhuaco`: 6 fotos, miniaturas, contador, el turno avanza solo
  y el ratón elige la foto.
- La plantilla generada se abrió con openpyxl: cuatro hojas, 7 listas
  desplegables, encabezado fijo.
- El lector de prospectos se probó con el Excel real del prospector (`outputs/`,
  no versionado): 9 hojas, 7 usadas, 30 prospectos con contacto.
- En local: `/api/plantilla-ofertas` 200 con el tipo de Excel;
  `/api/webhooks/bold` 404 sin llaves; `POST /api/baja` 200; la CSP incluye
  `checkout.bold.co`; `/baja` sale en `robots.txt` como no indexable.
- **No verificado**: nada de lo que necesita sesión de empresa o de administrador
  se vio en pantalla (carga desde Excel, «Contactar proveedores», el pedido con
  los datos de pago). Ni un correo de campaña real: faltan las `SMTP_*`.
