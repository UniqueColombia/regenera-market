# Regenera Market — orquestador del proyecto

Este archivo es el punto de entrada. No contiene todas las reglas: contiene el
mapa y dice dónde está cada cosa.

- **`.claude/skills/`** — las habilidades del proyecto: cómo se componentiza, cómo
  se diseña, cómo se accede a datos, cómo se verifica, cómo se ramifica. Claude
  las carga solas según el trabajo.
- **`.claude/hitos/`** — la bitácora: qué se construyó, por qué, y qué quedó
  abierto. Es la memoria entre sesiones.
- **`README.md`** — la puerta de entrada para una persona que va a colaborar.

---

## Qué es

Marketplace multi-proveedor de productos, experiencias y servicios regenerativos
para el sector turístico colombiano. Operado por **Dimension Natural SAS**.

Hoteles, glampings, restaurantes, transportadores y operadores compran a
proveedores colombianos verificados; la plataforma retiene comisión sobre cada
venta. Dimension Natural **opera la plataforma, no es el vendedor**.

- **Modelo:** transaccional (comisión), no directorio
- **Compradores:** B2C y B2B desde el inicio — cada oferta tiene precio minorista
  y mayorista
- **Idioma y moneda:** español y COP. Todo el código, los commits y la
  documentación van en español
- **Tagline:** «Turismo que regenera vidas y paisajes»

## Estado real

El catálogo se sirve desde **semillas en memoria** (`src/data/`), así que la
aplicación corre sin credenciales. **Supabase no está conectado**: el esquema
está escrito con RLS pero nunca se ha ejecutado contra una base. Órdenes y
postulaciones viven en memoria del servidor y se pierden al reiniciar. No hay
autenticación, ni paneles, ni pagos reales.

La lista completa de pendientes está en `README.md`, sección «Qué falta». Se
mantiene sin adornos: si algo no está, se dice.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · Supabase
(`@supabase/ssr`, pendiente) · Zod · lucide-react.

**Esta versión de Next.js tiene cambios de ruptura frente a lo que la mayoría
conoce.** Antes de escribir código de framework, lee la guía correspondiente en
`node_modules/next/dist/docs/`.

## Estructura

```
src/
  app/          Rutas (App Router). Server Components por defecto
  components/   Componentes compartidos entre dos o más rutas
  data/         Semillas de demostración — se reemplazan con Supabase
  lib/          Dominio y lógica pura, sin JSX
supabase/
  migrations/   Esquema con RLS. Numeradas, nunca se editan una vez aplicadas
.claude/
  hitos/        Bitácora del proyecto
  skills/       Habilidades: las reglas de este repositorio
```

### Rutas

| Ruta | Qué hace |
|---|---|
| `/` | Portada: propuesta de valor, verticales, ofertas destacadas |
| `/catalogo` | Listado con filtros. Formulario **GET**: cada combinación es una URL compartible e indexable |
| `/oferta/[slug]` | Ficha de la oferta, con compra o solicitud de cotización |
| `/proveedores` · `/proveedor/[slug]` | Directorio y perfil público |
| `/verificacion` | Metodología + autodiagnóstico interactivo |
| `/vender` | Propuesta para proveedores y formulario de postulación |
| `/carrito` · `/orden/[reference]` | Cesta multi-proveedor, checkout y confirmación |

### Módulos

| Módulo | Responsabilidad |
|---|---|
| `src/lib/types.ts` | Modelo de dominio. Cambiarlo se propaga a todo |
| `src/lib/taxonomy.ts` | 5 verticales, categorías, niveles, certificaciones, departamentos |
| `src/lib/sustainability.ts` | Motor de puntaje: dimensiones, pesos, nivel |
| `src/lib/repo.ts` | **Único** acceso a datos. `async` a propósito |
| `src/lib/pricing.ts` | Precio efectivo, comisión, impacto agregado |
| `src/lib/payments.ts` | Pasarela. `getGateway()` es el único punto a cambiar |
| `src/lib/orders.ts` | Órdenes — hoy en memoria |

