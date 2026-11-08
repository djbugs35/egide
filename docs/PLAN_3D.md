# Plan : déployer en 2D, observer en 3D, sortie vers un moteur de jeu

Plan détaillé des jalons 13 à 15, décidé le 5 novembre 2026. Les jalons 13 et 14 sont faits (v0.10.0) ; pour le 13, le rendu par couches MapLibre a été écarté (voir docs/PLAN_V2.md). Le jalon 15 est fait pour ses lots 1 à 3 ; le lot 15.4 a été remplacé par la liaison en direct de docs/PLAN_JEU.md (étape 5).

## Constat

L'affichage actuel est hybride. MapLibre dessine la carte, qu'on peut incliner et mettre en relief ; une toile 2D
séparée dessine les unités par-dessus, projetées point par point. Il en résulte :

- des symboles qui glissent par rapport au relief quand la carte est inclinée ;
- une altitude invisible (drones à 100 m, avions à 1 000 m, mâts, liaisons satellite) ;
- des couvertures radar dessinées en disques, alors que le moteur calcule des volumes masqués par le relief ;
- une édition moins sûre dès que la vue est inclinée.

## Principes

1. **Le moteur ne change pas.** Simulation, catalogue, algorithmes, scénarios, preuves et tests restent identiques.
   Les trois jalons ne touchent que l'affichage et ajoutent des sorties.
2. **Éditer à plat, regarder en volume.** Le déploiement se fait de dessus, sans inclinaison ; la 3D sert à observer et
   à comprendre un raid. C'est l'organisation des jeux de stratégie.
3. **Un seul état partagé.** Scénario, sélection, instant du raid et calques sont communs aux vues ; on bascule d'une
   touche sans rien perdre.
4. **Rien à installer** pour les jalons 13 et 14 : bibliothèques embarquées dans `vendor/`, pas de compilation, hors
   ligne possible. Le jalon 15 est une sortie de plus, facultative.

## Jalon 13 · Mode Déployer en 2D stricte

**But** : rendre l'édition nette et confortable, sans 3D.

Contenu :

- **Vue de dessus verrouillée** en édition : pas d'inclinaison ni de rotation, nord en haut, zoom et déplacement seuls.
  En sortant de l'édition, la vue revient à l'inclinaison choisie.
- **Unités dessinées par la carte elle-même** : icônes, bulles, couvertures, liaisons, zones et plan de vol deviennent
  des couches MapLibre (symboles et géométries GeoJSON) plutôt qu'une toile superposée. Plus de décalage au zoom ni au
  déplacement ; les couvertures « réelles » (masques de relief) deviennent des polygones.
- **Lisibilité** :
  - regroupement des unités proches aux petites échelles (« 12 avions ») ;
  - libellés qui s'effacent quand ils se chevauchent ;
  - niveaux de détail : silhouettes de près, points de loin ;
  - surbrillance de la sélection et de l'unité survolée.
- **Gestes d'édition** :
  - aimantation facultative à une grille ou aux unités ;
  - mesure de distance et de cap à la règle ;
  - aperçu de la couverture d'un radar et de la bulle d'une batterie avant de les poser ;
  - aperçu de la portée d'un moyen de communication quand on tire une liaison.
- La toile actuelle reste disponible pour le mode « Scope seul » (sans carte), le temps de la transition.

Critère de preuve :

- à toute échelle, une unité posée reste exactement à sa position géographique ;
- les tests de l'éditeur, purs, passent sans changement ;
- l'image d'un même instant est identique, unité par unité, entre l'ancien et le nouveau rendu (test de capture sur le
  scénario de référence).

Estimation : un jalon.

## Jalon 14 · Mode Observer en 3D (CesiumJS)

**But** : voir le raid en volume, sur le globe et son relief.

### Choix technique

CesiumJS (licence Apache 2.0) :

- globe WGS84 natif, en mètres et en coordonnées géodésiques comme le moteur ;
- relief, imagerie, caméra et sélection d'objets fournis ;
- s'embarque dans `vendor/` sans compilation.

