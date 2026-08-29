---
name: prospeccion-proveedores
description: Cómo se encuentran proveedores para el catálogo de Seregenera — qué fuentes sirven, cuáles están cerradas y por qué, cómo se puntúa un candidato y cómo se agrega un perfil de prospección nuevo. Úsala antes de tocar scripts/prospectar.mts, antes de conectar una fuente de datos de empresas, o cuando alguien proponga usar LinkedIn, Instagram o un scraper para conseguir proveedores.
---

# Prospección de proveedores

El catálogo se llena con proveedores colombianos reales. Esta skill es el mapa
de **de dónde salen** y, sobre todo, de dónde *no* pueden salir.

Quien ejecuta la prospección es el subagente `prospector-proveedores`. Esta
skill es lo que hay que saber para modificar la maquinaria.

## El estado real de cada fuente

Verificado el **2026-08-28** contra las APIs, no contra su documentación. Las
dos cosas no coinciden y ese es justamente el punto: la documentación de
MercadoLibre sigue diciendo que la búsqueda es pública, y responde 403.

| Fuente | Probado | Resultado | Uso |
|---|---|---|---|
| **RUES** vía `datos.gov.co`, dataset `c82u-588k` | `GET` sin token | `200`. 36 columnas, actualizado en agosto de 2026 | **Columna vertebral** |
| **MercadoLibre** `/sites/MCO/search` | `GET` sin token | `403 forbidden` — también `/categories` | Solo con app propia |
| **MercadoLibre** `/oauth/token` | `grant_type=client_credentials` | `invalid_client`, no `unsupported_grant_type` → el flujo servidor-a-servidor **sí existe** | Opcional |
| **RUES API oficial** `ruesapi.rues.org.co` | `GET DetalleRM` | `403`. Token con usuario y clave | No usada |
| **Instagram Graph** | documentación | `business_discovery` exige el @usuario de antemano; hashtags, 30 por semana | Enriquece, no descubre |
| **Facebook** | documentación | Page Search API deprecada; solo páginas propias | **Inútil** |
| **LinkedIn** | documentación y jurisprudencia | API cerrada desde 2015; los términos prohíben la extracción automatizada aunque el dato sea público | **Prohibida** |

### Por qué RUES es la columna vertebral

Es el registro mercantil de las 57 cámaras de comercio, publicado como dato
abierto por Confecámaras. Da lo que ninguna red social da: **identidad legal
comprobable**. NIT, matrícula, forma jurídica, actividad económica CIIU, año de
última renovación. El NIT importa además por una razón de producto: sin NIT no
se le puede pagar a un proveedor (`Provider.taxId` en `src/lib/types.ts`).

Lo que **no** trae, y hay que dejar de esperarlo: dirección, teléfono, correo,
municipio. Solo `camara_comercio`, que es la jurisdicción de matrícula y **no es
la ciudad**. Todo el contacto lo consigue el subagente leyendo fuentes públicas.

Consulta base, por si hace falta comprobarla a mano:

```bash
curl -s "https://www.datos.gov.co/resource/c82u-588k.json?\$select=count(1)&\$where=estado_matricula='ACTIVA'"
```

### Por qué LinkedIn no se usa, aunque sea donde están

Es la objeción obvia y conviene contestarla una sola vez, aquí:

LinkedIn cerró su API pública en 2015. El Partner Program tarda meses y no
aprueba casos de uso de generación de contactos comerciales. Y sus términos
prohíben la extracción automatizada **con independencia de que el dato sea
público** — la discusión de si "público" implica "libre de recolectar" ya se
litigó y LinkedIn ganó por incumplimiento de contrato, no por acceso indebido.

Que un scraper funcione técnicamente no lo hace disponible. Una persona puede
abrir un perfil en su navegador; el repositorio no automatiza eso.

## Cómo se puntúa un candidato

`puntuar()` en `scripts/prospectar.mts`. Máximo 100, con los motivos siempre
visibles en la columna `motivos` del CSV.

| Señal | Peso | Qué dice |
|---|---|---|
| Renovó el año en curso | 20 | Está operando. Es la señal más fiable del registro |
| Renovó el año anterior | 12 | Probablemente opera; aún no renueva |
| Nombre con carga sostenible | 12 c/u, tope 30 | Se posiciona como verde. **Señal de marketing, no de práctica** |
| CIIU principal en el perfil | 15 | Es su negocio, no una actividad lateral |
| CIIU solo secundario | 5 | Lo hace, pero no es a lo que se dedica |
| Asociativa o sin ánimo de lucro | 10 | Encaja con `community_owned` y `campesino` de la taxonomía |
| Sociedad constituida (SAS, Ltda, SA) | 8 | Puede facturar y sostener volumen |
| Persona natural | 4 | Facturable, pero suele ser de capacidad pequeña |
| 10+ años de operación | 12 | Sobrevivió |
| 3+ años | 8 | Ya no es un experimento |
| Vende en MercadoLibre | 20 | Tiene operación comercial montada y reputación pública |

