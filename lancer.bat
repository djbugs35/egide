@echo off
rem Lance Egide en local (Windows) : double-clic.
cd /d "%~dp0"
start "" http://127.0.0.1:8766
set PYTHON=python
if exist .venv\Scripts\python.exe set PYTHON=.venv\Scripts\python.exe
%PYTHON% -m http.server 8766 --bind 127.0.0.1
