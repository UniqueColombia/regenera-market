#!/usr/bin/env bash
#
# Aplica la política de ramas de Seregenera. Idempotente.
# Requiere permiso de admin sobre el repositorio — hoy solo Ivan.
#
#   bash scripts/politica-de-ramas.sh
#
# ─── La política, en una frase ──────────────────────────────────────────────
#
#   Ivan y Jesús pueden hacer cualquier modificación en cualquier rama.
#   Nadie más puede empujar nada.
#
# ─── Por qué esto NO es una contradicción ───────────────────────────────────
#
# Porque quién puede empujar NO lo decide la protección de rama: lo decide la
# lista de colaboradores del repositorio.
#
#   gh api repos/UniqueColombia/regenera-market/collaborators \
#     --jq '.[] | "\(.login) \(.role_name)"'
#
#   UniqueColombia  admin
#   seiler18        write
#
# Esos dos, y nadie más. Que el repositorio sea PÚBLICO significa que cualquiera
# puede leerlo y abrir un PR desde SU PROPIO fork — nunca empujar al nuestro. Un
# PR de un fork no toca ninguna rama hasta que uno de los dos lo mergea.
#
# Consecuencia que conviene tener clara: la protección de rama jamás estuvo
# defendiendo el repositorio de terceros. Lo único que hacía era estorbarnos a
# nosotros dos. Por eso queda reducida al mínimo.
#
# ─── Lo que SÍ queda bloqueado, y por qué ───────────────────────────────────
#
# Solo el borrado de `main` y `staging`. Borrar una rama no es "modificarla":
# es hacerla desaparecer, y no hay ninguna razón para que eso ocurra por
# accidente. Todo lo demás está abierto.
#
# `git push --force` queda PERMITIDO en el servidor para que ustedes dos puedan
# rehacer historia si hace falta, pero sigue prohibido para los agentes en
# `.claude/settings.json` y en la skill `flujo-git`. La distinción es
# deliberada: la persona decide, el agente no reescribe historia compartida.
#
set -euo pipefail
REPO="${1:-UniqueColombia/regenera-market}"

for rama in main staging; do
  gh api --method PUT "repos/$REPO/branches/$rama/protection" --input - >/dev/null <<'JSON'
{
  "required_status_checks": null,
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": true,
  "allow_deletions": false
}
JSON
  echo "  $rama: push directo libre · sin revisión · sin PR obligatorio · borrado bloqueado"
done

echo
echo "Quién puede empujar (esto es lo que realmente controla el acceso):"
gh api "repos/$REPO/collaborators" --jq '.[] | "  \(.login)  \(.role_name)"'
