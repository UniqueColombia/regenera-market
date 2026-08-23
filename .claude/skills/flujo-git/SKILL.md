---
name: flujo-git
description: Estrategia de ramas, commits, Pull Requests y releases de Seregenera. Úsala ANTES del primer commit de cualquier tarea, y también para abrir un PR, hacer un release, meter un hotfix, resolver un conflicto o cuando no tengas claro sobre qué rama estás trabajando. Cubre la separación main=producción / staging=integración y la convención de nombres que identifica quién hizo qué.
---

# Flujo de trabajo con Git

Dos personas (Ivan `UniqueColombia`, Jesús `seiler18`), cada una con su agente,
sobre el mismo repositorio. La estrategia existe para que **nadie rompa
producción y siempre se sepa quién hizo qué**.

## Regla cero: sincroniza antes de tocar nada

**Antes de modificar una sola línea, trae lo que haya en el repositorio.** No al
final, no antes de empujar: **antes de abrir el primer archivo.**

```bash
git fetch origin
git status                       # ¿hay algo sin commitear? resuélvelo primero
git switch staging && git pull origin staging
git switch -c <tipo>/<iniciales>-<tarea>
```

Y si ya llevas rato en una rama de trabajo, antes de seguir editando:

```bash
git fetch origin
git rebase origin/staging        # rebase, no merge hacia adentro
```

Somos dos personas con un agente cada una sobre el mismo repositorio. Empezar a
editar sobre un clon viejo es la forma más rápida de producir un conflicto que
nadie pidió, o —peor— de reescribir sin darte cuenta algo que el otro acababa de
arreglar. **Un `git fetch` cuesta un segundo; deshacer un conflicto de tres
archivos cuesta media hora.**

Esto no es una recomendación de higiene: es la primera acción de cualquier
tarea. Si no sabes si tu clon está al día, no está al día.

## Quién puede hacer qué

**Ivan y Jesús pueden hacer cualquier modificación en cualquier rama, sin pedirle
permiso ni revisión al otro.** Push directo a `main` y a `staging` incluido. No
hay PR obligatorio, no hay aprobaciones, no hay Code Owners bloqueando nada.

**Nadie más puede empujar nada.** Y eso no depende de la protección de rama:
depende de la lista de colaboradores del repositorio.

```bash
gh api repos/UniqueColombia/regenera-market/collaborators \
  --jq '.[] | "\(.login) \(.role_name)"'
# UniqueColombia  admin
# seiler18        write
```

Esos dos, y nadie más. Que el repositorio sea **público** significa que
cualquiera puede leerlo y abrir un PR **desde su propio fork** — nunca empujar al
nuestro. Un PR de un fork no toca ninguna rama hasta que uno de los dos lo
mergea.

De ahí la conclusión que conviene tener clara: **la protección de rama nunca
estuvo defendiendo el repositorio de terceros.** Lo único que hacía era
estorbarnos a nosotros dos. Por eso está reducida al mínimo, con
`scripts/politica-de-ramas.sh`.

> **Comprueba antes de confiar.** Verificado el 2026-08-23, el script todavía no
> se ha aplicado: `branches/main/protection` responde 404. Mientras siga así,
> **ni el borrado de `main` está bloqueado** — la única fila de la tabla que la
> política sí quiere imponer.
>
> ```bash
> gh api repos/UniqueColombia/regenera-market/branches/main/protection >/dev/null 2>&1 >   && echo "aplicada" || echo "SIN aplicar — corre scripts/politica-de-ramas.sh"
> ```
>
> Regla general: **una skill no afirma que un control externo está activo; da el
> comando para comprobarlo.** El repositorio puede describir su propio código con
> certeza, nunca la configuración de un servicio ajeno.

| | `main` y `staging` |
|---|---|
| Push directo de Ivan o Jesús | permitido |
| PR obligatorio | no |
| Revisión / aprobaciones | no |
| CI en verde para mergear | no lo impone el servidor |
| Push de cualquier otra persona | imposible: no es colaborador |
| Borrar la rama | bloqueado |

## Las reglas siguen existiendo — para el agente

Que el servidor ya no te detenga no las deroga. Lo que cambia es quién las
sostiene: antes GitHub, ahora vos.

- **El agente no empuja a `main` ni a `staging`.** Abre un PR. La persona decide
  si se salta el paso; el agente no.
