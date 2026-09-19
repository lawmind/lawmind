@echo off
REM ===========================================================================
REM  DOES CUDA REACH SESSION 0? — the one question that decides whether
REM  Lawmind-new1-delta-queue may move from LogonType Interactive to S4U.
REM
REM  Full reasoning and the exact registration/teardown commands:
REM    docs/ops/DELTA_QUEUE_S4U_PROOF.md
REM    docs/FOUNDER_QUEUE.md  FQ-SHIP-R0X-1
REM
REM  ---------------------------------------------------------------------------
REM  WHY THIS EXISTS RATHER THAN JUST FLIPPING THE PRINCIPAL
REM  ---------------------------------------------------------------------------
REM  docs/ops/JOB_TABLE.md states the Interactive principal is DELIBERATE, so that
REM  CUDA is available in a signed-in session. If that is true, an S4U delta queue
REM  fires on schedule, finds no GPU, and embeds nothing — a task that looks alive
REM  while producing zero vectors, which is worse than the honest hole it replaced.
REM  So the claim is measured before the production task is touched.
REM
REM  ---------------------------------------------------------------------------
REM  WHAT THIS DOES AND DOES NOT DO
REM  ---------------------------------------------------------------------------
REM  DOES      report whoami, the session list, onnxruntime's available providers,
REM            ort.get_device(), and nvidia-smi — to one file under %TEMP%.
REM  DOES NOT  load a model, start the sidecar, open a database connection, read or
REM            write the corpus, touch any Lawmind scheduled task, or import
REM            anything from this repo. It is safe to run at any time, including
REM            mid-pass, and it cannot become a second GPU writer.
REM
REM  Run it ONLY through a throwaway task whose trigger is a year out, started by
REM  hand — never on a repetition, and never as a Lawmind-* task. Unregister it
REM  when the answer is in.
REM
REM  SIDECAR_PYTHON is pinned to the same interpreter .agents/jobs/new1-delta-queue.cmd
REM  pins, and for the same reason: a scheduled task inherits a different PATH from
REM  an interactive shell, and the bare `python` launcher resolved to an environment
REM  with no CUDAExecutionProvider after the 14 Sep reboot. Probing the wrong
REM  interpreter would answer a question nobody asked.
REM ===========================================================================
setlocal
set "PROBE_PYTHON=C:\Python314\python.exe"
set "OUT=%TEMP%\lawmind-s4u-cuda-probe.txt"

echo ==== S4U CUDA PROBE %DATE% %TIME% ==== > "%OUT%"
echo. >> "%OUT%"

echo --- identity (expect the same user; session 0 for S4U) --- >> "%OUT%"
whoami >> "%OUT%" 2>&1
echo. >> "%OUT%"
echo --- sessions --- >> "%OUT%"
query session >> "%OUT%" 2>&1
echo. >> "%OUT%"

echo --- interpreter --- >> "%OUT%"
echo PROBE_PYTHON=%PROBE_PYTHON% >> "%OUT%"
if not exist "%PROBE_PYTHON%" (
  echo FAIL: pinned interpreter not found. This is NOT a CUDA answer -- fix the >> "%OUT%"
  echo       path first, then re-run. >> "%OUT%"
  goto :done
)

echo. >> "%OUT%"
echo --- onnxruntime providers: THE ANSWER --- >> "%OUT%"
echo     CUDAExecutionProvider present -> S4U is safe, principal is merely stale >> "%OUT%"
echo     CUDAExecutionProvider absent  -> leave the task Interactive; the fix is a >> "%OUT%"
echo                                      GPU-capable service account or host >> "%OUT%"
"%PROBE_PYTHON%" -c "import onnxruntime as ort; print('ort_version', ort.__version__); print('get_device', ort.get_device()); ps=ort.get_available_providers(); print('providers', ps); print('VERDICT', 'CUDA_AVAILABLE_IN_THIS_SESSION' if 'CUDAExecutionProvider' in ps else 'NO_CUDA_IN_THIS_SESSION')" >> "%OUT%" 2>&1
echo python_rc=%ERRORLEVEL% >> "%OUT%"

echo. >> "%OUT%"
echo --- driver visibility (a provider can be listed while the device is not usable) --- >> "%OUT%"
nvidia-smi --query-gpu=name,memory.total,memory.used,driver_version --format=csv >> "%OUT%" 2>&1
echo nvidia_smi_rc=%ERRORLEVEL% >> "%OUT%"

:done
echo. >> "%OUT%"
echo ==== END ==== >> "%OUT%"
type "%OUT%"
exit /b 0
