#!/usr/bin/env bash
# Build, push, and deploy Sparks API to Cloud Run (Cloud SQL + Secret Manager).
# Usage (from repo root or any cwd):
#   PROJECT=my-proj REGION=us-central1 SERVICE=sparks-api \
#   SQL_CONNECTION=my-proj:us-central1:sparks-pg \
#   ./deploy/gcp/deploy-api.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

PROJECT="${PROJECT:?Set PROJECT}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-sparks-api}"
REPO="${REPO:-sparks}"
SQL_CONNECTION="${SQL_CONNECTION:?Set SQL_CONNECTION (project:region:instance)}"
TAG="${TAG:-$(git rev-parse --short HEAD 2>/dev/null || echo latest)}"
IMAGE="${IMAGE:-${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/api:${TAG}}"
LATEST="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/api:latest"
MEMORY="${MEMORY:-512Mi}"
CPU="${CPU:-1}"
MAX_INSTANCES="${MAX_INSTANCES:-3}"
MIN_INSTANCES="${MIN_INSTANCES:-0}"
TIMEOUT="${TIMEOUT:-300}"

echo "==> Project=$PROJECT Region=$REGION Service=$SERVICE"
echo "==> Image=$IMAGE"
echo "==> Cloud SQL=$SQL_CONNECTION"

gcloud config set project "$PROJECT" >/dev/null

if [[ "${USE_CLOUD_BUILD:-1}" == "1" ]] || ! command -v docker >/dev/null 2>&1; then
  if [[ "${USE_CLOUD_BUILD:-1}" == "1" ]] || ! command -v docker >/dev/null 2>&1; then
  echo "==> Building+pushing via Cloud Build (no local Docker required)"
  gcloud builds submit --project="$PROJECT" \
    --config=deploy/gcp/cloudbuild-api.yaml \
    --substitutions=_IMAGE="$IMAGE",_LATEST="$LATEST" \
    .
else
  echo "==> Building API image locally (context=repo root)"
  docker build -f apps/api/Dockerfile -t "$IMAGE" -t "$LATEST" .
  echo "==> Pushing"
  docker push "$IMAGE"
  docker push "$LATEST"
fi

# Secret Manager refs (secret name == env var name)
SECRETS=(
  "DATABASE_URL=DATABASE_URL:latest"
  "JWT_SECRET=JWT_SECRET:latest"
  "SESSION_SECRET=SESSION_SECRET:latest"
  "ADMIN_USER=ADMIN_USER:latest"
  "ADMIN_PASS=ADMIN_PASS:latest"
  "ADMIN_USER_2=ADMIN_USER_2:latest"
  "ADMIN_PASS_2=ADMIN_PASS_2:latest"
  "XMR_TREASURY_ADDRESS=XMR_TREASURY_ADDRESS:latest"
  "INTERNAL_POLL_SECRET=INTERNAL_POLL_SECRET:latest"
  "CORS_ORIGIN=CORS_ORIGIN:latest"
)
SECRET_FLAGS=()
for pair in "${SECRETS[@]}"; do
  SECRET_FLAGS+=(--set-secrets="$pair")
done

echo "==> Deploying Cloud Run service $SERVICE"
gcloud run deploy "$SERVICE" \
  --image="$IMAGE" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --port=8787 \
  --memory="$MEMORY" \
  --cpu="$CPU" \
  --timeout="$TIMEOUT" \
  --min-instances="$MIN_INSTANCES" \
  --max-instances="$MAX_INSTANCES" \
  --add-cloudsql-instances="$SQL_CONNECTION" \
  --set-env-vars="NODE_ENV=production" \
  "${SECRET_FLAGS[@]}"

API_URL="$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')"
echo ""
echo "==> Deployed: $API_URL"
echo "    Health:      curl -sS $API_URL/health"
echo "    Work config: curl -sS $API_URL/v1/work-config"
echo "    Scheduler:   POST $API_URL/v1/internal/poll-nanopool"
echo "                 Header: X-Sparks-Poll-Secret: \$INTERNAL_POLL_SECRET"
