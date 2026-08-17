@echo off
REM Lawmind ingest fleet - logon launcher. NEW2, 15 Aug 2026.
REM
REM THE FLEET IS DEFINED IN scripts\start-ingest-fleet.ps1 -- so is all the
REM history: the two defects that killed this fleet on 15 Aug, why each worker
REM now gets its own detached console, and which courts are deliberately
REM absent because they are COMPLETE. Read that file, not this one.
REM
REM THIS FILE MUST STAY PLAIN ASCII WITH NO ANGLE BRACKETS, CARETS OR PARENS.
REM cmd.exe parses redirection and escape characters even on REM lines, so a
REM documentation comment containing an angle bracket or a caret desynchronises
REM the parser and fragments of later lines get executed as commands. That is
REM measured, not theoretical: a richly commented version of this file emitted
REM about thirty "is not recognized as an internal or external command" errors
REM and launched nothing at all. Keep prose in the .ps1, which has no hazard.
REM
REM A COPY LIVES IN THE STARTUP FOLDER. TO DISABLE: delete that copy.
REM TO STOP NOW: taskkill /f /im node.exe
REM
REM THIS LINE DELIBERATELY HAS NO REDIRECT. The .ps1 writes
REM TEMP\lawmind-ingest-boot.log itself. A cmd redirect makes an INHERITABLE
REM handle, the 38 workers inherit it and hold it for weeks, and the next run of
REM this launcher then dies on a locked file before executing a single line.
REM Measured 15 Aug 2026. The reason is written out in full in the .ps1.
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Xerxus\Documents\Lawmind\scripts\start-ingest-fleet.ps1"
