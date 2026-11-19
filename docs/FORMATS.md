# Exchange formats

*English · [Français](FORMATS.fr.md)*

This document sets out what the Égide library can read, so that an external tool — unit modeller, algorithm generator,
export from another simulator — can produce valid files directly. It complements [CATALOGUE.md](CATALOGUE.md), which
explains the why; here is the what, to the character.

File keys, identifiers and enumerated values are French (`herite_de`, `portee_km`, `filaire`…): they are part of the
format and are written as shown, whatever the interface language.

| What the tool produces | Format | Where to put it | Machine contract |
|---|---|---|---|
| Unit (vehicle, effector, sensor, post) | JSON | `unites/<family>/<class>/<name>.json` or `prive/unites/…` | `schemas/unite.<family>.schema.json` |
| Means of communication | JSON | `unites/liaisons/<name>.json` or `prive/unites/liaisons/…` | `schemas/unite.liaison.schema.json` |
| Terrain | JSON | `unites/terrains/<name>.json` | `schemas/unite.terrain.schema.json` |
| Algorithm | ES module (`.js`) | `algos/global/<role>/<name>.js` or `prive/algos/<role>/<name>.js` | `schemas/algo_meta.schema.json` + § 4 |
| Scenario | JSON, format 2 | `scenarios/<name>.json` (or imported in the interface) | `scenarios/reference.json` + § 5 |

## 1 · Production chain

```sh
# 1. the tool writes its files in place in the repository (or in prive/)
# 2. check, with the rules of the conformity suite
node outils/valider.js prive/unites/capteurs/radars/mon_radar.json prive/algos/allocation/mon_algo.js
node outils/valider.js --json prive/unites/…        # machine report: [{fichier, genre, id, valide, defauts[]}]
# 3. update the indexes read by the interface (palette, explorer, library)
node outils/indexer.js
# 4. the whole catalogue, algorithm invariants included
npm test
```

`outils/valider.js` returns code 0 if everything is valid, 1 otherwise, and names each fault (key without help text,
missing algorithm or algorithm of the wrong role, parameter read but missing from the unit, unknown icon or country,
badly sized terrain grid, forbidden import in an algorithm…). The JSON schemas (draft 2020-12) in `schemas/` are
**regenerated from the catalogue** by `node outils/indexer.js`: they follow the base classes, and a test fails if they
are stale. A tool uses them to offer the right keys, their types, their default values and their help sentences; the
validator remains the final arbiter. The schemas' descriptions are in French, the language of the catalogue files;
`langues/catalogue.en.json` holds their English translation for display (CATALOGUE.md § 6.1).

Encoding: UTF-8, strict JSON (no comments, no trailing commas). Numbers are JSON numbers; booleans `true`/`false`; no
value is `null`.

## 2 · Units

### 2.1 Identifier and inheritance

- A unit's **identifier** is its path without `unites/` or `.json`: `capteurs/radars/fra_ajonc_300`. In
  `prive/unites/`, it takes the prefix `prive/`: `prive/capteurs/radars/mon_radar`.
- `herite_de` (required) names the parent; the unit takes all its keys and only replaces those it writes. For a
  family, start from the base class given in its schema (`examples` of `herite_de`).
- `nom` (required): displayed name. `sources` (required): at least one string saying where the values come from.
- `fidelite`: `notionnel`, `cinematique`, `point_masse` or `6ddl` (inherited if absent).
- `algos`: `{role: algorithm identifier}`; merged **role by role** with the parent's.
- `pays`: ISO 3166 alpha-3 code known to `src/vue/pays.js`, or `null`. `icone`: name of a file in `icones/` without
  `.svg`, or `null`.
- Every **new** key (absent from the ancestors) must have its sentence in `_aide`: `"_aide": {"ma_cle": "…"}`.
- Files whose name starts with `_` are classes: you inherit from them, you do not place them.

### 2.2 Physical units

Values are written in the trade's units; the key's suffix says which, and the engine converts to SI by removing the
suffix (`vitesse_kmh: 800` becomes `vitesse: 222.2` m/s).

