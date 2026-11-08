# Formats d'échange

Ce document fixe ce que la bibliothèque d'Égide sait lire, pour qu'un outil externe — modeleur d'unités, générateur
d'algorithmes, export d'un autre simulateur — produise directement des fichiers valides. Il complète
[CATALOGUE.md](CATALOGUE.md), qui explique le pourquoi ; ici, le quoi, au caractère près.

| Ce que l'outil produit | Format | Où le ranger | Contrat machine |
|---|---|---|---|
| Unité (vecteur, effecteur, capteur, poste) | JSON | `unites/<famille>/<classe>/<nom>.json` ou `prive/unites/…` | `schemas/unite.<famille>.schema.json` |
| Moyen de communication | JSON | `unites/liaisons/<nom>.json` ou `prive/unites/liaisons/…` | `schemas/unite.liaison.schema.json` |
| Terrain | JSON | `unites/terrains/<nom>.json` | `schemas/unite.terrain.schema.json` |
| Algorithme | module ES (`.js`) | `algos/global/<rôle>/<nom>.js` ou `prive/algos/<rôle>/<nom>.js` | `schemas/algo_meta.schema.json` + § 4 |
| Scénario | JSON, format 2 | `scenarios/<nom>.json` (ou importé dans l'interface) | `scenarios/reference.json` + § 5 |

## 1 · Chaîne de production

```sh
# 1. l'outil écrit ses fichiers à leur place dans le dépôt (ou dans prive/)
# 2. vérification, avec les règles de la suite de conformité
node outils/valider.js prive/unites/capteurs/radars/mon_radar.json prive/algos/allocation/mon_algo.js
node outils/valider.js --json prive/unites/…        # rapport machine : [{fichier, genre, id, valide, defauts[]}]
# 3. mise à jour des index lus par l'interface (palette, explorateur, bibliothèque)
node outils/indexer.js
# 4. tout le catalogue, invariants des algorithmes compris
npm test
```

`outils/valider.js` rend le code 0 si tout est valide, 1 sinon, et nomme chaque défaut (clé sans aide, algorithme
absent ou de mauvais rôle, paramètre lu absent de l'unité, icône ou pays inconnu, grille de terrain mal dimensionnée,
import interdit dans un algorithme…). Les schémas JSON (draft 2020-12) de `schemas/` sont **régénérés depuis le
catalogue** par `node outils/indexer.js` : ils suivent les classes de base, et un test échoue s'ils sont périmés. Un
outil s'en sert pour proposer les bonnes clés, leurs types, leurs valeurs par défaut et leurs phrases d'aide ; le
validateur reste l'arbitre final.

Encodage : UTF-8, JSON strict (pas de commentaire, pas de virgule finale). Les nombres sont des nombres JSON ; les
booléens `true`/`false` ; l'absence de valeur `null`.

## 2 · Unités

### 2.1 Identifiant et héritage

- L'**identifiant** d'une unité est son chemin sans `unites/` ni `.json` : `capteurs/radars/fra_ajonc_300`. Dans
  `prive/unites/`, il prend le préfixe `prive/` : `prive/capteurs/radars/mon_radar`.
- `herite_de` (requis) cite le parent ; l'unité reprend toutes ses clés et ne remplace que celles qu'elle écrit. Pour
  une famille, partir de la classe de base indiquée dans son schéma (`examples` de `herite_de`).
- `nom` (requis) : nom affiché. `sources` (requis) : au moins une chaîne disant d'où viennent les valeurs.
- `fidelite` : `notionnel`, `cinematique`, `point_masse` ou `6ddl` (hérité si absent).
- `algos` : `{rôle: identifiant d'algorithme}` ; fusionné **rôle par rôle** avec celui du parent.
- `pays` : code ISO 3166 alpha-3 connu de `src/vue/pays.js`, ou `null`. `icone` : nom d'un fichier de `icones/` sans
  `.svg`, ou `null`.
- Toute clé **nouvelle** (absente des ancêtres) doit avoir sa phrase dans `_aide` : `"_aide": {"ma_cle": "…"}`.
- Les fichiers dont le nom commence par `_` sont des classes : on en hérite, on ne les place pas.

### 2.2 Unités physiques

Les valeurs s'écrivent dans les unités du métier ; le suffixe de la clé dit lesquelles, et le moteur convertit en SI
en ôtant le suffixe (`vitesse_kmh: 800` devient `vitesse: 222.2` m/s).

| Suffixe | Unité écrite | Unité SI | Suffixe | Unité écrite | Unité SI |
|---|---|---|---|---|---|
| `_kmh` | km/h | m/s | `_s` | s | s |
| `_km` | km | m | `_g` | g | g |
| `_m` | m | m | `_deg` | degré | radian |
| `_ms` | m/s | m/s | (aucun) | tel quel | tel quel |

### 2.3 Familles

| Schéma | Classe de base | Clés propres (en plus de nom, sources, fidélité, algos, pays, icône) | Rôles d'algorithme |
|---|---|---|---|
| `drone` | `vecteurs/drones/_drone` | `vitesse_kmh`, `altitude_croisiere_m` | mouvement |
| `avion` | `vecteurs/avions/_avion` | `vitesse_mise_a_poste_kmh`, `vitesse_engagement_kmh`, `facteur_charge_max_g`, `emport` (id d'effecteur), `emport_nombre`, `type_vecteur` (`avion`, `drone_arme`, `kamikaze`, `brouilleur`), `consomme_au_tir` | mouvement |
| `drone_defensif` | `vecteurs/drones_defensifs/_drone_defensif` | celles de l'avion | mouvement |
| `roquette` | `effecteurs/roquettes/_roquette_guidee` | `guidage` (`laser`, `ir`), `portee_km`, `pk`, `duree_designation_s`, `cadence_s`, `vitesse_ms` | tir |
| `charge_drone` | `effecteurs/drones/_charge_drone` | celles de la roquette | tir |
| `brouillage` | `effecteurs/brouillage/brouillage_notionnel` | `type` (`brouillage`), `portee_km`, `constante_temps_s` | — |
| `radar` | `capteurs/radars/radar_basse_altitude_notionnel` | `hauteur_antenne_m`, `portee_max_km` | detection |
| `poste` | `sites/postes/poste_sol_air_notionnel` | `portee_km`, `pk`, `engagements_par_passage`, `acquisition_s` | tir_sol |
| `liaison` | `liaisons/_liaison` | voir § 2.4 | — |
| `terrain` | `terrains/_terrain` | voir § 2.5 | — |

Exemple complet, une batterie :

```json
{
  "herite_de": "sites/postes/poste_sol_air_notionnel",
  "nom": "Batterie d'essai (notionnelle)",
  "sources": ["Ordre de grandeur notionnel de la classe"],
  "pays": null,
  "icone": "batterie_moyenne",
  "portee_km": 20,
  "pk": 0.6,
  "engagements_par_passage": 6,
  "acquisition_s": 15,
  "algos": {"tir_sol": "global/tir_sol/cadence_par_passage"}
}
```

Un algorithme porté par une unité (rôles mouvement, detection, tir, tir_sol) lit des paramètres déclarés dans sa fiche
(`meta.parametres`) : l'unité doit les contenir, sous leur nom SI (`portee` pour `portee_km`). Le validateur le vérifie.

### 2.4 Moyens de communication

| Clé | Sens |
|---|---|
| `type` | `filaire`, `radio`, `satellite` ou `optique` : fixe le trait du synoptique |
| `latence_s` | délai de bout en bout d'un message |
| `portee_km` | distance maximale entre les extrémités (40 000 : sans limite pratique) |
| `visibilite_directe` | `true` : la portée est bornée par l'horizon radioélectrique (k = 4/3) et le relief |
| `hauteur_antenne_m` | mât au sol ; une extrémité aérienne est à l'altitude du vecteur |

```json
{"herite_de": "liaisons/_liaison", "nom": "Radio HF (notionnelle)", "sources": ["Ordre de grandeur notionnel"],
 "type": "radio", "latence_s": 2, "portee_km": 1500, "visibilite_directe": false, "hauteur_antenne_m": 12}
```

### 2.5 Terrains

Une grille régulière en latitude et longitude, du sud au nord puis d'ouest en est :

| Clé | Sens |
|---|---|
| `lat_sud_deg`, `lon_ouest_deg` | coin sud-ouest (première ligne, première colonne) |
| `pas_lat_deg`, `pas_lon_deg` | écart entre lignes, entre colonnes |
| `pas_km` | pas nominal au sol, pour l'échantillonnage des masques |
| `lignes`, `colonnes` | dimensions de la grille |
| `altitudes_b64` | altitudes du sol en mètres, entiers signés 16 bits petit-boutistes, ligne par ligne du sud au nord, encodés en base64 : exactement `lignes × colonnes × 2` octets |

```python
import base64, struct
altitudes = [[0, 12, 30], [5, 40, 80]]                     # lignes du sud au nord
octets = b"".join(struct.pack("<h", a) for ligne in altitudes for a in ligne)
altitudes_b64 = base64.b64encode(octets).decode()
```

`node outils/terrain.js` fabrique un terrain depuis des tuiles de relief ; un outil externe peut écrire le même format.

## 3 · Icônes

Un SVG par silhouette dans `icones/` : `viewBox="0 0 64 64"`, tracé blanc (`#fff`) sur fond transparent, vu de dessus,
nez vers le haut. L'interface le teinte et le pose sur la pastille du pays. Pas d'insigne, de drapeau ni de logo.

## 4 · Algorithmes

Un algorithme est un **module ES autonome** : il exporte `meta` (schéma `schemas/algo_meta.schema.json`) et les
fonctions de son rôle. Il ne contient ni `import`, ni `require(`, ni `Math.random`, ni `Date.now`/`new Date`, ni
`fetch(`, ni `performance.` : tout ce dont il a besoin lui est passé.

### 4.1 Types communs

| Nom | Forme |
|---|---|
| `geo` | `{lat, lon, alt}` : radians WGS84, altitude en m au-dessus de l'ellipsoïde |
| `ecef` | `{x, y, z}` en m |
| `outils` | géodésie du moteur : `vers_ecef(geo)`, `depuis_ecef(ecef)`, `inverse(p1, p2)` → `{distance, azimut_depart, …}`, `direct(depart, azimut, distance)`, `distance_horizontale(a, b)`, `distance_oblique(e1, e2)`, `avancer_horizontalement(geo, ecef, ecefBut, pas)`, `point_radial(…)`, `vers_enu`/`depuis_enu`, `horizon_radar(h_antenne, h_cible)`, `G` |
| `hasard` | générateur à graine du raid : `uniforme(min, max)`, `succes(p)`, `entier(n)` — seul hasard permis |
| unité SI | l'unité résolue : clés sans suffixe, en SI (`portee`, `vitesse`, `pk`…) |

### 4.2 Rôles

| Rôle | Fonctions | Entrées | Sortie attendue |
|---|---|---|---|
| comportement | `planifier_drone(contexte, cible, hasard, outils)` | `contexte` : `{rouge` (unité SI du drone et réglages de l'essaim)`, cibles` (liste de `geo`)`, origine, rayon_apparition, caps, cap_commun}` ; `cible` : indice | `{position: geo, route: [geo…], depart: s}` ; la route finit sur la cible |
| mouvement | `avancer(mobile, route, distance, outils)` | `mobile` `{geo, ecef}` ; `route` `[{geo, ecef}…]` ; `distance` en m | `{geo, ecef, atteints}` ; jamais plus loin que `distance`, altitude conservée, entrées intactes |
| detection | `preparer(scenario, radar, outils)`, `detecte(etat, drone, outils)`, facultatif `detecte_par(etat, drone, outils)` | scénario résolu ; radar SI (et `sites`, `sites_unites` en disposition sites) ; `drone` `{id, geo, ecef, vitesse}` | `preparer` → état avec au moins `rayon_couverture` (m) ; `detecte` → booléen ; `detecte_par` → indices des radars qui voient |
| pistage | `pister(drones, outils)` | drones connus du centre | `[{drone, effectif}…]` ; chaque drone compte dans une seule piste |
| allocation | `allouer(avions, pistes, outils)` | avions libres `{id, geo, ecef, groupe` (unité SI : `vitesse_mise_a_poste`, `altitude`, `arme`…)`, munitions…}` ; pistes | `[{avion, point: geo ou null, explication?}…]` ; `explication` : `{pistes_connues, pistes_atteignables, retenue, alternatives}` pour l'inspecteur |
| tir | `planifier_tir(arme, distance)` | arme SI ; distance en m | `{vol: s, occupation: s}` |
| tir_sol | `cadence(poste, vitesse_cible)` | poste SI ; vitesse du drone en m/s | intervalle entre deux tirs, en s |
| guidage, filtrage, performance_radar | `acceleration` ; `initialiser`, `mettre_a_jour` ; `probabilite_detection` | bibliothèque privée | non appelés par le moteur public |

Squelette :

```js
export const meta = {
  role: "tir_sol", nom: "Cadence fixe", fidelite: "notionnel",
  description: "Un tir toutes les cadence_fixe secondes, quelle que soit la cible.",
  equations: ["Δt = cadence_fixe"], hypotheses: ["Rechargement instantané"],
  domaine_validite: "Ordres de grandeur.", references: ["Égide, docs/FORMATS.md § 4"],
  parametres: {cadence_fixe: {unite: "s", aide: "Intervalle entre deux tirs."}},
};

export function cadence(poste, vitesseCible) {
  return poste.cadence_fixe;
}
```

L'unité qui le porte doit alors avoir `cadence_fixe_s` (et sa phrase dans `_aide`) et citer
`"algos": {"tir_sol": "prive/tir_sol/cadence_fixe"}`. Rangement : `algos/global/<rôle>/` pour un algorithme public,
`prive/algos/<rôle>/` sinon. La suite de conformité applique d'elle-même les invariants du rôle à tout fichier déposé.

## 5 · Scénarios

Un scénario est un JSON de `"format": 2`. `scenarios/reference.json` en est la spécification vivante : chaque clé y
porte sa phrase dans `_aide`, et une clé sans phrase est refusée. Un outil qui génère un scénario part de ce fichier
et ne change que des valeurs, ou ajoute les clés optionnelles qu'il documente (`bleu.radar.sites[]`,
`bleu.sol.batteries[]`, `bleu.reseau.liaisons[]`, `bleu.reseau.equipements[]`, `bleu.reseau.centres[]`,
`theatre.cibles_placees`, `theatre.zones`, `rouge.plan_de_vol`, `bleu.ordres`…). Les unités y sont citées par
identifiant ; `surcharges` et `surcharges_emport` remplacent des clés existantes de l'unité, mêmes suffixes, et
`surcharges.algos` ne remplace que les rôles cités. Positions en `lat_deg`/`lon_deg` (WGS84, degrés décimaux).

Un scénario exporté par l'interface (« Exporter ») a exactement ce format ; un scénario produit par un outil se
recharge par « Importer », se range dans `scenarios/` (puis `node outils/indexer.js`), ou se joue en ligne de commande :
`node src/campagne.js --scenario scenarios/mon_scenario.json`.

## 6 · Rejeu pour moteur de jeu

Un fichier `.egide-rejeu` rejoue un raid dans un moteur de jeu (Godot, Unity, Unreal…). Égide reste l'autorité : le
client affiche ce qu'il lit, il ne simule rien. Il se produit par `node src/rejeu.js` (écrit dans `resultats/rejeux/`)
ou par « Exporter le rejeu » dans le panneau Scénario. Les deux chemins donnent le même contenu, à la même empreinte.

```sh
node src/rejeu.js --scenario scenarios/reference.json --echantillon 0.5 --simulation.graine 42
```

Compter environ 23 Mo pour le scénario de référence (1 000 drones, 20 min de raid, une image toutes les 0,5 s).

### 6.1 Structure

Le fichier est du **JSON lignes compressé en gzip** : un objet par ligne, que sa clé `genre` identifie. Le schéma de
chaque ligne est dans `schemas/rejeu.schema.json`.

| Ligne | `genre` | Contenu |
|---|---|---|
| 1 | `entete` | format, version, empreinte, graine, origine, repère, durées, colonnes, états, catalogue des unités |
| 2 | `statique` | drones (unité, nombre), vecteurs, sites, radars, postes, centres, liaisons, zones |
| suivantes | `image`, `evenement` | mêlées par instant croissant |
| dernière | `bilan` | bilan de la simulation, mêmes clés que `bilan()` du moteur |

Les évènements d'un pas précèdent l'image de la fin de ce pas. La dernière image est toujours celle de la fin du raid,
même hors de la grille d'échantillonnage.

### 6.2 Images

`{"genre": "image", "t": 12.5, "drones": [[…]], "vecteurs": [[…]], "postes": [40, 38, …]}`, `t` en secondes.

| Colonne | Unité | Sens |
|---|---|---|
| `id` | | numéro de l'entité, stable sur tout le raid |
| `e`, `n`, `u` | m | position dans le repère local, à 10 cm près |
| `alt` | m | altitude au-dessus de l'ellipsoïde |
| `cap_deg` | degrés | 0 à 360, depuis le nord, sens horaire |
| `etat` | rang | dans `entete.etats.drones` ou `entete.etats.vecteurs` |
| `munitions` | | vecteurs seulement ; 0 : à court |

`drones` ne liste que les drones en vol à cet instant : un drone absent n'est pas encore parti, est détruit (évènement
`tir` avec `detruit`) ou a frappé (évènement `impact`). `vecteurs` les liste tous, les perdus compris. `postes` donne
les munitions de chaque poste, dans l'ordre de `statique.postes`. L'ordre des colonnes fait foi dans `entete.colonnes`.

Le cap est mesuré sur le déplacement depuis l'image précédente : une entité immobile garde son dernier cap.

### 6.3 Repère

ENU en mètres, tangent à l'origine du théâtre (`entete.origine`) : `e` vers l'est, `n` vers le nord, `u` vers le haut
de l'origine. Les moteurs de jeu travaillent en flottants simple précision : des mètres locaux évitent les tremblements.

Le plan étant tangent, `u` descend avec la rotondité de la Terre : environ −7 km à 300 km de l'origine, pour un drone
qui vole à altitude constante. Deux façons d'afficher :

- `(e, n, u)` : positions exactes, à montrer sur un terrain exporté dans le même repère ;
- `(e, n, alt)` : monde plat, plus simple, déformé loin de l'origine.

Les images ne portent pas de latitude ni de longitude, ce qui divise le fichier par deux. Elles se retrouvent sans
perte : ECEF = ECEF(origine) + rotation ENU vers ECEF, puis géodésique (`depuis_enu` et `depuis_ecef` dans
`src/moteur/geodesie.js`). Le statique et les évènements écrivent chaque lieu sous les deux formes :
`{"lat_deg", "lon_deg", "alt_m", "e", "n", "u"}`.

### 6.4 Évènements

`{"genre": "evenement", "t": 358.5, "type": "tir", …}` reprend le journal du moteur, positions écrites en lieux :

| `type` | Champs |
|---|---|
| `detection` | `drone`, `radar`, `connu` |
| `mission` | `avion`, `point`, `effectif`, `arrivee`, `depuis`, `centre` |
| `reception` | `avion`, `ordre` |
| `ordre` | `avions`, `point` |
| `contact` | `avion`, `drone` |
| `tir` | `couche`, `de`, `vers`, `detruit`, `drone`, `pk`, `tireur` |
| `brouillage` | `tireur`, `drone`, `de`, `vers` |
| `impact` | `cible`, `drone` |
| `panne` | `element`, `cause` |
| `reseau` | `hs` |
| `reaction` | `nature`, `drone`, puis `de`, `vers` ou `point`, `foyer` |

Un nom de nœud (`radar:0`, `sol:3`, `avions:1`, `conduite`, `centre:0`) est celui du champ `noeud` du statique.

### 6.5 Vérifier un client

Fuites, destructions, munitions restantes et durée se recalculent à partir des images et des évènements :
`bilan_du_rejeu` dans `src/moteur/rejeu.js` fait référence, et le test vérifie qu'il redonne la ligne `bilan`. Les
nombres de tirs ne se recalculent pas : le journal note la résolution d'un tir, et un tir en vol sur un drone déjà
détruit n'en a pas.

Dans le catalogue de l'en-tête, `dimensions` vaut `null` tant que l'unité ne déclare pas cette clé : aucune unité du
catalogue public n'en déclare aujourd'hui.

## 7 · Stabilité

Le format de scénario est versionné (`format`) ; un format plus ancien est migré à la lecture. Les clés des unités ne
sont jamais retirées sans migration ; une clé ajoutée aux classes de base reçoit une valeur par défaut, si bien qu'un
fichier valide le reste. Les schémas de `schemas/` portent la forme de la version du dépôt où ils se trouvent. Le
fichier de rejeu porte sa `version` : un lecteur refuse celle qu'il ne connaît pas.
