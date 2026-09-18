#!/usr/bin/env bash
# Placeholder worker — sleeps and logs. Replace with pinned RandomX/Nanopool worker.
# Args: device_id cpu_percent
DEVICE_ID="${1:-unknown}"
CPU="${2:-50}"
echo "[placeholder-worker] start device=$DEVICE_ID cpu=$CPU%"
echo "[placeholder-worker] Plug RandomX here: stratum from /v1/work-config, worker=\$DEVICE_ID"
while true; do
  echo "[placeholder-worker] heartbeat $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  sleep 30
done
