@echo off
rem Installe ce qu il faut pour Egide, puis verifie le resultat (Windows) : double-clic.
rem   installer.bat --complet   lance aussi toutes les suites de tests a la fin
rem   set EGIDE_LANGUE=fr       messages en francais (anglais par defaut)
rem Ne reinstalle pas ce qui est deja la ; on peut le relancer sans risque.
setlocal
chcp 65001 >nul
cd /d "%~dp0"

rem winget ne met pas a jour le PATH de la fenetre deja ouverte : on y ajoute les dossiers ou il installe.
set "PATH=%PATH%;%ProgramFiles%\nodejs;%LOCALAPPDATA%\Microsoft\WinGet\Links;%USERPROFILE%\.local\bin"

where winget >nul 2>&1
if errorlevel 1 (
  if "%EGIDE_LANGUE%"=="fr" (echo winget est absent : installer "App Installer" depuis le Microsoft Store, puis relancer.) else (echo winget is missing: install "App Installer" from the Microsoft Store, then run again.)
  goto verifier
)

where node >nul 2>&1 || winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
where uv >nul 2>&1 || winget install -e --id astral-sh.uv --accept-source-agreements --accept-package-agreements
where godot >nul 2>&1 || winget install -e --id GodotEngine.GodotEngine --accept-source-agreements --accept-package-agreements

:verifier
where uv >nul 2>&1 && uv sync
where node >nul 2>&1
if errorlevel 1 (
  if "%EGIDE_LANGUE%"=="fr" (echo Node.js est introuvable : verification impossible.) else (echo Node.js not found: cannot check.)
  pause
  exit /b 1
)
call node outils\indexer.js
echo.
call node outils\verifier_installation.js %*
set ETAT=%ERRORLEVEL%
pause
exit /b %ETAT%
