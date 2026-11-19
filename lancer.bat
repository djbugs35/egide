@echo off
rem Lance Egide en local (Windows) : double-clic.
cd /d "%~dp0"
rem set EGIDE_LANGUE=fr avant : la page s ouvre en francais.
if "%EGIDE_LANGUE%"=="" (start "" http://127.0.0.1:8766) else (start "" "http://127.0.0.1:8766/?lang=%EGIDE_LANGUE%")
set PYTHON=python
if exist .venv\Scripts\python.exe set PYTHON=.venv\Scripts\python.exe
%PYTHON% outils\serveur_local.py 8766
