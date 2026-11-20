# Égide's mathematical model

*English · [Français](MODELE.fr.md)*

Reference for every formula in the code. The code cites the paragraph (`MODELE § 3.4`); an assumption enters here
before it enters the code. SI units in the equations; g = 9.806 65 m/s². Identifiers, scenario keys and file names are
French (`interception_profondeur_km`, `rouge.tactique`…) and are written as in the files.

## 1 · Frame and scenario
- Territory: disc of radius R; fixed targets spread over the disc.
- Drones: constant speed v_d, altitude h_d, trajectory unknown to the defender until detection.
- The defender knows the drones' position as soon as they enter radar coverage (§ 2), without knowing their
  destination.

## 2 · Detection: radar horizon
Geometric range between an antenna at h_r and a target at h_d (standard atmosphere, effective Earth radius 4/3):

  d_h = √(2 k R_T) · (√h_r + √h_d) ≈ 4.12 km · (√h_r[m] + √h_d[m])

Detection range: d_det = min(d_h, instrumented range). Example: 20 m / 100 m → ≈ 60 km.

## 3 · Aircraft: positioning
### 3.1 Turn
Level-flight radius at load factor n: r = v² / (g √(n² − 1)). Half-turn: t = π r / v.
At 500 km/h and 5 g: r ≈ 400 m, t ≈ 9 s — negligible compared with the delays of § 3.2.

### 3.2 Available delay
A drone detected at d_det from the border (§ 2) and intercepted at depth p inside the area
(key `interception_profondeur_km`) leaves:

  t = (d_det + p) / v_d − t_reaction

### 3.3 Positioning range
An aircraft does not pursue (v_a < v_d): it must place itself on the route before the drone passes. It can act on any
point less than ρ = v_a · t + r_weapon from its position when the order is given.

### 3.4 Aircraft that can be concentrated
Assumption: N aircraft spread uniformly over the disc of radius R (adjoining orbits). The number of aircraft that can
reach a given point is on average:

  k = N · min(1, (ρ / R)²)

It is an upper bound for a point near the edge (part of the disc of radius ρ falls outside the area).

### 3.5 Minimum positioning speed
Inverting § 3.4 to guarantee k aircraft on any route:

  v_min = (R √(k / N) − r_weapon) / t,   brought back to 0 if negative, infinite if k > N.

## 4 · Air-to-air engagement
### 4.1 Firing window
During a head-on pass, an aircraft has a window T_f = 2 r_weapon / (v_d + v_e), where v_e is its **engagement speed**
(once on station), distinct from the positioning speed v_a of § 3. Without this distinction, faster positioning would
shorten the window and would paradoxically push up the need for ground posts beyond 600 km/h.
### 4.2 Useful shots per pass
- Laser: n_L = min(payload, ⌊T_f / t_designation⌋) — a shot waits for the previous one's impact.
- IR: n_IR = min(payload, ⌊T_f / t_rate⌋).
### 4.3 Expected kills
E = n · Pk; a drone receives at most one shot at a time (no double shot in this basic model).

## 5 · Ground defence (without aircraft)
A post achieves e useful engagements per pass of a wave through its bubble.
- Shots needed for n drones aiming at one target: n / Pk.
- Posts needed per target: P = ⌈ n / (Pk · e) ⌉; total = sum over the targets.
- Robust sizing: n = maximum concentration the attacker can bring onto an unknown target, not
  n_total / number_of_targets.

## 6 · Multi-layer attrition (analytical approximation)
Survivors after the successive layers i: S_{i+1} = S_i − min(S_i, capacity_i · Pk_i).
### 6.1 Sharing aircraft between groups and pre-attrition
To bring c drones onto a target, the swarm forms G = min(targets, ⌈n_total / c⌉) simultaneous groups. The aircraft are
shared between them: a group receives A = min(k, N / G) aircraft (k of § 3.4). Pre-attrition of a group: A · E (E of
§ 4.3, a single pass per aircraft). Each target is sized for c drones minus this pre-attrition, since we do not know
which one will be targeted.

The simulation (step 2) replaces this approximation and must find it again when the swarm is uniformly spread.

## 7 · Known limits
- Radar coverage without terrain: continuous along the border, at the horizon of § 2 (terrain arrives in milestone 2).
- No countermeasures, no decoys, no avoidance manoeuvres by the drones.
- Perfect radar within its coverage (no false alarm, no track loss).
- No reloading of the aircraft during the raid.

## 8 · Multi-agent simulation (step 2, `src/moteur/`)
### 8.1 Time and randomness
Fixed step `simulation_pas_s` (0.5 s). Every draw goes through a seeded generator (`hasard.js`): a seed replays a raid
identically. A campaign (`src/campagne.js`) runs the seeds `graine`, `graine + 1`, … and summarises each quantity by its
mean and its 95% confidence interval (1.96 σ / √N).

### 8.2 Threat
Distribution over the targets: § 6.1 (G groups of equal size, targets drawn at random). Drones are born 20 km before
radar coverage and fly at constant speed; they only react to the defence if the scenario gives them a reaction
algorithm (`rouge.reaction`, § 22).
- `direct`: each group arrives from a random heading, in a tight wave (±1 km), and goes straight to its target.
- `disperse`: each drone has its own heading and leaves at an instant drawn within `drones_etalement_s`.
- `fourmi` (ant): the whole swarm enters on the same heading, in a 4 km column over `fourmi_largeur_couloir_km`, up to
  the burst point at `fourmi_eclatement_rayon_km` from the centre, then each drone heads for its target.

A drone that reaches its target hits it (leak); there is no lethal radius around the target.

### 8.3 Detection and planning
A drone is seen as soon as it enters the disc of radius R + d_det (§ 2); it is only usable by control after
`delai_reaction_s`. Every `avions_pas_decision_s`, control:
1. groups the drones seen into tracks (5 km cells), each weighted by its strength;
2. extrapolates each track in a straight line — it ignores the destination and the burst point;
3. for each free aircraft (armed, with no drone approaching), computes the shortest delay t such that
   |D + V t| ≤ v_a t + r_weapon (root of the quadratic, `delai_interception`), within a 15-min horizon;
4. sends the aircraft to the extrapolated point that maximises strength / (1 + aircraft already sent to the same cell).

### 8.4 Aircraft movement
Positioning at `avions_vitesse_kmh` (straight line; the turn, § 3.1, is neglected). As soon as a drone comes within 3
weapon ranges, the aircraft switches to engagement and flies towards it at `avions_vitesse_engagement_kmh`. With no
target left, it replans or returns to its orbit.

### 8.5 Shots
- Air: at the nearest untargeted drone in range. Laser: impact after `laser_duree_designation_s`, the aircraft does not
  fire meanwhile. IR: impact after the rocket's flight (700 m/s), next shot after `ir_cadence_s`. A targeted drone is not
  targeted a second time before the impact.
- Ground: posts on the targets, stock shared equally; shot at the nearest drone in the bubble, immediate result;
  rate = (r_sol / v_d) / e, to achieve the e engagements of § 5 during the crossing.

### 8.6 Expected gap with the closed-form formulas
The discrete step places one shot on entering the bubble and one on arrival at the target: a post achieves 8 to 9 shots
where § 5 counts 8. The acceptance tests (`tests/simulation.test.js`) check this range and that kills equal shots × Pk
within the confidence interval.

