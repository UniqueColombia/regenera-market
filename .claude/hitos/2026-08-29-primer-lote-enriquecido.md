# El primer lote enriquecido corrige tres perfiles mal cableados

- **Fecha:** 2026-08-29
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-agente-prospeccion` → #15
- **Fase del roadmap:** — (habilita la Fase 4, «Primer lote real de onboarding»)

Continúa [2026-08-29-excel-de-prospectos.md](2026-08-29-excel-de-prospectos.md).

## Qué se hizo

Cinco instancias del subagente `prospector-proveedores` enriquecieron los **162
prospectos de prioridad alta** —contacto, ciudad y juicio de encaje, una empresa
a la vez— y el resultado obligó a corregir el catálogo de perfiles.

El libro de `outputs/` tiene ahora una hoja **Contactar** con **29 empresas**,
14 de ellas con encaje `alto` y contacto verificado.

## Por qué así

**Los lotes se partieron intercalando, no por vertical.** 1.360 de los 2.826
prospectos sirven a más de una vertical: partir por vertical habría hecho que
dos agentes investigaran la misma empresa. Repartir con `filas[i::5]` además
distribuye los puntajes altos entre los cinco en vez de dejar el trabajo fácil
en uno solo.

**Tres perfiles estaban mal y solo se vio al llamar a las puertas.** Los cinco
agentes, sin hablar entre ellos, reportaron lo mismo:

- **3811, 3830 y 3900** —recolección de desechos, recuperación de materiales,
  saneamiento— estaban en `mantenimiento-verde`. **El flujo de dinero va al
  revés:** un reciclador *le compra* material al hotel, no le vende nada. Eran
  unas 45 de las 162 filas y se descartaron casi todas. Sustituidos por **4520**
  (mantenimiento de vehículos) y **8130** (paisajismo), que es lo que un
  transportador o un lodge sí contrata.
- **3511** (generación de energía eléctrica) estaba en los tres perfiles de
  energía. No devuelve instaladores: devuelve las sociedades vehículo de las
  granjas solares de escala, que le venden al sistema interconectado. Se
  reconocen por el nombre numerado —«Bosques Solares de los Llanos 7»—. Para
  paneles en un hotel el código es **4321**.
- La excepción del reciclaje se conservó: cuando la empresa **transforma** el
  material en producto —madera plástica para decks y mobiliario— sí es
  proveedor de catálogo. Eso lo recoge **2229**, agregado a
  `decoracion-sostenible` y `mobiliario-natural`.

**La lista de descartados es una barrera, no un comentario.** `CIIU_DESCARTADOS`
detiene el script si un perfil vuelve a incluir uno de esos códigos. Un
comentario se ignora; un `exitCode = 1` no. `--ciiu` los deja pasar a propósito:
quien los escribe a mano sabe lo que hace.

**Se agregó la señal BIC.** Sociedad de Beneficio e Interés Colectivo es una
**designación legal** que obliga a reportar impacto social y ambiental, no un
nombre bonito. En este lote acertó en todas las empresas que la tenían, que es
más de lo que consigue cualquier otra señal del registro mercantil. Se compara
como palabra suelta: dentro de «BICICLETAS» no dice nada.

**4520 entró a `CIIU_CAJON`.** No es «n.c.p.», pero es igual de ancho: ser
taller mecánico no dice nada por sí solo. Se le exige señal en el nombre y vale
6 puntos en vez de 15, como a los cajones de sastre.

## Qué quedó pendiente

- [ ] **Volver a correr los 20 perfiles con el catálogo corregido.** El libro
      actual se generó con los perfiles viejos: conserva las ~45 filas de
      reciclaje, ya marcadas `descartar`. La próxima corrida completa las quita.
- [ ] **Cruzar el RNT por NIT** (`thwd-ivmp` en datos.gov.co). Un agente
      descubrió que ese dataset da municipio real, estado del registro turístico
      y nombre comercial, y resolvió empresas que la búsqueda web no encontraba.
      Es la mejora de mayor rendimiento pendiente para `experiencias-regenerativas`.
- [ ] **`DEPARTMENTS` de `src/lib/taxonomy.ts` no incluye Bogotá D.C.** y le
      faltan Casanare, Córdoba, Guainía, Caquetá y Norte de Santander, todos con
      prospectos reales. Hoy los agentes los escriben igual y lo anotan; hay que
      decidir la convención antes del onboarding.
- [ ] Dos empresas con producto que encaja quedaron sin contacto por no existir
      en internet: **ORGANIC AND NATURAL COLOMBIAN** (jabones, Villavicencio) y
      **OVERALL NATIVE** (jabones, Bogotá). Se piden a la cámara de comercio.
- [ ] El presupuesto de búsquedas web se agotó en tres de los cinco agentes
      cerca del final. No cambió ningún juicio —esas filas eran del bloque de
      residuos, ya caracterizado— pero conviene lotes de 25 en vez de 33.

## Qué se rompe si tocas esto

- **`CIIU_DESCARTADOS` no es documentación: el script se detiene.** Si de verdad
  hace falta uno de esos códigos, hay que quitarlo de la lista *y* explicar por
  qué en este hito o en uno nuevo.
- **Los perfiles cambiaron, así que los CSV de `.claude/prospectos/` son de la
  versión anterior.** Mezclarlos con una corrida nueva sin borrarlos produce un
  libro con dos criterios distintos.
- **El enriquecimiento se superpone por NIT.** Si una corrida nueva ya no
  devuelve un NIT enriquecido, ese trabajo desaparece del libro. No está
  perdido: sigue en `.claude/prospectos/enriquecer/`.
- **Una celda de contacto vacía significa «se buscó y no se encontró».** Solo
  `Encaje` distingue eso de «sin investigar». No la rellenes con `info@dominio`:
  el agente la dejó vacía a propósito.

## Verificación

`npm run build`, `npx tsc --noEmit` y `npx eslint .`, los tres en limpio.

El perfil corregido, antes y después:

```
# antes: recicladores, que le compran al hotel
node scripts/prospectar.mts --perfil mantenimiento-verde
  → ASOCIACION DE RECICLADORES…, EMPRESA DE RECICLAJE Y SERVICIOS…

# después: paisajismo, que le vende al hotel
  → ESPACIOS Y AMBIENTES VERDES SAS · JARDINERIA AMBIENTE NATURAL SAS
```

La barrera se probó metiendo `3830` a mano en un perfil:

```
CIIU descartado en un perfil: 3830. Lee el comentario de CIIU_DESCARTADOS
antes de volver a agregarlo.
```

Resultado de los 162: **alto 14 · medio 15 · bajo 25 · descartar 108.** Cobertura
de contacto: 24 con sitio web, 40 con teléfono, 20 con correo, 14 con Instagram,
73 con ciudad confirmada en fuente.

**Que 108 de 162 se descarten no es un fracaso del puntaje: es el trabajo que el
puntaje no puede hacer.** El registro mercantil dice que una empresa existe y a
qué se dedica; no dice si le vendería a un hotel. Los tres perfiles corregidos
salieron justamente de mirar esos descartes.
