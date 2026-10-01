---
name: entrega-directa
description: La forma por defecto de entregar cambios en Seregenera - rama de trabajo, merge local a staging, merge a main y push directo, sin PR, sin tag y sin correos. Úsala en CUALQUIER cambio, siempre, salvo que Jesús pida expresamente un tag, un release con notificación o un PR. Sustituye a flujo-git en todo lo que se contradigan.
---

# Entrega directa

Es como se trabaja **todo el tiempo**. Jesús lo fijó el 2026-10-01 tras ver que
los PR, los releases etiquetados y las notificaciones llenaban su correo con
cada modificación pequeña.

**Por defecto, cada cambio se commitea, se empuja y llega a `main`. Sin PR, sin
tag, sin correo.** Solo se etiqueta o se notifica cuando Jesús lo pide con
palabras explícitas («genera un tag», «haz un release con aviso», «abre un PR»).
Que un cambio sea grande o importante no cuenta como pedirlo.

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
```

Solo se empujan `staging` y `main`. **La rama de trabajo no se sube**: queda
local y evita ruido en GitHub.

## Qué NO se hace, salvo orden expresa

- `git tag` / `git push --tags`: nada de etiquetas. El último tag existente
  queda como está; no hay que subirlo ni «ponerse al día».
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

## Cuando Jesús sí pide tag o notificación

Entonces, y solo para esa entrega, se sigue `flujo-git`: PR si lo pidió, y el
tag anotado `v0.MINOR.PATCH` sobre `main` con `git push origin <tag>`. Terminada
esa entrega, se vuelve a esta skill. El permiso no queda concedido para la
siguiente.