### Vocabulario del dominio

- **Vertical** — `hoteles`, `hostales`, `restaurantes`, `transporte`, `agencias`
- **Tipo de oferta** — `product`, `experience`, `service`
- **Nivel (tier)** — `unverified` → `semilla` → `raiz` → `bosque`
- **Rol** — `buyer`, `provider`, `admin`

## Las cinco reglas que no se rompen

1. **El precio nunca lo calcula el cliente.** El carrito guarda ids y cantidades;
   el servidor valoriza contra el catálogo en cada cambio.
2. **La comisión se guarda por ítem**, no sobre el total: una orden se reparte
   entre proveedores y cada uno audita su descuento.
3. **Título y precio se congelan en la orden.** El histórico dice lo que el
   comprador aceptó.
4. **Los roles viven en su propia tabla**, no en el perfil — si no, el usuario se
   autoasigna `admin`.
5. **El puntaje de sostenibilidad lo escribe un trigger**, no el proveedor. Las
   certificaciones suman con tope.

El porqué de cada una está en la habilidad `datos-y-supabase`.

## Habilidades

Claude las carga solo cuando corresponden. Están en `.claude/skills/`
([índice](.claude/skills/README.md)).

| Habilidad | Cuándo |
|---|---|
| `componentizacion` | Crear componentes, Server vs. Client, dónde va cada archivo |
| `diseno-visual` | Clases de Tailwind, color, tipografía, maquetación, accesibilidad |
| `datos-y-supabase` | `repo.ts`, `src/data/`, migraciones, precios, comisión, RLS |
| `verificacion-de-cambios` | Antes de dar algo por terminado o abrir un PR |
| `flujo-de-trabajo` | Ramas, commits, pull requests |
| `registro-de-hitos` | Cerrar una funcionalidad o tomar una decisión que recordar |

## Hitos

Cada cambio que altera **lo que el proyecto es o cómo se decide** se registra en
`.claude/hitos/` ([índice](.claude/hitos/README.md)). Git guarda qué cambió; los
hitos guardan por qué y qué quedó abierto.

Se escribe un hito al terminar una funcionalidad de punta a punta, al tomar una
decisión con alternativas descartadas, al conectar un servicio externo, al
cambiar reglas de negocio, o cuando el usuario lo pida. No se escribe por
arreglos de estilo, renombres ni dependencias. El procedimiento está en la
habilidad `registro-de-hitos`.

## Cómo se trabaja

```bash
npm install
npm run dev          # http://localhost:3000
npx tsc --noEmit     # tipos
npx eslint .         # lint
```

**No hay pruebas automatizadas.** La verificación es manual y no se salta: tipos,
lint, y pedir las rutas afectadas con el servidor levantado. Detalle en la
habilidad `verificacion-de-cambios`.

**Ramas:** `main` es la única de larga vida; todo lo demás son ramas cortas
(`feat/`, `fix/`, `chore/`, `docs/`, `db/`) que se integran por PR y se borran.
No hay `develop` — el equipo es pequeño y una segunda rama permanente solo
agregaría merges. Detalle en la habilidad `flujo-de-trabajo`.

## Cómo trabaja el usuario

Prefiere avanzar rápido antes que responder cuestionarios largos. Eso tiene una
consecuencia: **hay decisiones que Claude tomó por defecto y que nunca se
confirmaron explícitamente** — pasarela Wompi, alojamiento fuera del alcance,
modelo mixto de verificación, i18n preparado pero inactivo (ver hito
[0001](.claude/hitos/0001-mvp-navegable.md)).

Antes de una decisión grande de producto, confirma esas premisas. Para el resto,
decide con criterio y explica qué decidiste — no preguntes lo que se puede
resolver leyendo el código.

---

@AGENTS.md
