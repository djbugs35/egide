# Égide — consignes projet

## Objet
Simuler une défense du territoire (espace aérien non contesté) contre un essaim de ~1000 drones rapides
(~800 km/h) visant une dizaine de cibles, avec trois couches : radars, postes sol-air (roquettes, missiles)
et avions turbopropulseurs en orbite armés de roquettes guidées (laser ou IR).
Questions de fond : **vitesse minimale de mise à poste des avions** selon leur nombre, et **nombre de postes
sol-air nécessaires sans avions**.

Le scénario est **notionnel** : ordres de grandeur publics, aucune performance réelle de système identifié.
Toute valeur chiffrée vient du scénario (`scenarios/*.json`) et porte une phrase disant d'où elle vient.

## Feuille de route
- v0.1 (docs/PLAN.md) : abaques (`analyse/`), simulation (`src/moteur/`), interface (`index.html`, `src/vue/`).
- v2 (docs/PLAN_V2.md) : plateforme à la manière d'un jeu de stratégie vu de dessus — catalogue d'unités et
  d'algorithmes en fichiers, Terre réelle avec relief, éditeur à la souris, physique expliquée, preuve de qualité,
  réseau d'information. Versions et jalons : docs/PLAN_V2.md.
- Jeu (docs/PLAN_JEU.md) : Godot en interface de jeu, sur le même moteur (`src/direct.js`, `clients/godot/`).
- **Proposer au fil de l'eau de nouvelles fonctions** : l'utilisateur y tient. Par défaut, toute suggestion est
  retenue et ajoutée sans attendre au tableau de docs/PLAN_V2.md § Suggestions retenues (thème, jalon, état) ;
  passer son état à « fait » quand elle est livrée.

## Catalogue et scénarios (MODELE § 9.1)
- Une unité = un fichier `unites/<famille>/<classe>/<unite>.json`, héritage par `herite_de`, chaque clé documentée
  dans `_aide` (chez elle ou un ancêtre), `fidelite` et `sources` obligatoires. Fichiers de base préfixés `_`.
- Le catalogue public est **notionnel, par classe** : ordres de grandeur publics, sources citées, aucun système réel
  identifié. Les modèles de systèmes réels vont dans `prive/` (ignoré par git), identifiants préfixés `prive/`.
- Scénario v2 : unités citées par identifiant, valeurs modifiées par chemin (`bleu.avions.1.nombre`,
  `rouge.surcharges.vitesse_kmh`) partout : interface, balayage, `node src/campagne.js --chemin valeur`.
- Algorithmes (MODELE § 10) : un module par algorithme sous `algos/global/<rôle>/` ou `prive/algos/…`, qui exporte
  `meta` et les fonctions de son rôle, n'importe rien (outils et hasard en arguments), reste pur. Après tout ajout :
  `node outils/indexer.js` ; la conformité (`tests/conformite.test.js`) s'applique d'elle-même.
- Cartes (MODELE § 11) : une source par fichier sous `cartes/fonds|relief|batiments/`, clés de `cartes/_format.json`,
  attribution et conditions d'usage obligatoires. La carte ne sert qu'à l'affichage, jamais au calcul.
- Bibliothèques tierces : copiées dans `vendor/` (version, licence et procédure dans `vendor/README.md`), jamais de CDN.
- Éditeur (MODELE § 12) : tout geste devient des modifications par chemin, calculées dans `src/vue/edition.js`
  (pur, testé) ; `src/vue/editeur.js` ne fait que lire les gestes et dessiner.
- Toute évolution de la résolution se fait dans `src/moteur/scenario.js` ET `analyse/scenario.py` ;
  `tests/resolution_reference.json` garde les deux d'accord.

## Exigences : ludique ET rigoureux
- Ludique : animation fluide (canvas, 60 i/s), curseurs à effet immédiat, rejeu accéléré/ralenti,
  traînées, explosions, compteurs vivants. Mais **chaque visuel se lit au chiffre** : unité affichée,
  échelle visible, valeur exacte au survol.