| Suffix | Written unit | SI unit | Suffix | Written unit | SI unit |
|---|---|---|---|---|---|
| `_kmh` | km/h | m/s | `_s` | s | s |
| `_km` | km | m | `_g` | g | g |
| `_m` | m | m | `_deg` | degree | radian |
| `_ms` | m/s | m/s | (none) | as is | as is |

### 2.3 Families

| Schema | Base class | Own keys (besides name, sources, fidelity, algos, country, icon) | Algorithm roles |
|---|---|---|---|
| `drone` | `vecteurs/drones/_drone` | `vitesse_kmh`, `altitude_croisiere_m` | mouvement |
| `avion` | `vecteurs/avions/_avion` | `vitesse_mise_a_poste_kmh`, `vitesse_engagement_kmh`, `facteur_charge_max_g`, `emport` (effector id), `emport_nombre`, `type_vecteur` (`avion`, `drone_arme`, `kamikaze`, `brouilleur`), `consomme_au_tir` | mouvement |
| `drone_defensif` | `vecteurs/drones_defensifs/_drone_defensif` | those of the aircraft | mouvement |
| `roquette` | `effecteurs/roquettes/_roquette_guidee` | `guidage` (`laser`, `ir`), `portee_km`, `pk`, `duree_designation_s`, `cadence_s`, `vitesse_ms` | tir |
| `charge_drone` | `effecteurs/drones/_charge_drone` | those of the rocket | tir |
| `brouillage` | `effecteurs/brouillage/brouillage_notionnel` | `type` (`brouillage`), `portee_km`, `constante_temps_s` | — |
| `radar` | `capteurs/radars/radar_basse_altitude_notionnel` | `hauteur_antenne_m`, `portee_max_km` | detection |
| `poste` | `sites/postes/poste_sol_air_notionnel` | `portee_km`, `pk`, `engagements_par_passage`, `acquisition_s` | tir_sol |
| `liaison` | `liaisons/_liaison` | see § 2.4 | — |
| `terrain` | `terrains/_terrain` | see § 2.5 | — |

Complete example, a battery:

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

An algorithm carried by a unit (roles mouvement, detection, tir, tir_sol) reads parameters declared in its sheet
(`meta.parametres`): the unit must contain them, under their SI name (`portee` for `portee_km`). The validator checks it.

### 2.4 Means of communication

| Key | Meaning |
|---|---|
| `type` | `filaire`, `radio`, `satellite` or `optique`: sets the line style in the network diagram |
| `latence_s` | end-to-end delay of a message |
| `portee_km` | maximum distance between the ends (40,000: no practical limit) |
| `visibilite_directe` | `true`: the range is bounded by the radio horizon (k = 4/3) and the terrain |
| `hauteur_antenne_m` | ground mast; an airborne end is at the vehicle's altitude |

```json
{"herite_de": "liaisons/_liaison", "nom": "Radio HF (notionnelle)", "sources": ["Ordre de grandeur notionnel"],
 "type": "radio", "latence_s": 2, "portee_km": 1500, "visibilite_directe": false, "hauteur_antenne_m": 12}
```

### 2.5 Terrains

A regular grid in latitude and longitude, from south to north then from west to east:

| Key | Meaning |
|---|---|
| `lat_sud_deg`, `lon_ouest_deg` | south-west corner (first row, first column) |
| `pas_lat_deg`, `pas_lon_deg` | spacing between rows, between columns |
| `pas_km` | nominal ground spacing, for sampling the masks |
| `lignes`, `colonnes` | grid dimensions |
| `altitudes_b64` | ground altitudes in metres, signed 16-bit little-endian integers, row by row from south to north, base64-encoded: exactly `lignes × colonnes × 2` bytes |

```python
import base64, struct
altitudes = [[0, 12, 30], [5, 40, 80]]                     # rows from south to north
octets = b"".join(struct.pack("<h", a) for ligne in altitudes for a in ligne)
altitudes_b64 = base64.b64encode(octets).decode()
```

