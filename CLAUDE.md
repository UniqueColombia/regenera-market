@AGENTS.md

# Seregenera — orquestador

Este archivo es el **punto de entrada de todo agente** (Claude Code u otro) que
trabaje en este repositorio. Describe la infraestructura: quién trabaja aquí,
dónde vive cada cosa y qué habilidad cargar según la tarea. **No documenta el
producto** (eso es `README.md`) **ni el historial** (eso es `.claude/hitos/`).

Regla de oro: si algo que aprendes vale para la próxima sesión, no lo escribas
aquí. Va a una skill (si es "cómo hacer algo") o a un hito (si es "qué se hizo").
Este archivo solo crece cuando cambia la *infraestructura*.

## Quiénes

| Persona | GitHub | Rol | Iniciales de rama |
|---|---|---|---|
| Ivan Duarte | `UniqueColombia` | Admin del repo, autor de la base | `id` |
| Jesús Seiler | `seiler18` | Colaborador (push) | `js` |

Ambos trabajamos con Claude Code y GitHub CLI (`gh`). Todo cambio entra por Pull
Request: es el único lugar donde el otro puede ver y revisar lo que hizo el
agente del otro.

## Mapa del repositorio

| Ruta | Qué contiene | Quién lo lee |
|---|---|---|
| `CLAUDE.md` | Este orquestador | Todo agente, siempre |
| `AGENTS.md` | Bloque que regenera `next dev`. No editar a mano | Agentes |
| `README.md` | Qué es el producto, cómo correrlo, decisiones de diseño | Humanos y agentes |
| `docs/ROADMAP.md` | Camino del producto por fases, con criterio de salida | Humanos y agentes |
| `docs/BETA.md` | Cómo se ejecutan las Fases 1 y 2, bloque por bloque | Humanos y agentes |
| `docs/DEPLOY.md` | Stack de despliegue, por qué se eligió y qué se descartó | Humanos y agentes |
| `.claude/skills/` | Habilidades del proyecto. Una carpeta por skill | Agentes (carga automática) |
| `.claude/agents/` | Subagentes con encargo propio. Un archivo por agente | Claude Code |
| `.claude/hitos/` | Trazabilidad: un archivo por hito, quién y qué | Humanos y agentes |
| `.claude/prospectos/` | Salida del prospector. **No se versiona** (ver Límites duros) | Humanos |
| `.github/` | CI, plantilla de PR, CODEOWNERS | GitHub |
| `scripts/` | Utilidades de repositorio: política de ramas, verificar antes de mergear, prospectar proveedores | Humanos y hooks |
| `src/` | Aplicación Next.js (App Router) | — |
| `supabase/migrations/` | Esquema SQL con RLS | — |

## Skills disponibles

Las skills viven en `.claude/skills/<nombre>/SKILL.md`. Claude Code las descubre
solo y las invoca cuando la tarea coincide con su `description`; también se
pueden pedir a mano con `/<nombre>`.

| Skill | Cárgala cuando… |
|---|---|
| `flujo-git` | Vas a crear una rama, abrir un PR, hacer un release o resolver un conflicto. **Antes del primer commit de cualquier tarea.** |
| `registrar-hito` | Terminaste algo que otro debería poder reconstruir sin preguntarte |
| `dominio-regenera` | Tocas precios, comisiones, órdenes, roles o puntaje de sostenibilidad |
| `supabase-schema` | Tocas `supabase/migrations/` o `src/lib/repo.ts` |
| `nueva-integracion` | Conectas un servicio externo (pasarela, correo, WhatsApp, ERP de un cliente) |
| `componentizacion` | Creas un archivo en `src/components/`, dudas entre Server y Client Component, o una página pasa de ~150 líneas de JSX |
| `diseno-visual` | Escribes clases de Tailwind, eliges un color, maquetas una página o ajustas el aspecto de un componente |
| `prospeccion-proveedores` | Tocas `scripts/prospectar.mts`, conectas una fuente de datos de empresas, o alguien propone usar LinkedIn o un scraper para conseguir proveedores |

