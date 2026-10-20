# Seregenera

Marketplace multi-proveedor de productos, experiencias y servicios regenerativos
para el sector turístico colombiano. Operado por **Dimension Natural SAS**.

Hoteles, glampings, restaurantes, transportadores y operadores compran a
proveedores colombianos verificados uno por uno; la plataforma retiene comisión
sobre cada venta.

> **¿Acabas de hacer `git pull` y quieres saber en qué vamos?**
> → **[`docs/ESTADO.md`](docs/ESTADO.md)**: qué está a medias, qué falta, quién
> puede hacer cada cosa y con qué comando se comprueba. Este README describe el
> producto y cómo está hecho; el avance del día vive allá.

## Dónde corre

| | |
|---|---|
| **Producción** | **https://seregenera.com**, una Web App de Node.js en Hostinger (plan Business), desde el 2026-10-16 |
| **Base de datos** | El **MariaDB del mismo hosting**, desde el 2026-10-17 (el «modo MySQL», `BASE_DE_DATOS=mysql`). Cómo funciona: [`docs/MODO-MYSQL.md`](docs/MODO-MYSQL.md) |
| **Fotos** | En el disco del servidor (`ALMACEN_CARPETA`), servidas por `/archivos/…` |
| **Correo** | `info@seregenera.com`, el correo de Hostinger ([`docs/CORREOS.md`](docs/CORREOS.md)) |
| **Copias de seguridad** | Diarias, de la base y las fotos, en el servidor; cifradas con llave pública desde `v0.12.4` ([`docs/MODO-MYSQL.md`](docs/MODO-MYSQL.md), «Copias de seguridad») |
| **Despliegue** | Por tag (`v0.MINOR.PATCH`), con un comando: `scripts/desplegar.mts`. Skill `desplegar-hostinger` |
| **Monitor** | `.github/workflows/latido.yml`: cada día pregunta a `/api/latido` si la base contesta y la configuración de producción está completa |

**Supabase fue la base hasta el 2026-10-17** y ya no se usa: producción no tiene
sus variables. En el código sigue el «modo Supabase» (`supabase/migrations/`,
`src/lib/supabase/`) como historia y vuelta atrás; retirarlo es un pendiente de
`docs/ESTADO.md`. Vercel, el hosting anterior, tampoco se usa.

## Arranque

```bash
npm install
npm run dev          # http://localhost:3000
```

**No requiere credenciales para correr.** Sin base configurada, el catálogo se
sirve desde datos de demostración en memoria (`src/data/`), así que la
aplicación es navegable de inmediato. Para trabajar contra un MariaDB propio,
`npm run dev:mysql` ([`docs/MODO-MYSQL.md`](docs/MODO-MYSQL.md), «Probarlo en el
PC»). Las variables de entorno, sus nombres y de dónde sale cada una:
[`docs/VARIABLES.md`](docs/VARIABLES.md) (no hay `.env.example`: ningún `.env`
entra al repositorio).

## Cómo está organizado

| Ruta | Qué hace |
|---|---|
| `/` | Portada: propuesta de valor, verticales, ofertas destacadas y comunidad |
| `/catalogo` | Listado con filtros por tipo, vertical, categoría, departamento, nivel y certificación. Los filtros son un formulario GET, así que cada combinación es una URL compartible e indexable |
| `/oferta/[slug]` | Ficha de la oferta, con compra o solicitud de cotización |
| `/proveedores` · `/proveedor/[slug]` | Directorio y perfil público de proveedores |
| `/verificacion` · `/niveles` | Metodología de verificación, autodiagnóstico y cómo se gana el nivel de proveedor |
| `/vender` | Propuesta para proveedores y alta de la empresa |
| `/comunidad` | Artículos, preguntas y prácticas de los proveedores, con reacciones |
| `/carrito` · `/orden/[reference]` | Cesta multi-proveedor, pedido y pago |
| `/registro` · `/entrar` | Crear cuenta y acceder: contraseña, y código de seis dígitos como segundo factor en dispositivos nuevos |
| `/cuenta` · `/cuenta/clave` | Datos, contraseña, dispositivos de confianza y baja de la cuenta |
| `/cuenta/empresa` | Panel del proveedor: datos de la empresa, giros, sus ofertas y los pedidos que tiene que despachar |
| `/admin` | Panel del equipo: resumen, analíticas, ofertas, proveedores, postulaciones, órdenes, reseñas, comunidad, usuarios y contacto con prospectos |
| `/legal` · `/privacidad` · `/terminos` | Políticas y términos |
| `/api/latido` | Señal de vida: consulta la base y revisa la configuración de producción |
| `/api/webhooks/bold` | Avisos de pago de la pasarela, con la firma verificada |

