---
name: flujo-de-trabajo
description: Ramas, commits y pull requests en Regenera Market. Úsala antes de crear una rama, escribir un mensaje de commit, abrir un PR o preguntarte si algo puede ir directo a main.
---

# Flujo de trabajo

## Ramas — GitHub Flow

**`main` es la única rama de larga vida.** Todo lo demás es una rama corta que
nace de `main`, se integra por PR y se borra.

```
main ──●────●────────●────────●──►
        \        /        /
         feat/x ●   fix/y ●
```

**No hay `develop`.** La decisión es deliberada: el equipo es de dos personas,
Next.js genera un preview por PR, y una segunda rama de larga vida solo agrega
merges de mantenimiento sin proteger nada que el preview no proteja ya. Se
reconsidera cuando haya producción con proveedores reales cobrando: ahí `main`
pasa a ser producción y se agrega una rama de estabilización o se despliega por
etiquetas.

### Nombres

| Prefijo | Para |
|---|---|
| `feat/` | Funcionalidad nueva — `feat/panel-proveedor` |
| `fix/` | Corrección — `fix/comision-por-item` |
| `chore/` | Dependencias, configuración, tooling |
| `docs/` | README, hitos, habilidades |
| `db/` | Migraciones de Supabase — `db/0002-ordenes` |

En kebab-case y en español, como el resto del proyecto.

### Reglas

- **No se commitea directo a `main`.** GitHub no lo impide —el repositorio es
  privado en plan gratuito, así que las reglas de protección de rama no están
  disponibles— y por eso la disciplina es de las personas, no de la herramienta.
- Una rama, un tema. Si al abrir el PR necesitas la palabra "y" dos veces para
  describirlo, eran dos ramas.
- Rebase sobre `main` antes de pedir revisión, no merge de `main` hacia adentro.
- La rama se borra al fusionar.

## Commits

Mensaje en español, imperativo, primera línea de 72 caracteres o menos, sin
punto final. Se describe **el efecto**, no el archivo tocado.

```
Congelar precio y título al confirmar la orden

El proveedor puede editar su oferta después de la venta. La orden guardaba
solo el id, así que el histórico mostraba el precio de hoy y no el que el
comprador aceptó.
```

- Un commit debe dejar el proyecto compilando. `npx tsc --noEmit` y
  `npx eslint .` limpios antes de commitear (habilidad
  `verificacion-de-cambios`).
- El bloque `<!-- BEGIN:nextjs-agent-rules -->` de `AGENTS.md` lo reescribe
  `next dev`. Si aparece modificado, se commitea con el trabajo; quitarlo del
  diff solo lo hace reaparecer.
- Nunca se commitea `.env`, `.next/`, ni `.claude/settings.local.json` (ya
  están en `.gitignore`).

## Pull requests

Título en español, descriptivo. El cuerpo responde tres cosas:

```markdown
## Qué hace
Dos frases.

## Por qué
El problema. Si hubo alternativa descartada, cuál y por qué.

## Cómo probarlo
Rutas concretas y qué debería verse.
```

- Si el PR cierra un hito, enlaza su archivo de `.claude/hitos/`.
- Si toca precios, comisión, roles o RLS, dilo en el título — eso pide una
  lectura más despacio.
- Se revisa con `gh pr view`, `gh pr diff`, y se fusiona con **squash** para que
  `main` tenga un commit por cambio.

## Colaboradores

| Quién | Rol |
|---|---|
| `UniqueColombia` (Dimension Natural SAS) | Propietario |
| `seiler18` (Jesus Seiler) | Escritura — invitado 2026-08-19 |

Comandos útiles:

```bash
gh repo view --web
gh api repos/UniqueColombia/regenera-market/collaborators   # quién tiene acceso
gh api repos/UniqueColombia/regenera-market/invitations     # invitaciones pendientes
```
