#!/usr/bin/env bash
# Placeholder worker — sleeps and logs. Replace with pinned RandomX/Nanopool worker.
# Args: device_id cpu_percent
#
# Nanopool stratum (from GET /v1/work-config):
#   pool:  xmr-us-east1.nanopool.org:10343  (TLS)
#   user:  {wallet}.{worker}  where worker = device_id (UUID)
#   pass:  x
#   algo:  rx/0
DEVICE_ID="${1:-unknown}"
CPU="${2:-50}"
echo "[placeholder-worker] start device=$DEVICE_ID cpu=$CPU%"
echo "[placeholder-worker] Plug RandomX here: stratum user={wallet}.$DEVICE_ID from /v1/work-config"
while true; do
  echo "[placeholder-worker] heartbeat $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  sleep 30
done
