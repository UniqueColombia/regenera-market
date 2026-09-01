# Prospector de proveedores, y los hitos se mudan a `.claude/`

- **Fecha:** 2026-08-28
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-agente-prospeccion` → #<n>
- **Fase del roadmap:** — (habilita la Fase 4, «Primer lote real de onboarding»)

## Qué se hizo

El repositorio ya puede responder «quién nos podría vender amenities ecológicos
en Bogotá» sin que nadie busque a mano. `scripts/prospectar.mts` construye el
universo de candidatos desde el registro mercantil colombiano y lo puntúa; el
subagente `prospector-proveedores` toma esa lista y la enriquece con contacto y
criterio. La skill `prospeccion-proveedores` documenta el estado real de cada
fuente y por qué tres de las cuatro redes sociales que se plantearon no sirven.

Además, `hitos/` pasó a `.claude/hitos/`: son memoria del agente, y viven donde
vive el resto de la infraestructura de agentes.

## Por qué así

**El universo sale del RUES, no de las redes sociales.** Se probaron las cuatro
fuentes propuestas contra sus APIs, no contra su documentación, y la
documentación miente en dos de ellas:

| Fuente | Probado | Resultado |
|---|---|---|
| RUES vía `datos.gov.co` (`c82u-588k`) | `GET` sin token | `200`, actualizado en agosto de 2026 |
| MercadoLibre `/sites/MCO/search` | `GET` sin token | `403`, pese a que sus docs lo dan por público |
| MercadoLibre `/oauth/token` | `client_credentials` | `invalid_client`, no `unsupported_grant_type`: el flujo servidor-a-servidor existe |
| Instagram Graph | documentación | `business_discovery` exige el @usuario de antemano |
| Facebook | documentación | Page Search API deprecada |
| LinkedIn | documentación y jurisprudencia | API cerrada desde 2015; extracción prohibida por contrato |

El RUES es además la única fuente que da **identidad legal comprobable**: NIT,
matrícula, CIIU, año de renovación. Sin NIT no se le puede pagar a un proveedor
(`Provider.taxId`), así que empezar por ahí no es solo lo más fácil, es lo que el
modelo de datos ya exigía.

**LinkedIn se descartó por contrato, no por dificultad.** Sus términos prohíben
la extracción automatizada con independencia de que el dato sea público, y eso
ya se litigó. Queda escrito como límite duro en `CLAUDE.md` para no rediscutirlo.

**El script no opina y el subagente no inventa.** El corte entre las dos capas es
la decisión de diseño principal. Lo determinista —existe, está activa, renovó, su
CIIU es el correcto— va en el script. Lo que exige leer un sitio web y decidir si
esto le sirve a un hotel va en el subagente. Un script que adivina intención
produce basura con apariencia de dato; un agente que consulta APIs de a una fila
gasta una tarde en lo que una consulta resuelve en cuatro segundos.

**Se descartó meterlo en la aplicación.** Una tabla `prospects` con panel en
`/admin/prospeccion` era la otra opción, y es a donde esto debería llegar. Hoy
está bloqueada: el esquema de Supabase nunca se ha aplicado (Fase 1 abierta), y
no hay auth ni rol admin (Fase 2). Construirlo ahora habría obligado a abrir esas
fases por una herramienta interna, que es exactamente el orden inverso al del
roadmap.

**Los CSV no se versionan.** `.claude/prospectos/` está en `.gitignore`. Que el
RUES publique estos datos no nos autoriza a republicarlos agregados y puntuados
en un repositorio público.

## Qué quedó pendiente

- [ ] Registrar la app de MercadoLibre y llenar `MELI_CLIENT_ID` /
      `MELI_CLIENT_SECRET`. El paso a paso está en la skill. Sin eso, la señal
      comercial se salta y el script avisa.
- [ ] Correr el primer lote real y **recalibrar los pesos con el resultado**.
      Hoy son una heurística declarada, no un modelo: nadie ha comprobado
      todavía cuáles predicen bien.
- [ ] `--listar-camaras` tarda ~1 minuto (57 consultas). Sirve, pero merece
      caché si se usa seguido.
- [ ] Los perfiles cubren las 20 subcategorías de `taxonomy.ts` con 44 códigos
      CIIU. Faltan verticales enteras por afinar: `transporte` es la más floja,
      porque su oferta es más de servicio que de producto y el CIIU la describe
      mal.
- [ ] Cuando la Fase 2 cierre, evaluar mover esto a una tabla `prospects` con
      panel de administración.

## Qué se rompe si tocas esto

- **Los `slug` de `PERFILES` son los de `VERTICALS[].subcategories` en
  `src/lib/taxonomy.ts`.** Si allá se renombra una subcategoría y aquí no, el
  CSV deja de atarse a la taxonomía que alimenta.
- **Las descripciones del mapa `CIIU` están copiadas literalmente de datos
  abiertos oficiales**, no escritas de memoria. Al agregar un código, cópialo de
  la consulta que documenta la skill; un código mal etiquetado manda a
  prospectar la industria equivocada.
- **El puntaje mide prospectabilidad, no sostenibilidad.** No lo conectes al
  motor de `src/lib/sustainability.ts`: el nivel Semilla/Raíz/Bosque lo escribe
  un trigger sobre evidencia que un admin revisó.
- **La paginación del RUES necesita `$order` estable** (hoy `matricula`).
  Cambiarlo por un orden semántico reintroduce el sesgo descrito abajo.
- **`ultimo_ano_renovado` es texto en el dataset**, no número: la comparación
  SoQL va entre comillas o no filtra.
- **«EN LIQUIDACION» viene pegado a la razón social**, no en un campo de estado:
  esas empresas figuran como `ACTIVA` y se descartan por nombre.
- `.claude/` lo cubre `CODEOWNERS`, así que ahora un PR que registra un hito
  pide revisión de Ivan automáticamente. Es informativo, no bloquea.

## Verificación

`npm run build`, `npx tsc --noEmit` y `npx eslint .`, los tres en limpio. El
`node_modules` estaba vacío, así que el build exigió `npm install` primero.

Corrida real contra el RUES, sin credenciales de MercadoLibre:

```
node scripts/prospectar.mts --perfil amenities-ecologicos --camara BOGOTA --limite 20
RUES: 6440 empresas activas cumplen el filtro.
1487 superaron el umbral de 55; se escriben 20.
```

**La primera versión estaba mal y la corrida lo delató.** Traía 1.000 filas
ordenadas por razón social y puntuaba eso: como el filtro devuelve 6.440
empresas, las 1.000 primeras eran todas de la A a la C, y 993 de ellas pasaban el
umbral. Un puntaje que aprueba al 99% no ordena nada, y una muestra alfabética no
es una muestra. Se corrigieron las dos cosas: ahora se trae el universo completo
(18.523 filas nacionales = 5,8 MB en 4 s) y los pesos premian posicionarse por
encima de simplemente existir. El ranking resultante cubre matrículas de 1990 a
2019 y nombres de toda la lista.

Los códigos CIIU se verificaron uno a uno contra los datasets `wed5-aysq` y
`3vbk-w3sc` de datos.gov.co — 457 códigos con descripción oficial disponible—,
no contra memoria.
