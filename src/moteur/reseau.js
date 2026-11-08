// Réseau d'information (MODELE § 15.2) : ce que la conduite sait des drones, et quels avions elle peut joindre.
// En mode « complet », tout le monde parle avec tout le monde sans délai : le moteur se comporte comme avant.
import {distance_oblique, inverse, vers_ecef} from "./geodesie.js";
import {horizon_radar} from "./geometrie.js";
import {parametres_radar, portee_site, positions_radars} from "./radars.js";
import {altitude_sol, grille_terrain, masque_horizon, vu_par, vue_directe} from "./terrain.js";

// Par grille et non par identifiant de terrain : un terrain retouché garde son identifiant, mais pas ses masques.
const masques = new WeakMap();

/** Rendre la grille du terrain du scénario, ou null sur Terre lisse. */
export const grille_scenario = (scenario) => (scenario.theatre.terrain ? grille_terrain(scenario.theatre.terrain) : null);

/**
 * Rendre le masque d'horizon de chaque radar contre l'essaim (MODELE § 16.2), mis en mémoire par terrain, positions,
 * hauteur d'antenne et portée : une campagne ne les calcule qu'une fois.
 */
export function masques_radars(scenario) {
  const grille = grille_scenario(scenario);
  if (!grille) return null;
  const radars = positions_radars(scenario);
  const reglages = radars.map((_, i) => ({h: parametres_radar(scenario, i).hauteur_antenne, portee: portee_site(scenario, i)}));
  const cle = radars.map((r, i) => `${r.lat},${r.lon},${reglages[i].h},${reglages[i].portee}`).join(";");
  if (!masques.has(grille)) masques.set(grille, new Map());
  const memoire = masques.get(grille);
  if (!memoire.has(cle)) {
    if (memoire.size > 32) memoire.clear();
    memoire.set(cle, radars.map((site, i) => masque_horizon(grille, site, reglages[i].h, reglages[i].portee)));
  }
  return memoire.get(cle);
}

/** Rendre vrai si deux extrémités au sol (mât de `hauteur`) ou en l'air se voient au-dessus du relief. */
function en_vue(grille, a, za, b, zb, distance) {
  return !grille || vue_directe(grille, a, za, b, zb, distance);
}

/** Rendre la portée d'une liaison entre extrémités de hauteurs `ha` et `hb` : portée du moyen, bornée par l'horizon s'il exige la vue directe. */
export const portee_liaison = (moyen, ha, hb) => (moyen.visibilite_directe ? Math.min(moyen.portee, horizon_radar(ha, hb)) : moyen.portee);

const est_avion = (noeud) => noeud.startsWith("avions:");

/** Rendre les identifiants des centres : « conduite » (CDC principal) puis « centre:<k> ». */
export const ids_centres = (reseau) => ["conduite", ...(reseau.centres ?? []).map((_, k) => `centre:${k}`)];

/**
 * Rendre la position d'un nœud au sol (« conduite », « centre:<k> », « radar:<i> », « sol:<i> »), ou undefined
 * s'il n'existe pas. `lieux` : {centre, centres, radars, cibles}.
 */
function position_fixe(noeud, lieux) {
  if (noeud === "conduite") return lieux.centre;
  const [famille, n] = noeud.split(":");
  if (famille === "centre") return lieux.centres[Number(n)]?.geo;
  if (famille === "radar") return lieux.radars[Number(n)];
  if (famille === "sol") return lieux.cibles[Number(n)];
  return undefined;
}

/** Rendre les liaisons fixes (entre nœuds au sol) avec leur distance, leur portée et leur état ; `hs` : éléments en panne. */
function liaisons_fixes(reseau, lieux, hs, grille) {
  return reseau.liaisons.map((liaison, k) => ({...liaison, k})).filter((l) => !est_avion(l.de) && !est_avion(l.vers)).map((liaison) => {
    const [a, b] = [position_fixe(liaison.de, lieux), position_fixe(liaison.vers, lieux)];
    if (!a || !b) return {...liaison, distance: null, portee: 0, active: false};
    if (hs.has(`liaison:${liaison.k}`) || hs.has(liaison.de) || hs.has(liaison.vers)) return {...liaison, distance: inverse(a, b).distance, portee: 0, active: false, en_panne: true};
    const distance = inverse(a, b).distance;
    const {hauteur_antenne: h, visibilite_directe: vue} = liaison.moyen;
    const portee = portee_liaison(liaison.moyen, h, h);
    const masquee = Boolean(grille && vue && distance <= portee && !en_vue(grille, a, altitude_sol(grille, a) + h, b, altitude_sol(grille, b) + h, distance));
    return {...liaison, distance, portee, masquee, active: distance <= portee && !masquee};
  });
}

