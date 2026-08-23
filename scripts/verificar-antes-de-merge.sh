#!/usr/bin/env bash
#
# Hook PreToolUse: se ejecuta antes de cualquier `gh pr merge` que corra un
# agente, y lo BLOQUEA si el CI de ese PR no está en verde.
#
# Existe porque una regla de permisos en .claude/settings.json es incondicional:
# autoriza el comando siempre, sin mirar qué se está mergeando. La condición
# "solo si no rompe el código ni el deploy" no se puede escribir ahí. Aquí sí.
#
# Lo que comprueba (automático):
#   - Que todos los checks del PR estén en verde: `verificar`, `secretos` y Vercel.
#
# Lo que NO comprueba, y sigue siendo responsabilidad de quien mergea:
#   - Que el cambio haga lo que dice. Eso es leer el diff.
#   - Los invariantes de dinero y permisos. Ver la skill `dominio-regenera`.
#
# Usa `node` y no `jq` a propósito: jq no está instalado en las máquinas del
# equipo, y un hook que falla en silencio es peor que no tener hook.
#
# Entrada: JSON del hook por stdin.
# Salida:  nada y código 0  -> el permiso sigue su curso normal.
#          JSON de denegación -> Claude Code bloquea el comando.
set -uo pipefail

entrada=$(cat)

# El número del PR se extrae del JSON crudo: `gh pr merge 6 --merge` -> 6
pr=$(printf '%s' "$entrada" \
  | grep -oE 'gh[[:space:]]+pr[[:space:]]+merge[[:space:]]+[0-9]+' \
  | grep -oE '[0-9]+$' | head -1)

# Sin número explícito (`gh pr merge` a secas, sobre la rama actual) no hay nada
# que consultar. Se deja pasar al flujo de permisos normal, que preguntará.
[ -z "$pr" ] && exit 0

denegar() {
  RAZON="$1" node -e '
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: process.env.RAZON
      }
    }));
  '
  exit 0
}

command -v gh >/dev/null 2>&1 || \
  denegar "No se pudo verificar el PR #${pr}: gh no está instalado. Merge bloqueado por precaución."

command -v node >/dev/null 2>&1 || exit 0  # sin node no hay forma de responder

# gh pr checks: 0 = todo en verde · 8 = hay checks pendientes · otro = alguno falló
salida=$(gh pr checks "$pr" 2>&1)
codigo=$?

case $codigo in
  0) exit 0 ;;
  8) denegar "El PR #${pr} tiene checks PENDIENTES. Espera a que el CI termine antes de mergear.

${salida}" ;;
  *) denegar "El PR #${pr} tiene checks EN ROJO. No se mergea algo que rompe el código o el deploy.

${salida}" ;;
esac
