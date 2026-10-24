@echo off
setlocal
cd /d "%~dp0"
title 3D Viewer Studio

where node >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] Node.js est introuvable. Installez-le depuis https://nodejs.org puis relancez ce script.
  pause
  exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo Premiere execution : installation d'Electron, veuillez patienter...
  call npm.cmd install --no-audit --no-fund
  if errorlevel 1 (
    echo [ERREUR] L'installation des dependances a echoue.
    pause
    exit /b 1
  )
)

start "" "node_modules\electron\dist\electron.exe" .
endlocal
