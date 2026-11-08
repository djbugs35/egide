# Clients de rejeu

Égide reste l'autorité : un client relit un raid déjà simulé et l'affiche, il ne simule rien. Le format est décrit dans
[docs/FORMATS.md](../docs/FORMATS.md) (§ 6 pour le rejeu, § 7 pour le terrain).

## Client Godot

`clients/godot/` est un projet Godot 4 (licence MIT), en GDScript, sans extension. Essayé avec Godot 4.7.2.

```sh
node src/rejeu.js
node outils/export_terrain.js --terrain terrains/centre_france --pas-km 2
godot --path clients/godot
```

Sans argument, il prend le rejeu et le terrain les plus récents de `resultats/`. On peut les désigner :
`godot --path clients/godot -- --rejeu <fichier> --terrain <dossier> --debut 400 --camera 2 --couverture 3`. Le terrain est facultatif. Le chargement du
scénario de référence prend plusieurs secondes.

| Commande | Effet |
|---|---|
| Espace | lecture, pause |
| + et − | vitesse (×1 à ×60) |
| ← et → | reculer ou avancer de 10 s |
| 1, 2, 3 | caméra libre, suivi, vue de radar |
| Tab | drone suivi suivant |
| R | radar suivant |
| C | couverture affichée : détection, conduite de tir, interception, résultante d'un C2 |
| X | C2 suivant, pour sa résultante |
| WASD (touches physiques), bouton droit, molette | déplacer la caméra libre, regarder, changer sa vitesse |

Les entités sont agrandies selon la distance : à leur taille réelle, elles feraient moins d'un pixel à l'échelle d'un
théâtre. Les modèles sont des formes génériques construites dans le code.

### Jouer en direct

`./jouer.command` (ou `jouer.bat`) lance le serveur de partie et le client. À la main :

```sh
node src/direct.js
godot --path clients/godot -- --direct 8767
```

Le moteur tourne dans le serveur, Godot affiche et commande (docs/FORMATS.md § 10). La partie démarre en pause.

| Commande | Effet en direct |
|---|---|
| Espace | lancer, pause ; un ordre peut se donner en pause |
| + et − | vitesse (×1 à ×60) |
| clic gauche, cadre | sélectionner des vecteurs ; sur un radar ou un poste, l'inspecter (Maj : ajouter) |
| double-clic | tous les vecteurs du même type à l'écran |
| Ctrl+A, Échap | tout sélectionner, désélectionner |
| clic droit | envoyer la sélection au point visé, aussi sur la mini-carte |
| Ctrl+1 à 9, 1 à 9 | mémoriser un groupe, le rappeler (deux fois : centrer la caméra) |
| WASD (touches physiques), flèches, bord d'écran | défiler |
| molette, bouton du milieu | zoomer, pivoter |
| clic gauche sur la mini-carte | y centrer la caméra |
| F1 à F4 | caméra de stratégie, libre, suivi, vue de radar |
| C, X, Tab, R | couverture affichée, C2, drone suivi, radar suivi |
| B | lever ou rétablir le brouillard |
| M, H | couper le son, afficher l'aide |
| N | nouvelle partie |

| F5 | éditer le scénario (la partie revient à l'instant initial) |
| F6 | éditer le relief |

Sélectionner un objet trace ses enveloppes de détection, de conduite de tir et d'interception, jusqu'à huit vecteurs à la fois.
Le brouillard masque les drones qu'aucun radar n'a encore vus et assombrit le sol hors de la portée de détection, tracée en
disques sans le masque du relief. Sons et effets sont synthétisés au lancement. Un terrain dont l'origine n'est pas celle du
scénario est ignoré.

### Éditer

**Scénario (F5).** Choisir une unité dans la palette, puis cliquer sur le sol pour la poser : sa portée suit le curseur. Clic droit
ou Échap pour arrêter. Touches 1 à 5 : sélection (glisser pour déplacer), liaison (deux clics), plan de vol, zone (Entrée pour fermer),
gomme. Suppr efface la sélection. Ctrl+Z, Ctrl+Y annulent et rétablissent. La barre enregistre sous `prive/scenarios/` et charge un
scénario. Chaque geste passe par les mêmes calculs que l'éditeur du navigateur.

**Relief (F6).** Touches 1 à 4 : élever, abaisser, aplanir, lisser ; maintenir le clic gauche pour peindre. `[` et `]` changent le rayon.
Ctrl+Z annule un trait entier. La barre ouvre un relief du catalogue ou un relief plat. Enregistrer écrit sous `prive/unites/terrains/`
et l'applique au scénario : le moteur calcule alors masques radar et vues directes sur ce relief. Revenir en jeu sans enregistrer
abandonne les retouches.

### Vérifier le client

Sans écran, le client recalcule le bilan, puis `outils/verifier_client.js` compare ses positions à une nouvelle simulation.
Le critère est de 1 m au plus, aux mêmes instants.

```sh
godot --headless --path clients/godot --script res://scripts/verifier.gd -- --rejeu "$PWD/resultats/rejeux/<fichier>" --sortie "$PWD/resultats/dump.json"
node outils/verifier_client.js --client resultats/dump.json
```

Les règles du jeu (sélection, groupes, mini-carte, brouillard) se vérifient sans serveur :
`godot --headless --path clients/godot --script res://scripts/jeu/verifier_jeu.gd`.

La partie en direct se vérifie de la même façon, serveur lancé, sur le scénario que la partie a enregistré :

```sh
godot --headless --path clients/godot --script res://scripts/verifier_direct.gd -- --port 8767 --sortie "$PWD/resultats/dump.json"
node outils/verifier_client.js --client resultats/dump.json --scenario resultats/parties/<fichier>
```

## Porter vers un autre moteur

Le format, le repère et les correspondances ne changent pas. Seule la conversion d'axes dépend du moteur.

| Moteur | Axes | Position depuis `(e, n, h)`, h : `u` ou `alt` | Rotation au cap `c` |
|---|---|---|---|
| Godot | Y haut, droite directe, m | `(e, h, -n)` | `-c` autour de Y |
| Unity | Y haut, main gauche, m | `(e, h, n)` | `+c` autour de Y |
| Unreal | Z haut, main gauche, cm | `(100 n, 100 e, 100 h)` | `+c` autour de Z |

- **Lire le fichier** : décompresser le gzip, puis une ligne JSON à la fois. Ranger les images dans des tableaux
  compacts : le raid de référence compte 1,8 million d'échantillons.
- **Interpoler** entre deux images, position linéaire et cap par le plus court chemin. Une ligne d'image est triée par `id`.
- **Hauteur** : sur un terrain, ajouter l'altitude du sol à celle de l'entité (`docs/FORMATS.md` § 6.3). `hauteurs.raw`
  donne ce sol en entiers 16 bits petit-boutistes, le format de carte de hauteur qu'attend Unity.
- **Terrain** : glTF se charge par glTFast (Unity) ou glTFRuntime (Unreal), à vérifier pour chaque version de moteur.
  Les importeurs convertissent les axes eux-mêmes, en général de la même façon que le tableau ci-dessus.
- **Modèles** : `clients/modeles.json` donne le nom générique de chaque unité. Fournir les vôtres ; Égide n'en livre aucun d'un système réel.
- **Attribution** : afficher celle de l'imagerie, indiquée dans `terrain.json`.