## 9 · Geodesy and scenario v2 (milestone 0)
### 9.1 Scenario v2 and catalogue
A scenario (`scenarios/*.json`, format 2) names its units by identifier; each unit is a file in `unites/` (public,
notional) or in `prive/unites/` (outside git, identifier prefixed `prive/`). A unit inherits its parent's keys
(`herite_de`); every key carries its help sentence in the unit or in an ancestor. The scenario can replace a unit value
(`surcharges`, `surcharges_emport`). Resolution gives an SI scenario in which each group carries its own parameters:
the fleet can be heterogeneous. Any value is changed by its path (`bleu.avions.1.nombre`, `rouge.surcharges.vitesse_kmh`),
whether in the interface, a sweep or the command line. A v1 scenario (flat keys of v0.1) is migrated on reading; the
migration is checked by the tests.

### 9.2 Ellipsoid and frames
WGS84: a = 6,378,137 m, f = 1/298.257 223 563. A position is (φ, λ, h) in radians and metres; its geocentric position
(ECEF) is cached. Two distances, each in its place:
- **slant** (straight ECEF line) for everything a sensor measures or a weapon covers: ranges, ground bubbles;
- **geodesic** (Vincenty, on the ellipsoid) for radar coverage around the centre and the placement of entities.

Vincenty is checked against GeographicLib's published examples (JFK → Heathrow, Wellington → Salamanca, the latter
nearly antipodal) to better than a millimetre. The method does not converge for exactly antipodal points: it then
raises an error rather than return a wrong value.

### 9.3 Movement at constant altitude
At each step, the direction of the goal is recomputed in the local tangent plane (East, North, Up) and the vehicle moves
v·Δt horizontally, through the meridian and normal radii of curvature M and N:
Δφ = Δn / (M + h), Δλ = Δe / ((N + h) cos φ). Recomputing the direction at each step follows the geodesic: over 100 km
with 111 m steps, the length travelled differs from the geodesic by less than 10 m (test).

### 9.4 Interception in three dimensions
The quadratic of § 8.3 is solved in ECEF, with three-component vectors. A track's straight-line extrapolation follows
the chord and passes under the surface by about d²/8R (≈ 785 m at 200 km): only the latitude and longitude of the
extrapolated point are kept, and the aircraft flies there at its group's altitude. Weapon ranges are slant distances:
an aircraft at 1,000 m reaches a drone at 100 m up to √(8² − 0.9²) ≈ 7.95 km of ground distance.

### 9.5 Spatial index
12 km cubic cells in ECEF, with no singularity at the poles or the antimeridian. A search walks the cells of the
enclosing cube, or the occupied cells when there are fewer of them. 12 km is the measured compromise between a compact
and a scattered swarm; the cell size changes no result, only the computing time.

### 9.6 Equivalence with v0.1
The flat engine of v0.1 has been frozen as statistics (`tests/references_v01.json`, 20 raids per tactic). The geodetic
engine must find them again within 3 σ on the difference of the means of hits and of air and ground kills
(`tests/equivalence_v01.test.js`), although the geometry differs (ellipsoid, aircraft at 1,000 m, azimuths counted from
north). With the seeds fixed, this test is deterministic.

### 9.7 Display
The scope projects positions in spherical azimuthal equidistant projection around the centre (mean radius
6,371,008.8 m): distances to the centre are exact to within 0.5% up to 300 km, and the rings stay circles. This
projection is for display only; no engine computation uses it.

## 10 · Algorithm registry (milestone 1)
### 10.1 Principle
The engine orchestrates (order of steps, spatial index, Pk draw, log); each decision is entrusted to an algorithm named
by a unit (`algos` of the unit file, merged role by role with its ancestors) or by the scenario (`rouge.tactique`,
`bleu.conduite.pistage`, `bleu.conduite.allocation`). An algorithm is an ES module in `algos/global/<role>/` or
`algos/unites/…`, or in `prive/algos/…` (identifier prefixed `prive/`).

### 10.2 An algorithm's contract
- It exports `meta`: role, name, fidelity, description, equations, assumptions, validity domain, references (at least
  one) and parameters read (SI key, unit, help text).
- It exports the functions of its role (`src/moteur/algos.js`, `ROLES`).
- It imports nothing and calls no global randomness, clock or network: geodesy and the seeded generator are passed to it
  as arguments. It is therefore pure, deterministic, and independent of its folder.

| Role | Carried by | Functions |
|---|---|---|
| comportement | scenario (`rouge.tactique`) | `planifier_drone(contexte, cible, hasard, outils)` |
| mouvement | unit (drone, aircraft) | `avancer(mobile, route, distance, outils)` |
| detection | unit (radar) | `preparer(scenario, radar, outils)`, `detecte(etat, drone, outils)` |
| pistage | scenario (`bleu.conduite.pistage`) | `pister(drones, outils)` |
| allocation | scenario (`bleu.conduite.allocation`) | `allouer(avions, pistes, outils)` |
| tir | unit (weapon) | `planifier_tir(arme, distance)` |
| tir_sol | unit (post) | `cadence(poste, vitesse_cible)` |

### 10.3 Proof of the port
The eight algorithms of `algos/global/` are milestone 0's behaviour taken out of the engine. Four reference raids (three
tactics, plus a small raid straddling the antimeridian) give exactly milestone 0's outcomes (`tests/portage_j0.test.js`).

### 10.4 Automatic conformity
`tests/conformite.test.js` applies to any file dropped in, public or private, with no hand-written test: complete sheet,
placement under the right role, no hidden dependency, named algorithms existing and of the right role, parameters read
present in the unit, determinism and per-role invariants (a movement never goes further than asked nor changes
altitude; a tracking counts each drone in a single track; a behaviour leads each drone to its target). The indexes
`unites/index.json` and `algos/index.json` are regenerated by `node outils/indexer.js`.

## 11 · Base map (milestone 2)
The map enters no computation: it is the background of the display. The engine keeps its geodesy (§ 9); the scope is
drawn on a transparent canvas laid over the MapLibre map, each geographic position going through the map's projection
(`src/vue/ecran.js`). Rings, border, coverage and bubbles are drawn as geodesic polygons (vertices computed by Vincenty
direct), hence right on any projection: Mercator, globe, tilted view. The scale bar gives the ground size of one pixel at
the centre of the view; in a tilted view or on the globe, it only holds near the centre.

The sources (base maps, terrain, buildings) are files in `cartes/` in the format of `cartes/_format.json`, each with its
attribution and terms of use; the conformity suite checks their keys and the presence of the attribution.

## 12 · Editor and flight plan (milestone 3)

**Preparation gestures.** Dragging the background moves the map, Shift+drag draws the selection box. A placing tool acts
on release, if the mouse has not moved: you can therefore move the map without leaving the tool, and dragging a unit
moves it even with a tool armed. At the same point, a unit takes precedence over the middle of a link. If several units
overlap on screen (less than 6 px apart), a click without movement, in selection, link or erase mode, opens the list to
pick the right one; dragging takes the one nearest the cursor. Right click leaves the current tool; it only sends the
selection during the raid (orders mode). During preparation, the raid is not simulated at each gesture: only the world
at t = 0 is rebuilt, and the full simulation takes place when leaving the editor. These choices only affect the
interface, not the results.

**Symbol size.** Beyond 1 km per pixel, symbols shrink as the 3/4 power of the scale, down to 30%; below 50%, the names,
the latencies of active links and the group badges disappear, broken links and hits remain written. Hovering and the
sheet always give the values. This only affects the display.
### 12.1 Placed positions
The scenario can fix targets (`theatre.cibles_placees`) and aircraft orbits (`bleu.avions[].orbites_placees`) in
{lat_deg, lon_deg}. Placed elements come first; the remainder up to the number requested is drawn at random as before
(§ 8). The number of targets never goes below the number of placed targets.

