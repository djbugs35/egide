# Extending Égide: catalogue, units, algorithms

*English · [Français](CATALOGUE.fr.md)*

Égide is designed to be tuned and extended **without touching the engine**. Everything that describes the simulated
world is a file: a unit is a JSON file, an algorithm is a JavaScript module, a map or a terrain is a JSON file, a
scenario is a JSON file. The engine only orchestrates (order of steps, clock, draws, log); every value comes from a
unit and every decision is entrusted to an algorithm named by its identifier.

For an external tool that generates these files, the exact format, the JSON schemas and the validator are described
in [FORMATS.md](FORMATS.md).

This guide explains how these files fit together, how to add some, and how to prove the effect of an addition. The
equations and the formal contract are in [MODELE.md](MODELE.md) (§ 9.1 scenario and catalogue, § 10 algorithm
registry). File keys and identifiers are French (`herite_de`, `portee_km`…) and are written as shown.

## 1 · Overview

```
icones/                              SVG silhouettes of the game icons
unites/                              public unit catalogue (notional)
  _unite.json                        root: name, fidelity, sources, algos
  vecteurs/drones/                   threat: attack drones
  vecteurs/avions/                   piloted interceptors
  vecteurs/drones_defensifs/         armed drones, kamikaze interceptors, jammers
  effecteurs/roquettes/              weapons carried by aircraft
  effecteurs/drones/                 payloads of defensive drones
  effecteurs/brouillage/             jamming effect (notional probability)
  capteurs/radars/                   surveillance radars
  sites/postes/                      surface-to-air posts
  liaisons/                          means of communication (wired, radio, satellite, optical)
  terrains/                          terrains: altitude grids
algos/global/<role>/<algo>.js        public algorithms, sorted by role
cartes/fonds|relief|batiments/       base map sources (attribution required)
cartes/frontieres/pays.json          country borders (node outils/frontieres.js)
scenarios/                           scenario library
langues/catalogue.<code>.json        translations of the public catalogue (§ 6.1)
prive/unites/…  prive/algos/…        your private catalogue, ignored by git
```

To browse what exists: open **`catalogue.html`** ("Catalogue" link in the top bar; the inspector's sheets also lead
there). It shows each public unit with its resolved values (inheritance applied, units converted), the help sentence of
each key, its sources and its algorithms; and each algorithm with its sheet: description, equations, assumptions,
validity domain, references, parameters read.

## 2 · Units

### 2.1 One file per unit

A unit is identified by its path under `unites/`, without the extension: `vecteurs/avions/turbopropulseur_ir_notionnel`.
A minimal file inherits everything and only says what changes:

```json
{
  "herite_de": "vecteurs/avions/_avion",
  "nom": "Turbopropulseur d'appui, roquettes IR (notionnel)",
  "sources": ["Ordre de grandeur notionnel : classe des turbopropulseurs d'appui léger, 450 à 600 km/h"],
  "emport": "effecteurs/roquettes/roquette_guidee_ir_notionnelle"
}
```

Files whose name starts with `_` are **classes**: they carry a family's default values and help texts (`_avion`,
`_drone`, `_drone_defensif`, `_liaison`, `_terrain`…). You do not place them in a scenario, you inherit from them.

### 2.2 Inheritance

- `herite_de` names the parent. The parent's keys are taken, the file's replace them. The chain goes up to `_unite`.
- `algos` is **merged role by role**: a child unit that writes `"algos": {"mouvement": "…"}` only replaces its movement
  and keeps the other inherited roles.
- `_aide` is merged the same way: each key must have its help sentence, in the file or in an ancestor. That is what the
  interface, the inspector and the explorer show.

Example: `_drone_defensif` inherits from `_avion` (it takes its positioning, payload and consumption) and only changes
`type_vecteur` and the speeds; `intercepteur_kamikaze_notionnel` inherits from `_drone_defensif` and only changes its
payload and `consomme_au_tir`.

### 2.3 Physical units: suffixes

Files are written in the trade's units; the engine only sees SI. The key's suffix does the conversion on reading:

| Suffix | Unit in the file | SI key in the engine |
|---|---|---|
| `_kmh` | km/h | m/s (`vitesse_kmh` → `vitesse`) |
| `_km` | km | m |
| `_ms` | m/s | m/s |
| `_m` | m | m |
| `_s` | s | s |
| `_g` | g | g (load factor) |
| `_deg` | degree | radian |

A key without a suffix (`pk`, `engagements_par_passage`, `emport`…) is passed as is.

