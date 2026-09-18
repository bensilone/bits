# Sparks on Google Cloud (no Firebase)

Production stack: **Cloud Run** (API + optional web) + **Cloud SQL Postgres** + **Cloud Scheduler** + **Secret Manager**.

API image: `apps/api/Dockerfile` (build from repo root).  
Web image (optional): `apps/web/Dockerfile` (nginx:alpine serving Vite build).

---

## Prerequisites

- `gcloud` CLI authenticated (`gcloud auth login` / application-default as needed)
- Billing enabled on the GCP project
- Roles: Artifact Registry Admin, Cloud Run Admin, Cloud SQL Admin, Secret Manager Admin, Cloud Scheduler Admin (or Owner)

Set defaults (adjust as needed):

```bash
export PROJECT=your-gcp-project
export REGION=us-central1
export SERVICE=sparks-api
export REPO=sparks
export SQL_INSTANCE=sparks-pg
export DB_NAME=sparks
export DB_USER=sparks
gcloud config set project "$PROJECT"
```

---

## 1. Enable APIs

```bash
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  cloudscheduler.googleapis.com \
  cloudbuild.googleapis.com
```

---

## 2. Artifact Registry

```bash
gcloud artifacts repositories create "$REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --description="Sparks images" \
  || true

gcloud auth configure-docker "${REGION}-docker.pkg.dev"
```

Image URI pattern:

`IMAGE=${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/api:latest`

---

## 3. Cloud SQL Postgres

```bash
# Create instance (private IP optional later; start with public + Cloud Run connector)
gcloud sql instances create "$SQL_INSTANCE" \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region="$REGION" \
  --storage-size=10GB \
  --storage-auto-increase

gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE"

# Set a strong password (do not commit it)
read -s DB_PASS
gcloud sql users create "$DB_USER" --instance="$SQL_INSTANCE" --password="$DB_PASS"
```

**Connection name** (needed by Cloud Run):

```bash
export SQL_CONNECTION=$(gcloud sql instances describe "$SQL_INSTANCE" --format='value(connectionName)')
echo "$SQL_CONNECTION"
# e.g. your-gcp-project:us-central1:sparks-pg
```

**DATABASE_URL** for Cloud Run (Unix socket via Cloud SQL Auth Proxy sidecar):

```text
postgres://sparks:YOUR_PASSWORD@/sparks?host=/cloudsql/PROJECT:REGION:INSTANCE
```

URL-encode special characters in the password.

---

## 4. Secrets (Secret Manager)

Create secrets (values are never committed). Example:

```bash
# Generate secrets
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 32   # SESSION_SECRET
openssl rand -hex 32   # INTERNAL_POLL_SECRET

# DATABASE_URL — see §3
# CORS_ORIGIN — production web + any desktop allowed origins, comma-separated
#   e.g. https://winbitcoin.app,https://www.winbitcoin.app,tauri://localhost,http://tauri.localhost,https://tauri.localhost
# ADMIN_USER / ADMIN_PASS / ADMIN_USER_2 / ADMIN_PASS_2
# XMR_TREASURY_ADDRESS — public Monero receive address

create_secret() {
  local name="$1"
  local value="$2"
  if gcloud secrets describe "$name" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=-
  else
    printf '%s' "$value" | gcloud secrets create "$name" --data-file=-
  fi
}

create_secret DATABASE_URL "$DATABASE_URL"
create_secret JWT_SECRET "$JWT_SECRET"
create_secret SESSION_SECRET "$SESSION_SECRET"
create_secret ADMIN_USER "$ADMIN_USER"
create_secret ADMIN_PASS "$ADMIN_PASS"
create_secret ADMIN_USER_2 "$ADMIN_USER_2"
create_secret ADMIN_PASS_2 "$ADMIN_PASS_2"
create_secret XMR_TREASURY_ADDRESS "$XMR_TREASURY_ADDRESS"
create_secret INTERNAL_POLL_SECRET "$INTERNAL_POLL_SECRET"
create_secret CORS_ORIGIN "$CORS_ORIGIN"
```

Grant the Cloud Run runtime service account access to each secret:

```bash
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

for s in DATABASE_URL JWT_SECRET SESSION_SECRET ADMIN_USER ADMIN_PASS \
         ADMIN_USER_2 ADMIN_PASS_2 XMR_TREASURY_ADDRESS INTERNAL_POLL_SECRET CORS_ORIGIN; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member="serviceAccount:${SA}" \
    --role="roles/secretmanager.secretAccessor"
done
```

---

## 5. Build & push API image

