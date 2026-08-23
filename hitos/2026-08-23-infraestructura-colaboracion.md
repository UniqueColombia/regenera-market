# Infraestructura de colaboración

- **Fecha:** 2026-08-23
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `chore/js-infraestructura-colaboracion` → #1
- **Fase del roadmap:** 0 — Prototipo (habilitante, no funcionalidad)

## Qué se hizo

El repositorio pasó de un MVP de un solo autor a un proyecto de dos personas con
un agente cada una. Se agregó: `CLAUDE.md` como orquestador, cinco skills en
`.claude/skills/`, `hitos/` para trazabilidad, `docs/ROADMAP.md` con fases y
criterios de salida verificables, y CI en GitHub Actions que corre tipos, lint,
build y dos comprobaciones de secretos.

Ninguna línea de `src/` ni de `supabase/` cambió. Este hito es puramente
infraestructura.

## Por qué así

**`CLAUDE.md` orquesta, no documenta.** Antes era una sola línea (`@AGENTS.md`).
Ahora dice quién trabaja aquí, dónde vive cada cosa, qué skill cargar según la
tarea y cuáles son los límites duros. Lo que *no* dice es cómo funciona el
producto (eso es `README.md`) ni qué se hizo (eso es `hitos/`). La separación es
el punto: un `CLAUDE.md` que acumula historia se vuelve ilegible en tres meses y
el agente deja de encontrar lo que importa.

**Las skills van en `.claude/skills/`, no en una carpeta `skills/` en la raíz.**
Es la ruta canónica que Claude Code descubre solo: cada agente carga la skill
cuando la tarea coincide con su `description`, sin que nadie se acuerde de
pedirla. Una carpeta en la raíz sería documentación que hay que recordar leer —
que es exactamente lo que falla.

**Cinco skills, no quince.** `flujo-git` (ramas, PRs, releases),
`registrar-hito`, `dominio-regenera` (invariantes de dinero, permisos y
puntajes), `supabase-schema` y `nueva-integracion`. Cada una cubre una zona donde
un agente sin contexto haría daño real. Se descartó escribir skills de estilo de
código o de componentes: eso lo resuelven ESLint y TypeScript, y una skill que
repite lo que ya valida una herramienta solo gasta contexto.

**Tres capas de ramas: `main` (producción) ← `staging` (integración) ← ramas de
trabajo.** Se descartó git-flow completo (`develop` + `release/*` + `hotfix/*`):
sobra para dos personas y añade dos merges por entrega. Se descartó
trunk-based puro sobre `main`: con dos agentes trabajando en paralelo y sin
suite de tests todavía, `staging` es el único lugar donde un conflicto entre
nosotros aparece antes de que lo vea un cliente.

**Las ramas llevan iniciales del autor** (`feat/js-…`, `fix/id-…`). Con dos
personas y dos agentes, `git branch -a` tiene que responder "quién tiene qué
abierto" sin abrir GitHub.

**El CI corre el build sin credenciales, a propósito.** Es la forma de que la
propiedad más valiosa del MVP no se pierda por accidente: clonar el repo y
navegar la app sin configurar nada. El día que el build requiera un secreto para
compilar, el CI lo dice.

**El CI compila antes de chequear tipos.** Al verificar en un clon limpio salió
que `npx tsc --noEmit` falla con `TS2304: Cannot find name 'PageProps'` en siete
archivos de `src/app/` si no se corrió `next build` antes: Next genera
`PageProps` y `LayoutProps` durante el build. El `README.md` original mandaba
correr `tsc` primero, así que cualquiera que clonara el repo iba a ver siete
errores falsos. Se corrigió el orden en el README, en el CI, en el PR template y
en las skills que mencionan verificación.

**Dos comprobaciones de secretos en CI, además del `.gitignore`.** Que no haya
ningún `.env` versionado, y que ninguna variable `NEXT_PUBLIC_*` contenga
`SERVICE_ROLE`, `PRIVATE` o `SECRET` en el nombre. El `.gitignore` protege al
distraído; el CI protege al que lo forzó con `git add -f`. Una clave de servicio
en el bundle del navegador es una fuga total de la base, no un descuido de
nombres.

**`hitos/` es append-only.** Un hito no se edita ni se borra: si cambió la
decisión, se escribe otro que referencie al anterior. Un historial que se puede
reescribir no sirve para responder "¿quién decidió esto y por qué?".

**El hito del MVP se escribió retroactivamente**
(`2026-08-23-mvp-navegable.md`), reconstruido desde el código y el README, para
que el historial no empiece con un hueco. Está marcado como tal para que Ivan
pueda corregirlo.

## Qué quedó pendiente

- [ ] **Ivan debe crear la rama `staging` y proteger `main` y `staging`** en
      GitHub. Jesús tiene permiso de `push`, no de `admin`: no puede configurar
      reglas de protección. Sin eso, el flujo depende de disciplina y no de
      la plataforma. Detalle en el PR.
- [ ] Suite de tests. No hay ninguno. `tsc` + `eslint` atrapan errores de tipo,
      no de negocio — y `src/lib/pricing.ts` y `src/lib/sustainability.ts` son
      funciones puras, el caso más fácil de cubrir que existe. Es la primera
      deuda que conviene pagar.
- [ ] Deploy automático (Vercel): `main` → producción, `staging` → preview
      estable. Requiere que Ivan conecte el repo.
- [ ] Plantilla de issues en `.github/ISSUE_TEMPLATE/`. Se dejó fuera hasta ver
      si realmente usamos issues o nos basta con PRs.

## Qué se rompe si tocas esto

- **`CLAUDE.md`:** mantiene `@AGENTS.md` en la primera línea. `next dev`
  reescribe `AGENTS.md`; si se quita el import, los agentes pierden la
  advertencia de que este Next.js no es el de su entrenamiento.
- **`.github/CODEOWNERS`:** solo tiene efecto real si `main` y `staging` están
  protegidas con "require review from Code Owners". Sin protección es un archivo
  decorativo.
- **`.claude/settings.json`:** permisos compartidos por el equipo. Lo personal va
  en `.claude/settings.local.json`, que está en `.gitignore`. No metas rutas de
  tu máquina en el archivo versionado.
- **CI job `secretos`:** el `git grep` de `NEXT_PUBLIC_*` se excluye a sí mismo
  (`:!.github/workflows/ci.yml`). Si mueves el archivo, ajusta la exclusión o el
  job falla contra su propio patrón.
- **`hitos/README.md`:** cada hito nuevo agrega su fila al índice. Es lo único
  del directorio que sí se edita.

## Verificación

Corrido en este repo, con `node_modules` recién instalado (`npm ci`, 370
paquetes) y sin ningún `.env.local`:

```bash
npm run build        # ✓ compiló en 10.4s, 9 rutas generadas
npx tsc --noEmit     # ✓ exit 0
npx eslint .         # ✓ exit 0
```

El workflow de CI corre los mismos tres comandos en ese orden, más los dos
chequeos de secretos; se valida al abrir el PR. Las skills se verificaron leyéndolas contra
el código real (`pricing.ts`, `payments.ts`, `repo.ts`, `sustainability.ts`,
`0001_init.sql`): cada invariante que afirman está en un archivo concreto y
citado.
