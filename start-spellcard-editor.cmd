@echo off
cd /d "%~dp0"
if not exist "tools\spellcard-editor\node_modules\electron\dist\electron.exe" (
  echo Installing SpellCardEditor desktop dependencies...
  call npm install --prefix tools/spellcard-editor --no-audit --no-fund
  if errorlevel 1 exit /b 1
  call npm --prefix tools/spellcard-editor run setup
  if errorlevel 1 exit /b 1
)
if not exist "build\Release\ts-stg.exe" (
  echo Build the engine with build.ps1 before starting the preview.
  exit /b 1
)
call npm --prefix tools/spellcard-editor start