| Módulo | Responsabilidad |
|---|---|
| `src/lib/types.ts` | Modelo de dominio |
| `src/lib/taxonomy.ts` | Verticales, categorías, niveles, certificaciones, departamentos |
| `src/lib/sustainability.ts` · `src/lib/niveles.ts` | Puntaje de sostenibilidad y nivel del proveedor por experiencia |
| `src/lib/repo.ts` | Acceso a datos. El mismo código sirve para MariaDB y para Supabase |
| `src/lib/mysql/` | La capa que hace que MariaDB responda como Supabase: consultas, políticas de acceso por fila (RLS) aplicadas en cada lectura y escritura, funciones, cuentas y sesiones |
| `src/lib/pricing.ts` | Precio efectivo (minorista/mayorista), comisión e impacto agregado |
| `src/lib/payments.ts` | Capa de pasarela: BOLD si están sus llaves; si no, pago manual por llave Bre-B o transferencia, confirmado por el equipo en `/admin/ordenes` |
| `src/lib/orders.ts` | Órdenes: la compra es una transacción idempotente que descuenta cupo (`crear_orden()`) |
| `src/lib/almacenamiento.ts` | Dónde se guardan las fotos (disco del servidor o Supabase Storage) |
| `src/lib/configuracion.ts` | Lo que producción necesita tener configurado; lo revisan el arranque y el latido |
| `src/lib/password.ts` · `src/lib/dispositivos.ts` · `src/lib/inactividad.ts` | Fuerza de la contraseña, dispositivos de confianza y caducidad de la sesión |
| `mysql/` | El esquema y la lógica de MariaDB (`esquema.sql`, `logica.sql`) y sus pruebas |
| `supabase/migrations/` | El esquema de Postgres con RLS, `0001`–`0022`. **Historia** desde el corte a MariaDB |

## Decisiones que conviene conocer

**El precio nunca lo calcula el cliente.** El carrito guarda solo
identificadores y cantidades; el servidor los valoriza contra el catálogo en
cada cambio. Un carrito guardado hace un mes no puede comprar al precio de hace
un mes.

**La comisión se guarda por ítem, no sobre el total.** Una orden puede
repartirse entre varios proveedores y cada uno tiene que poder auditar
exactamente lo que se le descontó.

**El título y el precio se congelan en la orden.** Si el proveedor los cambia
mañana, la orden histórica sigue diciendo lo que el comprador aceptó.

**La contraseña se comprueba sin abrir sesión.** Si el dispositivo no se
reconoce, hace falta además el código de seis dígitos del correo — y hasta que se
verifique, no hay sesión de ninguna clase. Un segundo factor que se pide después
de dejar entrar no es un segundo factor.

**Recuperar la contraseña es entrar con código y definir una nueva.** No hay un
flujo aparte: usar la misma plantilla de correo que ya funciona es un camino
menos que se puede romper sin que nadie lo note.

**Los roles viven en su propia tabla,** no en el perfil: si el usuario pudiera
actualizar su propia fila de perfil, podría autoasignarse `admin`.

**El puntaje y el nivel los escribe la base,** no el proveedor. Las
certificaciones suman con tope, para que un taller pequeño sin plata para
certificarse pueda llegar a Raíz por prácticas reales, y para que una
certificación comprada no baste sola.

**Las reglas de acceso viven junto a los datos, no en las páginas.** Con
Supabase eran políticas RLS de Postgres; en MariaDB, que no las tiene, la capa
de `src/lib/mysql/` las aplica en cada consulta y falla cerrada si no puede
comprobar una. Las páginas no repiten esos controles: si uno faltara, la base
igual no devolvería la fila.

## Qué falta

En grandes rasgos; el detalle, quién puede hacer cada cosa y el orden están en
[`docs/ESTADO.md`](docs/ESTADO.md):

