#!/usr/bin/env bash
# Reset Cloud SQL app password and refresh DATABASE_URL in Secret Manager.
# Passwords stay in this terminal — never paste them into chat.
set -euo pipefail
PROJECT="${PROJECT:-spark-509022}"
SQL_INSTANCE="${SQL_INSTANCE:-sparks-pg}"
SQL_CONNECTION="${SQL_CONNECTION:-spark-509022:us-central1:sparks-pg}"
DB_USER="${DB_USER:-sparks}"
DB_NAME="${DB_NAME:-sparks}"

gcloud config set project "$PROJECT" >/dev/null

echo "Enter a NEW password for Cloud SQL user '$DB_USER' (hidden):"
read -rs DB_PASS
echo
echo "Confirm password:"
read -rs DB_PASS2
echo
if [[ "$DB_PASS" != "$DB_PASS2" ]]; then
  echo "Passwords do not match." >&2
  exit 1
fi
if [[ -z "$DB_PASS" ]]; then
  echo "Password cannot be empty." >&2
  exit 1
fi

echo "==> Setting Cloud SQL password for $DB_USER on $SQL_INSTANCE"
gcloud sql users set-password "$DB_USER" \
  --instance="$SQL_INSTANCE" \
  --project="$PROJECT" \
  --password="$DB_PASS"

DATABASE_URL="$(python3 - "$DB_PASS" "$DB_USER" "$DB_NAME" "$SQL_CONNECTION" <<'PY'
import sys, urllib.parse
pw, user, db, conn = sys.argv[1:5]
enc = urllib.parse.quote(pw, safe="")
print(f"postgres://{user}:{enc}@/{db}?host=/cloudsql/{conn}")
PY
)"

echo "==> Updating Secret Manager DATABASE_URL"
printf '%s' "$DATABASE_URL" | gcloud secrets versions add DATABASE_URL \
  --project="$PROJECT" --data-file=-

python3 - "$DATABASE_URL" <<'PY'
import sys
u = sys.argv[1]
assert u.startswith("postgres://sparks:") and "@/sparks?host=/cloudsql/" in u, "unexpected URL shape"
print("  ok: DATABASE_URL shape looks right")
PY

echo "Done. Redeploy Cloud Run so the new secret version is picked up if needed."
