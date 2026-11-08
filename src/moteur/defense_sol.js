// Postes sol-air : co-localisés avec les cibles, munitions partagées ; cadence donnée par l'algorithme tir_sol.
// S'y ajoutent les batteries placées une à une (déploiement, MODELE § 21.2), chacune avec son unité.
import {algo} from "./algos.js";
import {enveloppe_poste} from "./couvertures.js";
import {connu_du_centre, grille_scenario} from "./reseau.js";
import {masque_horizon, vu_par} from "./terrain.js";
import {est_actif, plus_proche, resoudre_tir} from "./tir.js";
import {distance_horizontale, distance_oblique, vers_ecef} from "./geodesie.js";
import {parcourir_voisins} from "./grille.js";

/**
 * Rendre le drone actif le plus éloigné dans la bulle, hors de `pris` : celui qui vient d'y entrer, le premier que
 * voit le capteur du poste, et que les postes voisins n'ont pas déjà en acquisition.
 */
function plus_loin(monde, centre, portee, pris, visible) {
  let [retenu, meilleure] = [null, -1];
  parcourir_voisins(monde.index, centre, portee, (drone) => {
    if (!est_actif(drone, monde.t) || pris.has(drone.id) || (visible && !visible(drone))) return;
    const ecart = distance_oblique(drone.ecef, centre);
    if (ecart <= portee && ecart > meilleure) [retenu, meilleure] = [drone, ecart];
  });
  return retenu;
}

/**
 * Rendre vrai si un centre a désigné `drone` au poste : il le connaît, et l'information a eu le temps de parcourir
 * la liaison du centre jusqu'aux postes de la cible (MODELE § 18.3). En réseau complet, il suffit qu'il soit connu.
 */
export function designe(monde, poste, drone) {
  const {reseau} = monde;
  if (reseau.simple) return drone.connu !== null && drone.connu <= monde.t;
  return reseau.latences_sol.some((latences, c) => {
    const connu = connu_du_centre(drone, c);
    return connu !== null && connu + (latences[poste.cible] ?? Infinity) <= monde.t;
  });
}

/**
 * Rendre le drone sur lequel le poste peut tirer maintenant, et s'il lui a été désigné (MODELE § 18.3) : le plus
 * proche de la bulle s'il est désigné ; sinon le poste acquiert seul le drone qui entre dans sa bulle (le plus
 * éloigné, le premier que voit son capteur), le garde tant qu'il y reste, et ne tire qu'après le délai d'acquisition.
 */
function cible_du_poste(monde, poste, sol) {
  const visible = poste.masque ? (drone) => vu_par(poste.masque, grille_scenario(monde.scenario), drone.geo, drone.ecef, monde.scenario.rouge.altitude) : null;
  const proche = plus_proche(monde, poste.ecef, poste.enveloppe, false, visible);
  if (!proche) return null;
  if (designe(monde, poste, proche)) return {drone: proche, designe: true};
  const enCours = poste.acquisition && monde.drones[poste.acquisition.drone];
  const garde = enCours && est_actif(enCours, monde.t) && distance_oblique(enCours.ecef, poste.ecef) <= poste.enveloppe && (!visible || visible(enCours)) ? enCours : null;
  // Les postes d'une même cible se répartissent les drones qu'ils acquièrent seuls.
  const pris = new Set(monde.postes.filter((p) => p !== poste && p.cible === poste.cible && p.acquisition).map((p) => p.acquisition.drone));
  const drone = garde ?? plus_loin(monde, poste.ecef, poste.enveloppe, pris, visible) ?? proche;
  if (designe(monde, poste, drone)) return {drone, designe: true};
  if (!garde) poste.acquisition = {drone: drone.id, t: monde.t};
  return monde.t - poste.acquisition.t >= sol.acquisition ? {drone, designe: false} : null;
}

/** Rendre l'indice de la cible la plus proche de `geo` : celle que défend une batterie placée, dont elle partage le nœud réseau. */
const cible_la_plus_proche = (cibles, geo) => cibles.reduce((m, c, i) => (distance_horizontale(geo, c.geo) < distance_horizontale(geo, cibles[m].geo) ? i : m), 0);

/**
 * Rendre la fonction qui donne {enveloppe (m), masque} d'une unité posée en `geo` (MODELE § 25.2) : le masque n'existe
 * que sur un terrain, et n'est calculé qu'une fois par position et par unité (200 postes tiennent sur 10 sites).
 */
function preparer_conduite(scenario) {
  const grille = grille_scenario(scenario);
  const memoire = new Map();
  return (unite, geo) => {
    const enveloppe = enveloppe_poste(unite, scenario.rouge.altitude);
    if (!grille) return {enveloppe, masque: null};
    const cle = `${geo.lat},${geo.lon},${unite.hauteur_conduite},${enveloppe}`;
    if (!memoire.has(cle)) memoire.set(cle, masque_horizon(grille, geo, unite.hauteur_conduite, enveloppe));
    return {enveloppe, masque: memoire.get(cle)};
  };
}

/**
 * Rendre les postes sol : `nombre` postes répartis à parts égales sur les cibles (`cibles` : {geo, ecef}), chacun avec
 * sa part du stock, puis une batterie par position placée, rattachée à la cible la plus proche, avec son unité.
 */
export function creer_postes(scenario, cibles) {
  const {nombre, munitions, batteries = []} = scenario.sol;
  const conduite = preparer_conduite(scenario);
  const communs = Array.from({length: nombre}, (_, i) => ({
    id: i,
    cible: i % cibles.length,
    geo: cibles[i % cibles.length].geo,
    ecef: cibles[i % cibles.length].ecef,
    munitions: Math.floor(munitions / nombre) + (i < munitions % nombre ? 1 : 0),
    prochain_tir: 0,
    ...conduite(scenario.sol, cibles[i % cibles.length].geo),
  }));
  const places = batteries.map((b, j) => ({
    id: nombre + j, batterie: j, cible: cible_la_plus_proche(cibles, b.geo), geo: b.geo, ecef: vers_ecef(b.geo),
    munitions: b.munitions, prochain_tir: 0, unite: b.unite, ...conduite(b.unite, b.geo),
  }));
  return [...communs, ...places];
}

/** Rendre le stock initial de munitions sol : celui du dispositif commun et celui des batteries placées. */
export const munitions_sol_initiales = (sol) => sol.munitions + (sol.batteries ?? []).reduce((s, b) => s + b.munitions, 0);

/** Faire tirer chaque poste prêt sur le drone le plus proche dans sa bulle ; le résultat est immédiat. */
export function tirer_sol(monde) {
  const {sol, rouge} = monde.scenario;
  const cadences = new Map();
  const cadence = (unite) => {
    if (!cadences.has(unite)) cadences.set(unite, algo(monde.registre, unite.algos.tir_sol, "tir_sol").cadence({...unite, portee: enveloppe_poste(unite, rouge.altitude)}, rouge.vitesse));
    return cadences.get(unite);
  };
  for (const poste of monde.postes) {
    if (poste.munitions === 0 || monde.t < poste.prochain_tir) continue;
    const unite = poste.unite ?? sol;
    const choix = cible_du_poste(monde, poste, unite);
    if (!choix) continue;
    const {drone} = choix;
    poste.munitions--;
    poste.prochain_tir = monde.t + cadence(unite);
    monde.compteurs.tirs_sol++;
    resoudre_tir(monde, drone, unite.pk, "sol", poste.geo, poste.id, {designe: choix.designe});
  }
}