### 2.4 Fidelity and sources

Each unit declares `fidelite` — `notionnel` (orders of magnitude), `cinematique`, `point_masse` (3 degrees of freedom)
or `6ddl` — and at least one entry in `sources`. The public catalogue is **entirely notional**: orders of magnitude by
class, never the performance of an identified real system.

### 2.5 Country of inspiration and game icons

Two display keys, inherited like the others:

- `pays`: three-letter ISO 3166 code (`"FRA"`, `"USA"`…) of the country the class is inspired by. It is used for sorting
  (the palette's "Country" filter) and for the badge colour. The unit's name is fictional and its values remain those
  of the class, rounded: no public unit corresponds to an identified real system, and no sheet names the system that
  would have inspired it. The countries known to the interface are in `src/vue/pays.js`.
- `icone`: name of a silhouette in `icones/` (`radar_pylone`, `batterie_moyenne`, `chasseur`, `helicoptere`,
  `drone_delta`…). An icon is a square SVG (viewBox 64 × 64), white on a transparent background, seen from above; the
  map lays it on the country badge, ringed with the side's colour. `null`: APP-6 symbol only. The "Game icons" layer
  switches between the two.

The public catalogue has 35 units sorted by country (radars, batteries, aircraft and helicopters, defensive drones,
attack drones), named after plants: `unites/capteurs/radars/fra_ajonc_300.json` ("Gorse 300" in English),
`unites/vecteurs/drones/irn_chardon_d.json` ("Thistle D")… The conformity suite checks that every icon exists and
every country is known.

### 2.6 What each family sets

| Family | Main keys | Algorithm roles carried |
|---|---|---|
| `vecteurs/drones` | speed, cruise altitude | mouvement |
| `vecteurs/avions` | positioning and engagement speeds, load factor, `emport`, `emport_nombre`, `type_vecteur`, `consomme_au_tir` | mouvement |
| `vecteurs/drones_defensifs` | as aircraft, `type_vecteur`: armed drone, kamikaze, jammer | mouvement |
| `effecteurs/…` | weapon or payload data (notional) | tir |
| `capteurs/radars` | antenna height, maximum range | detection |
| `sites/postes` | range, Pk, engagements per pass, acquisition delay | tir_sol |
| `liaisons` | latency, range, need for line of sight | — |
| `terrains` | extent, spacing, altitude grid | — |

## 3 · Scenarios: naming and overriding

A scenario names units by identifier and can override their values **without creating a file**:

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

- `surcharges` changes the named unit (same syntax, same suffixes); `surcharges_emport` changes its weapon. An `algos`
  override only replaces the roles it names: `"surcharges": {"algos": {"mouvement": "…"}}`.
- Unit-by-unit deployment (MODELE § 21), which the editor writes for you with the mouse:
  - `bleu.radar.sites[].unite` gives a placed radar its own model;
  - `bleu.sol.batteries[]` places batteries one by one, each with `unite`, `munitions` and `surcharges`;
  - `bleu.reseau.centres[].allocation` gives a secondary centre its own allocation algorithm;
  - `bleu.reseau.equipements[]` (`{noeud, moyens}`) declares each node's means of communication.
- Every value of the scenario has a **dotted path**: `bleu.avions.1.nombre`, `rouge.tactique`,
  `rouge.surcharges.vitesse_kmh`, `bleu.conduite.allocation`, `bleu.reseau.mode`… The same path is used everywhere: in
  the Scenario panel, in the Sweep panel, and on the command line.
- Each scenario key carries its sentence in `_aide`, like the units.
- A v1 scenario is migrated on reading; resolution (units + overrides → SI values) is done identically in JavaScript
  and in Python, and a cross test checks it (`tests/resolution_reference.json`).

```sh
node src/campagne.js --bleu.avions.1.unite vecteurs/avions/turbopropulseur_ir_notionnel
node src/campagne.js --rouge.surcharges.vitesse_kmh 600 --bleu.radar.surcharges.portee_max_km 180
node src/campagne.js --balayer bleu.sol.nombre=0,1,2,4
```

The `scenarios/` library is filled by hand, with "Save" in the interface, or by auto-configuration
(`node src/autoconfig.js --pays FRA`). `node outils/indexer.js` updates `scenarios/index.json`.

## 4 · Algorithms

### 4.1 Roles

Each decision of the engine is a **role**. An algorithm holds a role; it is chosen by a unit or by the scenario.

| Role | Chosen by | Functions to export | What it decides |
|---|---|---|---|
| comportement | `rouge.tactique` | `planifier_drone(contexte, cible, hasard, outils)` | each enemy drone's route |
| mouvement | unit (drone, aircraft) `algos.mouvement` | `avancer(mobile, route, distance, outils)` | how a vehicle travels its route |
| detection | radar unit `algos.detection` | `preparer(scenario, radar, outils)`, `detecte(etat, drone, outils)`, optional `detecte_par` | who sees what |
| pistage | `bleu.conduite.pistage` | `pister(drones, outils)` | how detections form tracks |
| allocation | `bleu.conduite.allocation` | `allouer(avions, pistes, outils)` → `[{avion, point, explication}]` | which aircraft goes to which track |
| tir | weapon unit `algos.tir` | `planifier_tir(arme, distance)` → `{vol, occupation}` | a shot's flight time and busy time |
| tir_sol | post unit `algos.tir_sol` | `cadence(poste, vitesse_cible)` | a post's engagements on a target |

Public algorithms available: `algos/index.json` (or the `catalogue.html` explorer). For `rouge.tactique`, the short
names `direct`, `disperse`, `fourmi`, `plan_de_vol` stand for `global/comportement/essaim_…`; any full identifier is
accepted.

### 4.2 Contract

An algorithm is an ES module, `algos/global/<role>/<name>.js` (or `prive/algos/<role>/<name>.js`):

1. It exports `meta`: `role`, `nom`, `fidelite`, `description`, `equations`, `hypotheses`, `domaine_validite`,
   `references` (at least one) and `parametres` (each SI key read from the unit, with its unit and help text).
2. It exports the functions of its role, with the signature in the table.
3. It **imports nothing** and calls neither `Math.random`, nor the clock, nor the network. What it needs is passed to it:
   - `outils`: the engine's geodesy (`distance_horizontale`, `inverse` for distance and azimuth, `direct_avec_azimut`,
     `pas_vers`…), `horizon_radar` (radar horizon at k = 4/3) and `G`;
   - `hasard`: the raid's seeded generator, the only randomness allowed.

