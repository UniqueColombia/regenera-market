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

## Cómo se llegó a la decisión

Se deja el resumen porque explica por qué el repositorio es público, y porque el
razonamiento vuelve a servir si algún día se plantea volverlo privado.

Con el repositorio **privado** y ambos servicios en plan gratuito, la
colaboración estaba bloqueada en los dos a la vez:

- **Vercel Hobby** compara el autor del commit contra los miembros del equipo, y
  en Hobby el equipo tiene un solo miembro. Los deployments de Jesús fallaban con
  `Git author seiler18 must have access to the project on Vercel`. Hobby no
  soporta colaboración en repos privados; en públicos sí, gratis.
- **GitHub Free** no permite protección de ramas en repos privados:
  `GET /rulesets` respondía `403: "Upgrade to GitHub Pro or make this repository
  public to enable this feature."`

Tres salidas: pagar las dos suscripciones, hacerlo público, o aceptar el límite
(el CI ya verificaba cada PR, y los merges de Ivan a `staging` sí desplegaban
porque los firma él). Se eligió hacerlo público.

Una cosa que se descartó explícitamente y conviene que siga descartada:
**reescribir el autor del commit** (`git commit --amend --author`) para que todo
apareciera firmado por el dueño de la cuenta. Circula como solución al bloqueo de
Hobby. Destruiría la trazabilidad que sostiene `.claude/hitos/`, `CODEOWNERS` y las
iniciales en las ramas, a cambio de nada.

## La decisión que se tomó: repositorio público

**El 2026-08-23 el repositorio pasó a público.** GitHub y Vercel chocaban con la
misma pared —plan gratuito + repositorio privado = sin funciones de
colaboración— y hacerlo público las abre las dos de una vez, gratis. Efecto
inmediato y comprobado: los deployments de Vercel de Jesús pasaron de
`Deployment was blocked` a `Deployment has completed`.

Este documento recomendaba lo contrario. La decisión se tomó con ese análisis a
la vista; queda registrada, no se discute de nuevo. Lo que sigue es lo que hay
que hacer **a partir de aquí**.

### Lo que se ganó

- Colaboración en Vercel sin plan Pro: Jesús despliega previews.
- Protección de ramas disponible sin pagar (en Free solo aplica a repos
  públicos). Ver la política adoptada en la skill `flujo-git`, que la reduce
  deliberadamente al mínimo.
- Secret scanning con push protection y alertas de Dependabot, gratis.

### Lo que quedó expuesto, y qué hacer

**No hay secretos.** Se escaneó el historial completo el 2026-08-23 —`git log
--all -p` contra patrones de JWT, claves de servicio, llaves privadas y
credenciales de Wompi y AWS— y los únicos hallazgos son documentación que
menciona **nombres** de variables. El único archivo `.env*` que ha existido es
`.env.example`.

Lo expuesto es lógica de negocio:

| Qué | Por qué importa | Mitigación |
|---|---|---|
| `src/lib/sustainability.ts` | Publica **los puntos exactos de cada opción de cada pregunta**. Un proveedor puede leerlo y responder lo justo para llegar a Bosque | Mover pesos y puntajes a base de datos: son **datos**, no código. El puntaje ya lo escribe un trigger |
| `COMMISSION_RATE = 0.12` | Cada proveedor la ve antes de negociar | A configuración en base. Ya estaba previsto diferenciarla por tipo de oferta en Fase 5 |
| Instrucciones de pago en `payments.ts` | Describen la cuenta de Bancolombia y el correo de contacto: plantilla lista para clonar el sitio y cambiar el número | Texto a base de datos o variables de entorno |
| Las ~35 políticas RLS de `0001_init.sql` | Facilita el análisis de superficie de ataque | Ninguna necesaria: la seguridad de RLS no depende de ser secreta. Sí exige probar cada política **con el rol equivocado** |

**El control real de la verificación no es el cuestionario, es la evidencia.**
Varias preguntas llevan `requiresEvidence: true` y un admin las revisa antes de
aprobar. Que la rúbrica sea pública debilita el autodiagnóstico, no la
verificación — siempre que la revisión de evidencia se haga de verdad. Si algún
día se aprueba sin mirarla, el puntaje deja de significar nada, y ahora además
cualquiera sabe cómo aprovecharlo.

Las tres mitigaciones son movimientos de código a datos, no rediseños, y caben
en la Fase 1.

### Pendiente

1. **Correr `scripts/politica-de-ramas.sh`.** Requiere admin (Ivan). Verificado
   el 2026-08-23: `branches/main/protection` y `branches/staging/protection`
   responden **404**, así que la política escrita todavía no está aplicada —
   incluido el bloqueo de borrado de `main` y `staging`, que es lo único que la
   política sí quiere impedir.
2. Activar **secret scanning con push protection** y **Dependabot** en
   Settings → Security. Gratis en repos públicos.
3. Las tres mitigaciones de la tabla, en Fase 1.

Comprobar el estado real en un comando:

```bash
gh api repos/UniqueColombia/regenera-market/branches/main/protection >/dev/null 2>&1   && echo "con política aplicada" || echo "SIN aplicar — corre scripts/politica-de-ramas.sh"
```

## Vercel: estado y lo que falta

- [x] Repo importado en Vercel. Hecho el 2026-08-18.
- [x] Previews de los dos colaboradores. Desbloqueado al pasar el repo a público:
      los deployments de Jesús pasaron a `Deployment has completed`.
- [ ] Asignar `main` a Production y `staging` a una Preview estable.
- [ ] `NEXT_PUBLIC_SITE_URL` por entorno, con el dominio real en Production.
- [ ] Dominio y SSL. **Antes:** cerrar el nombre. El repo se llama
      `regenera-market` y el producto **Seregenera**; renombrar el repositorio
      requiere admin y GitHub mantiene la redirección del URL antiguo.
- [ ] Confirmar que la versión de Node del proyecto en Vercel coincide con la del
      CI (`node-version: 22` en `.github/workflows/ci.yml`). Si no coinciden, el
      CI pasa en verde y producción falla.

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
