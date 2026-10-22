@echo off
rem Folla Immobiliere : double-cliquez sur ce fichier pour demarrer l'application.
rem Il installe ce qui manque, prepare l'interface, demarre le serveur et ouvre le navigateur.
setlocal
cd /d "%~dp0"
title Folla Immobiliere

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js n'est pas installe. Installez-le depuis https://nodejs.org puis relancez ce fichier.
  pause
  exit /b 1
)

rem Premier demarrage : reprendre le fichier de reglages (.env) d'une ancienne installation.
if not exist "server\.env" call :importer_reglages

if not exist "server\node_modules" set FORCER=1
if not exist "client\node_modules" set FORCER=1
if "%~1"=="--mise-a-jour" set FORCER=1

if defined FORCER (
  echo Installation des composants, patientez...
  call npm run install:all
  if errorlevel 1 goto erreur
)
if defined FORCER goto construire
if exist "client\dist\index.html" goto lancer
:construire
echo Preparation de l'interface...
call npm run build
if errorlevel 1 goto erreur

:lancer
echo.
echo Folla Immobiliere demarre sur http://localhost:3001
echo Laissez cette fenetre ouverte. Pour arreter l'application, fermez-la.
echo.
start "" /min powershell -NoProfile -Command "Start-Sleep -Seconds 4; Start-Process 'http://localhost:3001'"
call npm start
echo.
echo L'application s'est arretee.
pause
exit /b 0

:erreur
echo.
echo Une erreur s'est produite (voir les messages ci-dessus).
pause
exit /b 1

:importer_reglages
for %%D in ("%USERPROFILE%\OneDrive\Desktop\immo-stock-main" "%USERPROFILE%\OneDrive\Bureau\immo-stock-main" "%USERPROFILE%\Desktop\immo-stock-main" "C:\immo-stock") do (
  if exist "%%~D\server\.env" if /i not "%%~fD\"=="%~dp0" (
    echo Reglages trouves dans une ancienne installation : %%~D
    choice /c ON /m "Les reprendre (email, base de donnees...) ? O = oui, N = non"
    if not errorlevel 2 (
      copy /y "%%~D\server\.env" "server\.env" >nul
      echo Reglages repris.
    )
    goto :eof
  )
)
goto :eof
