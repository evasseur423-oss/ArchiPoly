@echo off
chcp 65001 >nul
title ArchPhysics Studio
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] Node.js est introuvable. Installez-le depuis https://nodejs.org puis relancez ce script.
  pause
  exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo Installation des dependances ^(premier lancement^)...
  call npm.cmd install --no-audit --no-fund
  if errorlevel 1 (
    echo [ERREUR] L'installation des dependances a echoue.
    pause
    exit /b 1
  )
)

start "" "node_modules\electron\dist\electron.exe" .
exit /b 0
