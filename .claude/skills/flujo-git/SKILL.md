---
name: flujo-git
description: Estrategia de ramas, commits, Pull Requests y releases de Seregenera. Úsala ANTES del primer commit de cualquier tarea, y también para abrir un PR, hacer un release, meter un hotfix, resolver un conflicto o cuando no tengas claro sobre qué rama estás trabajando. Cubre la separación main=producción / staging=integración y la convención de nombres que identifica quién hizo qué.
---

# Flujo de trabajo con Git

Dos personas (Ivan `UniqueColombia`, Jesús `seiler18`), cada una con su agente,
sobre el mismo repositorio. La estrategia existe para que **nadie rompa
producción y siempre se sepa quién hizo qué**.

## Antes de nada: los guardarraíles no están activos

**`main` y `staging` NO están protegidas.** Verificado el 2026-08-23: la
protección de ramas requiere GitHub Pro en repositorios privados, y el repo está
en plan Free. Ver `docs/DEPLOY.md`.

Qué significa para ti, agente:

- Un `git push` a `main` **no va a ser rechazado**. No cuentes con que la
  plataforma te detenga: las reglas de abajo son lo único que hay.
- `.github/CODEOWNERS` no obliga a nada todavía.
- El CI corre en cada PR, pero **no bloquea el merge**. Un PR en rojo se puede
  mergear. No lo hagas.

Todo lo que sigue es, por ahora, disciplina. Trátalo como si fuera obligatorio,
porque es lo único que separa esto de romper producción.

## Las tres capas de ramas

```
main       ← PRODUCCIÓN. Lo que ve un cliente real. Protegida.
  ↑ PR de release (solo desde staging o hotfix/*)
staging    ← INTEGRACIÓN. Todo se junta y se prueba aquí primero. Protegida.
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

Este PR lo aprueba y mergea **Ivan** (es producción y es su repo). Se mergea con
`--merge`, no con squash: queremos ver en `main` qué tareas entraron.

Después, etiquetar:

```bash
git checkout main && git pull origin main
git tag -a v0.2.0 -m "Panel de proveedor y auth con Supabase"
git push origin v0.2.0
```

Versionado: `v0.MINOR.PATCH` mientras el producto sea pre-lanzamiento. Sube
`MINOR` cuando entra una fase del `docs/ROADMAP.md`, `PATCH` cuando es solo
corrección. Cada release debería tener su hito en `hitos/`.

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

- `git push --force` a `main` o `staging`
- `git commit` con `main` o `staging` checkout
- Commitear `.env.local`, `node_modules/` o cualquier clave
- Mergear un PR con el CI en rojo
- Reescribir historia ya empujada a una rama compartida
