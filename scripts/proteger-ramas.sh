#!/usr/bin/env bash
#
# Protege `main` y `staging` en GitHub. Idempotente: se puede volver a correr
# para ajustar. Requiere permiso de admin sobre el repositorio — hoy solo Ivan.
#
#   bash scripts/proteger-ramas.sh
#
# ─── Quién puede empujar ────────────────────────────────────────────────────
#
# Esto NO lo decide la protección de rama, lo decide la lista de colaboradores:
#
#   gh api repos/UniqueColombia/regenera-market/collaborators \
#     --jq '.[] | "\(.login) \(.role_name)"'
#
# Hoy son dos: UniqueColombia (admin) y seiler18 (write). Que el repositorio sea
# público significa que cualquiera puede LEER y abrir un PR desde un fork; no
# que pueda empujar. Para empujar hay que estar en esa lista.
#
# Limitar quién puede mergear una rama protegida (`restrictions` en la API) solo
# existe en repos de organización. Este es de una cuenta personal, así que ese
# campo va en null obligatoriamente.
#
set -euo pipefail
REPO="${1:-UniqueColombia/regenera-market}"

echo "Protegiendo $REPO"

# ─── main: PRODUCCIÓN ───────────────────────────────────────────────────────
#
# enforce_admins=false a propósito, y no es pereza: Ivan es el único Code Owner.
# Si se exige revisión de Code Owner y el autor del PR ES ese Code Owner, GitHub
# no puede pedirle revisión a sí mismo y el PR queda bloqueado para siempre. Con
# enforce_admins=false, Ivan conserva el bypass de admin para ese caso; Jesús no
# lo tiene, así que sus PRs a main sí requieren la revisión.
#
# strict=true: la rama debe estar al día con main antes de mergear.
gh api --method PUT "repos/$REPO/branches/main/protection" --input - >/dev/null <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["verificar", "secretos"] },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "require_code_owner_reviews": true,
    "dismiss_stale_reviews": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true,
  "required_linear_history": false,
  "lock_branch": false,
  "allow_fork_syncing": false
}
JSON
echo "  main      PR obligatorio · CI verde · revisión de Code Owner · sin force push ni borrado"

# ─── staging: INTEGRACIÓN ───────────────────────────────────────────────────
#
# Exige PR y CI verde, nada más: cero aprobaciones y sin Code Owners, para que
# Jesús pueda integrar sin esperar a nadie. strict=false para no obligar a
# rebasear cada vez que la rama se mueve.
gh api --method PUT "repos/$REPO/branches/staging/protection" --input - >/dev/null <<'JSON'
{
  "required_status_checks": { "strict": false, "contexts": ["verificar", "secretos"] },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "require_code_owner_reviews": false,
    "dismiss_stale_reviews": false
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": false
}
JSON
echo "  staging   PR obligatorio · CI verde · sin aprobaciones · sin force push ni borrado"

echo
echo "Estado:"
for rama in main staging; do
  gh api "repos/$REPO/branches/$rama/protection" \
    --jq "\"  $rama: checks=\(.required_status_checks.contexts | join(\",\")) codeowners=\(.required_pull_request_reviews.require_code_owner_reviews) force_push=\(.allow_force_pushes.enabled) borrado=\(.allow_deletions.enabled)\""
done
