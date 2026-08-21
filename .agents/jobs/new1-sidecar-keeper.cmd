@echo off
cd /d "C:\Users\Xerxus\Documents\Lawmind"
node services\harness\src\sidecar-keeper.mjs >> "C:\Users\Xerxus\Documents\Lawmind\.agents\logs\new1-sidecar-keeper.task.log" 2>&1