- Rigoureux :
  - Unités SI dans tout le moteur (m, s, m/s, rad) ; conversions km, km/h, degrés **uniquement** aux frontières
    (scénario, affichage), via le suffixe des clés et `src/moteur/unites.js` / `analyse/unites.py`.
  - Géodésie (MODELE § 9) : positions (lat, lon, alt) sur WGS84 avec ECEF en cache ; distances de capteur et d'arme
    en oblique (ECEF), distances au sol en géodésique (Vincenty). Jamais de géométrie plane dans le moteur.
  - Chaque formule codée cite son paragraphe de docs/MODELE.md (`# MODELE § 3.2`) et inversement.
  - Hasard toujours à graine (générateur déterministe maison) : un résultat se rejoue à l'identique.
  - Toute statistique Monte-Carlo s'affiche avec son intervalle de confiance et le nombre de tirages.
  - Les cas limites de la simulation sont **testés contre les formules fermées** (mêmes valeurs de
    référence dans `tests/references.json`, vérifiées côté JS et côté Python).
  - Une hypothèse simplificatrice s'écrit dans docs/MODELE.md avant d'entrer dans le code.

## Choix techniques
- JavaScript sans compilation (modules ES), site statique servi en HTTP (`lancer.command`, `lancer.bat`).
- `src/moteur/` reste pur (pas de DOM, pas de réseau) : il tourne aussi sous Node pour les campagnes
  Monte-Carlo en lot et les tests. Le rendu vit dans `src/vue/`.
- Python ≥ 3.12 pour les abaques et le dépouillement ; `analyse/geometrie.py` n'utilise que la
  bibliothèque standard, les tracés passent par matplotlib.
- Un seul modèle de vérité : la simulation est en JS ; Python ne réimplémente que les formules fermées.
- Résultats de campagnes dans `resultats/` (ignoré par git).

## Conventions (reprises de cap-prepa et metascrap, docs/CONVENTIONS.md de metascrap)
- Le code est lu par quelqu'un qui a oublié le contexte : la règle qui sert le lecteur gagne.
- Domaine en français ; en Python, identifiants sans accents : `verbe_complement()`, prédicats `est_x()`,
  `_prive`, `MAJUSCULES`. Booléens nommés par ce qu'ils affirment. Pas d'abréviations hors domaine.
- Fonctions ≤ 50 lignes ; > 80 refusé sur du code neuf. Module > 800 lignes : à découper.
- Docstring Google sur toute fonction publique (JSDoc côté JS) : 1re ligne = ce qu'elle rend, à
  l'infinitif ; puis seulement le non-évident, dont l'unité de chaque grandeur.
- Commentaires : le pourquoi (chiffre mesuré, ce qui casse si on l'enlève), jamais le quoi.
- Erreurs : attraper le type qu'on sait traiter, jamais `except Exception` hors frontière journalisée.
- Imports en tête de module. Deux fois on note, trois fois on factorise. Un nom = un concept.
- Configuration et scénarios : toutes les clés lues par le code y figurent, avec leur valeur par défaut
  et une phrase dans le bloc frère `"_aide"` (tout ce qui commence par `_` est ignoré à la lecture).
- Tests : un test par comportement, nommé par ce qu'il garantit ; le test d'un bug corrigé reproduit le
  bug et son docstring raconte ce qui s'était passé ; aucun test ne touche au réseau.
- Écritures de fichiers atomiques (temporaire puis renommage).

## Façon de travailler
- Frugalité en tokens : filtrer les sorties avant de les lire, ne pas relire un fichier qu'on vient d'éditer.
- Utiliser Serena (outils symboliques) pour naviguer et modifier le code plutôt que relire des fichiers entiers.
- Faire une liste de tâches pour les demandes complexes ; analyser les données avant de choisir une solution.
- Lancer seulement les tests des fichiers touchés.
- Ne pas modifier README ni docs/PLAN.md sans demande : l'utilisateur les reprend avant chaque version.
  docs/MODELE.md, lui, se met à jour avec le code qui l'applique.
- **README : mis à jour seulement lors de la pose d'un tag de version** (captures et GIF refaits à ce moment-là), jamais entre deux tags.
- Ne jamais tuer un processus qu'on n'a pas lancé soi-même.

## Vérifications avant commit
- `npm test` (rapide) et `pytest -q tests` ; `npm run test:complet` ajoute l'équivalence avec la v0.1 (~2 min, en CI)
- `ruff check analyse tests` et `ruff format analyse tests`
- Conventional commits en français (`feat:`, `fix:`, `docs:`, `chore:`), une branche par fonctionnalité,
  PR avec description et liste de contrôle.
