#!/usr/bin/env bash
# Provision a fresh Railway instance for one ProposalIQ tenant.
#
# Prereqs (manual, in Railway dashboard):
#   1. Create the service from the GitHub repo (auto-deploy on push to main)
#   2. Attach a 500MB volume mounted at /app/data
#   3. Add the custom subdomain (e.g. rupert.proposal-insights.com)
#   4. Run `railway link` once locally to bind this terminal to the service
#
# Then run:
#   ./scripts/provision-instance.sh <serviceLabel> <adminEmail> [memberEmail]
#
# Example:
#   ./scripts/provision-instance.sh proposaliq-rupert rupertlescott@hotmail.com rupert.lescott@gmail.com
#
# What this does:
#   - Generates a strong JWT_SECRET unique to this instance
#   - Generates random passwords for the admin (and optional member)
#   - Sets all required env vars on the linked Railway service
#   - Triggers a redeploy and waits for SUCCESS
#   - SSHes in to seed the user(s) into the per-instance SQLite db
#   - Prints the login credentials at the end (capture these — not stored)
#
# Shared API keys (OPENAI_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY) are
# read from the local environment and copied onto the service. Set them in
# your shell before running, or export them from a .env you source manually.

set -euo pipefail

LABEL="${1:-}"
ADMIN_EMAIL="${2:-}"
MEMBER_EMAIL="${3:-}"

if [[ -z "$LABEL" || -z "$ADMIN_EMAIL" ]]; then
  echo "Usage: $0 <serviceLabel> <adminEmail> [memberEmail]" >&2
  exit 1
fi

for key in OPENAI_API_KEY GEMINI_API_KEY ANTHROPIC_API_KEY; do
  if [[ -z "${!key:-}" ]]; then
    echo "ERROR: \$$key not set in your shell — export it before running." >&2
    exit 1
  fi
done

if ! command -v railway >/dev/null 2>&1; then
  echo "ERROR: railway CLI not found. Install: npm i -g @railway/cli" >&2
  exit 1
fi

# Confirm the link points at the right service
echo ">> Confirming Railway link…"
railway status || { echo "Run 'railway link' first to bind this dir to the $LABEL service." >&2; exit 1; }
read -r -p "Is the linked service correct for [$LABEL]? (y/N) " confirm
[[ "$confirm" == "y" || "$confirm" == "Y" ]] || { echo "Aborted."; exit 1; }

gen_secret() { node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"; }
gen_password() { node -e "console.log(require('crypto').randomBytes(12).toString('base64url'))"; }

JWT_SECRET="$(gen_secret)"
ADMIN_PASS="$(gen_password)"
MEMBER_PASS=""
if [[ -n "$MEMBER_EMAIL" ]]; then
  MEMBER_PASS="$(gen_password)"
fi

echo ">> Setting env vars on service…"
railway variables \
  --set "NODE_ENV=production" \
  --set "JWT_SECRET=$JWT_SECRET" \
  --set "OPENAI_API_KEY=$OPENAI_API_KEY" \
  --set "GEMINI_API_KEY=$GEMINI_API_KEY" \
  --set "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY" \
  >/dev/null

echo ">> Triggering redeploy…"
railway redeploy --yes >/dev/null || railway up --detach >/dev/null

echo ">> Waiting for deployment SUCCESS (this can take a few minutes)…"
for i in $(seq 1 60); do
  status="$(railway status --json 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);console.log(j?.deployments?.[0]?.status||j?.latestDeployment?.status||'UNKNOWN')}catch{console.log('UNKNOWN')}})" || echo UNKNOWN)"
  echo "   [$i] status=$status"
  if [[ "$status" == "SUCCESS" ]]; then break; fi
  if [[ "$status" == "FAILED" || "$status" == "CRASHED" ]]; then
    echo "ERROR: deploy ended in $status — check Railway logs." >&2
    exit 1
  fi
  sleep 10
done

echo ">> Seeding users via railway ssh…"
SEED_CMD="node scripts/seed-admin.js '$ADMIN_EMAIL' '$ADMIN_PASS'"
if [[ -n "$MEMBER_EMAIL" ]]; then
  SEED_CMD="$SEED_CMD '$MEMBER_EMAIL' '$MEMBER_PASS'"
fi
railway ssh "$SEED_CMD"

cat <<EOF

============================================================
 Provisioned: $LABEL
============================================================
 Admin:  $ADMIN_EMAIL
 Pass:   $ADMIN_PASS
EOF
if [[ -n "$MEMBER_EMAIL" ]]; then
cat <<EOF
 Member: $MEMBER_EMAIL
 Pass:   $MEMBER_PASS
EOF
fi
cat <<EOF
============================================================
 Capture these credentials now — they are not stored anywhere.
 JWT_SECRET is set on the service; rotate via 'railway variables'.
============================================================
EOF