- **El agente no reescribe historia compartida.** `git push --force` está
  permitido en el servidor para que Ivan o Jesús puedan rehacer algo si hace
  falta, pero sigue denegado en `.claude/settings.json`. La distinción es
  deliberada.
- **El CI sigue corriendo en cada PR y sigue diciendo la verdad.** El servidor ya
  no bloquea el merge, pero el hook `scripts/verificar-antes-de-merge.sh` corta
  cualquier `gh pr merge` que un agente intente sobre un PR con checks rojos o
  pendientes.
- **`.github/CODEOWNERS` es informativo.** Ya no bloquea: solo pide la revisión
  automáticamente, para que quien toca `supabase/`, `pricing.ts`, `payments.ts`,
  `sustainability.ts`, `orders.ts`, `CLAUDE.md`, `.claude/` o `.github/` sepa que
  al otro le interesa enterarse.

## Las tres capas de ramas

```
main       ← PRODUCCIÓN. Lo que ve un cliente real.
  ↑ PR de release (solo desde staging o hotfix/*)
staging    ← INTEGRACIÓN. Todo se junta y se prueba aquí primero.
  ↑ PR de trabajo
feat/js-panel-proveedor      ← RAMAS DE TRABAJO. Una por tarea. Efímeras.
fix/id-comision-redondeo
```

**`main` nunca recibe un commit directo.** No importa lo pequeño que sea el
cambio. Si `main` está roto, el marketplace está roto.

**`staging` es el único lugar donde se descubren los conflictos entre nosotros
dos.** Si dos ramas de trabajo tocan `src/lib/pricing.ts`, quiero enterarme en
`staging`, no en producción.

## Nombres de rama

Formato: `<tipo>/<iniciales>-<slug-en-kebab-case>`

| Tipo | Para qué |
|---|---|
| `feat/` | Funcionalidad nueva |
| `fix/` | Corrección de un bug que no es urgente |
| `hotfix/` | Bug en producción. Es el único tipo que puede ir directo a `main` |
| `chore/` | Dependencias, CI, configuración, refactor sin cambio de comportamiento |
| `docs/` | README, skills, hitos, roadmap |

Iniciales: `id` = Ivan Duarte, `js` = Jesús Seiler. **No son decorativas**: en
`git branch -a` se ve de un tiro quién tiene qué abierto, sin abrir GitHub.

Ejemplos buenos: `feat/js-auth-supabase`, `fix/id-carrito-cantidad-cero`,
`chore/js-ci-typecheck`, `hotfix/id-checkout-500`.

Malos: `nueva-rama`, `js`, `feat/cosas`, `develop` (no existe aquí).

## Empezar una tarea

```bash
git checkout staging
git pull origin staging          # SIEMPRE. Sobre todo si el otro empujó ayer.
git checkout -b feat/js-mi-tarea
```

Si `staging` no existe todavía en tu clon: `git fetch origin && git checkout -b staging origin/staging`.

## Commits

Convención: `<tipo>(<ámbito>): <qué cambió, en imperativo>`

```
feat(carrito): valorizar el carrito contra el catálogo en cada cambio
fix(pricing): redondear la comisión al peso, no al centavo
chore(ci): correr tsc y eslint en cada PR
docs(hitos): registrar el arranque de Supabase
```

Ámbitos usados: `carrito`, `catalogo`, `pricing`, `payments`, `repo`, `auth`,
`supabase`, `ci`, `skills`, `hitos`, `ui`.

Reglas:
- Un commit = un cambio comprensible. No mezcles un refactor con una feature.
- El mensaje dice **qué cambió y por qué**, no "cambios varios" ni "wip".
- Si `next dev` reescribió el bloque de `AGENTS.md`, commitéalo junto con tu
  trabajo. Descartarlo solo lo hace volver.

## Antes de abrir el PR

En este orden:

```bash
npm run build        # genera los tipos de rutas de Next
npx tsc --noEmit
npx eslint .
```

Los tres en limpio. **El build va primero, no es opcional:** Next genera
`PageProps` y `LayoutProps` durante el build, así que en un clon limpio
`npx tsc --noEmit` falla con `TS2304: Cannot find name 'PageProps'` en cada
`page.tsx`. No es un error tuyo — es que faltó compilar.

