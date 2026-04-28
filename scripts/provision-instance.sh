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

# API keys: prefer values from the local shell; fall back to whatever is
# already set on the linked Railway service (the common case when the
# service was created via "Duplicate Service" so keys carried over).
service_vars_json="$(railway variables --json 2>/dev/null || echo '{}')"
read_service_var() {
  printf '%s' "$service_vars_json" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);process.stdout.write(j['$1']||'')}catch{process.stdout.write('')}});"
}

for key in OPENAI_API_KEY GEMINI_API_KEY ANTHROPIC_API_KEY; do
  if [[ -z "${!key:-}" ]]; then
    existing="$(read_service_var "$key")"
    if [[ -n "$existing" ]]; then
      export "$key=$existing"
      echo "   (using existing $key from linked service)"
    else
      echo "ERROR: \$$key not in shell and not on linked service — export it before running." >&2
      exit 1
    fi
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

echo ">> Waiting for deployment to come online (the seed step retries until it succeeds)…"
sleep 60

echo ">> Seeding users via railway ssh (with retries)…"
SEED_CMD="node scripts/seed-admin.js '$ADMIN_EMAIL' '$ADMIN_PASS'"
if [[ -n "$MEMBER_EMAIL" ]]; then
  SEED_CMD="$SEED_CMD '$MEMBER_EMAIL' '$MEMBER_PASS'"
fi

# Retry: deploys can take up to ~5min and the first SSH connection on a
# new Mac may drop while the host key is being negotiated. seed-admin.js
# is idempotent (skips users that exist) so retrying is safe.
seeded=0
for attempt in 1 2 3 4 5 6; do
  echo "   attempt $attempt/6…"
  if railway ssh "$SEED_CMD"; then
    seeded=1
    break
  fi
  echo "   (failed; waiting 30s before retry)"
  sleep 30
done

if [[ "$seeded" -ne 1 ]]; then
  echo "ERROR: railway ssh failed after 6 attempts. Check the Railway dashboard for deploy status, then run manually:" >&2
  echo "  railway ssh \"$SEED_CMD\"" >&2
  exit 1
fi

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
