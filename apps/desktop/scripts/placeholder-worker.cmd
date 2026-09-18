@echo off
REM Placeholder worker for Windows — replace with RandomX/Nanopool worker.
REM Nanopool stratum (from GET /v1/work-config):
REM   pool: xmr-us-east1.nanopool.org:10343 (TLS)
REM   user: {wallet}.{worker} where worker = device_id (UUID)
REM   pass: x
REM   algo: rx/0
set DEVICE_ID=%1
set CPU=%2
echo [placeholder-worker] start device=%DEVICE_ID% cpu=%CPU%%%
echo [placeholder-worker] Plug RandomX here: user=WALLET.DEVICE_ID pool from /v1/work-config
:loop
echo [placeholder-worker] heartbeat
timeout /t 30 /nobreak >nul
goto loop
