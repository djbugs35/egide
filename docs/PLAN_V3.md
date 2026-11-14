# Égide v3 : composer un terrain de jeu et le voir vivre

Objectif : qu'un utilisateur compose un terrain de jeu complet, défense et menace, en posant ses unités à la souris,
qu'il l'enregistre comme scénario, et qu'il le voie se jouer en moins d'une seconde après chaque geste. Le reste du
plan rend cette boucle soutenable : moteur plus rapide, code découpé et testé, livraison automatisée.

Ce plan prolonge [PLAN_V2.md](PLAN_V2.md) (jalons 0 à 17) et [PLAN_JEU.md](PLAN_JEU.md). Les stories correspondantes
sont dans [BACKLOG.csv](BACKLOG.csv), epics « Atelier de scénario », « Exécution rapide », « Santé du code » et
« Livraison et exploitation (DevOps) ».

## Diagnostic (14 novembre 2026)

- 89 commits, 19 000 lignes (moteur 3 300, vue 7 100, client Godot 3 700, tests 4 300) ; 713 tests en 13 s ; CI verte ;
  aucune dépendance npm ; `vendor/` 14 Mo.
- Simulation complète : 1,4 s sur le scénario de référence, 4,4 s sur le théâtre France. Profil : `distance_oblique`
  19 %, `drone_approchant` 10 %, `parcourir_voisins` 8 %, objets ECEF recréés à chaque pas.
- Chemin « poser → composer → exécuter » : pas de scénario vierge (seulement « Revenir à la référence » et « Tout
  effacer ») ; la menace se règle par curseurs et par JSON (`rouge.groupes`), hors de la palette ; chaque geste rejoue
  tout le raid sur le fil principal ; l'éditeur Godot a 5 outils contre 9 au navigateur, sans règle ni aimantation.
- Dette : `creer_editeur` 586 lignes, `creer_vue3d` 203, `app.js` 878 ; 25 modules de vue et 5 modules moteur
  (`defense_air`, `defense_sol`, `tir`, `reaction`, `grille`) sans test direct ; `modeles/` et `sons/` à régénérer à
  la main sur un clone neuf.

## Décisions
- **L'atelier d'abord.** La valeur est dans la composition d'un scénario et son exécution immédiate ; le reste sert cela.
- **Un seul éditeur, deux rendus.** Les gestes restent dans `src/vue/edition.js` et `src/vue/deploiement.js`, purs et
  testés ; navigateur et Godot n'en sont que des rendus, et le serveur (`src/serveur/atelier_scenario.js`) les applique.
- **Une estimation n'est jamais présentée comme un résultat.** L'aperçu rapide est marqué « estimation » à l'écran et
  remplacé par le résultat complet dès qu'il arrive.
- **Aucune optimisation sans preuve.** Toute accélération du moteur passe le test d'équivalence avec la v0.1 et garde
  les bilans à l'identique, graine par graine.
- **Aussi simple qu'un jeu de stratégie en temps réel.** Toute l'interface de jeu suit les conventions du genre : clic
  gauche pour sélectionner, glisser pour le rectangle, clic droit pour l'ordre contextuel, groupes de contrôle, panneau
  de commandes à touches fixes, mini-carte, fantôme sous le curseur avant de poser. Un nouveau venu doit composer et
  lancer un scénario en moins de cinq minutes sans lire le README. Égide garde ses propres noms, graphismes et sons.
- **Pas d'automatisation de l'attaque.** Les idées d'équipe rouge automatique de PLAN_V2 restent hors de ce plan.

## Jalons et critères de preuve

| Jalon | Contenu | Critère de preuve | État |
|---|---|---|---|
| 20 | **Exécution rapide** : simulation dans un Web Worker avec progression ; aperçu rapide (pas ×2, essaim échantillonné à 20 %) marqué « estimation » ; cache de la résolution ; moteur optimisé (distances au carré, ECEF en tableaux typés, index spatial incrémental) | Bilans identiques graine par graine (test d'équivalence v0.1) ; référence sous 0,7 s, France sous 2 s ; interface fluide pendant le calcul | à faire |
| 21 | **Atelier de scénario** : nouveau scénario vierge (théâtre par nom de lieu ou clic, modèles de départ), menace dans la palette (onglet Rouge : départs, groupes, cibles), assistant en quatre étapes (Théâtre, Défense, Menace, Vérifier), fiche de scénario (nom, description, difficulté, objectif), export en un fichier (scénario, terrain, incidents) | Un scénario complet composé sans toucher au JSON ; même empreinte qu'il soit composé au navigateur ou dans Godot | à faire |
| 22 | **Éditeur Godot au niveau du navigateur** : règle, aimantation, dépôt par quantité, onglet Rouge, ordres rejoués | Même scénario produit des deux côtés ; raid avec ordres rejoué à l'identique | à faire |
| 23 | **Comparer deux scénarios** côte à côte sur la même graine, depuis la bibliothèque | Écart chiffré avec son IC, les deux raids synchronisés | à faire |
| 24 | **Santé du code** : `creer_editeur` découpé par outil, `creer_vue3d` en caméra / couches / modèles, `app.js` par panneau ; tests directs des modules moteur sans test ; capture de référence du canevas 2D comparée en CI | Aucune fonction neuve au-delà de 50 lignes ; chaque module moteur a son test ; la capture de référence est stable | en continu |
| 26 | **Ergonomie de jeu de stratégie** : panneau de commandes en bas à droite (grille de boutons à touche fixe, raccourci et infobulle sur chaque bouton), panneau de sélection en bas au centre (icône, état, munitions, ordres en cours ; vignettes et Tab pour les sous-groupes en multi-sélection), mini-carte cliquable avec alertes, clic droit contextuel (rallier, suivre, engager la piste), Maj pour enfiler les ordres, Ctrl+clic et double-clic pour sélectionner par type, double appui sur un groupe pour y centrer la caméra, point de ralliement des sites, fantôme vert ou rouge avant la pose et pose en série avec Maj, alerte « sous attaque » avec Espace pour y sauter, didacticiel interactif de cinq minutes ; navigateur et Godot | Un testeur qui découvre Égide compose et lance un scénario en moins de cinq minutes sans aide ; chaque commande du panneau a sa touche, affichée dessus ; les mêmes gestes font la même chose dans Godot et au navigateur | à faire |
| 25 | **Livraison** : `modeles/` et `sons/` générés à l'installation et en CI avec empreinte ; release GitHub au tag ; journal des changements tiré des commits ; contrôle anti-fuite des noms de systèmes réels ; test nocturne complet avec alerte sur dérive des bilans | Un clone neuf joue avec modèles et sons ; chaque tag a sa release ; la CI refuse un motif interdit | à faire |

## Ordre proposé
1. Jalons 20 et 25 en parallèle : courts, sans risque fonctionnel, ils rendent la suite confortable.
2. Jalon 26 (ergonomie de jeu de stratégie) avec le jalon 21 : l'atelier naît directement dans ces conventions, plutôt que d'être refait ensuite ; puis 22 et 23.
3. Jalon 24 au fil de l'eau, chaque fois qu'un module est touché.