### 12.2 Editor gestures
Each gesture becomes changes by path of the scenario (`src/vue/edition.js`, pure and tested), exactly like a slider:
undo, export, saved settings and reproducibility by seed therefore apply to editing. Moving an element freezes all the
targets, or all the orbits of its group: nothing else moves on rereading. A move is a geodesic translation: each element
keeps its distance and azimuth from the reference point (the selection's barycentre for a right-click dispatch), so the
formation is preserved.

### 12.3 "Flight plan" behaviour
The swarm follows the drawn waypoints, in a column of width `fourmi_largeur_couloir_km` and 4 km deep; each drone keeps
its lateral offset, measured perpendicular to the leg, at each point. After the last point, it heads for its target. The
first point is the start: if it is inside radar coverage, the swarm is seen at once.

### 12.4 Orders during the raid
Paused at instant t, the editor switches to orders mode: you select aircraft and send them to a point. The order is
recorded in the scenario (`bleu.ordres`: instant, aircraft numbers, point), then the raid is recomputed from the start
and replayed up to t. At the first step where the order's instant is reached, the named aircraft still armed switch to
heading for the point, at their altitude; control no longer reassigns them before they arrive, but they still engage a
drone that approaches them, then resume their route. Once arrived, they become free again. Like any change, the order
replays identically with the same seed.

### 12.5 Areas
An area is a polygon of geographic vertices. A "protected" area counts, every 2 s, the active drones inside it (each
drone only once): that is the number of incursions, added to the outcome when the scenario has areas. Membership is
tested in the tangent plane at the area's barycentre (ray casting), which stays right for areas of a few hundred km. An
"annotation" area is for display only.

### 12.6 Profile view
The flight plan is sampled every km along the geodesics (at most 600 samples); under each sample, the terrain altitude
is read from the terrarium tiles of `cartes/relief/` at zoom 10 (about 150 m per pixel):
altitude = R × 256 + G + B / 256 − 32,768. The profile draws the swarm's flight altitude above the terrain. Without a
network, it falls back to the flight altitude alone. The engine itself does not yet take terrain into account.

## 13 · Physics explained (milestone 4)
### 13.1 Sheets
Each unit and each algorithm has its sheet in the explorer (`catalogue.html`): fidelity level, equations, assumptions,
validity domain, sources or references, parameters (with, for a unit, the ancestor that sets each value), link to the
code or data file, and what uses it. The sheets are drawn from the files themselves (the algorithms' `meta`, the units'
`_aide` and `sources`): they cannot diverge from the code. Their English texts come from `langues/catalogue.en.json`,
beside the files, which do not change (CATALOGUE.md § 6.1).

### 13.2 "Why" inspector
Clicking an entity opens its inspection, updated live:
- aircraft: state, position, speed, munitions, and control's last decision — chosen track, score
  strength / (1 + aircraft already sent), interception delay, known and reachable tracks, three best discarded
  alternatives. The allocation algorithm returns this explanation with its decision, without changing it (the reference
  outcomes stay exact, `tests/portage_j0.test.js`);
- drone: state, detection, remaining distance and time, each shot taken with its Pk and outcome, and the probability of
  surviving these shots, Π(1 − Pk);
- target: posts, munitions, hits, and the firing rate deduced from § 5.

### 13.3 Proof of the references
The code refers to the model with "MODELE § x"; `tests/conformite.test.js` checks that every reference in the code, the
algorithms and the analyses names an existing section of this document.

## 14 · Proof tools (milestone 5)
### 14.1 Reproducibility fingerprint
A result is only worth something if it can be redone. Each result of the proof tools carries a fingerprint: SHA-256 of
four parts, each hashed separately to say what changed between two results:
- `scenario`: the complete v2 scenario, in canonical JSON (sorted keys, `_aide` blocks removed);
- `unites`: the unit files loaded, bases and payloads included;
- `algos`: for each algorithm the scenario runs, its `meta` sheet and the code of each of its functions;
- `moteur`: the code of `src/moteur/`.

Randomness only depends on the seed (§ 8.1, mulberry32): two results with the same fingerprint, same seeds and same
draws are bit-for-bit identical. The result also carries its differences from the reference scenario, path by path. The
display language enters none of these parts: translations live beside the files and are applied only on display.

### 14.2 Time-step convergence
The engine advances by a fixed step Δt (0.5 s by default: 111 m for a drone at 800 km/h). A result must not depend on
this choice. The campaign is replayed at several steps, on the same seeds, and each step is compared with the finest one
draw by draw: mean difference d̄, standard deviation s_d, paired reduced gap z = |d̄| / (s_d / √n). A step is compliant
if, for each quantity, z ≤ 3 (gap indistinguishable from chance) or |d̄| ≤ 1% of the value at the fine step (real but
negligible gap: the raid's duration, for instance, is measured to within one step).

### 14.3 A/B duel with common random numbers
Compare two variants of a scenario (one tactic against another, 30 aircraft against 40) on the same seeds: draw i of A
and draw i of B start from the same seed. The differences are then paired: their variance is
Var(A) + Var(B) − 2 Cov(A, B), smaller than that of two independent campaigns as soon as both variants react the same
way to the same chance. The gain of common numbers, (Var A + Var B) / Var(B − A), says how many more independent draws
would be needed for the same precision. Verdict: "B > A" or "B < A" if z > 3, "indistinguishable" otherwise. A single
generator serves the whole raid: as soon as the variants diverge, their draws fall out of step, and the gain drops — it
is measured, never assumed.

### 14.4 Morris sensitivity screening
Which settings really weigh on a quantity? The Morris method (Morris 1991; Campolongo, Cariboni and Saltelli 2007)
answers with r (k + 1) evaluations for k factors. Each factor is brought back to [0, 1] over its range [min, max], on a
grid of p levels (p even); the step is Δ = p / (2(p − 1)). A trajectory starts from a point in the lower half of the
grid and increases each factor by Δ in turn, in a random order. The elementary effect of factor i is
EEᵢ = (y(x + Δᵢeᵢ) − y(x)) / Δᵢ, Δᵢ being the step actually taken after rounding an integer factor: it reads as the
change in the quantity when the factor runs over its whole range. Over r trajectories:
- μ* = mean of the |EEᵢ|: the factor's influence, used for ranking;
- μ = mean of the EEᵢ: the direction of the effect;
- σ = standard deviation of the EEᵢ: large compared with μ*, the effect depends on the other factors (non-linearity,
  interactions).

Each point is the mean of a few raids on the same seeds. The Monte Carlo noise of an elementary effect is estimated by
1.96 √2 σ̄_mean / Δ: a μ* below it cannot be told from chance. Morris ranks; a variance decomposition (Sobol) will then
quantify each factor's share.

### 14.5 Evidence file
`node src/preuve.js dossier` writes a Markdown file: fingerprint, differences from the reference scenario, results with
their 95% CI, time-step convergence, units and algorithms in play (fidelity, sources, assumptions), known limits and
the command to reproduce it. It is written in the chosen language (`--langue fr` or `EGIDE_LANGUE`, English by
default); its numbers and its fingerprint do not depend on it.

## 15 · Placed radars and network (milestone 6)
### 15.1 Radar layout
Two layouts, chosen by the scenario (`bleu.radar.disposition`):
- **frontiere** (border, reference, § 2): radars line the border; a drone is seen as soon as it comes within
  d = min(radar horizon, max range) of the area. For display and editing, this coverage is materialised by
  n = ⌈2π R / (√3 d)⌉ radars (at least 3) spread over the area's circle: two neighbours are at most √3 d apart, so that
  any drone crossing the border passes within d of one of them;
- **sites**: each radar is placed on the map (`bleu.radar.sites`). A drone is seen as soon as it is within range of at
  least one site, in slant distance between ECEF positions: ‖P_drone − P_site‖² ≤ d² + (h_drone − h_antenna)². Drones
  appear beyond the furthest coverage and, at least, beyond the border.

In the editor, moving, adding or removing a radar switches the scenario to the "sites" layout by writing in the
position of all the radars displayed. Detection stays memorised: a drone seen once stays tracked.

### 15.2 Information network
The network says what control knows and whom it can reach (`bleu.reseau`). Its nodes: the control centre ("conduite",
at the centre of the theatre unless a position is given), each radar ("radar:<i>", R<i+1>) and each aircraft group
("avions:<g>"). A link joins two nodes by a means from the catalogue (`unites/liaisons/`): family (wired, radio,
satellite, optical), end-to-end latency λ, range P and, for line-of-sight means, a ground antenna height h. The
effective range between two ends of heights h₁ and h₂ is P_eff = min(P, √(2 k R_T) (√h₁ + √h₂)), k = 4/3, for a
line-of-sight means, P otherwise.

- **Full mode** (reference): everyone talks to everyone, with no delay. Control learns each detection at that very
  instant; each aircraft can be reached. The outcomes are those before the network, identically
  (`tests/portage_j0.test.js`).
- **Links mode**: only the listed links carry information, both ways.
  - Links between ground nodes are active if their ends are less than P_eff apart; a radar's latency to control is that
    of the shortest path through active links (relays possible), infinite with no path.
  - A drone seen by radar i at instant t is known to control at t + λ_i; an unlinked radar sees for nothing. The radar
    that sees is named by the detection algorithm (`detecte_par`) or, failing that, is the nearest.
  - Control's reaction delay runs from the instant it knows the drone.
  - An aircraft can be reached if it is within range of at least one link between its group and a ground node linked to
    control, at the aircraft's altitude. An aircraft out of contact is no longer assigned: it finishes its current
    mission, then stays where it is; its own weapon sensors still engage the drones that pass within its range.

In the editor, the Link tool joins two nodes (radar, control centre, aircraft for its group) by the chosen means; from
the full network, the first link first materialises the default network (each radar to control by wire, control to each
group by radio). "Full network" goes back to it. The control centre moves like a unit. Limits of this first batch: the
latency of orders to the aircraft, throughput, jamming and links between drones are not yet modelled (docs/PLAN_V2.md,
milestone 7).

### 15.3 Map-centred interface
The map (or the scope) takes the whole screen. The rest floats on top and folds away: tactic and editing bar at the top,
rail of panels on the left (scenario, layers, sweep, profile, help; one at a time, keys 1 to 5), compact outcome at the
top right with its details folded, inspector below, playback at the bottom. The **layers** show or hide each family of
entities (IR aircraft, laser aircraft, radars, coverage, ground bubbles, detected or undetected drones, plots, flight
plan, shots, targets, areas, rings); a hidden entity cannot be hovered, inspected or edited. It is a display filter: the
simulation does not depend on it.

### 15.4 Failures, targeted control centre, CRC view
- **Latency of instructions**: a decision of control, or an order given in the editor, leaves from the control centre
  and only reaches the aircraft after the latency of its access (§ 15.2); an aircraft that cannot be reached does not
  receive it. An order on its way takes priority over control's following decisions.
- **Dated failures** (`bleu.reseau.pannes`): at instant t, a radar stops seeing, a link stops carrying information, or
  the control centre stops working (nothing is known any more, nobody is assigned any more); a duration makes it
  temporary, otherwise it is permanent. The network is recomputed at each change. In the editor, during the raid,
  Delete puts the selected radar, CRC or link out of service, at that instant. After the CRC's failure, a drone seen
  during the failure is only known on its return, if it is still seen.
- **Targeted control centre** (`bleu.reseau.conduite_ciblee`): it becomes one more target of the swarm, the last one,
  defended by ground posts like the others; at the first hit, it is destroyed for good.
- **CRC view**: the screen only shows the drones control knows, and the tracks of its tracking algorithm; ground truth
  is one button away (V). The positions shown are the known drones' true positions: the delay in updating tracks is not
  yet represented.

## 16 · Terrain in the engine (milestone 2)
### 16.1 Terrain
A terrain is a catalogue unit (`unites/terrains/`): regular grid in latitude and longitude, at 1 to 2 km spacing, of
ground altitudes in metres (16-bit integers encoded in base64), with its sources. The scenario names it in
`theatre.terrain` (null: smooth Earth, previous behaviour). `node outils/terrain.js` makes it from terrarium tiles
(dependency-free PNG decoder, `outils/png.js`), or as synthetic terrain for trials (`terrains/crete_notionnelle`: a
1,500 m ridge 170 km north of the centre, just beyond the border, and a 1,200 m massif to the south-east, which blind
the neighbouring radars towards the outside). Once made, the terrain is a file: the engine works offline. The altitude
at a point is interpolated between the four neighbouring nodes; outside the grid, it is 0.

### 16.2 Radar horizon mask
For each radar, with antenna altitude z_a = z_ground + h_antenna, the engine computes once, in 360 sectors of 1°, the
terrain's elevation angle at each distance step up to the range d:
θ(s) = (z_ground(s) − z_a) / s − s / (2 k R_T), k = 4/3, and its running maximum M(s). A drone at distance s, flying at
h_drone above the ground (terrain following: the drones' altitude is then a height above ground), is seen if
θ_drone(s) > M(s), that is if it rises above all the terrain before it. With a terrain, each radar sees according to its
mask (in border layout, the materialised radars of § 15.1, each within its range d); a drone is seen as soon as a
working radar sees it. The real coverage (range seen in each sector) replaces the circles on screen. The computation
goes through the radar's ENU frame (distance and azimuth to better than 0.1% up to 100 km).

### 16.3 Line of sight for links
A line-of-sight link (radio, optical) between two antennas of altitudes z₁ and z₂, D apart, passes if, at each point s
from the first, z_ground(s) < z₁ + (z₂ − z₁) s / D − s (D − s) / (2 k R_T) (straight ray, Earth of effective radius).
The test applies to links between ground nodes and to each aircraft's access (flight altitude above the ellipsoid).

## 17 · Flow of information (milestone 8)
### 17.1 The chain, step by step
1. **A radar sees.** A drone enters its range (or comes out from behind the terrain, § 16.2).
2. **The information goes up to the CRC** after the latency of the shortest path through active links (§ 15.2), or never
   arrives if the radar is not linked; in a full network, at once.
3. **The CRC waits for its reaction delay** (`bleu.conduite.delai_reaction_s`), then, at each decision step, groups the
   drones it knows into tracks (tracking) and assigns each free and reachable aircraft its best track (allocation,
   § 8.3).
4. **The mission goes down to the aircraft** after the latency of its access (§ 15.4); the aircraft leaves for the
   interception point at its positioning speed.
5. **The aircraft locks onto a drone with its own sensor** as soon as an approaching drone comes within three ranges of
   its weapon: it pursues it without waiting for control, then fires in range (§ 4.2).
6. **The ground posts fire at whatever enters their bubble**; they are not yet warned by the network (milestone 9:
   designation by the control and reporting centre).

### 17.2 Log and display
The engine logs, during playback only (not in campaigns), each link of the chain: `detection` (drone, radar, instant of
arrival at the CRC or null), `mission` (aircraft, track strength, access node, instant of reception), `reception`,
`contact` (aircraft, drone), `tir`, `impact`, `ordre`, `panne`, `reseau`. The log changes nothing in the run: the
reference outcomes stay exact (`tests/portage_j0.test.js`).

On screen ("Information flow" layer): a blue pulse from a radar to the CRC with the number of drones reported (red and
stopped if the information goes nowhere), a white pulse from the CRC to the aircraft on mission, a white circle when
the aircraft receives it, yellow dashes when it locks onto a drone. The Log panel tells the same story in sentences
(detections grouped by radar over 10 s), filterable by family; a drone's inspector gives its complete chain. These
sentences are in the interface's language; the events they tell are the same.

## 18 · Control and reporting centres (milestone 9)
### 18.1 Several centres, one picture each
The main centre ("conduite", displayed CRC) and the added centres (`bleu.reseau.centres`, nodes "centre:<k>") receive
the radars' detections, turn them into tracks, send the aircraft and designate the drones to the ground posts. Each
centre has its own picture: it knows a drone seen by radar i at t + λ_c,i, the latency of the shortest path from the
radar to it; a path can go through another centre (track exchange between centres). In a full network, all the
centres know everything at once.

### 18.2 Aircraft control
Each aircraft is controlled by the centre that reaches it fastest (§ 15.2, access per centre). At each decision step,
each centre assigns the free aircraft it controls to the tracks of the drones it has known for at least the reaction
delay. If a centre falls, its aircraft pass to the centre that still reaches them; if there is none left, they are no
longer assigned. A single centre in a full network gives back the earlier outcomes (`tests/portage_j0.test.js`).

### 18.3 Designation of the ground posts
A target's ground posts form the node "sol:<i>". A drone is **designated** to the posts when a centre knows it and the
information has had time to go from the centre to the posts: known_c + λ_c,sol ≤ t. Designated, the post fires as soon
as it is in its bubble, at the nearest; otherwise, the post must acquire it on its own: it takes the drone that enters
its bubble (the furthest, the first its sensor sees), that the neighbouring posts of the same target do not already
have in acquisition, keeps it as long as it stays, and only fires after its unit's acquisition delay (`acquisition_s`,
10 s for the notional post). On the reference scenario in links mode (8 raids), the posts linked to the CRC shoot down
312 drones, against 231 without a link; hits go from 432 ± 52 to 515 ± 42. In a full network, every known drone is
designated. The log tells designated shots from shots after acquisition.

### 18.4 Editor
CRC tool (K): add a centre; it is moved, deleted and put out of service during the raid like a radar. The Link tool also
joins a centre, or a target's posts (click on the target). The default network links each radar to the CRC by wire,
the CRC to each aircraft group by radio, to each target's posts and to each other centre by wire.

## 19 · Defensive drones (milestone 10)
### 19.1 Principle
Defensive drones are catalogue vehicles (`unites/vecteurs/drones_defensifs/`), stored like aircraft in `bleu.avions`:
they wait at a position, are assigned by the centre that reaches them (§ 18.2), head for their point, lock with their
own sensor onto the approaching enemy drone (§ 17.1) and engage it. Only their speed, payload and family
(`type_vecteur`) change. Notional models by class: public orders of magnitude, no performance of real systems, no
guidance law.

### 19.2 Armed drones and single-use interceptors
- **Armed drone**: two short-range payloads (1 km, Pk 0.4), "fire and forget" shot (§ 4.2), reusable.
- **Single-use interceptor**: it is its own weapon; it rams its target to within 300 m (Pk 0.6) and is lost on its first
  shot, whether it destroys it or not (`consomme_au_tir`). The outcome counts the interceptors lost.

### 19.3 Jammers
A jammer does not fire. Notional area effect, with no signal or countermeasure model: each active enemy drone within
radius r of the jammer (3 km) is neutralised, at each step Δt, with probability p = 1 − exp(−Δt / τ), τ being the
jamming time constant (60 s); a drone kept t seconds within the radius escapes with probability exp(−t / τ). The
outcome counts the drones neutralised by jamming.

The reference scenario carries an empty group of each family: its outcomes are unchanged, and the "Defensive drones"
sliders of the Scenario panel fill them.

## 20 · Auto-configuration (milestone 11)
### 20.1 Construction
The request brings together the threats to consider (tactic and number of drones, one or several), the means available
(radars, centres, targets to defend, ground posts and munitions, aircraft, defensive drones) and an area: a country
(`cartes/frontieres/pays.json`, Natural Earth, public domain; its largest outline is kept, the mainland rather than an
island) or an area drawn in the editor. The scenario built:
- centres the theatre on the area's barycentre, with the circumscribed radius as radius, and sets the area as a
  protected area (incursions are counted there);
- spreads the targets over the area by drawing the point furthest from the points already chosen among inner
  candidates; the main CRC at the barycentre if it is inside the area, otherwise on the most central target; the other
  centres the same way;
- places the radars at regular intervals along the outline ("sites" layout, § 15.1).

### 20.2 Searching for the distribution
Three parameters describe the distribution: `avions` (fraction of the way from the area's centre to regularly spaced
points of the outline, where the aircraft orbit: 0.35, 0.6 or 0.85), `drones` (distance of the defensive drones around
the targets, as a fraction of half the radius: 0.1 or 0.5) and `radars` (push of the radars beyond the outline, as a
fraction of their range: 0 or 0.5). Starting from (0.6; 0.1; 0), the search tries in turn the other values of each
parameter and keeps those that lower the mean hits, all threats and all seeds together (common random numbers, § 14.3).
The **uniform** distribution (orbits drawn at random over the theatre's disc, radars on the outline) is the reference:
the difference chosen − uniform is given with its 95% CI over the paired raids, and declared significant if z > 3.
Local search, not a global optimum: it finds a good distribution among those described, not the best possible.

### 20.3 Library
`node src/autoconfig.js` writes the scenario to `scenarios/` and reindexes the library (`scenarios/index.json`); in the
interface, the result is applied, stored in the browser's library or exported. The "Library" list of the Scenario panel
loads a scenario from the repository or the browser as the new base.

## 21 · Unit-by-unit deployment (milestone 12)
### 21.1 Radars of different units
In the `sites` layout, each site can name its own unit (`bleu.radar.sites[].unite`) and its overrides. Its antenna
height sets the site's altitude, and its range against the swarm is
`d_i = min(√(2 k R_T)(√h_i + √h_c), max_range_i)`. Detection, information network and terrain masks take `d_i` site by
site. Without its own unit, a site takes those of the common radar, and the result is unchanged.

### 21.2 Placed batteries
`bleu.sol.batteries[]` places batteries one by one, in addition to the `nombre` posts spread over the targets. Each has
its position, its munitions and its unit (range, Pk, engagements per pass, acquisition delay, `tir_sol` algorithm). It
fires on its own bubble at its own rate. For the network, it is attached to the nearest target and shares its node
`sol:<i>` (designation and latency, § 18.3).

### 21.3 Algorithms per unit, per group or per centre
The `surcharges` of a group, a site or a battery can carry `algos`; they only replace the roles they name, as in a child
unit (§ 10.1). A secondary centre can have its own allocation algorithm (`bleu.reseau.centres[].allocation`); otherwise
it takes that of `bleu.conduite`.

### 21.4 Communication equipment
`bleu.reseau.equipements[]` declares the means each node is equipped with (radio, satellite, wired, optical…). In the
browser, the link drawn by hand (Link tool, or click on a means in the palette) takes the chosen means, even if absent
from one end's declared equipment, which is then completed; between two ground nodes, it is refused, with the reason
shown, if the distance exceeds the range. The Godot client keeps the rule of the common means, the fastest one when no
choice is made. The range of a vehicle link is judged in the simulation, aircraft by aircraft (§ 15.2). Each unit's
sheet lists its connections by family of means: other end, means, distance over range (at the mean orbit for vehicles),
latency and state. "Auto-link" joins any pair of nodes that share a means, if the distance fits in its range and, for a
line-of-sight means, if the horizon (and the terrain) allows it. The engine only reads the resulting links (§ 15.2).

### 21.5 Deployment editor
In editing mode, the "Deploy" palette lists the catalogue by family. Click a unit then the map, or drag it. A means of
communication or a weapon is dropped on a unit already placed. Each drop and each setting of the sheet (model,
algorithms by role, munitions, numbers, means) is a change by path of the scenario. Undo, export, the library and the
replay therefore apply automatically. A vehicle group grows with each drop: the orbits of the aircraft already placed
are frozen and the new ones orbit at the dropped point.

### 21.6 Deployment aids (milestone 13)
In editing, the view is locked top-down: no tilt, no rotation, no 3D terrain, no globe; it takes back its settings on
leaving. These aids never enter the computation: they only change the point where you place.

- **Ruler**: distance and initial heading on the ellipsoid (Vincenty, § 9), drawn along the geodesic.
- **Snap to grid**: the grid of spacing `p` lives in the theatre's azimuthal equidistant plane. A point at distance `d`
  and azimuth `α` from the origin has coordinates `x = d sin α`, `y = d cos α`, rounded to the nearest multiple of `p`,
  then brought back onto the ellipsoid. Assumption: regular mesh in this plane, hence slightly distorted far from the
  origin; it is for aligning units, not for measuring.
- **Snap to units**: placement goes onto the unit less than 12 px from the cursor, moved units excluded.
- **Previews**: a radar shows its range against the swarm, `min(horizon(h, swarm altitude), instrumented range)` (§ 2),
  without terrain masking; a battery, its bubble; a link, `portee_liaison` (§ 15.2) from its first node, the other end
  assumed on the ground on the means' mast.
- **Grouping**: aircraft less than 14 px apart on screen carry the number of overlapping aircraft; each one's drawing and
  selection do not change.

## 22 · Reactive swarm (milestone 16)
### 22.1 Principle and perception
By default the swarm does not react (`rouge.reaction` null): every earlier result is unchanged. With a reaction
algorithm (role `reaction`, `algos/global/reaction/…`), each drone questions its route and its target during the flight,
from what the swarm knows of the defence. Notional decision model, with no real performance.

Perception assumptions, all simplifying:
- **Connected mesh network**: a lost drone (shot down by air or ground, neutralised by jamming) is known to the whole
  swarm Δ_m seconds later (`reaction_delai_s`) with its last position and the instant; likewise a hit on a target. The
  swarm sees neither the radars, nor the aircraft, nor the posts: it only learns from its losses.
- **Loss hotspots**: each known loss joins the nearest hotspot less than r_d (`reaction_rayon_danger_km`) from its
  centre, otherwise founds a hotspot centred on it. A hotspot of n ≥ n_s losses (`reaction_seuil_pertes`) is deemed
  defended.
- **Per-target outcome**: for target k, P_k known losses within r_d of it and F_k known hits. The swarm estimates the
  survival at the terminal by Laplace's rule of succession: ŝ_k = (F_k + 1) / (F_k + P_k + 2).
- Decisions are taken every Δ_r seconds (`reaction_pas_s`), and only when the swarm's knowledge has changed since the
  previous decision. No random draw: the reaction does not change the generator's sequence, and an A/B duel (§ 14.3)
  with and without reaction keeps its common random numbers.

### 22.2 Target reassignment
A drone engaged (within r_d of its target) no longer changes it. Otherwise, it compares its target c with the targets k
whose ground distance d_k satisfies d_k ≤ (1 + a) d_c (a: `reaction_allongement_max`) and that have already been hit
(F_k ≥ 1: proven breach), and switches to the best if ŝ_k − ŝ_c ≥ g (`reaction_seuil_gain`), at most m times
(`reaction_reaffectations_max`). Only the last point of its route changes: a flight plan or a corridor already engaged
is kept. The effect sought: shifting the effort from the targets whose posts kill to those that let through. The
breach condition is measured: without it, the drones fled towards targets never approached, as defended as the others,
and abandoned targets whose posts were about to run out of munitions (scattered swarm of the reference scenario: 100
hits instead of 163 without reaction, seed 1).

### 22.3 Bypassing hotspots
For the current leg (from the drone to the next waypoint, distance d_w, azimuth α_w), a defended hotspot whose centre is
at distance d_f and azimuth α_f is on the way if 0 < x < d_w and |y| < r_d, with, on the sphere of radius R = 6,371 km
(spherical approximation, reserved for the decision; the movement stays geodesic, § 9.3):
- lateral offset y = R asin(sin(d_f / R) sin(α_f − α_w)),
- abscissa x = R acos(cos(d_f / R) / cos(y / R)) if cos(α_f − α_w) > 0, otherwise negative.

Only the hotspots that contain a target other than its own (within r_d) are bypassed: they are fixed defended sites.
Losses due to aircraft follow aircraft that move, and bypassing them lengthened the routes with no gain (−1% to −3%
hits measured on the reference scenario); nor does a drone bypass its own target. The drone then inserts a detour point
at the tangent of the circle of radius ρ = 1.3 r_d, on the side the leg already passes: azimuth
α_f ∓ asin(min(1, ρ / d_f)) (sign opposite to that of y), distance √(max(d_f² − ρ², 0)) (local tangent plane, d_f ≪ R).
The detour is refused if it lengthens the leg by more than a d_w, or if the drone has already made
`reaction_detours_max` detours. The nearest hotspot on the way is handled first; the following ones will be at the next
decisions.

### 22.4 Dodging
A drone targeted by an air rocket in flight knows it (notional approach warning) and manoeuvres until impact: the
shot's Pk is multiplied by (1 − e) (`reaction_esquive_reduction`) and the drone's progress along its route by (1 − v_e)
(`reaction_esquive_perte_vitesse`) as long as a shot targets it. Ground shots, resolved instantly (§ 8.5), and jamming do
not open a dodge. Aggregated effect, with no guidance or manoeuvre law.

### 22.5 Outcome and inspector
With a reaction, the outcome adds `reaffectations`, `detours` and `esquives` (number of air shots dodged, whether they
hit or not). The log keeps each reaction (`reaction`: drone, nature, target or detour point, hotspot), which the
inspector reads back to say why a drone changed course.

### 22.6 Measured effect
Paired duel (§ 14.3) on the reference scenario, seeds 1 to 10, default settings: mean hits without reaction, then the
difference with reaction and its 95% confidence interval (Student, 9 degrees of freedom).
- `fourmi`: 362 hits, +147 ± 80 (+41%); the compact column learns little in time, the dodge does most of the work.
- `direct`: 486 hits, +90 ± 68 (+18%).
- `disperse`: 182 hits, +115 ± 14 (+63%); the spread departures give the last drones time to learn from the first.

## 23 · Observer 3D view (milestone 14)
The 3D view (CesiumJS) never enters the computation: it shows the engine's geodetic positions, with no second
computation, according to the same layers as 2D. Display assumptions:

- **Altitudes**: drones and vehicles are drawn at their engine altitude **above the displayed ground**, not above the
  ellipsoid. The engine flies the swarm at constant altitude above the ellipsoid: a drone at 100 m would otherwise pass
  under 1,000 m terrain. This gap only concerns the image: the horizontal position is exactly the engine's, so is the
  altitude shown in the tooltip, and the computation does not depend on it. The exaggeration factor, if any, shown on
  screen, multiplies this height. A stem links each airborne unit to the ground. Radars at the height of their mast
  above the terrain, batteries, centres and sites set on the ground.
- **Silhouettes**: a drone less than 80 km from the camera is drawn as a silhouette oriented by its heading to the next
  point of its route, otherwise as a dot; at most 150 drone stems, beyond that a cloud of lines can no longer be read.
- **Models**: a unit whose icon has a file `modeles/<icone>.glb` (notional classes, `node outils/modeles3d/classes.js`)
  or `prive/modeles/<icone>.glb` is drawn as a 3D model between 60 m and 400 km from the camera, at its real size but
  never below 80 pixels; the pictogram comes back beyond that. A radar's model is set on the ground, the mast height
  staying the engine's. These files are identification images. Their paint is baked into a texture: each part is
  unfolded onto the six faces of a cube, and each texel receives the colour of a function evaluated at its 3D position
  (seamless camouflage, panels, markings). It is illustrative, neither taken from photographs nor exact. In the browser,
  the light follows the camera and the ambience is neutral, so that no viewpoint leaves the model backlit; Godot keeps
  its light baked into the vertex colours. The "Follow the selection" camera sits 70 m from a unit with a model, against
  12 km for the others. The 40 nearest drones, less than 30 km away, are drawn as models at least 40 pixels across; the
  rest of the swarm keeps silhouettes and dots. These models cannot be clicked. The shapes come from parameterised
  archetypes (`outils/modeles3d/archetypes.js`): a class silhouette at the object's dimensions, not a detailed survey of
  a system.
- **Orientation**: all views (2D, 3D, replay) read the same heading. A drone's points at the next point of its route. A
  defensive vehicle keeps the spherical azimuth of its last move; still in orbit, it keeps this heading, and faces north
  as long as it has not moved. The heading enters no simulation computation. Ground units are not oriented.
- **Terrain**: "terrarium" tiles, `h = 256 R + G + B / 256 − 32768` (m), nearest neighbour on a 65 × 65 grid, with no
  geoid correction (about 50 m in France), with no effect since everything is drawn above that same ground. Negative
  altitudes are brought back to 0: the sea floor is not shown, and land below sea level is displayed at that level. The
  PNGs are decoded without a canvas, because reading back a canvas can be noised by the browser's anti-tracking
  protection: one bit of red is worth 256 m.
- **Shading**: a layer computed on the same tiles, up to zoom 12, makes the terrain readable from above. Light from the
  north-west at 45° elevation; `slope = Δh / (2 m) × max(1, (m / 30) ^ 0.25)`, `m` the pixel size in metres, this
  reinforcement making up for the smoothing of distant tiles; opacity `min(0.6; 2 |e − e_flat|)`, black in shadow, white
  in the sun, zero on the flat. These reinforced slopes are an image choice, with no measurement value.
- **Exaggeration**: the chosen factor stretches the terrain like the flight heights, never the shape of the 3D models;
  at 1, everything is to scale. Symbols stay visible through the terrain, so as not to lose a unit behind a ridge. The
  engine's terrain (§ 16) stays the scenario's; that of this view is only for the image.
- **Coverages**: an outline at the swarm's height, then at 1,500 and 5,000 m above the ground for those higher than it.
  On terrain, each outline comes from `couverture_reelle` (§ 16.2); without terrain, from the engine's range (§ 2),
  `min(horizon(h, z), instrumented range)`. Image assumption: an outline is drawn level, at the radar's ground plus its
  height, without hugging the terrain point by point.
- **Bubbles**: half-spheres of the post's range, centred on the ground under the post (rounded to 20 m), whose opacity
  follows the remaining munitions. Their edge goes down `r / (2 R) + 0.02` rad below the horizontal, `r` the radius and
  `R` = 6,371 km, to stay buried despite the Earth's curvature and the terrain.
- **Satellite**: the top of the arc (120 km) is figurative, at the theatre's scale, unrelated to the real orbit.
- **Cameras**: a camera set on a radar or on a site looks at the barycentre of the airborne drones (mean of their
  latitudes and longitudes, with no role in the computation); the site observed is the target most airborne drones aim
  at, or the most hit if there are none left.

## 24 · Replay for game engines (milestone 15)

The replay puts a simulated raid into a file, to read it back in a game engine. It observes the simulation and changes
nothing in it: the test checks that the outcome is that of a simulation with no log and no observer. Format:
docs/FORMATS.md § 6.

Rendering assumptions, with no effect on the computation:

- **Sampling.** One frame at each multiple of the sampling step (0.5 s by default), bounded by the simulation step.
  Between two frames, the client interpolates: at 800 km/h, a drone travels 111 m in 0.5 s in a nearly straight line.
- **Frame.** Rigid ENU, tangent at the theatre's origin: rotation and translation of ECEF, with no distortion or
  projection. It gives back the engine's position to within rounding (10 cm).
- **Heading.** The engine's (§ 23).
- **Exported terrain.** The mesh joins the nodes of the engine's grid with triangles, with no recomputation of
  altitude: between two nodes, it can depart from the engine's bilinear interpolation (§ 16), all the more as `--pas-km`
  is large.

## 25 · Coverages per object and C2 resultant (docs/PLAN_JEU.md, step 3)

Each object carries up to three envelopes, computed once by `src/moteur/couvertures.js` and read by all the interfaces.
All are given at the swarm's altitude.

### 25.1 Detection

A radar sees up to min(radar horizon, instrumented range) (§ 2), reduced by the terrain if there is one (§ 16.2).

### 25.2 Fire control

Distance at which an effector tracks a target well enough to fire at it, with its own sensor (fire-control radar,
electro-optics, designator). It is a constraint of the engine: an effector does not fire beyond it.

  fire control = portee_conduite if the unit declares it, otherwise facteur_conduite × weapon range

- A **post** is also bounded by the horizon of its sensor, of height `hauteur_conduite_m`, against a drone at the
  swarm's altitude (§ 2), and, on a terrain, by its horizon mask (§ 16.2). Its firing bubble becomes:

    r_fire = min(weapon range, fire control, fire-control horizon)

  The rate of § 5 is computed on r_fire: the useful crossing is the one the post can track.
- A **vehicle** (aircraft, defensive drone) flies above the terrain: neither horizon nor mask. It fires at min(weapon
  range, fire control), and its fire control is also the distance at which it locks onto a drone on its own. The
  catalogue's factor 3 is the old "three weapon ranges" rule: the behaviour of the units that declare nothing does not
  change.

Limit: the closed-form formulas (§ 4 and § 5) assume fire control is not binding. When it is, the engine is
authoritative.

### 25.3 Interception

Volume where the object can really destroy a drone.

- **Post**: its firing bubble r_fire (fixed).
- **Vehicle**: disc around its position, of radius

    r_int = min(weapon range, fire control) + v_positioning × t

  where t is the available delay of § 3.2. It says how far the vehicle can go to fetch a drone detected in time.
  Assumptions: straight line, constant speed, no turn (§ 3.1). This radius is an indicator: the engine itself simulates
  the flight. An object without munitions no longer has an interception envelope.

### 25.4 Resultant of a C2

A centre's coverage is **the union of the coverages of the objects linked to it at the instant considered**:

- detection: the working radars whose latency to this centre is finite (§ 18);
- fire control and interception: the posts of the targets it reaches (§ 18.3), and the vehicles within range of a link
  to it (§ 15.2).

It changes with the network: a cut link or a destroyed centre removes the objects concerned at once. A centre out of
service has no coverage. The area announced is measured on a 2 km grid: the error stays small compared with the range
uncertainties, and the computation does not enter the simulation.

## 26 · Live game (docs/PLAN_JEU.md, step 5)

A game played live runs the same `avancer_monde` loop as `simuler`, one step at a time. The player only adds the orders
of § 12.4: no other rule.

- **Instant of an order.** An order given while the world is at instant `t` takes the instant `t + step`: that of the
  next step, the first that can carry it out. It then follows the path of a scenario order, network latency included.
- **Replayability.** The starting scenario and its orders, read back by `simuler`, give the same game bit for bit: the
  aimed point is rounded to 1e-7 degree (1 cm) then converted by the resolution's function, and the test checks it.
- **Aimed point.** The client gives `(e, n)` in the replay's ENU frame (§ 24). The server keeps the zero-altitude point
  of this position, by looking for the height `u` of the tangent plane that cancels it; the terrain height plays no
  part, since an order to head somewhere only concerns the horizontal position.
- **Clock.** Real time only decides how many steps to play. If the computation cannot keep up with the speed requested,
  the delay is dropped and the achieved speed is displayed; the steps played stay the same, the game just goes slower.
- **Language.** The client tells the server its language (FORMATS § 10.2): it only changes the texts sent (palette,
  lists, refusals), never a rule or a value.

The client's editors (FORMATS § 10.4 and 10.5) change no simulation rule. The terrain brush computes its distances in a
local plane, as a drawing tool; only the saved altitudes enter the engine, like those of an imported terrain (§ 16). A
retouched terrain keeps its identifier: the engine compares its content, not its name, to decide whether to redo grid
and masks.

## 27 · Multiple threats, RCS and ballistic trajectory

The swarm remains the main threat: a single type, a single altitude. `rouge.groupes` adds groups, each with its unit,
its starting point, its target, its altitude or its trajectory. With no group, no `ser_m2` and no `ser_reference_m2`,
nothing changes.

### 27.1 Radar range and radar cross-section

The radar equation gives a range proportional to the fourth root of the RCS. The catalogue's range holds for the
radar's reference RCS:

    d = min(horizon(h_r, h_c), portee_max × (RCS / RCS_ref)^(1/4))

If the radar has no `ser_reference_m2` or the threat no `ser_m2`, the factor is 1. Assumptions: constant RCS whatever
the aspect, no fluctuation (perfect radar within its range, § 7); the RCS values are orders of magnitude.

### 27.2 Detecting the groups and display

A group object is detected at its current altitude (§ 2) and according to its RCS. The "Radar range per threat" layer
draws, for each radar, the instrumented range and one colour per threat class, with the same computation; a ballistic
arc reads there at its apogee. Limit: on a terrain, the horizon masks stay computed at the swarm's altitude (§ 16.2),
hence approximate for the groups.

### 27.3 Ballistic trajectory

Arc above the geodesic, at constant ground speed V, of length L and apogee H:

    h(s) = 4 H (s / L) (1 − s / L)

Assumptions: no propulsion, no re-entry, no manoeuvre. The model places altitude and flight time; it describes no real
missile.

### 27.4 Engagement

An aircraft does not engage a ballistic trajectory. Only a post declared `anti_balistique` can, within its usual firing
bubble. Limits: the bubble stays computed at the swarm's altitude (§ 25.2), which is cautious against a higher object;
the rate (§ 5) and the Pk do not depend on the target's speed.


## 28 · End-of-raid debriefing
The debriefing is computed after the raid, from the world's final state and its log (`src/vue/debriefing.js`). It
changes nothing in the simulation: it is a reading, valid in the 2D view as in 3D.

### 28.1 The defence's grade
The threats count the swarm and the groups (§ 27). A threat is intercepted if it is destroyed (air, ground or jamming),
and hits if it arrives. Interception rate τ = intercepted / threats. Grade: A if τ ≥ 95%, B if τ ≥ 85%, C if τ ≥ 70%,
D if τ ≥ 50%, E otherwise. These thresholds are a game scale, with no other basis.

### 28.2 Cause of each hit
A hit receives the first cause that applies: **not detected** (no radar saw it), **detected, unknown to control** (seen,
but the information reached no centre), **known, never engaged** (no shot targeted it), **engaged, missed** (at least
one shot, none hit). A target's main cause is the most frequent among its hits.

### 28.3 Shooters, sensors, timeline
- **Shooters**: per unit (ground posts grouped by unit, aircraft by group), shots, kills and success (kills / shots). A
  post is **exhausted** if it has no munitions left; its exhaustion instant is that of its last shot. The shots are those
  of the log: a shot whose target fell in the meantime does not appear.
- **Sensors**: first detections per radar, from the log (§ 17). In a full network, the first detection is attributed to
  the radar nearest the drone: a radar "with no detection" may have seen drones already known.
- **Timeline**: hits per 5-min slot.

### 28.4 Weak points
At most five findings, each quantified, in this order: main cause of all the hits; most-hit target and its main cause;
posts exhausted before the end of the raid, with the first exhaustion instant; radars with no detection at all; more
than half the air munitions left while threats have hit (air assets under-used). They are written in the interface's
language; the figures are the same.

## 29 · Scenario incidents
An incident is a dated failure (§ 15.4) that the scenario designer sets, with a cause that reads on screen. No adversary
causes it: it tells what happens to a real system (wear, maintenance, sky, transmissions).

- **Cause** (`pannes[].cause`): `panne` (fault), `maintenance`, `meteo` (weather) or `coupure` (transmission cut). It
  only changes the story: log, on-screen announcement, debriefing.
- **Reduced range** (`pannes[].portee`, radar only): factor f in ]0, 1[. The radar stays in service but only sees to f
  times its range (slant distance to the drone). Without `portee`, the element is out of service. With border coverage
  (§ 15.1), which names no radar, the drone seen is attributed to the nearest working radar, which must still see it at
  its reduced range.
- **Battery** (`batterie:<j>`, j-th placed battery, § 21.2): out of service, it neither fires nor acquires during the
  incident; its munitions remain.
- **Story**: each start and each end of an incident is written in the log (`incident`: element, cause, range, start or
  end) and announced on screen, in 2D as in 3D.
- **Random draw**: the editor can set incidents drawn with a seed (`src/vue/incidents.js`); the draw does not touch the
  raid's generator, it writes failures into the scenario like an editor gesture.

## 30 · Staging
Screen effects drawn from the world's state and its log, with no effect at all on the simulation (`src/vue/ambiance.js`,
`src/vue/radio.js`, `src/vue/sons.js`).

- **Damage to a target**: level 0 intact, 1 hit (at least one hit), 2 damaged (at least 20% of
  `rouge.concentration_max`), 3 on fire (at least 60%). A plume of smoke rises from the target, all the higher and denser
  as the level is high; at level 3, its base burns. The exact number of hits stays written near the target.
- **Control radio**: the log also reads as subtitled radio messages. Control is called "Égide", the radars "Lookout n"
  ("Vigie n" in French), the aircraft by their group's callsign (birds of prey, invented, translated with the
  interface) and their rank. At most one message every 1.5 s of real time, the most important first: impact, then
  mission and contact, then shot and detection.
- **Sound effects**: sound bank computed offline by `outils/sons/generer.js` (seeded synthesis: layered explosions with
  reverberation, missile and rocket launches, interceptions, radio, alert), written as WAV in `sons/`, with no borrowed
  recording. An explosion answers a hit, a missile launch a ground shot, a rocket an air shot, an interception a kill, an
  alert the start of an incident (§ 29). Each sound is played in a randomly drawn variant, within ±10% pitch, behind a
  compressor; at most ten at once, with a minimum gap per kind. Muted at the start: Sound button or M key.

## 31 · Fog of war (CRC view)
Display only: the simulation keeps its true positions (`src/vue/brouillard.js`). In the CRC view (V key), a drone known
to control is displayed as a track, not at its true position.

- **Refresh**: the track is updated every 10 s, counted from the instant control knew the drone. Between two updates, it
  stays at the last plot taken at that instant or before (plots every 4 s, § 23).
- **Position error**: at each update, the track departs from the plot by at most 300 m, in a direction and by a length
  set by the drone and the update's rank (no draw: the same reading gives back the same image).
- **Uncertainty**: a circle of radius 300 m + v × age, v the swarm's speed and age the time since the plot, surrounds
  the track: a swarm drone is always inside it (a group object, faster, can leave it).