- [ ] **Encender el pago en línea.** BOLD está implementado (`src/lib/payments.ts`
      y su webhook); faltan sus llaves y los datos de cobro (`PAGO_*`) en
      producción. Hasta entonces, el pedido se paga por Bre-B o transferencia y
      el equipo lo confirma a mano.
- [ ] **Terminar el panel del proveedor** (Bloque 4 de `docs/BETA.md`) y la
      pantalla de evaluaciones del equipo.
- [ ] **Fechas con cupo de las experiencias** desde el panel (hoy, por script).
- [ ] **Correos:** repasar el formato de todos y crear los que faltan
      ([`docs/CORREOS.md`](docs/CORREOS.md), parte C).
- [ ] **Primer lote real de proveedores**, reemplazando los de demostración.
- [ ] **Retirar Supabase:** pausar y luego eliminar el proyecto (con un respaldo
      final), y después quitar el modo Supabase del código.
- [ ] **Repensar el impacto ambiental:** cómo se mide y cómo se presenta.

## Trabajar en este repo

Proyecto colaborativo entre **Ivan Duarte** (`UniqueColombia`) y **Jesús Seiler**
(`seiler18`), ambos con Claude Code.

| Ruta | Qué es |
|---|---|
| `CLAUDE.md` | Orquestador: quién trabaja aquí, dónde está cada cosa, qué skill cargar |
| `.claude/skills/` | Habilidades del proyecto (`entrega-directa`, `desplegar-hostinger`, `dominio-regenera`, `acceso-y-registro`, `registrar-hito`, `prospeccion-proveedores`…) |
| `.claude/agents/` | Subagentes con encargo propio (`prospector-proveedores`) |
| `.claude/hitos/` | Trazabilidad: un archivo por hito, append-only |
| `docs/ESTADO.md` | Dónde estamos hoy y qué falta |
| `docs/ROADMAP.md` | Fases del producto con criterio de salida |
| `docs/DEPLOY.md` | Stack de despliegue (Hostinger) y por qué se eligió |
| `docs/MODO-MYSQL.md` | La base de producción: cómo está armada, cómo se prueba y las copias de seguridad |
| `docs/VARIABLES.md` | Las variables de entorno: nombre, para qué sirve y de dónde sale (nunca el valor) |

**Cómo se entrega:** rama de trabajo `<tipo>/<iniciales>-<slug>` → merge a
`staging` → merge a `main`, sin PR (skill `entrega-directa`). Un cambio
importante lleva además tag y despliegue (skill `desplegar-hostinger`). Los
únicos PRs son los de **Dependabot** (`.github/dependabot.yml`), que vigila las
dependencias; cómo se tratan, en la misma skill.

### Conseguir proveedores

El catálogo se llena con proveedores colombianos reales, y encontrarlos es
trabajo aparte del producto. `scripts/prospectar.mts` construye el universo de
candidatos desde el registro mercantil (RUES, dato abierto) y lo puntúa; el
subagente `prospector-proveedores` lo enriquece con contacto y criterio.

```bash
node scripts/prospectar.mts --listar-perfiles
node scripts/prospectar.mts --perfil amenities-ecologicos --camara BOGOTA
node scripts/exportar-excel.mts       # junta los CSV en un .xlsx categorizado
```

El Excel sale en `outputs/`: una hoja por vertical, una con todo, un resumen y
un diccionario que explica qué mide el puntaje y qué no. Lleva filtro
automático y la primera fila fijada.

No necesita credenciales. Las listas que produce **no se versionan**: son datos
de empresas identificables y este repositorio es público. El porqué de cada
fuente —y por qué LinkedIn no es una de ellas— está en la skill
`prospeccion-proveedores`.

## Verificación

En este orden — `next build` genera los tipos de rutas (`PageProps`,
`LayoutProps`) que `tsc` necesita, así que en un clon limpio `tsc` sin build
previo falla con `TS2304` en cada `page.tsx`:

```bash
npm run build        # compila y genera tipos de rutas
npx tsc --noEmit     # tipos
npx eslint .         # lint
npm test             # reglas de src/lib
npm run test:mysql   # la capa de MariaDB, contra un MariaDB propio (el CI levanta uno)
npm run test:base    # las migraciones de Postgres (historia del modo Supabase)
```

El CI (`.github/workflows/ci.yml`) corre todo esto en cada push a `staging` y
`main`, más un control de que ningún `.env` ni ninguna clave entre al repo.