**Los pesos están calibrados para separar, no para aprobar.** La primera versión
daba 65 sobre 100 a cualquier SAS viva con el CIIU correcto, y 993 de cada 1.000
pasaban el corte: un puntaje que aprueba a todos no ordena nada. Por eso pesa
más posicionarse (nombre, presencia comercial) que simplemente existir.

**El puntaje mide prospectabilidad, no sostenibilidad.** Son cosas distintas y
confundirlas contamina el catálogo. El nivel Semilla/Raíz/Bosque lo calcula un
trigger sobre evidencia que un admin revisó — ver `dominio-regenera` y
`src/lib/sustainability.ts`. Un puntaje de 90 aquí significa "vale la pena
llamarlos", nunca "son verificados".

Consecuencia práctica para quien lea un CSV: **espera descartar buena parte de
los puntajes altos.** "BIONATURAL SAS" puede ser un laboratorio de suplementos
importados. El script no puede saberlo; el subagente sí, leyendo el sitio.

## Agregar un perfil de prospección

Un perfil es una necesidad de una vertical traducida a códigos CIIU. Viven en
`PERFILES`, en `scripts/prospectar.mts`.

1. **El `slug` sale de `src/lib/taxonomy.ts`**, de las `subcategories` de la
   vertical. No inventes uno: el CSV alimenta el onboarding y el onboarding
   llena esa taxonomía. Si hace falta un slug que no existe, primero se agrega
   la subcategoría allá.
2. **Verifica los códigos CIIU antes de escribirlos.** No los pongas de memoria:
   un código mal etiquetado manda a prospectar la industria equivocada. La
   descripción oficial se comprueba así —

   ```bash
   curl -s "https://www.datos.gov.co/resource/wed5-aysq.json?\$select=ciiu,descripci_n&\$where=ciiu='2023'&\$limit=1"
   ```

   Si el código es nuevo para el repositorio, agrégalo también al mapa `CIIU`
   del script, con la descripción **copiada literalmente** de esa consulta.
3. **Comprueba el tamaño antes de confiar en el perfil.** Un perfil que devuelve
   30 empresas en todo el país está mal armado; uno que devuelve 40.000 no
   discrimina nada.

   ```bash
   node scripts/prospectar.mts --perfil <slug> --limite 20
   ```

   Lee la línea `RUES: N empresas activas cumplen el filtro`.

## Trampas conocidas

- **El muestreo sesga si se trunca.** El script trae el universo completo (hasta
  40.000) precisamente porque traer 1.000 ordenados por razón social devolvía
  solo empresas de la A a la C. Si ves el `AVISO: se traen solo N de M`, la lista
  **no es representativa**: acota con `--camara` o sube `--candidatos`.
- **El RUES repite la empresa por cada matrícula** (sede, sucursal,
  establecimiento). Se deduplica por NIT, y por `camara-matricula` cuando no hay
  NIT. Si agregas columnas, no rompas esa clave.
- **`ultimo_ano_renovado` viene como texto**, no como número. La comparación en
  SoQL va entre comillas o no filtra.
- **"EN LIQUIDACION" viene pegado a la razón social**, no en un campo de estado.
  Una empresa en liquidación aparece como `ACTIVA`. Se descarta por nombre.
- **CSV con `;` y BOM.** Excel en configuración regional colombiana usa `;` como
  separador de lista e ignora el UTF-8 sin BOM: sin las dos cosas, el archivo se
  abre en una sola columna y con las tildes rotas.

## MercadoLibre: registrar la app

Opcional. Sin credenciales el script salta el paso y avisa.

1. Entra a `https://developers.mercadolibre.com.co/` con una cuenta de
   MercadoLibre de la empresa (no una personal de nadie).
2. *Mis aplicaciones → Crear aplicación*. Nombre y descripción; como
   *redirect URI* sirve `https://seregenera.co/callback` — el flujo que usa el
   script es `client_credentials` y no redirige a ninguna parte.
3. Copia `App ID` y `Secret Key` a `.env.local`:

   ```
   MELI_CLIENT_ID=
   MELI_CLIENT_SECRET=
   ```

**El secreto no entra al repositorio.** `.env.example` documenta el nombre de la
variable, nunca el valor — ver los límites duros de `CLAUDE.md`.

Compruébalo así, sin exponer nada en el historial del shell:

```bash
node scripts/prospectar.mts --perfil amenities-ecologicos --limite 5
# "MercadoLibre: buscando señal comercial…"  → quedó bien
# "sin MELI_CLIENT_ID/MELI_CLIENT_SECRET"    → no las está leyendo
```

## Los CSV no se versionan

`.claude/prospectos/` está en `.gitignore`. Son datos de empresas y personas
identificables, y el repositorio es **público**. Que el dato sea de acceso
público en el RUES no autoriza a republicarlo agregado y puntuado en GitHub.

Lo que sí se versiona es la maquinaria: el script, los perfiles y esta skill.