`node outils/terrain.js` makes a terrain from elevation tiles; an external tool can write the same format.

## 3 · Icons

One SVG per silhouette in `icones/`: `viewBox="0 0 64 64"`, white stroke (`#fff`) on a transparent background, seen
from above, nose up. The interface tints it and lays it on the country badge. No insignia, flag or logo.

## 4 · Algorithms

An algorithm is a **self-contained ES module**: it exports `meta` (schema `schemas/algo_meta.schema.json`) and the
functions of its role. It contains no `import`, no `require(`, no `Math.random`, no `Date.now`/`new Date`, no
`fetch(` and no `performance.`: everything it needs is passed to it.

### 4.1 Common types

| Name | Shape |
|---|---|
| `geo` | `{lat, lon, alt}`: WGS84 radians, altitude in m above the ellipsoid |
| `ecef` | `{x, y, z}` in m |
| `outils` | the engine's geodesy: `vers_ecef(geo)`, `depuis_ecef(ecef)`, `inverse(p1, p2)` → `{distance, azimut_depart, …}`, `direct(depart, azimut, distance)`, `distance_horizontale(a, b)`, `distance_oblique(e1, e2)`, `avancer_horizontalement(geo, ecef, ecefBut, pas)`, `point_radial(…)`, `vers_enu`/`depuis_enu`, `horizon_radar(h_antenne, h_cible)`, `G` |
| `hasard` | the raid's seeded generator: `uniforme(min, max)`, `succes(p)`, `entier(n)` — the only randomness allowed |
| SI unit | the resolved unit: keys without suffix, in SI (`portee`, `vitesse`, `pk`…) |

### 4.2 Roles

| Role | Functions | Inputs | Expected output |
|---|---|---|---|
| comportement | `planifier_drone(contexte, cible, hasard, outils)` | `contexte`: `{rouge` (SI unit of the drone and swarm settings)`, cibles` (list of `geo`)`, origine, rayon_apparition, caps, cap_commun}`; `cible`: index | `{position: geo, route: [geo…], depart: s}`; the route ends on the target |
| mouvement | `avancer(mobile, route, distance, outils)` | `mobile` `{geo, ecef}`; `route` `[{geo, ecef}…]`; `distance` in m | `{geo, ecef, atteints}`; never further than `distance`, altitude kept, inputs untouched |
| detection | `preparer(scenario, radar, outils)`, `detecte(etat, drone, outils)`, optional `detecte_par(etat, drone, outils)` | resolved scenario; SI radar (and `sites`, `sites_unites` in sites layout); `drone` `{id, geo, ecef, vitesse}` | `preparer` → state with at least `rayon_couverture` (m); `detecte` → boolean; `detecte_par` → indices of the radars that see |
| pistage | `pister(drones, outils)` | drones known to the centre | `[{drone, effectif}…]`; each drone counts in a single track |
| allocation | `allouer(avions, pistes, outils)` | free aircraft `{id, geo, ecef, groupe` (SI unit: `vitesse_mise_a_poste`, `altitude`, `arme`…)`, munitions…}`; tracks | `[{avion, point: geo or null, explication?}…]`; `explication`: `{pistes_connues, pistes_atteignables, retenue, alternatives}` for the inspector |
| tir | `planifier_tir(arme, distance)` | SI weapon; distance in m | `{vol: s, occupation: s}` |
| tir_sol | `cadence(poste, vitesse_cible)` | SI post; drone speed in m/s | interval between two shots, in s |
| guidage, filtrage, performance_radar | `acceleration`; `initialiser`, `mettre_a_jour`; `probabilite_detection` | private library | not called by the public engine |

Skeleton:

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

The unit that carries it must then have `cadence_fixe_s` (and its sentence in `_aide`) and name
`"algos": {"tir_sol": "prive/tir_sol/cadence_fixe"}`. Placement: `algos/global/<role>/` for a public algorithm,
`prive/algos/<role>/` otherwise. The conformity suite applies the role's invariants by itself to any file dropped in.
A public algorithm also gets its English sheet in `langues/catalogue.en.json` (CATALOGUE.md § 6.1).