Para agregar una skill: carpeta nueva en `.claude/skills/`, un `SKILL.md` con
frontmatter `name` + `description`, y una fila en esta tabla. Nada más.

## Subagentes

Un subagente es un encargo con contexto propio: se le delega una tarea larga y
devuelve el resultado, no el camino. Viven en `.claude/agents/<nombre>.md`.

La diferencia con una skill, que es la que importa al decidir dónde escribir
algo: **una skill es conocimiento que se carga en la conversación en curso; un
subagente es trabajo que se delega y ocurre aparte.** Si lo que tienes es "cómo
se hace X", es una skill. Si es "andá y traeme X", es un subagente.

| Subagente | Delégale… |
|---|---|
| `prospector-proveedores` | Encontrar candidatos a proveedor para una vertical o categoría, con el contacto verificado y el encaje ya juzgado. Parte del registro mercantil (RUES) |

Para agregar uno: archivo nuevo en `.claude/agents/`, frontmatter `name` +
`description` + `tools`, y una fila en esta tabla.

## Cómo se trabaja aquí (ciclo estándar)

1. **Sincronizar y ramificar.** `git fetch origin` y `git pull` de `staging`
   **antes de abrir el primer archivo**, no antes de empujar: somos dos
   personas con un agente cada una sobre el mismo repositorio, y editar sobre un
   clon viejo produce conflictos que nadie pidió. Carga `flujo-git`, regla cero.
   El **agente** nunca commitea directo a `main` ni a `staging`: abre un PR.
   Ivan y Jesús sí pueden, y no necesitan revisión de nadie — ver `flujo-git`,
   «Quién puede hacer qué».
2. **Cargar el contexto del dominio.** Si la tarea toca dinero, órdenes, roles o
   puntajes, carga `dominio-regenera` antes de escribir código. Esas reglas no
   son estilo: violarlas es un bug de negocio o de seguridad.
3. **Implementar.**
4. **Verificar.** En este orden: `npm run build`, luego `npx tsc --noEmit`,
   luego `npx eslint .`. Los tres en limpio. El build va primero porque genera
   los tipos de rutas que `tsc` necesita. El CI corre lo mismo; no abras PR sin
   haberlo corrido local.
5. **Registrar el hito** si el cambio es estructural. Carga `registrar-hito`.
6. **Abrir PR** contra `staging` con `gh pr create`. La plantilla se llena sola.

## Límites duros

- **No se commitea `.env.local` ni ninguna clave.** `SUPABASE_SERVICE_ROLE_KEY`
  y las llaves de Wompi nunca aparecen en el repo, ni en un comentario, ni en un
  hito, ni en un mensaje de PR. `.env.example` documenta el *nombre* de la
  variable, nunca el valor.
- **No se hace `push --force` a `main` ni a `staging`.**
- **No se aplican migraciones destructivas** sin que el dueño del repo lo
  autorice explícitamente en el PR.
- **No se borra ni se reescribe un archivo de `.claude/hitos/`.** Si un hito quedó mal,
  se escribe otro que lo corrija y lo referencie.
- **No se versionan listas de prospectos.** `.claude/prospectos/` está en
  `.gitignore`: son datos de empresas y personas identificables, y el
  repositorio es público. Que el RUES los publique no nos autoriza a
  republicarlos agregados y puntuados en GitHub. Se versiona la maquinaria
  (`scripts/prospectar.mts`), nunca su salida.
- **No se automatiza LinkedIn, Instagram ni Facebook para conseguir
  proveedores.** No es una preferencia: los términos de LinkedIn prohíben la
  extracción automatizada aunque el dato sea público, y hay condena judicial.
  El detalle y las alternativas están en `prospeccion-proveedores`.
- El agente no decide por el equipo: si una tarea implica cambiar la estrategia
  de ramas, el modelo de datos compartido o el costo de un servicio externo, se
  plantea en el PR y lo aprueba un humano.
