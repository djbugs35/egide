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

### Vérifier le client

Sans écran, le client recalcule le bilan, puis `outils/verifier_client.js` compare ses positions à une nouvelle simulation.
Le critère est de 1 m au plus, aux mêmes instants.

```sh
godot --headless --path clients/godot --script res://scripts/verifier.gd -- --rejeu "$PWD/resultats/rejeux/<fichier>" --sortie "$PWD/resultats/dump.json"
node outils/verifier_client.js --client resultats/dump.json
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
