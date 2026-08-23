# Despliegue

Decisión tomada y por qué. Si vas a cambiar de proveedor, lee primero
"Lo que se descartó": los tres candidatos obvios ya se evaluaron.

## El stack

```
GitHub    →  código + CI (.github/workflows/ci.yml)
Vercel    →  hosting: servidor Node, CDN, dominio, SSL, previews por PR
Supabase  →  Postgres + Auth + Storage
```

Tres capas, tres responsabilidades. **No son intercambiables entre sí**, y ese
es el malentendido que este documento existe para evitar.

| Capa | Qué resuelve | Sin ella |
|---|---|---|
| Hosting (Vercel) | Dónde **corre** el código | No hay página |
| Base de datos (Supabase) | Dónde **viven** los datos | No hay catálogo persistente |
| Repositorio (GitHub) | Dónde vive el **código** y qué lo valida | No hay colaboración |

## Se puede desplegar hoy, sin base de datos

La propiedad más valiosa del MVP: **`npm run dev` con `.env.local` vacío levanta
una app navegable** (catálogo desde `src/data/` en memoria). El job `verificar`
del CI compila sin credenciales justamente para no perderla.

Consecuencia práctica: conectar Vercel al repo y tener una URL para mostrarle a
un hotel **no depende de la Fase 1**. La decisión de base de datos se toma
después, sin bloquear nada.

Lo que se pierde mientras no haya base: las órdenes y las postulaciones viven en
memoria del servidor (`src/lib/orders.ts`, `src/app/vender/actions.ts`) y se
borran en cada redeploy. Sirve para demostrar; no para operar.

Configuración en Vercel:

| Rama | Entorno | Para qué |
|---|---|---|
| `main` | Production | Lo que ve un cliente real |
| `staging` | Preview (estable) | Integración, la URL que se le pasa a un cliente para revisar |
| `feat/*`, `fix/*` | Preview (efímera) | Una URL por PR, muere con la rama |

Variables por entorno, nunca compartidas entre Production y Preview. En
particular `NEXT_PUBLIC_SITE_URL` y —cuando existan— dos proyectos de Supabase
distintos: **una base de pruebas nunca apunta a datos de producción**.

## Por qué Supabase y no Neon

Neon es **solo base de datos**: sin auth, sin storage, sin realtime. Supabase es
Postgres + auth + storage, con la autorización expresada como políticas RLS en
SQL.

El costo de cambiar, medido en este repositorio:

- `src/` **no importa el SDK de Supabase en ningún archivo** todavía. Cero
  acoplamiento en código de aplicación.
- Pero `supabase/migrations/0001_init.sql` tiene **14 usos de `auth.uid()` y 7
  llaves foráneas a `auth.users`**. Las ~35 políticas RLS cuelgan enteras del
  schema `auth` de Supabase.
- Y el roadmap las necesita: **Fase 2** es auth y paneles, **Fase 4** son
  imágenes subidas por el proveedor.

Cambiar a Neon significa reescribir las 491 líneas del esquema y sustituir **una
dependencia por tres** (Neon + un proveedor de auth + un bucket S3/R2).

El argumento que cierra la discusión está en la **Fase 5, multi-cliente**: el
aislamiento entre clientes se garantiza con RLS en Postgres, no con un `where` en
el código de aplicación. Un `where` olvidado es una fuga de datos; una política
RLS olvidada es un error de acceso. Ver la skill `nueva-integracion`.

**Lo que Neon hace mejor y conviene envidiar:** branching de base de datos, un
branch de datos por PR, que encaja exactamente con el flujo `main`/`staging` de
la skill `flujo-git`. Supabase también lo ofrece, pero es función de plan pago:
verificar el plan antes de contar con ello.

## Lo que se descartó

**Vercel Postgres.** Ya no existe. Era Neon con marca blanca; Vercel lo retiró y
en diciembre de 2024 migró esas bases a Neon. Vercel hoy no opera ninguna base de
datos: vende un marketplace donde Neon es una de las opciones. Si alguien
encuentra un tutorial que dice "usa Vercel Postgres", está desactualizado.

**GitHub Pages.** Solo sirve archivos estáticos, y esta app no lo es:

- Dos server actions — `src/app/carrito/actions.ts` y `src/app/vender/actions.ts`.
  Que el carrito se valorice en el servidor es la invariante #1 de la skill
  `dominio-regenera`: el cliente nunca calcula un precio.
- Cuatro rutas dinámicas en el build: `/catalogo`, `/oferta/[slug]`,
  `/orden/[reference]`, `/proveedor/[slug]`.
- Ningún `generateStaticParams`.

Un `output: "export"` obligaría a mover el cálculo de precios al navegador. No es
una opción: es el bug que la arquitectura evita a propósito.

**Neon como reemplazo de Supabase.** Ver arriba.

## Al conectar Vercel (checklist para Ivan)

Requiere ser dueño del repo y de la cuenta de Vercel.

- [ ] Importar `UniqueColombia/regenera-market` en Vercel. Framework: Next.js
      (autodetectado). Sin variables: debe compilar igual.
- [ ] Asignar `main` a Production y `staging` a una Preview estable.
- [ ] `NEXT_PUBLIC_SITE_URL` por entorno, con el dominio real en Production.
- [ ] Dominio y SSL. **Antes:** cerrar el nombre — ver `docs/ROADMAP.md` y el
      hito de la marca. El repo se llama `regenera-market` y el producto
      **Seregenera**; renombrar el repositorio requiere permiso de admin y
      GitHub mantiene la redirección del URL antiguo.
- [ ] Verificar que las Preview de PRs de forks queden restringidas: una preview
      pública con variables de entorno es una fuga.

## Cuando entre Supabase (Fase 1)

- [ ] **Dos proyectos**, no uno: uno para `main`, uno para `staging`.
- [ ] Aplicar `supabase/migrations/0001_init.sql`. Desde ese momento la
      migración es **inmutable**: todo cambio va en `0002_`. Ver la skill
      `supabase-schema`.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` solo en variables de servidor. **Jamás** con
      prefijo `NEXT_PUBLIC_` — el job `secretos` del CI falla si aparece, porque
      una service role key en el bundle del navegador es una fuga total de la
      base.
- [ ] Plan gratuito: Supabase pausa proyectos inactivos. Para un demo que un
      hotel abre tres semanas después, eso es una página muerta. Mientras el
      catálogo se sirva de `src/data/`, no aplica.
- [ ] Registrar el hito (skill `registrar-hito`): qué migración, en qué entorno,
      qué quedó pendiente.

## Fuentes

- [Postgres on Vercel](https://vercel.com/docs/postgres) — Vercel Postgres retirado
- [Neon en Vercel Marketplace](https://vercel.com/changelog/neon-now-available-on-vercel-marketplace)
- [Neon vs Supabase](https://neon.com/guides/neon-vs-supabase) — Neon no trae auth ni storage
- [Neon vs Supabase (Bytebase)](https://www.bytebase.com/blog/neon-vs-supabase/)
- [Best database for Next.js (Vercel Postgres is gone)](https://layerbase.com/blog/best-database-for-nextjs-vercel)

Consultadas el 2026-08-23. Si alguna contradice lo de arriba, gana la fuente y se
escribe un hito.