Si no pasan local, no pasan en CI, y el PR queda bloqueado.

## Abrir el PR

Siempre contra `staging` (excepto `hotfix/*`, ver abajo):

```bash
git push -u origin feat/js-mi-tarea
gh pr create --base staging --fill
```

`--fill` toma título y cuerpo de los commits; la plantilla de
`.github/PULL_REQUEST_TEMPLATE.md` agrega la checklist. Complétala de verdad —
es lo único que el otro tiene para revisar sin reconstruir tu razonamiento.

Para revisar el PR del otro:

```bash
gh pr list                       # qué hay abierto
gh pr diff <n>                   # el diff completo
gh pr checkout <n>               # traerlo local y correrlo
gh pr review <n> --approve       # o --request-changes -b "motivo"
```

**Nadie mergea su propio PR sin que el otro lo haya visto**, salvo un `hotfix`
en llamas. El merge lo hace `gh pr merge <n> --squash --delete-branch`: squash
para que `staging` tenga un commit por tarea, y borrar la rama para que
`git branch -a` no se convierta en un cementerio.

## Release: staging → main

Cuando `staging` está probado y estable:

```bash
git checkout staging && git pull origin staging
gh pr create --base main --head staging --title "release: <fecha o alcance>"
```

**Lo mergea cualquiera de los dos.** Antes esta skill decía que solo Ivan, y
quedó desactualizada con la política de ramas abierta: no hay PR obligatorio ni
aprobaciones. Lo que no cambia es que **el agente abre el PR y no lo mergea sin
que su persona se lo pida** — un release va a producción.

Se mergea con `--merge`, no con squash: queremos ver en `main` qué tareas
entraron.

**El release no termina hasta que está etiquetado.** No es opcional y es el paso
que se olvida:

```bash
git checkout main && git pull origin main
git tag -a v0.2.0 -m "Panel de proveedor y auth con Supabase"
git push origin v0.2.0
```

Versionado: `v0.MINOR.PATCH` mientras el producto sea pre-lanzamiento. Sube
`MINOR` cuando entra una fase del `docs/ROADMAP.md`, `PATCH` cuando es solo
corrección.

Sin etiqueta no hay forma de responder «qué había en producción el martes»: los
merges de `staging` a `main` se ven todos iguales en el log. Los cuatro primeros
releases del 2026-08-23 se hicieron sin etiquetar; el estado resultante quedó
marcado como `v0.1.0` (Fase 0 cerrada) y desde ahí la numeración es continua. No
se etiquetaron hacia atrás: inventar cuatro versiones retroactivas para commits
que nadie desplegó por separado documenta menos que la nota que estás leyendo.

Comprobar antes de dar un release por terminado:

```bash
git fetch --tags && git tag --points-at origin/main
# vacío = el release no está etiquetado
```

## Hotfix (producción caída)

```bash
git checkout main && git pull origin main
git checkout -b hotfix/js-descripcion-corta
# arreglar, verificar, commitear
gh pr create --base main --fill --title "hotfix: ..."
```

Al mergear en `main`, **hay que traerlo a `staging` de inmediato** o el próximo
release lo revierte:

```bash
git checkout staging && git pull origin staging
git merge main && git push origin staging
```

## Conflictos

Rebase sobre `staging`, no merge de `staging` hacia tu rama — el historial queda
legible y el PR muestra solo lo tuyo:

```bash
git fetch origin
git rebase origin/staging
# resolver, luego:
git push --force-with-lease
```

`--force-with-lease`, nunca `--force`: si el otro empujó a tu rama mientras
resolvías, `--force` le borra el trabajo y `--force-with-lease` te detiene.

Conflicto en `package-lock.json`: no lo resuelvas a mano. `git checkout
origin/staging -- package-lock.json && npm install`.

Conflicto en un archivo de `hitos/`: no debería pasar (un hito es un archivo
nuevo). Si pasa, quedan los dos.

## Nunca

- **Empezar a editar sin un `git fetch` previo.** Ver la regla cero
- `git push --force` a `main` o `staging`
- `git commit` con `main` o `staging` checkout
- Commitear `.env.local`, `node_modules/` o cualquier clave
- Mergear un PR con el CI en rojo
- Reescribir historia ya empujada a una rama compartida
