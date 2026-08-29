@echo off
cd /d "C:\Users\Xerxus\Documents\Lawmind"
REM  NEW1 worker truth. Derives the coarse walk's liveness from the single-writer
REM  GPU lock, the runner log and the durable row count, then heartbeats
REM  HEAVY_BOX only while the worker is provably alive. It exists because the
REM  lease used to track the AGENT SESSION's pid, so the bus said the box was
REM  free for eleven hours on 29 Aug while the walk was at 100% GPU.
REM
REM  THE FLEET FREEZE. It is honoured here too, but note the asymmetry: under a
REM  freeze the walk does not start, so nothing advances the metric, so the
REM  lease decays on its own. That is the correct behaviour -- a frozen box is
REM  not a held box.
if exist "C:\Users\Xerxus\Documents\Lawmind\services\ingest\.checkpoints\STOP" (
  echo [%DATE% %TIME%] PAUSED by services/ingest/.checkpoints/STOP -- not starting >> "C:\Users\Xerxus\Documents\Lawmind\.agents\logs\new1-worker-truth.task.log"
  exit /b 0
)
"C:\Program Files\nodejs\node.exe" services\harness\src\worker-truth.mjs >> "C:\Users\Xerxus\Documents\Lawmind\.agents\logs\new1-worker-truth.task.log" 2>&1
