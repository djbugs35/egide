@echo off
rem Joue une partie d Egide dans Godot. Fermer la fenetre "Egide serveur" apres la partie.
cd /d "%~dp0"
if "%EGIDE_GODOT%"=="" set EGIDE_GODOT=godot
start "Egide serveur" /min node src\direct.js %*
"%EGIDE_GODOT%" --path clients\godot -- --direct 8767
