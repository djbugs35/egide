# Plan : Égide comme jeu de stratégie en temps réel

Objectif : que jouer à Égide procure le plaisir, l'ergonomie et le rythme d'un jeu de stratégie en temps réel, pour les
scénarios comme pour l'édition de terrain, sans rien perdre de la rigueur du simulateur. Égide garde son identité :
genre et mécaniques du jeu de stratégie, avec ses propres noms, graphismes et sons.

## Décisions (8 novembre 2026)

- **Godot devient une interface à part entière**, en parallèle du navigateur, et non un simple lecteur de rejeu.
- **Un seul moteur de vérité.** La simulation reste en JavaScript : un serveur Node local la fait tourner, Godot lui
  envoie ordres et modifications par chemin, et reçoit l'état en direct. Aucun portage du moteur.
- **Rôles des interfaces.** Godot : le jeu. Navigateur : l'analyse et les preuves. Cesium : le théâtre sur le globe.
- **Boucle de jeu d'abord défensive** : le joueur commande la défense contre l'essaim. Une économie ou un camp rouge
  jouable viendraient plus tard, dans un mode séparé qui ne fausse pas les analyses.
- **Conduite de tir et interception sont de vraies contraintes du moteur**, pas de simples dessins : un visuel ne doit
  pas montrer ce que la simulation ne fait pas.
- **Icônes des objets privés** : une icône qui ressemble à chaque objet réel, pour comprendre un rejeu d'un coup d'œil.
  Elles vont dans `prive/icones/`, ignoré par git, et jamais dans le dépôt public.

## Étapes

| Étape | Contenu | État |
|---|---|---|
| 1 | Installation automatique et vérification (`installer.command`, `installer.bat`, `outils/verifier_installation.js`) | fait |
| 2 | Orientation des objets selon leur déplacement, dans toutes les vues | fait |
| 3 | Couvertures calculées une seule fois dans le moteur : détection, conduite de tir, interception selon l'objet, couverture de chaque C2 comme résultante des objets connectés ; affichées dans le navigateur, Cesium et Godot | fait |
| 4 | Icônes des objets privés, ressemblantes, sous `prive/icones/` | fait |
| 5 | Liaison en direct entre Godot et le moteur (remplace le lot 15.4) : `node src/direct.js`, `jouer.command` | fait |
| 6 | Gameplay dans Godot : sélection au rectangle, groupes, ordres, mini-carte, brouillard, sons, effets | fait |
| 7 | Éditeurs dans Godot : scénario, puis terrain | à faire |

L'étape 3 ne change les bilans que là où la conduite de tir borne vraiment un objet (portée déclarée plus courte, horizon, relief) ; elle est passée par `docs/MODELE.md`, `src/moteur/scenario.js`, `analyse/scenario.py` et
`tests/resolution_reference.json`. Le catalogue public garde une conduite proportionnelle à l'arme, sans chiffre inventé.