## 5 · Scenarios

A scenario is a JSON file with `"format": 2`. `scenarios/reference.json` is its living specification: each key carries
its sentence in `_aide`, and a key without a sentence is refused. A tool that generates a scenario starts from this file
and only changes values, or adds the optional keys it documents (`bleu.radar.sites[]`, `bleu.sol.batteries[]`,
`bleu.reseau.liaisons[]`, `bleu.reseau.equipements[]`, `bleu.reseau.centres[]`, `theatre.cibles_placees`,
`theatre.zones`, `rouge.plan_de_vol`, `bleu.ordres`…). Units are named in it by identifier; `surcharges` and
`surcharges_emport` replace existing keys of the unit, same suffixes, and `surcharges.algos` only replaces the roles
named. Positions in `lat_deg`/`lon_deg` (WGS84, decimal degrees).

A scenario exported by the interface ("Export") has exactly this format; a scenario produced by a tool is reloaded with
"Import", put in `scenarios/` (then `node outils/indexer.js`), or played on the command line:
`node src/campagne.js --scenario scenarios/mon_scenario.json`.

## 6 · Replay for game engines

An `.egide-rejeu` file replays a raid in a game engine (Godot, Unity, Unreal…). Égide remains the authority: the client
shows what it reads, it simulates nothing. It is produced by `node src/rejeu.js` (written to `resultats/rejeux/`) or by
"Export the replay" in the Scenario panel. Both paths give the same content, with the same fingerprint.

```sh
node src/rejeu.js --scenario scenarios/reference.json --echantillon 0.5 --simulation.graine 42
```

Expect about 23 MB for the reference scenario (1,000 drones, 20-min raid, one frame every 0.5 s).

### 6.1 Structure

The file is **gzip-compressed JSON lines**: one object per line, identified by its `genre` key. The schema of each line
is in `schemas/rejeu.schema.json`.

| Line | `genre` | Content |
|---|---|---|
| 1 | `entete` | format, version, fingerprint, seed, origin, frame of reference, durations, columns, states, unit catalogue |
| 2 | `statique` | drones (unit, number), vehicles, sites, radars, posts, centres, links, areas |
| following | `image`, `evenement`, `couvertures` | interleaved by increasing time |
| last | `bilan` | simulation outcome, same keys as the engine's `bilan()` |

A step's events come before the frame at the end of that step. The last frame is always that of the end of the raid,
even off the sampling grid.

### 6.2 Frames

`{"genre": "image", "t": 12.5, "drones": [[…]], "vecteurs": [[…]], "postes": [40, 38, …]}`, `t` in seconds.

| Column | Unit | Meaning |
|---|---|---|
| `id` | | entity number, stable over the whole raid |
| `e`, `n`, `u` | m | position in the local frame, to 10 cm |
| `alt` | m | altitude above the ellipsoid |
| `cap_deg` | degrees | 0 to 360, from north, clockwise |
| `etat` | rank | in `entete.etats.drones` or `entete.etats.vecteurs` |
| `munitions` | | vehicles only; 0: out of ammunition |

`drones` only lists the drones airborne at that instant: an absent drone has not left yet, has been destroyed (`tir`
event with `detruit`) or has hit (`impact` event). `vecteurs` lists them all, lost ones included. `postes` gives each
post's munitions, in the order of `statique.postes`. The column order in `entete.colonnes` is authoritative.

A drone's heading points at the next point of its route. A vehicle's is its last move: when still, it keeps it (0 at the
start).

### 6.3 Frame of reference

ENU in metres, tangent at the theatre's origin (`entete.origine`): `e` east, `n` north, `u` up from the origin. Game
engines work in single-precision floats: local metres avoid jitter.

As the plane is tangent, `u` drops with the Earth's curvature: about −7 km at 300 km from the origin, for a drone flying
at constant altitude. Two ways to display:

