# Habilidades de Regenera Market

Cada carpeta es una habilidad: un `SKILL.md` con las reglas del proyecto sobre un
tema. Claude Code las descubre solo —por el campo `description` del frontmatter—
y carga la que corresponda al trabajo en curso.

No son documentación general. Son **las decisiones de este repositorio**: por qué
el precio se calcula en el servidor, por qué no hay modo oscuro, por qué
`repo.ts` es `async` aunque hoy lea un arreglo en memoria.

| Habilidad | Cuándo se usa |
|---|---|
| [`componentizacion`](componentizacion/SKILL.md) | Crear componentes, decidir Server vs. Client, dónde va cada archivo |
| [`diseno-visual`](diseno-visual/SKILL.md) | Cualquier clase de Tailwind, color, tipografía, maquetación, accesibilidad |
| [`datos-y-supabase`](datos-y-supabase/SKILL.md) | Tocar `repo.ts`, `src/data/`, migraciones, precios, comisión, RLS |
| [`verificacion-de-cambios`](verificacion-de-cambios/SKILL.md) | Antes de dar por terminado un cambio o abrir un PR |
| [`flujo-de-trabajo`](flujo-de-trabajo/SKILL.md) | Ramas, commits, pull requests, colaboradores |
| [`registro-de-hitos`](registro-de-hitos/SKILL.md) | Cerrar una funcionalidad o tomar una decisión que hay que recordar |

## Cómo se agrega una

```
.claude/skills/<nombre-en-kebab-case>/SKILL.md
```

Con frontmatter:

```yaml
---
name: nombre-en-kebab-case
description: Qué contiene y — sobre todo — cuándo debe usarse. Empieza por el
  qué y sigue con "Úsala antes de…". La descripción es lo único que Claude lee
  para decidir si abre la habilidad; una vaga equivale a no tenerla.
---
```

Reglas de contenido:

- **Específica de este proyecto.** Si el texto sirve igual para cualquier
  proyecto de Next.js, no es una habilidad: es documentación de Next.js, y ya
  existe en `node_modules/next/dist/docs/`.
- **Con el porqué.** Una regla sin razón se rompe la primera vez que estorba.
- **Con referencias a archivos reales** del repositorio, para que se pueda
  contrastar con el código.
- **Corta.** Si pasa de ~150 líneas, probablemente son dos habilidades.

Al agregar una, actualiza la tabla de arriba y la de `CLAUDE.md`.