Écartés :

- **deck.gl** : reste une carte inclinée, pas un globe ;
- **Three.js fait main** : il faudrait refaire globe, relief et tuiles ;
- **moteurs de jeu** : une autre application, d'où la sortie dédiée du jalon 15.

### Lot 14.1 · Scène et entités

- Globe, relief et imagerie des sources de `cartes/` ; cadrage sur le théâtre.
- Drones de l'essaim en primitives groupées : 1 000 drones et plus à 60 images par seconde, teinte selon qu'ils sont
  détectés ou non.
- Avions, drones défensifs, radars, batteries, C2 et sites en modèles simples ou en silhouettes de `icones/` posées
  en panneaux. Chaque unité est à sa vraie altitude : mâts au sol, orbites à l'altitude du groupe.
- Même frise, mêmes vitesses de lecture, même bilan, mêmes calques qu'en 2D.
- Bascule Déployer / Observer d'une touche, avec le même instant et la même sélection.

Critère : une entité donnée est au même point géographique dans les deux vues, à 1 m près, à tout instant.

### Lot 14.2 · Volumes et information

- **Couvertures radar en volumes** : coupoles bornées par l'horizon (k = 4/3), découpées par les masques de relief que
  calcule déjà le moteur (MODELE § 16) ; zones d'ombre derrière les crêtes visibles. Calque pour l'altitude des drones
  (coupe de la couverture à 100 m, par exemple).
- **Bulles des batteries** en demi-sphères, qui pâlissent avec les munitions.
- **Liaisons en 3D** : arcs au sol, segment vers l'avion à son altitude, montée et descente pour le satellite ; tronçon
  masqué par le relief en rouge.
- **Circulation de l'information** : impulsions le long des liaisons, comme en 2D.
- **Trajectoires** : traînées de l'essaim épousant le terrain, orbites et ralliements des avions, tirs et impacts.

Critère : chaque volume dessiné est calculé par les fonctions du moteur (pas de second calcul côté affichage), vérifié
par test sur quelques points.

### Lot 14.3 · Caméras, inspection, hors ligne

