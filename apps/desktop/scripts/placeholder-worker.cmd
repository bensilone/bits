@echo off
REM Placeholder worker for Windows — replace with RandomX/Nanopool worker.
set DEVICE_ID=%1
set CPU=%2
echo [placeholder-worker] start device=%DEVICE_ID% cpu=%CPU%%%
:loop
echo [placeholder-worker] heartbeat
timeout /t 30 /nobreak >nul
goto loop