- `(e, n, u)`: exact positions, to show on a terrain exported in the same frame;
- `(e, n, alt)`: flat world, simpler, distorted far from the origin.

**On a terrain, add the ground altitude to the chosen height.** The engine flies the swarm at constant altitude above
the ellipsoid, without following the terrain: without this addition, a drone at 100 m would be under ground at 300 m.
Égide's 3D view does the same (MODELE § 23). The static data and the events follow the same rule.

Frames carry no latitude or longitude, which halves the file. They are recovered without loss: ECEF = ECEF(origin) + ENU
to ECEF rotation, then geodetic (`depuis_enu` and `depuis_ecef` in `src/moteur/geodesie.js`). The static data and the
events write each place in both forms: `{"lat_deg", "lon_deg", "alt_m", "e", "n", "u"}`.

### 6.4 Events

`{"genre": "evenement", "t": 358.5, "type": "tir", …}` carries the engine's log, positions written as places:

| `type` | Fields |
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
| `reaction` | `nature`, `drone`, then `de`, `vers` or `point`, `foyer` |

A node name (`radar:0`, `sol:3`, `avions:1`, `conduite`, `centre:0`) is that of the `noeud` field of the static data.

### 6.5 Coverages

`{"genre": "couvertures", "t", "objets", "c2"}` is written at the initial instant, then at each network change (failure,
destruction of a centre). Meaning of the envelopes: `docs/MODELE.md` § 25.

- `objets`: `{noeud, genre ("radar", "poste", "vecteur"), id, unite, lieu, detection, conduite, interception, profil}`.
  Ranges in metres, 0 if the object does not have that envelope. A vehicle's `lieu` is that of the line's instant: the
  client centres its envelope on the current position, that of `vecteurs` at the object's `id`.
- `profil`: on a terrain, range for each degree of azimuth, to be bounded by `detection` or `interception`; otherwise
  `null`. It does not apply to `conduite`.
- `c2`: `{noeud, nom, hs, membres}`, `membres` being the ranks in `objets` linked to this centre. A centre's coverage is
  the union of its members' envelopes.

### 6.6 Checking a client

Leaks, destructions, remaining munitions and duration are recomputed from the frames and events: `bilan_du_rejeu` in
`src/moteur/rejeu.js` is the reference, and the test checks that it gives back the `bilan` line. For a complete client,
see § 8. Shot counts are not recomputed: the log records a shot's resolution, and a shot in flight at a drone already
destroyed has none.

In the header's catalogue, `dimensions` is `null` as long as the unit does not declare this key: no unit of the public
catalogue declares one today.

## 7 · Terrain for game engines

`node outils/export_terrain.js` writes the relief of a catalogue terrain to `resultats/terrains/<name>/`, in the replay's
local frame: the same theatre gives the same origin, so positions can be overlaid directly.

```sh
node outils/export_terrain.js --terrain terrains/centre_france --rayon-km 200 --pas-km 2
node outils/export_terrain.js --terrain terrains/centre_france --plat --imagerie fonds/ign_ortho --zoom-imagerie 9
```

`--scenario` (reference by default) sets the origin; it must be the replay's. `--terrain` replaces the scenario's
terrain, `--rayon-km` and `--pas-km` reduce the extent and the resolution. `terrain.json` describes the export: format,
version, terrain and sources, origin, frame, grid, heights, mesh, imagery.

### 7.1 Height map

`hauteurs.png`: 16-bit greyscale PNG, north up, west left, on the regular latitude and longitude grid (`terrain.json`:
`grille`). A pixel's altitude is `alt_min_m + value × echelle_m`. `hauteurs.raw` carries the same values as 16-bit
little-endian integers, for engines whose PNG loader reduces to 8 bits.

### 7.2 Mesh