- **Caméras** :
  - libre ;
  - suivi d'une unité ;
  - vue depuis un radar (ce qu'il voit et ne voit pas) ;
  - vue depuis un site attaqué ;
  - vue « commandant » oblique figée ;
  - retour en vue de dessus.
- **Inspection** : clic sur une entité en 3D, même inspecteur qu'en 2D.
- **Hors ligne** : un outil (comme `outils/terrain.js`) prépare pour un théâtre les tuiles de relief et d'imagerie dans
  un dossier, que la vue 3D lit sans réseau.
- **Performances** : niveaux de détail, cadence de rendu adaptée en pause, mesure du temps par image sur le scénario de
  référence.

Critère : le scénario de référence se rejoue en 3D, hors ligne, à au moins 30 images par seconde sur une machine de
bureau courante.

Estimation : trois lots, de l'ordre de trois jalons passés.

## Jalon 15 · Sortie vers un moteur de jeu

**But** : rejouer un raid dans un moteur de jeu (Godot, Unity, Unreal…) pour un rendu spectaculaire, une
démonstration ou une immersion. Cette sortie vient **en plus** des vues du navigateur et ne les remplace pas. Égide
reste l'autorité : le moteur de jeu affiche, il ne simule pas.

### Lot 15.1 · Format de rejeu

Un fichier de rejeu (`.egide-rejeu`, JSON compressé ou JSON lignes) produit par `node src/rejeu.js` ou par
l'interface (« Exporter le rejeu ») :

- **En-tête** :
  - empreinte du scénario et graine, pour la reproductibilité ;
  - origine du théâtre et repère local ;
  - durée et pas d'échantillonnage ;
  - catalogue des unités en jeu (identifiant, famille, pays, icône, dimensions indicatives).
- **Repère local ENU en mètres** autour de l'origine du théâtre, en plus des coordonnées géodésiques. Les moteurs de jeu
  travaillent en flottants simple précision : des mètres locaux évitent les tremblements loin de l'origine.
- **États échantillonnés** (par exemple toutes les 0,5 s) : position, cap, altitude et état de chaque entité (vivant,
  détecté, en orbite, en ralliement, à poste, à court, perdu).
- **Événements datés** : ceux du journal (détection, mission, réception, contact, tir, impact, brouillage, panne, ordre).
- **Statique** : sites, radars, batteries, C2, liaisons, zones.

Spécification dans `docs/FORMATS.md`, schéma JSON généré comme les autres. Un test vérifie que le rejeu redonne le
bilan de la simulation.

### Lot 15.2 · Terrain et décor

- Export du terrain du théâtre en carte de hauteur PNG 16 bits et en maillage glTF, dans le même repère local.
- Export de l'imagerie du théâtre en texture, si la source le permet (attribution reprise).
- Table de correspondance icône → modèle 3D : le moteur de jeu associe ses propres modèles aux familles et aux icônes.
  Égide ne livre aucun modèle d'un système réel.

### Lot 15.3 · Client de référence Godot

- Godot (licence MIT, léger, gratuit) : un projet d'exemple dans `clients/godot/` qui charge un rejeu, le terrain et
  des modèles génériques, avec lecture, pause, vitesse et caméras (libre, suivi, vue de radar).
- Notes de portage pour Unity et Unreal : même format, même repère, mêmes correspondances.

### Lot 15.4 · Flux en direct (facultatif)

Remplacé par docs/PLAN_JEU.md, étape 5 : le moteur tourne dans un serveur et Godot le commande. Plan d'origine :

- Diffusion de l'état pendant qu'un raid se joue dans le navigateur, par WebSocket, via un petit relais local
  (`node outils/relais.js`) : même contenu que le rejeu, envoyé au fil de l'eau.
- Sens retour, plus tard : un ordre donné dans le moteur de jeu revient à Égide comme une modification par chemin du
  scénario (comme les ordres de l'éditeur), donc rejouable et prouvable.

Critère :

- un rejeu exporté puis relu par le client Godot montre les mêmes positions qu'Égide, à 1 m près, aux mêmes instants ;
- le bilan affiché est celui de la simulation.

Estimation : deux jalons (rejeu, terrain et client ; flux en direct à part).

## Ordre conseillé et dépendances

| Ordre | Jalon | Dépend de | Apporte |
|---|---|---|---|
| 1 | 13 · Déployer en 2D stricte | — | l'essentiel du confort d'édition, vite |
| 2 | 14.1 · Scène 3D et entités | 13 (état partagé) | la troisième dimension |
| 3 | 14.2 · Volumes et information | 14.1 | ce que la 2D ne peut pas montrer |
| 4 | 15.1 et 15.2 · Rejeu et terrain | — (indépendant de 14) | la sortie vers les moteurs de jeu |
| 5 | 14.3 · Caméras, inspection, hors ligne | 14.2 | la 3D utilisable au quotidien |
| 6 | 15.3 · Client Godot | 15.1, 15.2 | la démonstration |
| 7 | 15.4 · Flux en direct | 15.1 | le temps réel |

## Risques

- **Poids** : CesiumJS ajoute plusieurs mégaoctets à `vendor/`. Il serait chargé seulement à l'ouverture du mode
  Observer.
- **Performances** de 1 000 drones et de volumes découpés par le relief : à mesurer dès le lot 14.1 sur le scénario
  de référence, avant d'aller plus loin.
- **Tuiles hors ligne** : volume disque d'un théâtre en haute résolution ; prévoir des niveaux de détail bornés.
- **Licences** des sources d'imagerie et de relief, qui ne se redistribuent pas toutes : l'attribution suit chaque
  source, comme aujourd'hui pour `cartes/`.
- **Modèles 3D** : uniquement génériques ou de la main de l'utilisateur ; aucun modèle de système réel dans le dépôt
  public.
