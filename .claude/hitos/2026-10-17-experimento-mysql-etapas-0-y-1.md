# El MySQL de Hostinger sirve, y el catálogo sale igual leyéndolo de un espejo

- **Fecha:** 2026-10-17
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-espejo-mysql` (sin merge: es un experimento)
- **Fase del roadmap:** — (infraestructura: pruebas de la vía B-2 de `ROADMAP-MIGRACION.md`)

## Qué se hizo

Las dos primeras etapas de un experimento: ver si se puede ir pasando
Seregenera al MySQL que ya trae el plan de Hostinger **sin tocar lo que
funciona**. Supabase sigue siendo la fuente de verdad y producción no cambió.

1. **Etapa 0: medir el terreno.** Se creó la base de pruebas `…_sgpruebas` en
   la cuenta de hosting, asignada a `seregenera.com` (Hostinger rechaza nombres
   largos: `seregenera_pruebas` no entró). Tiene acceso remoto solo desde la IP
   del PC de Jesús. `scripts/mysql/sondeo.mts` lee la configuración y prueba
   lo que el esquema de Postgres usa. El resultado está abajo.
2. **Etapa 1: el catálogo en espejo, solo lectura.**
   - `mysql/espejo-catalogo.sql`: `providers` (solo lo que expone la vista),
     `listings`, `listing_availability` y la vista `listings_publicos`.
   - `scripts/mysql/espejo.mts` copia de Supabase a MySQL y compara campo por
     campo.
   - `src/lib/mysql/` tiene la conexión (Kysely sobre mysql2) y la consulta del
     catálogo.
   - En `consultarOfertas()` de `src/lib/repo.ts`, un interruptor:
     con `FUENTE_CATALOGO=mysql`, `/catalogo` lee del espejo. Sin la variable,
     no se ejecuta nada nuevo.

### Lo que dijo el sondeo

| | Resultado | Qué significa |
|---|---|---|
| Servidor | **MariaDB 11.8.9**, no MySQL 8 | Kysely y mysql2 funcionan igual. Al traducir, se consulta la documentación de MariaDB |
| Funciones, triggers, CHECK | Sí: se crean sin privilegios especiales (`log_bin` apagado) y el CHECK se cumple | Los gemelos SQL de precios y niveles se podrían portar como funciones |
| JSON, `JSON_TABLE`, CTE recursiva, ventanas | Sí | Los `jsonb` y arreglos pasan a `json` |
| `FOR UPDATE SKIP LOCKED` | Sí | La compra atómica y los cupos se pueden hacer igual |
| FULLTEXT y colación sin tildes | Sí: «cafe organico» encuentra «Café orgánico» | Sustituye a `pg_trgm` + `unaccent` |
| Eventos programados | Se crean, pero **`event_scheduler` está apagado**: no corren | No hay sustituto de `pg_cron` dentro de la base |
| `sql_mode` | **No estricto** | Sin `STRICT_ALL_TABLES`, un texto largo se recorta y un número inválido se guarda como 0, sin error. `conexion.ts` lo fija en cada conexión |
| `wait_timeout` | **20 s** | El pool suelta las conexiones ociosas a los 15 s |
| Límites | 75 conexiones por usuario; el usuario **remoto** además tiene 500 conexiones por hora, el local no | Para la app (127.0.0.1) solo cuenta el 75 |
| Latencia | PC → base: 162 ms por consulta. En el servidor, a 127.0.0.1: 0,13 ms por consulta en una conexión abierta | Abrir conexiones seguidas sin pausa falla a veces (6 de 30 por socket): hay que usar el pool, no una conexión por petición |

## Por qué así

- **Un espejo y no una migración.** El SQL empieza con `drop` y se rehace en
  cada corrida. Mientras Supabase sea la fuente de verdad, el espejo no se
  edita: se vuelve a copiar.
- **El espejo se llena con la llave anónima**, no con la de servicio: copia
  lo que cualquier visitante ya ve a través de RLS. Así a Hostinger no pasa
  ningún dato privado (ni correos, ni NIT, ni ofertas en borrador), y el
  script no tiene con qué escribir en Supabase.
- **Kysely sobre mysql2**, y no Drizzle ni un ORM. Las consultas de Kysely son
  casi iguales en MySQL y en Postgres: si un día hay VPS con Postgres (vía A),
  lo escrito no se pierde.
- **Las reglas de negocio no se duplicaron.** `repo.ts` calcula el patrón de
  búsqueda (`patron()`), los niveles (`nivelesDesde()`), si la subcategoría se
  filtra y qué columnas se piden, y se los pasa a `catalogo.ts`. Lo que cambia
  según la base (cómo se filtra un arreglo, la paginación, los cupos) es lo
  único que vive aparte.
- **Ids en `ascii_bin`** y no el tipo `UUID` de MariaDB. El desempate del
  catálogo es `order by id`. Con `ascii_bin` se ordena byte a byte, igual que
  el uuid de Postgres, y las páginas salen idénticas. El tipo nativo no se
  probó.
- **La búsqueda sin tildes la da la colación** (`utf8mb4_uca1400_ai_ci`), no
  una función. Por eso `busqueda` es el texto tal cual.
  `category`, `subcategory` y `department` van en `utf8mb4_bin`: se filtran
  por igualdad exacta, como en Postgres. Con la colación de la tabla,
  `department=Narino` traería las de «Nariño».
- **No se desplegó en Hostinger.** Probar la app contra 127.0.0.1 exigía
  subir esta rama a producción (aunque fuera con el interruptor apagado) o
  crear una segunda Web App. Ninguna de las dos se hizo sin preguntar. La
  latencia del servidor se midió por SSH.

## ¿Vale la pena seguir?

**Lo técnico, sí.** MariaDB 11.8 tiene todo lo que el esquema usa, salvo dos
cosas: no tiene RLS y no corren las tareas programadas. Además, la lectura
se tradujo sin una sola diferencia. Desde el servidor, el catálogo en MySQL
tarda unos **3 ms** (las tres consultas). En Supabase, la consulta equivalente
tarda unos **52 ms** (mediana de 10, con la conexión abierta). Una página hace
varias consultas, así que leer de Hostinger la haría más rápida, aunque no es
un cambio grande.

**Lo caro sigue intacto.** Las etapas 0 y 1 no tocaron ninguna de las tres
cosas que hacen de B-2 un trabajo de semanas:
- las políticas RLS, que pasarían a comprobarse en el código;
- la lógica de dinero en funciones y triggers;
- el acceso (cuentas y código de 6 dígitos).

Antes de decidir B-2, la prueba que de verdad responde es portar **una
escritura protegida por RLS** y sus pruebas de permisos. Por ejemplo: que un
proveedor edite su oferta y otro no pueda. Eso mide el costo de sacar RLS a
TypeScript.

## Qué quedó pendiente

- [ ] **La app en Hostinger contra 127.0.0.1.** Depende de decidir cómo: una
      segunda Web App con dominio provisional, si el plan la permite, o
      desplegar con `FUENTE_CATALOGO` vacía.
- [ ] El espejo es una foto: lo que cambie en Supabase no llega hasta volver a
      correr `espejo.mts`.
- [ ] En modo MySQL, solo `consultarOfertas()` (la lista del catálogo y el
      sitemap) lee del espejo. La ficha (`getListingBySlug`), los proveedores
      de cada tarjeta (`getProvidersByIds`), la portada y la sesión siguen en
      Supabase.
- [ ] Etapa 2 (escrituras sin dinero, `page_views` en las dos bases) y etapa 3
      (imágenes al disco de Hostinger): sin empezar.
- [ ] Sin sustituto de `pg_cron`: el cron de hPanel no se miró.
- [ ] La búsqueda es `like '%…%'`, que recorre la tabla entera. Con 19
      ofertas no importa; con miles, FULLTEXT.
- [ ] El acceso remoto está abierto para una sola IP (la del PC de Jesús).
      Si cambia, se agrega la nueva en hPanel → Bases de datos → MySQL
      remoto. Al terminar el experimento, se quita.

## Qué se rompe si tocas esto

- **`FUENTE_CATALOGO=mysql` en producción.** Con el espejo viejo, el catálogo
  muestra ofertas que ya no existen o les faltan las nuevas. Sin las
  variables `MYSQL_*`, `/catalogo` responde 500. Hoy no está en Hostinger y
  no debe ponerse.
- **Una columna nueva en `listings` que el catálogo lea** (está en
  `src/lib/columnas-ofertas.ts`) va en tres sitios: `espejo-catalogo.sql`,
  `esquema.ts` y `TABLAS` de `espejo.mts`. Si falta, el modo MySQL falla con
  «Unknown column» (no en silencio). La vista congela su `l.*` igual que en
  Postgres (0020): hay que recrearla.
- **`AJUSTES_DE_SESION`** de `conexion.ts`. Si se quita el modo estricto,
  los datos se corrompen en silencio.
- **Las colaciones.** Si se cambia la de la tabla, la búsqueda deja de
  ignorar las tildes. Si se quita el `utf8mb4_bin`, los filtros dejan de ser
  exactos. Si se quita el `ascii_bin`, la paginación repite ofertas.
- `conexion.ts` y `catalogo.ts` no tienen imports relativos con valor porque
  `espejo.mts` los carga con `node` pelado.

## Verificación

- `node --env-file=.env scripts/mysql/sondeo.mts`: todo disponible (el CHECK
  rechaza el precio negativo).
- `node --env-file=.env scripts/mysql/espejo.mts`: 14 proveedores, 19
  ofertas, 11 fechas con cupos. Comparadas campo por campo: 19 ofertas
  públicas, 931 campos, idénticas.
- `npm run build`, `npm start -p 3101` y `FUENTE_CATALOGO=mysql npm start -p
  3102`, y luego `node scripts/mysql/comparar-catalogo.mts`: **31 de 31 casos
  idénticos** (total, ofertas y orden). Incluye los cinco órdenes, tipo,
  vertical, categoría y subcategoría, departamento con y sin tilde,
  certificación, los tres niveles, búsquedas con y sin tildes y mayúsculas, y
  combinaciones.
- `npx tsc --noEmit` en limpio; `npx eslint .` sin errores ni avisos en lo
  nuevo (los 94 avisos son de `.claude/skills/impeccable/scripts/`, que ya
  estaban); `npm test`: 61 pruebas pasan.
- Por SSH en el servidor: conexión a 127.0.0.1 y medición de latencia contra
  las dos bases.
- No se probó: la app desplegada en Hostinger leyendo de MySQL.
