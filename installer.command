#!/bin/sh
# Installe ce qu'il faut pour Égide, puis vérifie le résultat : double-clic dans le Finder (macOS) ou ./installer.command.
#   ./installer.command --oui       # sans question (installe Homebrew s'il manque)
#   ./installer.command --complet   # lance aussi toutes les suites de tests à la fin
#   ./installer.command --langue fr # messages en français (sinon EGIDE_LANGUE, sinon l'anglais)
# Ne réinstalle pas ce qui est déjà là et assez récent ; on peut le relancer sans risque.
cd "$(dirname "$0")" || exit 1

OUI=non
COMPLET=
LANGUE="${EGIDE_LANGUE:-en}"
while [ $# -gt 0 ]; do
  case "$1" in
    --oui) OUI=oui ;;
    --complet) COMPLET=--complet ;;
    --langue) LANGUE="$2"; shift ;;
    --langue=*) LANGUE="${1#--langue=}" ;;
    *) echo "unknown option / option inconnue : $1"; exit 2 ;;
  esac
  shift
done
# Les outils Node lancés plus bas parlent la même langue (jalon 27).
export EGIDE_LANGUE="$LANGUE"

# Écrire le message anglais "$1" ou, en français, "$2".
dire() {
  if [ "$LANGUE" = fr ]; then echo "$2"; else echo "$1"; fi
}

# Un double-clic dans le Finder ne reçoit pas le PATH du terminal : Homebrew doit être cherché à ses deux emplacements.
for brew in /opt/homebrew/bin/brew /usr/local/bin/brew; do
  [ -x "$brew" ] && eval "$("$brew" shellenv)"
done

pause_finale() {
  if [ -t 0 ] && [ "$OUI" = non ]; then
    printf '\n%s ' "$(dire 'Press Enter to close.' 'Appuyer sur Entrée pour fermer.')"
    read -r _
  fi
}

# Rendre vrai si "$1" (a.b…) atteint le majeur $2 et le mineur $3.
version_atteint() {
  majeur=$(echo "$1" | cut -d. -f1)
  mineur=$(echo "$1" | cut -d. -f2)
  [ "${majeur:-0}" -gt "$2" ] || { [ "${majeur:-0}" -eq "$2" ] && [ "${mineur:-0}" -ge "$3" ]; }
}

node_pret() {
  command -v node >/dev/null 2>&1 && version_atteint "$(node -p 'process.versions.node')" 22 0
}

godot_pret() {
  command -v godot >/dev/null 2>&1 && version_atteint "$(godot --headless --version 2>/dev/null | tail -1)" 4 4
}

installer_homebrew() {
  command -v brew >/dev/null 2>&1 && return 0
  if [ "$OUI" = non ]; then
    printf '%s ' "$(dire 'Homebrew, the macOS package manager, is missing. It will ask for your password. Install it? [y/N]' 'Homebrew, le gestionnaire de paquets de macOS, est absent. Il demandera votre mot de passe. L installer ? [o/N]')"
    read -r reponse
    case "$reponse" in y|Y|yes|o|O|oui) ;; *) return 1 ;; esac
  fi
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" || return 1
  for brew in /opt/homebrew/bin/brew /usr/local/bin/brew; do
    [ -x "$brew" ] && eval "$("$brew" shellenv)"
  done
  command -v brew >/dev/null 2>&1
}

# Installer le paquet $1, ou le mettre à jour s'il est là mais trop ancien. $2 : --cask pour une application.
paquet() {
  if brew list $2 "$1" >/dev/null 2>&1; then
    brew upgrade $2 "$1"
  else
    brew install $2 "$1"
  fi
}

installer_macos() {
  if ! installer_homebrew; then
    dire "Homebrew missing: Node.js, uv and Godot will not be installed." "Homebrew manquant : Node.js, uv et Godot ne seront pas installés."
    return
  fi
  node_pret || { dire "Installing Node.js…" "Installation de Node.js…"; paquet node; }
  command -v uv >/dev/null 2>&1 || { dire "Installing uv (Python)…" "Installation de uv (Python)…"; paquet uv; }
  godot_pret || { dire "Installing Godot…" "Installation de Godot…"; paquet godot --cask; }
}

afficher_manques_linux() {
  dire "On Linux, this program installs nothing by itself; depending on the report below, you need:" "Sous Linux, ce programme n'installe rien de lui-même ; il faut, selon le rapport ci-dessous :"
  dire "  Node.js 22 or later: https://nodejs.org" "  Node.js 22 ou plus récent : https://nodejs.org"
  echo "  uv : https://docs.astral.sh/uv/"
  dire "  Godot 4.4 or later: https://godotengine.org" "  Godot 4.4 ou plus récent : https://godotengine.org"
}

dire "=== Égide: installation ===" "=== Égide : installation ==="
case "$(uname -s)" in
  Darwin) installer_macos ;;
  *) afficher_manques_linux ;;
esac

if command -v uv >/dev/null 2>&1; then
  dire "Preparing the Python environment…" "Préparation de l'environnement Python…"
  uv sync
else
  dire "uv missing: Python environment not prepared." "uv absent : environnement Python non préparé."
fi

if ! node_pret; then
  echo
  dire "Node.js 22 or later not found: cannot check." "Node.js 22 ou plus récent est introuvable : vérification impossible."
  pause_finale
  exit 1
fi

dire "Updating the catalogue indexes…" "Mise à jour des index du catalogue…"
node outils/indexer.js

echo
dire "=== Égide: check ===" "=== Égide : vérification ==="
node outils/verifier_installation.js $COMPLET
etat=$?
[ "$etat" -eq 0 ] && dire "To start Égide: double-click lancer.command." "Pour lancer Égide : double-clic sur lancer.command."
pause_finale
exit "$etat"
