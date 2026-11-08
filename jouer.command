#!/bin/sh
# Joue une partie d'Egide dans Godot : double-clic dans le Finder (macOS) ou ./jouer.command dans un terminal.
# Le serveur de partie s'arrete avec le client. Variable EGIDE_GODOT : chemin d'un Godot non standard.
cd "$(dirname "$0")" || exit 1
GODOT="${EGIDE_GODOT:-godot}"
command -v "$GODOT" >/dev/null 2>&1 || GODOT=/Applications/Godot.app/Contents/MacOS/Godot
if ! command -v "$GODOT" >/dev/null 2>&1; then
  echo "Godot introuvable : lancer ./installer.command, ou donner son chemin par EGIDE_GODOT."
  exit 1
fi
node src/direct.js "$@" &
SERVEUR=$!
trap 'kill "$SERVEUR" 2>/dev/null' EXIT INT TERM
"$GODOT" --path clients/godot -- --direct 8767