It is therefore pure and deterministic: same scenario, same seed, same result — which makes A/B duels and the
reproducibility fingerprint possible.

### 4.3 Complete example

`algos/global/allocation/plus_proche.js` is a deliberately simple example, to read before writing your own: each free
aircraft is sent to the current position of the nearest track.

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
    // … sort the tracks by outils.distance_horizontale(avion.geo, piste.drone.geo)
    return {avion, point: {...plus_proche.drone.geo, alt: avion.groupe.altitude}, explication};
  });
}
```

The `explication` (known tracks, chosen track, alternatives with delay and score) is what the inspector shows when you
click an aircraft: a well-written allocation algorithm says why it chose.

The `meta` texts are written in French, the catalogue's language; a public algorithm also gets its English sheet in
`langues/catalogue.en.json` (§ 6.1).

To try it:

```sh
node src/preuve.js duel --variante bleu.conduite.allocation=global/allocation/plus_proche
```

On the reference scenario, it lets markedly more drones through than density allocation (around 490 hits against 400
over 6 raids): it does not gather the aircraft on dense tracks.

### 4.4 Plugging in an algorithm

- Role carried by a unit: in the unit's file (or a child's), `"algos": {"detection": "global/detection/sites_radar"}`.
- Role carried by the scenario: the matching key (`rouge.tactique`, `bleu.conduite.pistage`,
  `bleu.conduite.allocation`), in the Scenario panel or with `--path value`.

The roles `guidage`, `filtrage` and `performance_radar` are reserved for the private library: the public engine does
not call them.

## 5 · Private catalogue

`prive/` is ignored by git. You can put there a clone of another, private repository, with the same tree:

```
prive/unites/vecteurs/avions/mon_avion.json     → identifier "prive/vecteurs/avions/mon_avion"
prive/algos/allocation/mon_allocation.js        → identifier "prive/allocation/mon_allocation"
```

- A private unit can inherit from a public unit (`"herite_de": "vecteurs/avions/_avion"`) and be named in any scenario.
- **Models of real systems, guidance or weapon performance go there only.** The public repository stays notional, by
  class.
- The automatic conformity checks also apply to private files.
- To be playable, a private unit goes into one of the engine's families (§ 2.6) and inherits from its public base,
  which brings its algorithms; elsewhere (for example `prive/menace/hypersonique/`), it remains a sheet you can browse
  in the catalogue but is absent from the palette.
- A private unit can have its own icon: `"icone": "prive/<name>"` reads `prive/icones/<name>.svg`.
- Private units have no translation: they show their own texts in every language.
- The Godot game stores under `prive/` what the player saves: scenarios in `prive/scenarios/`, terrains in
  `prive/unites/terrains/`.

### 5.1 Importing the private catalogue into the interface

A browser cannot list `prive/unites/`: `node outils/indexer.js` writes `prive/unites/index.json` there (outside git,
like the rest of `prive/`). The **Catalogue** page then offers three choices, remembered in the browser and also
applied to the simulation's palette:

- **Public only**: the private catalogue is ignored;
- **Merge**: private units are added to the public ones;
- **Replace**: in each folder where the private catalogue has at least one unit (`vecteurs/avions`, `sites/postes`…),
  the public units disappear from the palette; the folders it does not cover (terrains, rockets…) and the public `_`
  base classes remain.

When the private catalogue is imported, the scenario library also offers those listed in `prive/scenarios/index.json`
(`[{"id": "nom", "nom": "Displayed name"}]`, one file `prive/scenarios/<id>.json` per entry).

Without a private index, the interface stays on the public catalogue and the Catalogue page says what to run.
Scenarios always name units by identifier: a scenario that names a private unit only opens where `prive/` contains it.

## 6 · Conformity and indexes

After any addition or change:

```sh
node outils/indexer.js     # regenerates unites/, algos/, cartes/ and scenarios/index.json
npm test                   # the conformity suite checks every file dropped in by itself
```

The interface reads the indexes (a browser cannot list a folder); a stale index makes the tests fail. The
`tests/conformite.test.js` suite checks, with no test to write: complete `meta` sheet, placement under the right role,
no hidden dependency, named algorithms existing and of the right role, parameters read present in the unit, help text
present for each key, determinism, and the role's invariants (a movement never goes further than asked; a tracking
counts each drone only once; a behaviour leads each drone to its target…).

### 6.1 Translations

The catalogue files stay in French; their translations live beside them, in `langues/catalogue.<code>.json` (today
`catalogue.en.json`): for each unit its `nom`, its `sources` and the sentences of its `_aide` block; for each algorithm
the texts of its `meta` sheet (`nom`, `description`, `equations`, `hypotheses`, `domaine_validite`, `references`, and
each parameter's `aide`); for each repository scenario its `nom`; for each map source its `nom`, `attribution` and
`conditions`. The files do not change: the reproducibility fingerprint does not depend on the language. A missing entry
shows the French text, so a private unit is displayed as it is.

```sh
node outils/valider.js --langues   # missing and faulty entries of each catalogue dictionary
```

For the public catalogue, `npm test` requires a complete and consistent translation (same help keys, same number of
sources, equations, assumptions and references): adding a unit or an algorithm also means adding its English entry.

## 7 · Other data

| Data | Where | How to add it |
|---|---|---|
| Means of communication | `unites/liaisons/` | inherit from `_liaison`: `type`, `latence_s`, `portee_km`, `visibilite_directe`, `hauteur_antenne_m`; name the unit in `bleu.reseau.liaisons[]` |
| Terrain | `unites/terrains/` | `node outils/terrain.js --nom … --lat … --lon … --rayon_km … --pas_km …` (elevation tiles, or `--synthetique`); name it in `theatre.terrain` |
| Base map | `cartes/fonds|relief|batiments/` | one source per file, attribution required, plus its English `nom` and `conditions` in `langues/catalogue.en.json` |
| Borders | `cartes/frontieres/pays.json` | `node outils/frontieres.js` (Natural Earth), for auto-configuration by country |

## 8 · Proving the effect of a change

An addition to the catalogue is only worth something if its effect is measured honestly:

```sh
node src/preuve.js empreinte                                     # reproducibility fingerprint of the scenario
node src/preuve.js duel --variante bleu.avions.1.unite=prive/vecteurs/avions/mon_avion
node src/preuve.js morris --facteur bleu.radar.surcharges.portee_max_km=100:300 --facteur bleu.sol.nombre=0:4
node src/preuve.js dossier                                       # dossier.md: results, convergence, models
```

Every tool writes in English by default; add `--langue fr` (or set `EGIDE_LANGUE=fr`) for French, the evidence file
included.

The duel compares A and B on the **same draws** (same seeds) and gives the difference with its confidence interval:
that is what lets you say an algorithm or a unit does better, and not merely that chance was kind. The methods are
described in [MODELE.md § 14](MODELE.md).
