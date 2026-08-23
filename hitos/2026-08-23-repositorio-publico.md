# El repositorio pasó a público y la política de ramas se abrió

- **Fecha:** 2026-08-23
- **Autor:** decisión de Ivan Duarte (`UniqueColombia`) y Jesús Seiler (`seiler18`); registro por Jesús
- **Rama / PR:** `fix/js-guardarrailes-y-repo-publico` → #11
- **Fase del roadmap:** 0 — Prototipo (habilitante)

## Qué se hizo

El repositorio pasó de privado a **público**, y con eso se desbloquearon la
protección de ramas, CODEOWNERS y la colaboración en Vercel, que en plan gratuito
solo existen para repositorios públicos. Efecto inmediato y comprobado: los
deployments de Vercel de Jesús pasaron de `Deployment was blocked` a
`Deployment has completed`.

Acto seguido, y con el repositorio ya público, la política de ramas se **abrió**
en vez de cerrarse (PR #9, `scripts/politica-de-ramas.sh`).

## Por qué así

**Público.** GitHub y Vercel chocaban con la misma pared: plan gratuito +
repositorio privado = sin colaboración. Pagar dos suscripciones para un proyecto
sin un solo cliente real era desproporcionado. `docs/DEPLOY.md` recomendaba
explícitamente lo contrario; la decisión se tomó con ese análisis a la vista y el
documento ahora describe la realidad y sus mitigaciones.

**Ramas abiertas.** El argumento de Ivan es correcto y conviene que quede
escrito: **quién puede empujar no lo decide la protección de rama, lo decide la
lista de colaboradores.** Que el repositorio sea público significa que cualquiera
puede leerlo y abrir un PR desde su propio fork — nunca empujar al nuestro. La
protección de rama jamás estuvo defendiendo el repositorio de terceros; lo único
que hacía era estorbar a los dos únicos colaboradores. Queda un solo control
activo: **bloquear el borrado** de `main` y `staging`, porque hacer desaparecer
una rama no es "modificarla" y no hay razón para que ocurra por accidente.

`git push --force` queda permitido en el servidor y denegado para los agentes en
`.claude/settings.json`. La distinción es deliberada: la persona decide, el agente
no reescribe historia compartida.

## Lo que se verificó

**No hay ni ha habido secretos en el repositorio.** Escaneado el historial
completo (`git log --all -p`) contra patrones de JWT, claves de servicio, llaves
privadas y credenciales de Wompi y AWS: los únicos hallazgos son documentación
que menciona **nombres** de variables. El único archivo `.env*` que ha existido
es `.env.example`.

Lo expuesto es lógica de negocio, no credenciales: la rúbrica de sostenibilidad
con su puntaje por respuesta, la tasa de comisión y las instrucciones de pago.
La tabla de mitigaciones está en `docs/DEPLOY.md`. El atenuante que conviene
tener claro: **el control real de la verificación no es el cuestionario, es la
evidencia** — varias preguntas llevan `requiresEvidence: true` y un admin las
revisa. Que la rúbrica sea pública debilita el autodiagnóstico, no la
verificación, siempre que esa revisión se haga de verdad.

## La lección: la documentación afirmó dos veces un control que no existía

Esto es lo que más vale conservar de este hito.

**Primera vez.** `flujo-git` decía «Los guardarraíles SÍ están activos… `main` y
`staging` están protegidas» y `CLAUDE.md` que el servidor rechaza los commits
directos. Ninguna era cierta: 404 en la protección de ambas ramas, cero rulesets.
La prueba estaba en el propio historial — el commit `f880608`, «PRUEBA: este
commit no debe llegar a staging», está en `staging` **y en `main`**. Era el test
correcto, y su resultado decía justo lo contrario que la documentación.

**Segunda vez, en el sentido opuesto.** El PR #9 reescribió la sección y afirmó
que la política mínima está aplicada, con una tabla que dice «Borrar la rama:
bloqueado». Verificado después del #9: sigue 404. El script está escrito y es
correcto, pero **no se ha corrido**. Es decir: el único control que la política
nueva sí quiere imponer es exactamente el que no está en efecto.

De ahí la regla que queda, y que ya está en la skill:

> **Una skill no afirma que un control externo está activo; da el comando para
> comprobarlo.** El repositorio puede describir su propio código con certeza,
> nunca la configuración de un servicio ajeno.

Una documentación que promete una barrera inexistente es **peor que no tener
documentación**: quien lee «el servidor lo rechaza» deja de tener cuidado.

## Qué quedó pendiente

- [ ] **Correr `scripts/politica-de-ramas.sh`.** Requiere admin (Ivan). Es lo
      único que convierte la política escrita en política real.
- [ ] Activar secret scanning con push protection y Dependabot (Settings →
      Security). Gratis en repos públicos.
- [ ] Las tres mitigaciones de lógica expuesta, en Fase 1.
- [ ] Decidir qué hacer con `f880608`. Está **vacío**, así que revertirlo no
      haría nada y borrarlo exigiría reescribir `main`, que es peor que el ruido.
      Recomendación: dejarlo, y que este hito lo explique — es la evidencia de que
      el test se hizo.
- [ ] Sigue sin haber ni un test. `pricing.ts` y `sustainability.ts` son
      funciones puras y son justo donde vive el dinero y la reputación. Ahora que
      el servidor no bloquea nada, el CI es el único control automático que queda,
      y solo comprueba que compila.

## Qué se rompe si tocas esto

- **`scripts/politica-de-ramas.sh`:** cuando se aplique, hay que quitar el aviso
  de «sin aplicar» de `flujo-git` y de `DEPLOY.md`. El comando de comprobación se
  queda: es lo que evita la tercera vez.
- **`.github/CODEOWNERS`** con la política abierta **no bloquea nada**: solo pide
  la revisión automáticamente. Se le agregaron `src/lib/sustainability.ts` y
  `src/lib/orders.ts`, que la skill ya daba por cubiertos y no estaban.
- **El CI no impide mergear.** Lo único que corta hoy es el hook
  `scripts/verificar-antes-de-merge.sh`, y solo frente a un `gh pr merge` de un
  agente — no frente a un merge desde la web.
- **Un PR con conflictos no dispara el CI.** GitHub no puede construir el merge
  commit que el evento `pull_request` necesita, así que no aparece ninguna
  corrida: ni fallida ni pendiente. Si el CI "no corre", revisa
  `gh pr view <n> --json mergeable` antes de buscar el problema en el workflow.

## Verificación

```bash
npm run build        # ✓ 9 rutas
npx tsc --noEmit     # ✓
npx eslint .         # ✓
```

Estado de protección comprobado con la API cuatro veces a lo largo de la
revisión: antes de pasar a público, después, después del PR #9, y al reconstruir
esta rama. Las cuatro, 404.
