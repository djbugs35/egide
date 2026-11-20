#!/bin/sh
# Films Godot de la documentation (outils/captures.js fait ceux du navigateur) : pour chaque langue, une partie et
# l'édition, sous l'enregistreur d'images de Godot, assemblées en GIF par ffmpeg dans docs/images/<langue>/.
#   outils/captures_godot.sh                 # en et fr ; variable EGIDE_GODOT pour un Godot non standard
#   outils/captures_godot.sh en              # une seule langue
cd "$(dirname "$0")/.." || exit 1
GODOT="${EGIDE_GODOT:-godot}"
PORT=8791
for langue in ${1:-en fr}; do
  for film in partie edition; do
    images=$(mktemp -d)
    node src/direct.js --port "$PORT" --langue "$langue" >/dev/null 2>&1 &
    serveur=$!
    sleep 3
    "$GODOT" --path clients/godot --resolution 1280x720 --write-movie "$images/image.png" --fixed-fps 10 \
      --script res://scripts/captures.gd -- --direct "$PORT" --film "$film" --langue "$langue" >/dev/null 2>&1
    kill "$serveur" 2>/dev/null
    mkdir -p "docs/images/$langue"
    ffmpeg -y -loglevel error -framerate 10 -i "$images/image%08d.png" \
      -vf "fps=10,scale=960:-1:flags=lanczos,split[x][y];[x]palettegen=max_colors=160:stats_mode=diff[p];[y][p]paletteuse=dither=bayer:bayer_scale=4" \
      -loop 0 "docs/images/$langue/godot_$film.gif" && echo "→ docs/images/$langue/godot_$film.gif"
    rm -rf "$images"
  done
done
