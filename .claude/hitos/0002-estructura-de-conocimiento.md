# 0002 — Estructura de conocimiento del proyecto

- **Fecha:** 2026-08-19
- **Estado:** Cerrado
- **Commits:** pendiente de commitear
- **Ramas / PR:** —

## Qué cambió

`CLAUDE.md` pasó de ser un archivo de una línea (`@AGENTS.md`) a ser el
**orquestador** del proyecto: qué es Regenera Market, en qué estado real está,
cómo está estructurado, el vocabulario del dominio, las cinco reglas que no se
rompen, y punteros a todo lo demás.

Se crearon dos carpetas dentro de `.claude/`:

- **`hitos/`** — la bitácora, con índice, plantilla y el hito retroactivo
  [0001](0001-mvp-navegable.md) que reconstruye de dónde viene el proyecto.
- **`skills/`** — seis habilidades con las reglas del repositorio por tema:
  `componentizacion`, `diseno-visual`, `datos-y-supabase`,
  `verificacion-de-cambios`, `flujo-de-trabajo`, `registro-de-hitos`.

`README.md` se reescribió para una persona que llega a colaborar: arranque,
estructura, convenciones de código, flujo de ramas y commits, qué revisar antes
de un PR, y dónde vive el conocimiento del proyecto.

Se invitó a **`seiler18` (Jesus Seiler)** como colaborador con permiso de
escritura.

## Por qué

El conocimiento del proyecto vivía en tres sitios que no se hablan: el código,
la memoria de Claude entre sesiones, y la cabeza del usuario. Nada de eso lo ve
una persona nueva, y la memoria de Claude no es del repositorio: no se clona, no
se revisa en un PR, no sobrevive a un cambio de máquina.

Con un colaborador entrando al proyecto, eso deja de ser un inconveniente y pasa
a ser un costo: cada decisión no escrita se vuelve una pregunta o, peor, una
regla rota sin que nadie se dé cuenta —el precio calculado en el cliente, un hex
suelto en un componente, una consulta que se salta `repo.ts`.

La alternativa era un solo `CLAUDE.md` largo con todo adentro. Se descartó: un
archivo que se carga entero en cada sesión y que crece con cada regla nueva
termina siendo demasiado largo para leerse y demasiado caro para cargarse. Las
habilidades se cargan **solo cuando el trabajo las pide**, y por eso pueden ser
detalladas sin costo permanente.

## Decisiones tomadas

- **`CLAUDE.md` es mapa, no manual.** Contiene lo que hay que saber siempre;
  todo lo que depende del trabajo en curso vive en una habilidad. *(usuario
  pidió el orquestador; el reparto exacto lo definió Claude)*
- **Las carpetas van dentro de `.claude/` y se commitean.** Solo
  `settings.local.json` sigue ignorado. El conocimiento del proyecto es del
  repositorio, no de una máquina. *(usuario)*
- **Un hito es un cambio que altera lo que el proyecto es o cómo se decide**, no
  un changelog de commits. El criterio explícito está en
  `.claude/hitos/README.md`. *(Claude)*
- **Se marca el origen de cada decisión** en los hitos —usuario, Claude, o
  Claude sin confirmar— porque hay varias premisas del MVP que se asumieron por
  defecto y hay que poder encontrarlas antes de que sean caras de revertir.
  *(Claude)*
- **GitHub Flow: `main` + ramas cortas por PR. Sin `develop`.** Con dos personas
  y previews por PR, una segunda rama de larga vida solo agrega merges de
  mantenimiento. Se reconsidera cuando haya producción cobrando. *(Claude —
  el usuario delegó la decisión)*
- **`seiler18` entra con permiso de escritura**, no de administración: puede
  crear ramas, abrir PR y fusionar, no borrar el repositorio ni cambiar su
  visibilidad. *(Claude)*

## Qué tocar si esto se cambia

- `CLAUDE.md` — el `@AGENTS.md` del final debe quedarse: `next dev` reescribe
  `AGENTS.md` y el import es lo que lo mantiene en contexto.
- `.claude/skills/README.md` y la tabla de habilidades de `CLAUDE.md` — se
  actualizan **las dos** al agregar una habilidad.
- `.claude/hitos/README.md` — el índice se actualiza con cada hito nuevo.
- `README.md`, sección «Qué falta» — es la lista viva de pendientes; los hitos
  la referencian y no deben contradecirla.

## Queda abierto

- [ ] **Protección de rama `main`.** No disponible: el repositorio es privado en
      plan gratuito y GitHub responde 403 a `rulesets` y a
      `branches/main/protection`. Se habilita pagando GitHub Pro o haciendo
      público el repositorio. Mientras tanto, la regla de «no commitear a main»
      es disciplina, no barrera.
- [ ] **Aceptación de la invitación de `seiler18`.** Verificable con
      `gh api repos/UniqueColombia/regenera-market/invitations` — si sigue
      apareciendo, no la ha aceptado.
- [ ] **Integración continua.** Un workflow que corra `tsc --noEmit` y `eslint`
      en cada PR sustituiría con una barrera lo que hoy es un checklist. Cabe en
      el plan gratuito para repositorios privados.
- [ ] **Confirmar las premisas asumidas** del hito [0001](0001-mvp-navegable.md):
      Wompi, alojamiento fuera del alcance, modelo mixto de verificación, i18n
      inactivo.