/** Rendre {nœud: latence depuis `origine`} par le plus court chemin (Bellman-Ford : le graphe est petit). */
function latences_depuis(origine, fixes) {
  const latences = new Map([[origine, 0]]);
  for (let tour = 0; tour <= fixes.length; tour++) {
    let change = false;
    for (const {de, vers, moyen, active} of fixes.filter((l) => l.active)) {
      for (const [x, y] of [[de, vers], [vers, de]]) {
        const candidat = (latences.get(x) ?? Infinity) + moyen.latence;
        if (candidat < (latences.get(y) ?? Infinity)) [change] = [true, latences.set(y, candidat)];
      }
    }
    if (!change) break;
  }
  return latences;
}

/** Rendre l'accès de chaque groupe d'avions : par centre, les nœuds au sol reliés au groupe, avec moyen et latence. */
function acces_groupes(scenario, lieux, hs, latencesCentres) {
  const {reseau} = scenario;
  return scenario.avions.map((_, g) => reseau.liaisons
    .filter((l, k) => !hs.has(`liaison:${k}`) && (l.de === `avions:${g}` || l.vers === `avions:${g}`))
    .flatMap((l) => {
      const sol = l.de === `avions:${g}` ? l.vers : l.de;
      const position = position_fixe(sol, lieux);
      return latencesCentres.map((latences, centre) => ({centre, sol, position, moyen: l.moyen, latence: (latences.get(sol) ?? Infinity) + l.moyen.latence}));
    })
    .filter((a) => a.position && Number.isFinite(a.latence)));
}

/**
 * Préparer le réseau du scénario résolu (MODELE § 15.2 et § 18), les éléments `hs` (« conduite », « centre:<k> »,
 * « radar:<i> », « liaison:<k> ») étant en panne, `cibles` donnant la position des postes sol (nœuds « sol:<i> »).
 * Pour chaque centre : latence depuis chaque radar (Infinity sans chemin), vers chaque cible défendue, et accès de
 * chaque groupe d'avions. `simple` : réseau complet sans panne ni relief, le moteur prend le chemin d'avant le réseau.
 */
export function preparer_reseau(scenario, hs = new Set(), cibles = []) {
  const {reseau} = scenario;
  const radars = positions_radars(scenario);
  const ecefRadars = radars.map((geo) => vers_ecef(geo));
  const centres = ids_centres(reseau).map((id, c) => ({id, geo: c === 0 ? reseau.centre : reseau.centres[c - 1].geo, nom: c === 0 ? "CDC" : reseau.centres[c - 1].nom, hs: hs.has(id)}));
  const grille = grille_scenario(scenario);
  const radars_hs = radars.map((_, i) => hs.has(`radar:${i}`));
  // Avec un terrain, chaque radar voit selon son masque : le moteur prend le chemin radar par radar.
  const commun = {centre: reseau.centre, centres, radars, ecefRadars, hs, conduite_hs: hs.has("conduite"), aucun_centre: centres.every((c) => c.hs),
    grille, masques: masques_radars(scenario), hauteur_drones: scenario.rouge.altitude, portees_radars: positions_radars(scenario).map((_, i) => portee_site(scenario, i)), radars_hs,
    simple: reseau.mode === "complet" && hs.size === 0 && !grille};
  const resumer = (latencesRadars, latencesSol) => ({
    latences_centres: latencesRadars, latences_sol: latencesSol,
    latences_radars: radars.map((_, i) => Math.min(...latencesRadars.map((l) => l[i]))),
  });
  if (reseau.mode === "complet") {
    const radarsC = centres.map((c) => radars.map((_, i) => (c.hs || radars_hs[i] ? Infinity : 0)));
    const solC = centres.map((c) => cibles.map(() => (c.hs ? Infinity : 0)));
    return {...commun, mode: "complet", ...resumer(radarsC, solC), fixes: [], acces: []};
  }
  const lieux = {centre: reseau.centre, centres: reseau.centres ?? [], radars, cibles};
  const fixes = liaisons_fixes(reseau, lieux, hs, grille);
  const latences = centres.map((c) => (c.hs ? new Map() : latences_depuis(c.id, fixes)));
  const radarsC = latences.map((l) => radars.map((_, i) => (radars_hs[i] ? Infinity : l.get(`radar:${i}`) ?? Infinity)));
  const solC = latences.map((l) => cibles.map((_, i) => l.get(`sol:${i}`) ?? Infinity));
  return {...commun, mode: "liaisons", ...resumer(radarsC, solC), fixes, acces: acces_groupes(scenario, lieux, hs, latences)};
}

