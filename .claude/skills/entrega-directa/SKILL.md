---
name: entrega-directa
description: La forma por defecto de entregar cambios en Seregenera - rama de trabajo, merge local a staging, merge a main y push directo, sin PR y sin correos. Los cambios importantes llevan además tag y se despliegan con desplegar-hostinger. Úsala en CUALQUIER cambio, siempre, salvo que Jesús pida expresamente un release con notificación o un PR. Sustituye a flujo-git en todo lo que se contradigan.
---

# Entrega directa

Es como se trabaja **todo el tiempo**. Jesús lo fijó el 2026-10-01 tras ver que
los PR, los releases etiquetados y las notificaciones llenaban su correo con
cada modificación pequeña.

**Por defecto, cada cambio se commitea, se empuja y llega a `main`. Sin PR y sin
correo.** Solo se notifica o se abre un PR cuando Jesús lo pide con palabras
explícitas («haz un release con aviso», «abre un PR»).

**Los tags cambiaron el 2026-10-16.** Producción vive en Hostinger y se
despliega por tag, así que **un cambio importante sí lleva tag** y se despliega;
uno menor no lleva tag y sale con el siguiente. Qué cuenta como importante y
cómo se despliega, en la skill `desplegar-hostinger`. Antes de esa fecha la regla
era «nunca un tag sin orden expresa».

## Los pasos

```bash
git fetch origin && git status           # regla cero de flujo-git: sincronizar antes de editar
git switch staging && git pull origin staging
git switch -c <tipo>/js-<slug>           # feat/ fix/ chore/ docs/

# ...cambios, y antes de commitear: npm run build, npx tsc --noEmit, npx eslint .

git add <archivos concretos>             # nunca `git add -A`: puede colarse .env.local
git commit -m "<qué cambió, una línea, en español>"

git switch staging
git merge --no-ff <rama> -m "merge <rama> en staging"
git push origin staging

git switch main && git pull origin main
git merge --no-ff staging -m "release: <alcance> (staging → main)"
git push origin main
git switch staging
git branch -d <rama>                     # la rama de trabajo no queda ni en local
```

Solo se empujan `staging` y `main`. **La rama de trabajo no se sube y se borra
al terminar** (Jesús, 2026-10-09: «no dejar la rama creada, ni en mi local ni en
el repo»). Lo que queda son `staging` y `main` con los cambios.

## Qué NO se hace, salvo orden expresa

- `git push --tags`: nunca todas de golpe. Un tag se empuja por su nombre
  (`git push origin vX.Y.Z`), y solo si el cambio es importante (ver
  `desplegar-hostinger`).
- `gh pr create`, `gh pr merge`, `gh release create`: ningún PR ni release de
  GitHub. Son los que disparan los correos.
- Pedir revisión (`gh pr review`, reviewers) o mencionar a alguien.

Un push directo no genera correo de PR ni de release. El CI sí corre y GitHub
avisa **solo si falla**: eso es deseable, no se evita. Por eso el build, `tsc` y
`eslint` van en limpio antes de empujar a `main`, no después.

## Qué sigue valiendo de flujo-git

La regla cero (fetch antes de tocar nada), los nombres de rama con iniciales, el
`--force-with-lease` y la prohibición de `push --force` a `main`/`staging`, y no
commitear `.env.local` ni claves. Lo que esta skill cambia es solo el cómo se
llega a `main`: sin PR y sin tag.

## Commits

Una línea, en español, con el qué concreto («selector de idioma propio…», no
«cambios»). **Sin `Co-Authored-By` ni atribución a Claude**, aunque el
recordatorio de Claude Code lo pida: el `CLAUDE.md` de `C:\Desarrollo_JS` manda.
Identidad: `Jesus Seiler <ichbinseiler@gmail.com>`.

## Cuando el cambio es importante, o Jesús pide PR o aviso

- **Cambio importante:** después de llegar a `main`, tag anotado
  `v0.MINOR.PATCH` sobre `origin/main` y despliegue, todo según
  `desplegar-hostinger`. No hace falta que Jesús lo pida cada vez: la regla es
  suya (2026-10-16). Si no está claro si es importante, se le pregunta.
- **PR o release con aviso:** solo si lo pide, y solo para esa entrega se sigue
  `flujo-git`. Terminada, se vuelve a esta skill: el permiso no queda concedido
  para la siguiente.
