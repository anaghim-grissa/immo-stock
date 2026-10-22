@echo off
rem Folla Immobiliere : double-cliquez sur ce fichier pour installer la derniere version.
rem Vos reglages (server\.env), vos sauvegardes et vos donnees MongoDB ne sont pas touches.
setlocal
set "APP=%~dp0"
if "%APP:~-1%"=="\" set "APP=%APP:~0,-1%"

rem Ce fichier va etre remplace pendant la mise a jour : on travaille depuis une copie temporaire.
if /i not "%~1"=="--copie" (
  copy /y "%~f0" "%TEMP%\folla-mise-a-jour.bat" >nul
  "%TEMP%\folla-mise-a-jour.bat" --copie "%APP%"
)
set "APP=%~2"
title Mise a jour de Folla Immobiliere
cd /d "%APP%"

echo Arret de l'application si elle est ouverte...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"

echo Telechargement de la derniere version...
set "MAJDIR=%TEMP%\folla-maj"
if exist "%MAJDIR%" rmdir /s /q "%MAJDIR%"
mkdir "%MAJDIR%"
powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol='Tls12'; Invoke-WebRequest 'https://github.com/anaghim-grissa/immo-stock/archive/refs/heads/main.zip' -OutFile '%MAJDIR%\main.zip'; Expand-Archive '%MAJDIR%\main.zip' '%MAJDIR%' -Force"
if not exist "%MAJDIR%\immo-stock-main\package.json" (
  echo Le telechargement a echoue. Verifiez la connexion Internet et reessayez.
  pause
  exit /b 1
)

echo Remplacement des fichiers (server\.env et les sauvegardes sont conserves)...
robocopy "%MAJDIR%\immo-stock-main" "%APP%" /E /XF .env /XD node_modules sauvegardes /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 (
  echo La copie des fichiers a echoue.
  pause
  exit /b 1
)
rmdir /s /q "%MAJDIR%"

echo Mise a jour terminee. Demarrage de la nouvelle version...
call "%APP%\demarrer.bat" --mise-a-jour
exit /b 0
