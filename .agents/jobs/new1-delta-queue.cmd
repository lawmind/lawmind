@echo off
cd /d "C:\Users\Xerxus\Documents\Lawmind"
REM  THE FLEET FREEZE. services\ingest\.checkpoints\STOP is written by
REM  elease:candidate pause and by scripts\fleet-stop.ps1, and every writer in
REM  this repo is expected to cross it. Checked on EVERY fire, because a
REM  repeating trigger means "every n minutes" is also "every n minutes during a
REM  freeze".
if exist "C:\Users\Xerxus\Documents\Lawmind\services\ingest\.checkpoints\STOP" (
  echo [%DATE% %TIME%] PAUSED by services/ingest/.checkpoints/STOP -- not starting >> "C:\Users\Xerxus\Documents\Lawmind\.agents\logs\new1-delta-queue.task.log"
  exit /b 0
)
node services\harness\src\delta-queue.mjs >> "C:\Users\Xerxus\Documents\Lawmind\.agents\logs\new1-delta-queue.task.log" 2>&1