`terrain.glb`: binary glTF 2.0, with positions, normals, UVs and 32-bit indices. glTF has Y up and Z backwards:
`(x, y, z) = (e, u, −n)`, in metres. With `--plat`, `y` is the altitude: the mesh then follows the replay's `(e, n, alt)`
reading (§ 6.3), and `terrain.json` states `"repere": "plat"`. The terrain and the replay must be read the same way.

### 7.3 Imagery

`--imagerie <source>` only accepts the sources whose file under `cartes/` has `"export_imagerie": true`, which rules out
those that forbid bulk download. The attribution and the conditions are copied into `terrain.json`, for the client to
display.

Tiles are written as served, without decoding or reprojection, in `imagerie/{z}/{x}/{y}.tuile` (JPEG or PNG). The client
assembles them into a mosaic of `colonnes × lignes` tiles, tile `(x_min, y_min)` at the top left. A missing tile (sea,
out of coverage) stays empty. The mesh UVs (`"uv": "mosaique"`) target this mosaic; without imagery (`"uv": "grille"`),
they follow the height map.

### 7.4 3D models

Detailed models, optional: an icon that has a file `modeles/<icone>.glb`, or an icon `prive/<name>` that has a file
`prive/modeles/<name>.glb` (listed in its folder's `index.json` for the browser) is displayed with it rather than with a
generic model. The file contains a single mesh in metres, Y up, +Z forward, colours in `COLOR_0`, multiplied by the
`baseColorTexture` texture (embedded PNG, `TEXCOORD_0`) if it exists. Files in `prive/` stay there; those in `modeles/`,
notional, are regenerated and not versioned.

`clients/modeles.json` gives the generic model of each icon (`icones`) and, failing that, of each family (`familles`). A
client starts from the unit named by the static data, reads its icon and family in the replay header's catalogue, then
displays its own model for that name. Sites and centres have no unit: icons `site` and `c2`. Égide ships no model of any
real system.

## 8 · Checking a client

`node outils/verifier_client.js --client dump.json` replays the scenario and compares. `dump.json` contains
`{"empreinte", "bilan_recalcule", "bilan_fichier", "images": [{"t", "drones": [[id, x, y, z], …], "vecteurs": […]}]}`,
positions in `(e, u, −n)`, without the ground added. Any position gap above 1 m, any outcome gap, or any unmatched entity
makes the command fail. `clients/README.md` gives the procedure for Godot and the porting notes.

## 9 · Stability

The scenario format is versioned (`format`); an older format is migrated on reading. Unit keys are never removed without
a migration; a key added to the base classes gets a default value, so that a valid file stays valid. The schemas in
`schemas/` carry the shape of the repository version they are in. The replay file carries its `version`: a reader
refuses one it does not know.

## 10 · Live game

`node src/direct.js [--scenario <file>] [--port 8767] [--langue en|fr] [--path value…]` runs the simulation and serves
it over WebSocket on `ws://127.0.0.1:8767`, JSON text messages, one record per message. The server only listens on this
computer and refuses any web page from another origin. The game starts paused. An arriving client receives the opening.

### 10.1 From server to client

The records are those of the replay (§ 6), with the same frame and the same columns.

| `genre` | When | Content |
|---|---|---|
| `entete` | opening | as § 6.1; `duree_s` and `images` are `null`, the end not being known in advance |
| `statique` | opening | as § 6.1 |
| `couvertures` | opening, then at each network change | as § 6.5 |
| `image` | opening, then at most ten times a second | as § 6.2; at high speed, only the last one of a tick is sent |
| `evenement` | as they come, before their step's frame | as § 6.4; never skipped |
| `etat` | after each useful tick and each command | `t` (s), `pause`, `vitesse`, `vitesse_obtenue`, `termine`, `bilan` at that instant |
| `bilan` | once, at the end of the raid | as in the replay |
| `archive` | after the outcome | `chemin` of the scenario played, `empreinte` |
| `erreur` | command refused | `commande`, `message` (in the server's language); the game goes on |

A client that cannot keep up loses frames, never events. An `entete` received midway announces a new game: the client
starts again from scratch.

### 10.2 From client to server

Each message carries its `type`:

| `type` | Fields | Effect |
|---|---|---|
| `pause`, `reprendre` | | stops or restarts the clock |
| `vitesse` | `valeur`, from 0 excluded to 60 | simulated time per real second |
| `ordre` | `avions` (ranks in `statique.vecteurs`), `e`, `n` (m, frame of § 6.3) | the vehicles head for this point, at the next step |
| `recommencer` | | same scenario, at the initial instant, paused |
| `modifier` | `modifications`: `{path: value}` | scenario changed by path (§ 5), restarted at the initial instant, paused |
| `langue` | `code`: `en` or `fr` | language of the texts the server sends from then on (palette, lists, refusals); palette and lists are sent again if it changes |

### 10.3 Saved game

At the end of a raid, the starting scenario and its orders go to `resultats/parties/`. `node src/rejeu.js --scenario
<that file>` makes its replay again, identical to the game played (MODELE § 26).
`clients/godot/scripts/verifier_direct.gd` plays a game and writes the dump to pass to
`outils/verifier_client.js --scenario <that file>` (§ 8).

### 10.4 Scenario editing

The client describes gestures; the server translates them through the browser editor's functions
(`src/vue/edition.js`, `src/vue/deploiement.js`), then restarts the game at the initial instant, paused. An edit is
refused once the raid has started.

| `type` | Fields | Effect |
|---|---|---|
| `editer`, `geste: "deposer"` | `id` (catalogue or `special/cible`, `special/centre`), `e`, `n`, optional `sous` (element key), `quantite` | places a unit from the palette |
| `editer`, `geste: "deplacer"` | `cles`, `de` and `vers` (`{e, n}`) | moves the elements |
| `editer`, `geste: "supprimer"` | `cles` | erases the elements |
| `editer`, `geste: "relier"` | `de`, `vers` (keys), optional `moyen` | creates a link |
| `editer`, `geste: "passage"` | `e`, `n` | adds a point to the flight plan |
| `editer`, `geste: "zone"` | `points` (`[{e, n}…]`, at least 3) | adds a protected area |
| `annuler`, `retablir` | | walks through the edit history |
| `enregistrer_scenario` | `nom` (letters, digits, `-`, `_`) | writes `prive/scenarios/<nom>.json`, outside the public repository |
| `charger_scenario` | `id` (from the `scenarios` list) | replaces the scenario |

In addition to § 10.1: `palette` (catalogue `familles`, each element with `rayon_m`, its preview range or `null`; names
and labels in the server's language) and `scenarios` when a client arrives, `elements` (`liste` `{cle, type, indice, e,
n}`, `liaisons`, `zones`) at each opening at the initial instant, `terrain` (the grid of § 2.5, or `id: null`) at each
opening, between the header and the static data, and `enregistre` (`chemin`).

### 10.5 Terrain editing

The server holds an altitude grid in the format of § 2.5, separate from the scenario until it is saved.

| `type` | Fields | Effect |
|---|---|---|
| `terrain_ouvrir` | `id` | opens a catalogue terrain |
| `terrain_nouveau` | optional `rayon_km` (320), `pas_km` (2) | flat grid around the scenario's origin |
| `terrain_debut` | `e`, `n` | starts a stroke: a single undo for the whole stroke; sets the "flatten" height |
| `terrain_pinceau` | `outil` (`elever`, `abaisser`, `aplanir`, `lisser`), `rayon_m`, `force_m`, `e`, `n` | retouches the grid |
| `terrain_annuler`, `terrain_retablir` | | walks through the strokes |
| `terrain_enregistrer` | `nom` | writes `prive/unites/terrains/<nom>.json`, makes the scenario name it and restarts the game |

Replies: `atelier_terrain` (the whole grid, at opening and after an undo) and `terrain_retouche` (`i0`, `j0`, `lignes`,
`colonnes`, `altitudes_b64` of the changed rectangle). A saved terrain is a terrain like any other: the engine derives
horizon masks and lines of sight from it (MODELE § 16).
