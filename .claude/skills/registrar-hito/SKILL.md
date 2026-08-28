---
name: registrar-hito
description: Cómo y cuándo escribir un archivo en .claude/hitos/ para dejar trazabilidad de quién hizo qué en Seregenera. Úsala al terminar un cambio estructural (una fase del roadmap, un módulo nuevo, una migración aplicada, una integración conectada, una decisión de arquitectura, un release) para que la otra persona pueda reconstruirlo sin preguntar. Incluye la plantilla y la convención de nombres.
---

# Registrar un hito

`.claude/hitos/` es la memoria del proyecto. Existe para que `CLAUDE.md` no se convierta
en un diario y para que, seis meses después, cualquiera pueda responder **"¿quién
decidió esto y por qué?"** leyendo un archivo en vez de arqueología de commits.

Un hito no es un changelog. El changelog lo da `git log`. Un hito captura **lo
que el diff no dice**: qué se descartó, qué queda a medias, qué se rompe si el
siguiente toca esto sin saberlo.

## Cuándo escribir uno

Sí:
- Terminó una fase de `docs/ROADMAP.md`
- Se aplicó una migración contra una base real
- Se conectó un servicio externo (Supabase, Wompi, correo, un cliente)
- Se tomó una decisión de arquitectura con alternativas descartadas
- Se hizo un release (tag en `main`)
- Se cambió algo que invalida documentación anterior

No:
- Un fix de una línea
- Renombrar variables, formateo, dependencias
- Cualquier cosa que el mensaje de commit ya explica completo

Ante la duda: **¿la otra persona perdería una tarde reconstruyendo esto?** Si sí,
hito.

## Nombre del archivo

`.claude/hitos/AAAA-MM-DD-slug-en-kebab-case.md`

Fecha en que se **terminó**, no en que se empezó. La fecha primero para que
`ls .claude/hitos/` salga en orden cronológico.

Ejemplos: `2026-08-23-mvp-navegable.md`,
`2026-09-04-supabase-en-produccion.md`, `2026-09-20-wompi-pagos-reales.md`.

## Plantilla

Copia `.claude/hitos/_plantilla.md`. Estructura:

```markdown
# <Título del hito>

- **Fecha:** AAAA-MM-DD
- **Autor:** <Nombre> (`<usuario-github>`)
- **Rama / PR:** `feat/js-...` → #<n>
- **Fase del roadmap:** <fase de docs/ROADMAP.md, o "—">

## Qué se hizo
Dos o tres frases. Qué existe ahora que antes no existía.

## Por qué así
La decisión y las alternativas que se descartaron, con el motivo. Esta es la
sección que importa: es la que no está en el código.

## Qué quedó pendiente
Lista honesta. Si algo quedó a medias, dilo aquí y no en un TODO perdido.

## Qué se rompe si tocas esto
Lo que el siguiente debe saber antes de modificar esta zona. Archivos, tablas,
invariantes.

## Verificación
Cómo se comprobó que funciona. Comandos, rutas visitadas, datos usados.
```

## Reglas

- **Un hito no se edita ni se borra nunca.** Si quedó mal o cambió la decisión,
  se escribe uno nuevo que lo referencie: `Reemplaza a
  [2026-08-23-mvp-navegable.md](2026-08-23-mvp-navegable.md)`.
- **El autor es la persona, no el agente.** El agente escribe; Ivan o Jesús
  firman. Si el trabajo fue conjunto, van los dos.
- **Sin claves ni datos de clientes.** Ni una URL de Supabase con token, ni un
  correo real de proveedor. Nombra la variable de entorno, no su valor.
- El hito entra **en el mismo PR** que el trabajo que describe, como último
  commit: `docs(hitos): registrar <slug>`.
- Actualiza `.claude/hitos/README.md` agregando la fila del hito nuevo al índice.
