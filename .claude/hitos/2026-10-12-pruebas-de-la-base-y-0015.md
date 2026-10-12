# Pruebas de verdad, la 0015 y los fallos que encontraron

- **Fecha:** 2026-10-12
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-pruebas-y-portabilidad` → entrega directa (sin PR)
- **Fase del roadmap:** — (transversal: calidad y portabilidad)

## Qué se hizo

Con la `0014` aplicada, Jesús pidió la revisión exhaustiva que quedó pendiente,
pruebas que se queden en el repositorio y que la base no quede atada a Supabase.
Hasta hoy el proyecto **no tenía una sola prueba automatizada**: las 19 de la
0014 se corrieron en un Postgres de una sesión y se perdieron con ella.

| Qué | Dónde |
|---|---|
| Pruebas de las reglas de `src/lib` (precios, formato de dinero) | `src/lib/*.test.ts` · `npm test` |
| Pruebas de la base: migraciones, compras, envíos, reseñas, permisos, concurrencia | `supabase/pruebas/*.test.ts` · `npm run test:base` |
| **Gemelos**: `pricing.ts` ↔ `crear_orden()`, `TRANSICIONES` ↔ `orders_transicion`, `puedeResenar()` ↔ `puede_resenar()` | `supabase/pruebas/gemelos.test.ts` |
| Lo mínimo de Supabase sobre un Postgres cualquiera: el contrato de portabilidad | `supabase/pruebas/supabase-minimo.sql`, `docs/PORTABILIDAD.md` |
| Las dos suites en el CI (job `base` aparte, sin build) | `.github/workflows/ci.yml` |
| Migración `0015` (escrita y probada, **sin aplicar**) | `supabase/migrations/0015_permisos_de_anon_e_indices.sql` |

En total, 56 pruebas en unos 8 segundos.

### Lo que encontraron

| Fallo | Gravedad | Arreglo |
|---|---|---|
| Con la clave pública, `vencer_pedidos_sin_pago(24)` cancelaba los pedidos de más de un día sin pagar y liberaba su stock. La guarda `auth.uid() is not null` dejaba pasar al anónimo | Alta | 0015 §1: la guarda mira `auth.role()`; `anon` sin permiso |
| `anon` tenía `execute` sobre `crear_orden`, `calificar`, `despachar_item`, `aprobar_postulacion`, `admin_*`… (se defendían por dentro) y sobre `recontar_todas_las_publicaciones`, que no se defendía y bloquea toda la Comunidad | Media | 0015 §2 |
| `puede_resenar()` daba NULL con un servicio pagado: `calificar()` dejaba reseñar antes de recibir | Media | 0015 §6. Lo encontró la prueba de gemelos |
| Un anónimo leía `author_id` y `order_item_id` de las reseñas | Baja | 0015 §3: permisos por columna |
| La ficha de una experiencia sin «mínimo de personas» daba error (`test-de-expriencia`, reportada por Jesús); una experiencia sin fechas no se podía agregar a la cesta; al editarla, el formulario salía vacío | Alta (visible) | `repo.ts` arma siempre el bloque `experience`; `add-to-cart.tsx` reserva sin fecha si no hay cupos |
| «20.000» en un precio se guardaba como **$20**: `type="number"` lo leía como decimal y `Number()` lo dejaba en 20 | Alta (plata) | `pesosDesdeTexto()` en el servidor y `CampoDinero` en el formulario |
| `/proveedores` hacía 1 + N consultas; `/catalogo` y la ficha, una por proveedor; `/admin` bajaba todas las órdenes, ofertas y postulaciones para mostrar cuatro números | Media (volumen) | `getConteoDeOfertasPorProveedor`, `getProvidersByIds`, `getResumenAdmin` |
| Errores de Supabase ignorados que se leían como «no hay datos», y uno que mostraba un falso «es el único administrador» | Baja | Se mira `error` en cada uno |

Y de usabilidad, por la misma revisión:

- la rueda del mouse ya no cambia números en el formulario de oferta;
- los campos miden 16 px en móvil, para que iOS no haga zoom;
- la cesta autocompleta nombre, teléfono, ciudad y dirección;
- la guía de envío no pasa por el corrector;
- «www.miempresa.com» se acepta como sitio web;
- las estrellas de la reseña son blancos de 40 px.

## Por qué así

**Postgres embebido y no Docker ni un proyecto de Supabase de pruebas.**
`embedded-postgres` baja los binarios de Postgres 17 por npm: corre igual en
Windows (Jesús), macOS y el runner del CI, sin instalar nada ni credenciales.
Docker no está en esta máquina. Un Supabase de pruebas exigía claves en el CI y
no probaba la portabilidad. Con `PRUEBAS_PG_URL` las mismas pruebas corren
contra cualquier Postgres, como la VPS de destino.

**El shim es la prueba de portabilidad.** Que las migraciones se apliquen sobre
Postgres más 150 líneas que imitan a Supabase demuestra que la mudanza es
posible. El CI falla el día que alguien agregue una dependencia nueva sin
anotarla. Se descartó migrar ya a `pg` y un auth propio: reescribir ~80
consultas y el acceso, sin fecha de mudanza, es riesgo sin beneficio.
`PORTABILIDAD.md` recomienda Supabase autoalojado en Docker cuando toque.

**Cada base de prueba es una copia de una plantilla.** Las migraciones se
aplican una vez (`preparar-base.ts`) y cada archivo hace `create database …
template`. Así los archivos corren en paralelo y nadie hereda datos de otro.

**Las pruebas entran como la aplicación.** `comoUsuario()` hace
`set local role authenticated` y escribe los mismos `request.jwt.claims` que
PostgREST. Una prueba como superusuario se salta la RLS y no prueba nada de
permisos.

**El nivel no se siembra, se siembran los puntos.** El trigger
`providers_tier_por_experiencia` (0006) pisa el `tier` escrito a mano. La
primera versión de las pruebas lo hacía y daba 12 % de comisión a todos.

**Experiencia sin fecha = se reserva sin fecha.** Es lo que ya prometía el
formulario («hasta entonces se puede reservar sin fecha») y lo que acepta
`crear_orden()`. El botón era el único que no lo cumplía.

**«20.000» se acepta, «20.5» no.** En COP no hay centavos, así que un punto o
una coma con grupos de tres cifras solo puede ser separador de miles. Lo demás
es ambiguo y se rechaza con un mensaje, en vez de adivinar.

## Qué quedó pendiente

- **Aplicar la `0015`** (SQL Editor, el archivo entero). Antes, confirmar el
  hueco con la consulta de `docs/ESTADO.md`. Después, correr la consulta del
  final del archivo para ver si alguna reseña entró antes de tiempo.
- **Decisión de producto, para Ivan y Jesús:** un proveedor puede comprarse a sí
  mismo, confirmar la entrega él mismo y reseñarse. Así gana puntos y baja su
  comisión. La revisión propone rechazarlo en `crear_orden()` y `calificar()`
  con `manages_provider()`. No se hizo porque es una regla de negocio.
- **Decisión de producto: precios en otra moneda** (COP, CLP, US$). Hoy todo es
  COP (invariante 5). `CampoDinero` ya lleva la prop `moneda` para no cambiar la
  interfaz el día que se decida.
- **Paginación** del catálogo y de las listas del panel. Hoy traen todo; con
  miles de ofertas se notará. Es un cambio de interfaz (`?pagina=` en el
  formulario GET, invariante 19).
- **Las políticas viejas** de `orders`, `order_items` y `listings` llaman
  `auth.uid()` e `is_admin()` por fila. La 0015 solo arregló la de reseñas.
  Envolverlas en `(select …)` es otra migración, con prueba de que no cambian
  qué filas ve cada rol.
- **Consultas fuera de `src/lib`**: ~15 acciones de `src/app/` siguen llamando a
  Supabase directo (`PORTABILIDAD.md`, regla 1). Se mueven al tocarlas.
- Un vendedor ve la fila entera de un pedido compartido con otro vendedor
  (montos del otro, dirección antes del pago). Viene de la 0005.
- Nada de esto se probó en el navegador ni contra Supabase de verdad. La ficha
  de `test-de-expriencia`, el campo de precio y `/admin` se revisan a mano
  después de desplegar.

## Qué se rompe si tocas esto

- **Una migración nueva corre en el CI** contra el shim. Si usa algo de
  Supabase que no está en `supabase-minimo.sql`, el job `base` falla.
- **Una función `security definer` nueva** que deba llamar un anónimo va a la
  lista de `migraciones.test.ts` con su motivo. Si no, se revoca nombrando el
  rol: `revoke … from public, anon`.
- **`pricing.ts` y `crear_orden()`**: si cambias uno, `gemelos.test.ts` falla
  hasta que cambies el otro. Es intencional.
- **`CampoDinero` manda el número en un campo oculto con el `name`.** Quien
  busque el campo visible (para enfocarlo o desplazarse) usa `data-campo`.
- **`listing.experience` ahora siempre existe** en una experiencia, con
  `minPeople`, `maxPeople`, `durationHours` y `meetingPoint` opcionales.

## Verificación

- `npm run build`, `npx tsc --noEmit`: limpios. `npx eslint .`: 0 errores; los
  94 avisos son los de siempre (scripts minificados de `impeccable`), los mismos
  que en `staging` antes de este cambio.
- `npm test` (14) y `npm run test:base` (42): 56 pruebas en verde, unos 8 s,
  sobre Postgres 17.10 embebido en Windows.
- La experiencia rota se confirmó contra producción leyendo `listings_publicos`
  con la clave pública: `test-de-expriencia` tiene `min_people` nulo.
- La 0015 se aplicó sobre las 14 anteriores y una segunda vez seguida, sin
  error.
