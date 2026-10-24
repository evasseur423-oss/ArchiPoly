@echo off
title PBR Alchemist Studio
cd /d "%~dp0"

echo ========================================================
echo        PBR ALCHEMIST STUDIO - DEMARRAGE RAPIDE
echo ========================================================
echo.

if not exist "node_modules" (
    echo [INFO] Premier lancement detecte. Installation des dependances...
    call npm install
    if errorlevel 1 (
        echo [ERREUR] Impossible d'installer les dependances npm.
        pause
        exit /b 1
    )
)

echo [INFO] Lancement de PBR Alchemist Studio...
start "" ".\node_modules\.bin\electron.cmd" .

exit /b 0