From the **repo root**:

```bash
export IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/api:$(git rev-parse --short HEAD)"
docker build -f apps/api/Dockerfile -t "$IMAGE" -t "${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/api:latest" .
docker push "$IMAGE"
docker push "${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/api:latest"
```

Or use `./deploy/gcp/deploy-api.sh` which builds, pushes, and deploys.

---

## 6. Cloud Run deploy (API)

```bash
./deploy/gcp/deploy-api.sh
# or with overrides:
PROJECT=... REGION=... SERVICE=sparks-api SQL_CONNECTION=project:region:instance \
  ./deploy/gcp/deploy-api.sh
```

The script sets:

- Cloud SQL attachment (`--add-cloudsql-instances`)
- Secrets as env vars from Secret Manager
- `NODE_ENV=production`
- Public HTTP (needed for desktop/web + Scheduler)

Migrations run automatically on API boot.

---

## 7. Verify

```bash
API_URL=$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')
curl -sS "$API_URL/health"
curl -sS "$API_URL/v1/work-config"
```

Expect JSON with `ok: true` on `/health` and work-config fields (treasury, rates, etc.).

---

## 8. Cloud Scheduler → Nanopool poll (every 5 min)

**URL:** `https://YOUR-API-HOST/v1/internal/poll-nanopool`  
**Method:** `POST`  
**Header:** `X-Sparks-Poll-Secret: <same value as INTERNAL_POLL_SECRET>`

```bash
API_URL=$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')

# Store the poll secret value you put in Secret Manager (do not commit)
# INTERNAL_POLL_SECRET=...

gcloud scheduler jobs create http sparks-nanopool-poll \
  --location="$REGION" \
  --schedule="*/5 * * * *" \
  --uri="${API_URL}/v1/internal/poll-nanopool" \
  --http-method=POST \
  --headers="X-Sparks-Poll-Secret=${INTERNAL_POLL_SECRET}" \
  --attempt-deadline=120s \
  || gcloud scheduler jobs update http sparks-nanopool-poll \
       --location="$REGION" \
       --uri="${API_URL}/v1/internal/poll-nanopool" \
       --headers="X-Sparks-Poll-Secret=${INTERNAL_POLL_SECRET}"
```

`/v1/dev/poll-nanopool` is **dev-only** (404 in production). Always use `/v1/internal/poll-nanopool` with the secret header.

Manual test:

```bash
curl -sS -X POST "$API_URL/v1/internal/poll-nanopool" \
  -H "X-Sparks-Poll-Secret: $INTERNAL_POLL_SECRET"
```

---

## 9. (Optional) Web on a second Cloud Run service

Build with production API URL baked into Vite:

```bash
export WEB_IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/web:latest"
docker build -f apps/web/Dockerfile \
  --build-arg "VITE_API_URL=${API_URL}" \
  -t "$WEB_IMAGE" .
docker push "$WEB_IMAGE"

gcloud run deploy sparks-web \
  --image="$WEB_IMAGE" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --memory=256Mi
```

Then set `CORS_ORIGIN` on the API to include the web Cloud Run URL (and custom domain when you add one). Update the `CORS_ORIGIN` secret and redeploy the API.

**Without Docker:** build locally (`VITE_API_URL=... npm run build -w @sparks/web`) and serve `apps/web/dist` with `npx serve -s apps/web/dist -l 8080` or any static host. Prefer the nginx Dockerfile for Cloud Run parity.

Map custom domains in Cloud Run → Manage custom domains (manual console / `gcloud beta run domain-mappings`).

---

## Manual steps still typical in console

- Billing / quota bump for Cloud SQL or Scheduler
- Custom domain + managed SSL for API and web
- Optional: restrict Cloud Run ingress / IAM if you later put a load balancer in front
- Rotate secrets: add new Secret Manager versions, redeploy Cloud Run to pick them up

---

## Env reference (API)

| Variable | Source | Notes |
|----------|--------|--------|
| `DATABASE_URL` | Secret | Cloud SQL socket URL |
| `JWT_SECRET` | Secret | Admin JWT |
| `SESSION_SECRET` | Secret | Cookie signing |
| `ADMIN_*` | Secret | Seeded on boot |
| `XMR_TREASURY_ADDRESS` | Secret | Public XMR address |
| `INTERNAL_POLL_SECRET` | Secret | Scheduler header |
| `CORS_ORIGIN` | Secret | Comma-separated production origins |
| `NODE_ENV` | Deploy | `production` |
| `PORT` | Cloud Run | Injected automatically |
