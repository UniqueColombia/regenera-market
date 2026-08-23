# Regenera Market

Marketplace multi-proveedor de productos, experiencias y servicios regenerativos
para el sector turístico colombiano. Operado por **Dimension Natural SAS**.

Hoteles, glampings, restaurantes, transportadores y operadores compran a
proveedores colombianos verificados uno por uno; la plataforma retiene comisión
sobre cada venta. Dimension Natural opera la plataforma — **no es el vendedor**.

> **Estado:** MVP navegable. El catálogo funciona con datos de demostración en
> memoria. Supabase, autenticación y pagos todavía no están conectados. La lista
> completa está en [Qué falta](#qué-falta), sin adornos.

---

## Arranque

```bash
git clone https://github.com/UniqueColombia/regenera-market.git
cd regenera-market
npm install
npm run dev          # http://localhost:3000
```

Requiere **Node 20 o superior**.

**No necesitas credenciales para correr el proyecto.** El catálogo se sirve desde
datos semilla en memoria (`src/data/`), así que la aplicación es navegable de
inmediato. `.env.example` documenta las variables que harán falta cuando entre
Supabase; hoy ninguna es obligatoria.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · Zod ·
lucide-react · Supabase (`@supabase/ssr`, pendiente de conectar).

> **Ojo con Next.js 16.** Tiene cambios de ruptura frente a versiones anteriores.
> Antes de escribir código de framework, consulta la guía en
> `node_modules/next/dist/docs/`.

## Cómo está organizado

```
src/app/          Rutas (App Router). Server Components por defecto
src/components/   Componentes compartidos entre dos o más rutas
src/data/         Semillas de demostración
src/lib/          Dominio y lógica pura, sin JSX
supabase/         Migraciones con RLS
.claude/hitos/    Bitácora: qué se hizo, por qué, qué quedó abierto
.claude/skills/   Habilidades: las reglas de este repositorio
```

| Ruta | Qué hace |
|---|---|
| `/` | Portada: propuesta de valor, verticales, ofertas destacadas |
| `/catalogo` | Listado con filtros por tipo, vertical, categoría, departamento, nivel y certificación. Los filtros son un formulario GET, así que cada combinación es una URL compartible e indexable |
| `/oferta/[slug]` | Ficha de la oferta, con compra o solicitud de cotización |
| `/proveedores` · `/proveedor/[slug]` | Directorio y perfil público de proveedores |
| `/verificacion` | Metodología de verificación + autodiagnóstico interactivo |
| `/vender` | Propuesta para proveedores y formulario de postulación |
| `/carrito` · `/orden/[reference]` | Cesta multi-proveedor, checkout y confirmación |

| Módulo | Responsabilidad |
|---|---|
| `src/lib/types.ts` | Modelo de dominio |
| `src/lib/taxonomy.ts` | Verticales, categorías, niveles, certificaciones, departamentos |
| `src/lib/sustainability.ts` | Motor de puntaje: dimensiones, pesos y cálculo del nivel |
| `src/lib/repo.ts` | Acceso a datos. Funciones async a propósito, para que el cambio a Supabase no toque las páginas |
| `src/lib/pricing.ts` | Precio efectivo (minorista/mayorista), comisión e impacto agregado |
| `src/lib/payments.ts` | Capa de pasarela. Hoy modo manual; `getGateway()` es el único punto a cambiar |
| `supabase/migrations/0001_init.sql` | Esquema completo con RLS |

### Vocabulario

- **Vertical** — `hoteles`, `hostales`, `restaurantes`, `transporte`, `agencias`
- **Tipo de oferta** — `product`, `experience`, `service`
- **Nivel de verificación** — `unverified` → `semilla` → `raiz` → `bosque`
- **Rol** — `buyer`, `provider`, `admin`

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

**Los roles viven en su propia tabla,** no en el perfil: si el usuario pudiera
actualizar su propia fila de perfil, podría autoasignarse `admin`.

**El puntaje de sostenibilidad lo escribe un trigger,** no el proveedor. Las
certificaciones suman con tope, para que un taller pequeño sin plata para
certificarse pueda llegar a Raíz por prácticas reales, y para que una
certificación comprada no baste sola.

**El sitio se compromete con el modo claro.** No es un descuido: los productos se
juzgan por su foto y su ficha, y una inversión a oscuras cambia cómo se leen los
materiales naturales.

---

## Cómo colaborar

### Ramas

`main` es la **única rama de larga vida**. Todo lo demás es una rama corta que
nace de `main`, se integra por pull request y se borra.

```bash
git switch main
git pull
git switch -c feat/panel-proveedor
# ...trabajo...
git push -u origin feat/panel-proveedor
gh pr create
```

| Prefijo | Para |
|---|---|
| `feat/` | Funcionalidad nueva |
| `fix/` | Corrección |
| `chore/` | Dependencias, configuración, tooling |
| `docs/` | README, hitos, habilidades |
| `db/` | Migraciones de Supabase |

**No hay rama `develop`,** y es a propósito: el equipo es pequeño, cada PR genera
su propio preview, y una segunda rama permanente solo agregaría merges de
mantenimiento. Se reconsidera cuando haya producción con proveedores reales
cobrando.

**No se commitea directo a `main`.** El repositorio es privado en plan gratuito,
así que GitHub no puede imponerlo con reglas de protección de rama: la disciplina
es de las personas.

### Commits

En español, imperativo, primera línea de 72 caracteres o menos, sin punto final.
Se describe el **efecto**, no el archivo tocado.

```
Congelar precio y título al confirmar la orden

El proveedor puede editar su oferta después de la venta. La orden guardaba
solo el id, así que el histórico mostraba el precio de hoy y no el que el
comprador aceptó.
```

Cada commit debe dejar el proyecto compilando.

### Antes de abrir un PR

```bash
npx tsc --noEmit     # tipos
npx eslint .         # lint
```

Ambos limpios. **No hay pruebas automatizadas**, así que además hay que levantar
`npm run dev` y pedir las rutas que el cambio pudo tocar — en Next.js un error de
servidor no se ve hasta que se pide la página.

Mira con los ojos, no solo el 200, cuando el cambio toque precios o comisión
(que el total cuadre), filtros del catálogo (que la URL refleje el filtro),
móvil a 375 px, o navegación con teclado.

El cuerpo del PR responde tres cosas: **qué hace**, **por qué**, y **cómo
probarlo**.

### Convenciones de código

- **Server Components por defecto.** `"use client"` solo si hay estado, eventos
  del navegador, APIs del navegador o un hook cliente del repo — y se empuja al
  componente más pequeño posible, nunca a la página entera. El SEO del catálogo
  depende de eso.
- **Lógica de negocio en `src/lib/`**, nunca dentro de un componente. Si un
  componente multiplica algo con plata de por medio, está en el archivo
  equivocado.
- **Todo acceso a datos pasa por `src/lib/repo.ts`.** Sus firmas son `async`
  aunque hoy lean arreglos en memoria; ese es el contrato que permite entrar a
  Supabase sin tocar ninguna página.
- **Colores solo desde los tokens** de `src/app/globals.css`. Cero hex en
  componentes.
- **Dinero en enteros.** COP sin decimales, nunca `float`.
- Todo en español: código, comentarios, commits, documentación.

### Dónde está el conocimiento del proyecto

| Carpeta | Qué guarda |
|---|---|
| [`.claude/hitos/`](.claude/hitos/README.md) | La bitácora. Git guarda **qué** cambió; los hitos guardan **por qué** y qué quedó abierto. Empieza por [0001](.claude/hitos/0001-mvp-navegable.md) para entender de dónde viene el proyecto |
| [`.claude/skills/`](.claude/skills/README.md) | Las reglas del repositorio por tema: componentización, diseño visual, datos, verificación, flujo de trabajo |
| [`CLAUDE.md`](CLAUDE.md) | Orquestador: el mapa que apunta a todo lo anterior |

Si tomas una decisión que otra persona necesitará entender en seis meses,
escríbela como hito. La plantilla está en `.claude/hitos/PLANTILLA.md`.

---

## Qué falta

Estado real, sin adornos:

- [ ] **Proyecto de Supabase.** El esquema está escrito y con RLS, pero no se ha
      ejecutado contra ninguna base. Al crearlo: aplicar la migración, cargar
      `src/data/` como semilla y reemplazar el cuerpo de `src/lib/repo.ts`. Las
      firmas ya son async, así que ninguna página cambia.
- [ ] **Autenticación y paneles.** Sin Supabase no hay auth. Faltan el panel de
      proveedor (gestionar ofertas y órdenes) y el de administración (aprobar
      proveedores, revisar evidencia, confirmar pagos).
- [ ] **Pagos con Wompi.** Implementar `WompiGateway` con la interfaz de
      `src/lib/payments.ts` y el webhook de confirmación.
- [ ] **Cupos e inventario transaccionales.** El checkout todavía no descuenta
      cupo de experiencias ni stock. Necesita una transacción de base de datos
      para evitar sobreventa.
- [ ] **Imágenes.** Los proveedores aún no suben fotos; mientras tanto se dibuja
      un tapiz derivado del título (`src/components/listing-media.tsx`).
- [ ] **Persistencia de órdenes y postulaciones.** Hoy viven en memoria del
      servidor (`src/lib/orders.ts`, `src/app/vender/actions.ts`) y se pierden al
      reiniciar.
- [ ] **Reseñas.** La tabla y su política existen; falta la interfaz.
- [ ] **Pruebas automatizadas.** No hay ninguna. Los primeros candidatos son
      `pricing.ts` y `sustainability.ts`: lógica pura y con plata de por medio.

Los datos de `src/data/` son de demostración: proveedores ficticios construidos
sobre los quince productos del prototipo original. Se reemplazan por proveedores
reales en cuanto entre el primer lote de onboarding.

## Equipo y contacto

| | |
|---|---|
| Propietario del repositorio | `UniqueColombia` — Dimension Natural SAS |
| Colaborador | `seiler18` — Jesus Seiler |
| Correo | dimensionnaturalsas@gmail.com |
| Teléfono | +57 312 684 4848 |

Repositorio privado: <https://github.com/UniqueColombia/regenera-market>