/**
 * Rendre l'accès par lequel un centre joint `avion` (le plus rapide à portée) : {centre, sol, latence…}, ou null s'il
 * est hors liaison. En réseau complet, le premier centre en état, sans délai. `impose` : ne considérer que ce centre.
 */
export function acces_avion(reseau, avion, indiceGroupe, impose = null) {
  if (reseau.aucun_centre) return null;
  if (reseau.mode === "complet") {
    if (impose !== null && reseau.centres[impose].hs) return null;
    const centre = impose ?? reseau.centres.findIndex((c) => !c.hs);
    return {centre, sol: reseau.centres[centre].id, latence: 0};
  }
  let retenu = null;
  for (const acces of reseau.acces[indiceGroupe] ?? []) {
    if (impose !== null && acces.centre !== impose) continue;
    const {hauteur_antenne: h, visibilite_directe: vue} = acces.moyen;
    const portee = portee_liaison(acces.moyen, h, avion.geo.alt);
    const distance = inverse(acces.position, avion.geo).distance;
    if (distance > portee || (retenu && acces.latence >= retenu.latence)) continue;
    // Le relief peut masquer la liaison radio entre le mât et l'avion (MODELE § 16.3).
    if (vue && reseau.grille && !en_vue(reseau.grille, acces.position, altitude_sol(reseau.grille, acces.position) + h, avion.geo, avion.geo.alt, distance)) continue;
    retenu = acces;
  }
  return retenu;
}

/** Rendre l'instant où le centre `c` connaît `drone` (null : jamais pour l'instant). */
export const connu_du_centre = (drone, c) => (drone.connus ? drone.connus[c] : drone.connu);

/** Rendre l'indice du radar en état le plus proche de `drone` (-1 s'il n'y en a pas). */
export function radar_le_plus_proche(reseau, drone) {
  let [indice, meilleure] = [-1, Infinity];
  reseau.ecefRadars.forEach((ecef, i) => {
    if (reseau.radars_hs[i]) return;
    const d = distance_oblique(ecef, drone.ecef);
    if (d < meilleure) [indice, meilleure] = [i, d];
  });
  return indice;
}

/**
 * Rendre les indices des radars en état qui voient `drone` : ceux que l'algorithme désigne, sinon le plus proche des
 * radars en état s'il est vu (couverture frontière : la frontière est jalonnée par les radars, MODELE § 15.1).
 */
export function radars_voyants(detection, couverture, reseau, drone, outils) {
  if (reseau.grille) return radars_voyants_relief(detection, couverture, reseau, drone, outils);
  if (detection.detecte_par) return detection.detecte_par(couverture, drone, outils).filter((i) => !reseau.radars_hs[i]);
  if (!detection.detecte(couverture, drone, outils)) return [];
  const indice = radar_le_plus_proche(reseau, drone);
  return indice < 0 ? [] : [indice];
}

/**
 * Avec un terrain : les radars candidats sont ceux que l'algorithme désigne, sinon tous ceux dont la portée contient
 * le drone ; le masque d'horizon de chacun tranche, le drone volant à sa hauteur au-dessus du sol (MODELE § 16.2).
 */
function radars_voyants_relief(detection, couverture, reseau, drone, outils) {
  const candidats = detection.detecte_par
    ? detection.detecte_par(couverture, drone, outils)
    : reseau.ecefRadars.map((e, i) => ((drone.ecef.x - e.x) ** 2 + (drone.ecef.y - e.y) ** 2 + (drone.ecef.z - e.z) ** 2 <= reseau.portees_radars[i] ** 2 + reseau.hauteur_drones ** 2 ? i : -1)).filter((i) => i >= 0);
  return candidats.filter((i) => !reseau.radars_hs[i] && vu_par(reseau.masques[i], reseau.grille, drone.geo, drone.ecef, reseau.hauteur_drones));
}
