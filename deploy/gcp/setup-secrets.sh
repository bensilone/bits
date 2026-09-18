#!/usr/bin/env bash
# Interactive Secret Manager setup for Sparks. Values never printed after entry.
set -euo pipefail
PROJECT="${PROJECT:-spark-509022}"
SQL_CONNECTION="${SQL_CONNECTION:-spark-509022:us-central1:sparks-pg}"
DB_USER="${DB_USER:-sparks}"
DB_NAME="${DB_NAME:-sparks}"
gcloud config set project "$PROJECT" >/dev/null

create_secret() {
  local name="$1"
  local value="$2"
  if gcloud secrets describe "$name" --project="$PROJECT" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --project="$PROJECT" --data-file=-
  else
    printf '%s' "$value" | gcloud secrets create "$name" --project="$PROJECT" --data-file=-
  fi
  echo "  ok: $name"
}

echo "Project=$PROJECT"
echo "Enter the Cloud SQL password for user '$DB_USER' (input hidden):"
read -rs DB_PASS
echo
# URL-encode password minimally for DATABASE_URL (never print)
DATABASE_URL="$(python3 - "$DB_PASS" "$DB_USER" "$DB_NAME" "$SQL_CONNECTION" <<'PY'
import sys, urllib.parse
pw, user, db, conn = sys.argv[1:5]
enc = urllib.parse.quote(pw, safe="")
print(f"postgres://{user}:{enc}@/{db}?host=/cloudsql/{conn}")
PY
)"

JWT_SECRET="$(openssl rand -hex 32)"
SESSION_SECRET="$(openssl rand -hex 32)"
INTERNAL_POLL_SECRET="$(openssl rand -hex 32)"

echo "Admin username [admin]:"
read -r ADMIN_USER
ADMIN_USER=${ADMIN_USER:-admin}
echo "Admin password (hidden):"
read -rs ADMIN_PASS
echo
echo "Backup admin username [admin2]:"
read -r ADMIN_USER_2
ADMIN_USER_2=${ADMIN_USER_2:-admin2}
echo "Backup admin password (hidden):"
read -rs ADMIN_PASS_2
echo

XMR_TREASURY_ADDRESS="${XMR_TREASURY_ADDRESS:-45SKqCpVYCDLHdaHk9gDwL6BNxTyd6x1xPs5jciterQTZJaFpYKtMcoKmGWkERgbX79BpWNmXVA3BQv9t21DbUgXVW3kV4J}"
CORS_ORIGIN="${CORS_ORIGIN:-https://winbitcoin.app,https://www.winbitcoin.app,tauri://localhost,http://tauri.localhost,https://tauri.localhost,http://127.0.0.1:1420,http://localhost:1420}"

echo "Writing secrets to Secret Manager..."
create_secret DATABASE_URL "$DATABASE_URL"
create_secret JWT_SECRET "$JWT_SECRET"
create_secret SESSION_SECRET "$SESSION_SECRET"
create_secret INTERNAL_POLL_SECRET "$INTERNAL_POLL_SECRET"
create_secret ADMIN_USER "$ADMIN_USER"
create_secret ADMIN_PASS "$ADMIN_PASS"
create_secret ADMIN_USER_2 "$ADMIN_USER_2"
create_secret ADMIN_PASS_2 "$ADMIN_PASS_2"
create_secret XMR_TREASURY_ADDRESS "$XMR_TREASURY_ADDRESS"
create_secret CORS_ORIGIN "$CORS_ORIGIN"
echo "Done. INTERNAL_POLL_SECRET was generated — retrieve later with:"
echo "  gcloud secrets versions access latest --secret=INTERNAL_POLL_SECRET --project=$PROJECT"
