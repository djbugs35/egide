#!/bin/sh
# Lance Egide en local : double-clic dans le Finder (macOS) ou ./lancer.command dans un terminal.
# Les modules ES exigent un service HTTP : un fichier ouvert directement (file://) ne les charge pas.
cd "$(dirname "$0")" || exit 1
(sleep 1 && open "http://127.0.0.1:8766") &
# Le Python du projet (installer.command) d'abord : sur un Mac neuf, python3 n'est qu'un renvoi vers les outils Xcode.
PYTHON=python3
[ -x .venv/bin/python ] && PYTHON=.venv/bin/python
exec "$PYTHON" outils/serveur_local.py 8766
