# Étendre Égide : catalogue, unités, algorithmes

Égide est conçu pour être réglé et étendu **sans toucher au moteur**. Tout ce qui décrit le monde simulé est un
fichier : une unité est un JSON, un algorithme est un module JavaScript, une carte ou un relief est un JSON, un
scénario est un JSON. Le moteur ne fait qu'orchestrer (ordre des étapes, horloge, tirages, journal) ; chaque
valeur vient d'une unité et chaque décision est confiée à un algorithme désigné par son identifiant.

Pour un outil externe qui génère ces fichiers, le format exact, les schémas JSON et le validateur sont décrits dans
[FORMATS.md](FORMATS.md).

Ce guide explique comment ces fichiers s'articulent, comment en ajouter, et comment prouver l'effet d'un ajout.
Les équations et le contrat formel sont dans [MODELE.md](MODELE.md) (§ 9.1 scénario et catalogue, § 10 registre
d'algorithmes).

## 1 · Vue d'ensemble

```
icones/                              silhouettes SVG des icônes de jeu
unites/                              catalogue public d'unités (notionnel)
  _unite.json                        racine : nom, fidélité, sources, algos
  vecteurs/drones/                   menace : drones d'attaque
  vecteurs/avions/                   intercepteurs pilotés
  vecteurs/drones_defensifs/         drones armés, intercepteurs kamikazes, brouilleurs
  effecteurs/roquettes/              armes emportées par les avions
  effecteurs/drones/                 charges des drones défensifs
  effecteurs/brouillage/             effet de brouillage (probabilité notionnelle)
  capteurs/radars/                   radars de surveillance
  sites/postes/                      postes sol-air
  liaisons/                          moyens de communication (filaire, radio, satellite, optique)
  terrains/                          reliefs : grilles d'altitudes
algos/global/<rôle>/<algo>.js        algorithmes publics, rangés par rôle
cartes/fonds|relief|batiments/       sources de fond de carte (attribution obligatoire)
cartes/frontieres/pays.json          frontières des pays (node outils/frontieres.js)
scenarios/                           bibliothèque de scénarios
prive/unites/…  prive/algos/…        votre catalogue privé, ignoré par git
```

Pour parcourir ce qui existe : ouvrez **`catalogue.html`** (lien « Catalogue » de la barre du haut ; les fiches de l'inspecteur y
renvoient aussi). Il affiche chaque unité publique avec ses valeurs résolues (héritage appliqué, unités converties), la phrase
d'aide de chaque clé, ses sources et ses algorithmes ; et chaque algorithme avec sa fiche : description, équations,
hypothèses, domaine de validité, références, paramètres lus.

## 2 · Unités

### 2.1 Un fichier par unité

Une unité est identifiée par son chemin sous `unites/`, sans l'extension : `vecteurs/avions/turbopropulseur_ir_notionnel`.
Un fichier minimal hérite de tout et ne dit que ce qui change :

```json
{
  "herite_de": "vecteurs/avions/_avion",
  "nom": "Turbopropulseur d'appui, roquettes IR (notionnel)",
  "sources": ["Ordre de grandeur notionnel : classe des turbopropulseurs d'appui léger, 450 à 600 km/h"],
  "emport": "effecteurs/roquettes/roquette_guidee_ir_notionnelle"
}
```

Les fichiers dont le nom commence par `_` sont des **classes** : ils portent les valeurs par défaut et l'aide d'une
famille (`_avion`, `_drone`, `_drone_defensif`, `_liaison`, `_terrain`…). On ne les place pas dans un scénario, on en
hérite.

### 2.2 Héritage

- `herite_de` désigne le parent. Les clés du parent sont reprises, celles du fichier les remplacent. La chaîne
  remonte jusqu'à `_unite`.
- `algos` est **fusionné rôle par rôle** : une unité fille qui écrit `"algos": {"mouvement": "…"}` ne remplace que
  son mouvement et garde les autres rôles hérités.
- `_aide` est fusionné de la même manière : chaque clé doit avoir sa phrase d'aide, dans le fichier ou chez un
  ancêtre. C'est elle qu'affichent l'interface, l'inspecteur et l'explorateur.

Exemple : `_drone_defensif` hérite de `_avion` (il en reprend la mise à poste, l'emport, la consommation) et ne
change que `type_vecteur` et les vitesses ; `intercepteur_kamikaze_notionnel` hérite de `_drone_defensif` et ne
change que son emport et `consomme_au_tir`.

### 2.3 Unités physiques : suffixes

Les fichiers sont écrits dans les unités du métier ; le moteur ne voit que le SI. Le suffixe de la clé fait la
conversion à la lecture :

| Suffixe | Unité du fichier | Clé SI dans le moteur |
|---|---|---|
| `_kmh` | km/h | m/s (`vitesse_kmh` → `vitesse`) |
| `_km` | km | m |
| `_ms` | m/s | m/s |
| `_m` | m | m |
| `_s` | s | s |
| `_g` | g | g (facteur de charge) |
| `_deg` | degré | radian |

Une clé sans suffixe (`pk`, `engagements_par_passage`, `emport`…) est passée telle quelle.

### 2.4 Fidélité et sources

Chaque unité déclare `fidelite` — `notionnel` (ordres de grandeur), `cinematique`, `point_masse` (3 degrés de
liberté) ou `6ddl` — et au moins une entrée dans `sources`. Le catalogue public est **entièrement notionnel** : des
ordres de grandeur par classe, jamais les performances d'un système réel identifié.

### 2.5 Pays d'inspiration et icônes de jeu

Deux clés d'affichage, héritées comme les autres :

- `pays` : code ISO 3166 à trois lettres (`"FRA"`, `"USA"`…) du pays dont la classe s'inspire. Il sert au classement
  (filtre « Pays » de la palette) et à la couleur de la pastille. Le nom de l'unité est fictif et ses valeurs restent
  celles de la classe, arrondies : aucune unité publique ne correspond à un système réel identifié, et aucune fiche
  ne nomme le système qui l'aurait inspirée. Les pays connus de l'interface sont dans `src/vue/pays.js`.
- `icone` : nom d'une silhouette de `icones/` (`radar_pylone`, `batterie_moyenne`, `chasseur`, `helicoptere`,
  `drone_delta`…). Une icône est un SVG carré (viewBox 64 × 64), blanc sur fond transparent, vu de dessus ; la
  carte la pose sur la pastille du pays, cerclée de la couleur du camp. `null` : symbole APP-6 seul. Le calque
  « Icônes de jeu » bascule entre les deux.

Le catalogue public compte 35 unités rangées par pays (radars, batteries, avions et hélicoptères, drones
défensifs, drones d'attaque), nommées d'après des plantes : `unites/capteurs/radars/fra_ajonc_300.json`,
`unites/vecteurs/drones/irn_chardon_d.json`… La conformité vérifie que chaque icône existe et que chaque pays est connu.

### 2.6 Ce que chaque famille règle

| Famille | Clés principales | Rôles d'algorithme portés |
|---|---|---|
| `vecteurs/drones` | vitesse, altitude de croisière | mouvement |
| `vecteurs/avions` | vitesses de mise à poste et d'engagement, facteur de charge, `emport`, `emport_nombre`, `type_vecteur`, `consomme_au_tir` | mouvement |
| `vecteurs/drones_defensifs` | idem avions, `type_vecteur` : drone armé, kamikaze, brouilleur | mouvement |
| `effecteurs/…` | données de l'arme ou de la charge (notionnelles) | tir |
| `capteurs/radars` | hauteur d'antenne, portée maximale | detection |
| `sites/postes` | portée, Pk, engagements par passage, délai d'acquisition | tir_sol |
| `liaisons` | latence, portée, besoin de vue directe | — |
| `terrains` | emprise, pas, grille d'altitudes | — |

## 3 · Scénarios : citer et surcharger

Un scénario cite les unités par identifiant et peut en surcharger les valeurs **sans créer de fichier** :

```json
"bleu": {
  "avions": [
    {"unite": "vecteurs/avions/turbopropulseur_ir_notionnel", "nombre": 20,
     "surcharges": {"vitesse_mise_a_poste_kmh": 550},
     "surcharges_emport": {"…": "…"}}
  ],
  "radar": {"unite": "capteurs/radars/radar_basse_altitude_notionnel", "surcharges": {"portee_max_km": 200}}
}
```

- `surcharges` modifie l'unité citée (même syntaxe, mêmes suffixes) ; `surcharges_emport` modifie son arme. Une
  surcharge `algos` ne remplace que les rôles qu'elle cite : `"surcharges": {"algos": {"mouvement": "…"}}`.
- Déploiement unité par unité (MODELE § 21), que l'éditeur écrit pour vous à la souris :
  - `bleu.radar.sites[].unite` donne à un radar placé son propre modèle ;
  - `bleu.sol.batteries[]` place des batteries une à une, chacune avec `unite`, `munitions` et `surcharges` ;
  - `bleu.reseau.centres[].allocation` donne à un centre secondaire son propre algorithme d'allocation ;
  - `bleu.reseau.equipements[]` (`{noeud, moyens}`) déclare les moyens de communication de chaque nœud.
- Toute valeur du scénario a un **chemin pointé** : `bleu.avions.1.nombre`, `rouge.tactique`,
  `rouge.surcharges.vitesse_kmh`, `bleu.conduite.allocation`, `bleu.reseau.mode`… Ce même chemin sert partout :
  dans le panneau Scénario, dans le panneau Balayage, et en ligne de commande.
- Chaque clé du scénario porte sa phrase dans `_aide`, comme les unités.
- Un scénario v1 est migré à la lecture ; la résolution (unités + surcharges → valeurs SI) est faite à
  l'identique en JavaScript et en Python, et un test croisé le vérifie (`tests/resolution_reference.json`).

```sh
node src/campagne.js --bleu.avions.1.unite vecteurs/avions/turbopropulseur_ir_notionnel
node src/campagne.js --rouge.surcharges.vitesse_kmh 600 --bleu.radar.surcharges.portee_max_km 180
node src/campagne.js --balayer bleu.sol.nombre=0,1,2,4
```

La bibliothèque `scenarios/` est remplie à la main, par « Enregistrer » dans l'interface, ou par l'auto-configuration
(`node src/autoconfig.js --pays FRA`). `node outils/indexer.js` met à jour `scenarios/index.json`.

## 4 · Algorithmes

### 4.1 Rôles

Chaque décision du moteur est un **rôle**. Un algorithme tient un rôle ; on le choisit par une unité ou par le
scénario.

| Rôle | Choisi par | Fonctions à exporter | Ce qu'il décide |
|---|---|---|---|
| comportement | `rouge.tactique` | `planifier_drone(contexte, cible, hasard, outils)` | la route de chaque drone adverse |
| mouvement | unité (drone, avion) `algos.mouvement` | `avancer(mobile, route, distance, outils)` | comment un mobile parcourt sa route |
| detection | unité radar `algos.detection` | `preparer(scenario, radar, outils)`, `detecte(etat, drone, outils)`, option `detecte_par` | qui voit quoi |
| pistage | `bleu.conduite.pistage` | `pister(drones, outils)` | comment les détections forment des pistes |
| allocation | `bleu.conduite.allocation` | `allouer(avions, pistes, outils)` → `[{avion, point, explication}]` | quel avion va sur quelle piste |
| tir | unité arme `algos.tir` | `planifier_tir(arme, distance)` → `{vol, occupation}` | durée de vol et occupation d'un tir |
| tir_sol | unité poste `algos.tir_sol` | `cadence(poste, vitesse_cible)` | engagements d'un poste sur une cible |

Algorithmes publics disponibles : `algos/index.json` (ou l'explorateur `catalogue.html`). Pour `rouge.tactique`,
les noms courts `direct`, `disperse`, `fourmi`, `plan_de_vol` désignent `global/comportement/essaim_…` ; tout
identifiant complet est accepté.

### 4.2 Contrat

Un algorithme est un module ES, `algos/global/<rôle>/<nom>.js` (ou `prive/algos/<rôle>/<nom>.js`) :

1. Il exporte `meta` : `role`, `nom`, `fidelite`, `description`, `equations`, `hypotheses`, `domaine_validite`,
   `references` (au moins une) et `parametres` (chaque clé SI lue dans l'unité, avec son unité et son aide).
2. Il exporte les fonctions de son rôle, avec la signature du tableau.
3. Il **n'importe rien** et n'appelle ni `Math.random`, ni l'horloge, ni le réseau. Ce dont il a besoin lui est
   passé :
   - `outils` : la géodésie du moteur (`distance_horizontale`, `inverse` pour distance et azimut, `direct_avec_azimut`, `pas_vers`…), `horizon_radar`
     (horizon radar à k = 4/3) et `G` ;
   - `hasard` : le générateur à graine du raid, seul hasard permis.

Il est donc pur et déterministe : même scénario, même graine, même résultat — ce qui rend les duels A/B et
l'empreinte de reproductibilité possibles.

### 4.3 Exemple complet

`algos/global/allocation/plus_proche.js` est un exemple volontairement simple, à lire avant d'écrire le sien :
chaque avion libre est envoyé sur la position actuelle de la piste la plus proche.

```js
export const meta = {
  role: "allocation",
  nom: "Piste la plus proche",
  fidelite: "notionnel",
  description: "Chaque avion libre est envoyé sur la position actuelle de la piste la plus proche de lui…",
  equations: ["piste retenue = argmin distance(avion, piste)"],
  hypotheses: ["Pas d'anticipation", "Plusieurs avions peuvent viser la même piste"],
  domaine_validite: "Référence pédagogique…",
  references: ["Égide, docs/MODELE.md § 10"],
  parametres: {vitesse_mise_a_poste: {unite: "m/s", aide: "…"}, altitude: {unite: "m", aide: "…"}},
};

export function allouer(avions, pistes, outils) {
  return avions.map((avion) => {
    // … trier les pistes par outils.distance_horizontale(avion.geo, piste.drone.geo)
    return {avion, point: {...plus_proche.drone.geo, alt: avion.groupe.altitude}, explication};
  });
}
```

L'`explication` (pistes connues, piste retenue, alternatives avec délai et score) est ce qu'affiche l'inspecteur
quand on clique un avion : un algorithme d'allocation bien écrit dit pourquoi il a choisi.

Pour l'essayer :

```sh
node src/preuve.js duel --variante bleu.conduite.allocation=global/allocation/plus_proche
```

Sur le scénario de référence, il laisse passer nettement plus de drones que l'allocation par densité (de l'ordre
de 490 frappes contre 400 sur 6 raids) : il ne regroupe pas les avions sur les pistes denses.

### 4.4 Brancher un algorithme

- Rôle porté par une unité : dans le fichier de l'unité (ou d'une fille), `"algos": {"detection": "global/detection/sites_radar"}`.
- Rôle porté par le scénario : la clé correspondante (`rouge.tactique`, `bleu.conduite.pistage`,
  `bleu.conduite.allocation`), dans le panneau Scénario ou par `--chemin valeur`.

Les rôles `guidage`, `filtrage` et `performance_radar` sont réservés à la bibliothèque privée : le moteur public ne
les appelle pas.

## 5 · Catalogue privé

`prive/` est ignoré par git. On peut y mettre un clone d'un autre dépôt, privé, avec la même arborescence :

```
prive/unites/vecteurs/avions/mon_avion.json     → identifiant « prive/vecteurs/avions/mon_avion »
prive/algos/allocation/mon_allocation.js        → identifiant « prive/allocation/mon_allocation »
```

- Une unité privée peut hériter d'une unité publique (`"herite_de": "vecteurs/avions/_avion"`) et être citée
  dans n'importe quel scénario.
- **Les modèles de systèmes réels, de guidage ou de performances d'armes vont uniquement là.** Le dépôt public
  reste notionnel, par classe.
- La conformité automatique s'applique aussi aux fichiers privés.
- Pour être jouable, une unité privée se range dans une famille du moteur (§ 2.6) et hérite de sa base publique,
  qui apporte ses algorithmes ; ailleurs (par exemple `prive/menace/hypersonique/`), elle reste une fiche consultable
  dans le catalogue mais absente de la palette.
- Une unité privée peut avoir son icône : `"icone": "prive/<nom>"` lit `prive/icones/<nom>.svg`.
- Le jeu Godot range sous `prive/` ce que le joueur enregistre : scénarios dans `prive/scenarios/`, reliefs dans
  `prive/unites/terrains/`.

### 5.1 Importer le catalogue privé dans l'interface

Un navigateur ne peut pas lister `prive/unites/` : `node outils/indexer.js` y écrit `prive/unites/index.json`
(hors git, comme le reste de `prive/`). La page **Catalogue** propose alors trois choix, retenus dans le navigateur
et appliqués aussi à la palette de la simulation :

- **Public seul** : le privé est ignoré ;
- **Fusionner** : les unités privées s'ajoutent aux publiques ;
- **Remplacer** : dans chaque dossier où le privé a au moins une unité (`vecteurs/avions`, `sites/postes`…), les
  unités publiques disparaissent de la palette ; les dossiers qu'il ne couvre pas (terrains, roquettes…) et les
  classes de base `_` publiques restent.

Quand le privé est importé, la bibliothèque de scénarios propose aussi ceux que liste `prive/scenarios/index.json`
(`[{"id": "nom", "nom": "Nom affiché"}]`, un fichier `prive/scenarios/<id>.json` par entrée).

Sans index privé, l'interface reste sur le catalogue public et la page Catalogue dit quoi lancer. Les scénarios
citent toujours les unités par identifiant : un scénario qui cite une unité privée ne s'ouvre que là où `prive/`
la contient.

## 6 · Conformité et index

Après tout ajout ou modification :

```sh
node outils/indexer.js     # régénère unites/, algos/, cartes/ et scenarios/index.json
npm test                   # la conformité vérifie d'elle-même chaque fichier déposé
```

L'interface lit les index (un navigateur ne peut pas lister un dossier) ; un index périmé fait échouer les tests.
La suite `tests/conformite.test.js` vérifie, sans test à écrire : fiche `meta` complète, rangement sous le bon rôle,
aucune dépendance cachée, algorithmes cités existants et du bon rôle, paramètres lus présents dans l'unité, aide
présente pour chaque clé, déterminisme, et invariants du rôle (un mouvement ne va jamais plus loin que demandé ; un
pistage compte chaque drone une seule fois ; un comportement mène chaque drone sur sa cible…).

## 7 · Autres données

| Donnée | Où | Comment l'ajouter |
|---|---|---|
| Moyens de communication | `unites/liaisons/` | hériter de `_liaison` : `type`, `latence_s`, `portee_km`, `visibilite_directe`, `hauteur_antenne_m` ; citer l'unité dans `bleu.reseau.liaisons[]` |
| Relief | `unites/terrains/` | `node outils/terrain.js --nom … --lat … --lon … --rayon_km … --pas_km …` (tuiles de relief, ou `--synthetique`) ; citer dans `theatre.terrain` |
| Fond de carte | `cartes/fonds|relief|batiments/` | une source par fichier, attribution obligatoire |
| Frontières | `cartes/frontieres/pays.json` | `node outils/frontieres.js` (Natural Earth), pour l'auto-configuration par pays |

## 8 · Prouver l'effet d'un changement

Un ajout au catalogue n'a de valeur que si son effet est mesuré honnêtement :

```sh
node src/preuve.js empreinte                                     # empreinte de reproductibilité du scénario
node src/preuve.js duel --variante bleu.avions.1.unite=prive/vecteurs/avions/mon_avion
node src/preuve.js morris --facteur bleu.radar.surcharges.portee_max_km=100:300 --facteur bleu.sol.nombre=0:4
node src/preuve.js dossier                                       # dossier.md : résultats, convergence, modèles
```

Le duel compare A et B sur les **mêmes tirages** (mêmes graines) et donne l'écart avec son intervalle de confiance :
c'est ce qui permet de dire qu'un algorithme ou une unité fait mieux, et pas seulement que le hasard a été favorable.
Les méthodes sont décrites dans [MODELE.md § 14](MODELE.md).
