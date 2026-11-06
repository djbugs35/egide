// L'essaim : répartition sur les cibles (MODELE § 6.1), puis comportement et mouvement délégués aux algorithmes
// désignés par le scénario (rouge.tactique) et par l'unité de drone (algos.mouvement).
import {algo} from "./algos.js";
import {vers_ecef} from "./geodesie.js";
import {melanger} from "./hasard.js";
import {OUTILS} from "./outils.js";
import {effet_esquive} from "./reaction.js";
import {connu_du_centre, radar_le_plus_proche, radars_voyants} from "./reseau.js";
import {est_actif, journaliser} from "./tir.js";

/**
 * Rendre l'indice de cible de chaque drone : au plus `concentration_max` par cible (MODELE § 6.1). `nombreCibles` :
 * cibles du monde, centre de conduite visé compris (MODELE § 15.4).
 */
export function repartir_drones(scenario, hasard, nombreCibles = scenario.theatre.cibles_nombre) {
  const {rouge} = scenario;
  const groupes = Math.min(nombreCibles, Math.ceil(rouge.nombre / rouge.concentration_max));
  const visees = melanger([...Array(nombreCibles).keys()], hasard).slice(0, groupes);
  return Array.from({length: rouge.nombre}, (_, i) => visees[i % groupes]);
}

/**
 * Rendre les drones de l'essaim, placés à `rayonApparition` m du centre par l'algorithme de comportement.
 * Le moteur tire un cap par cible puis un cap commun, quel que soit le comportement : l'ordre des tirages, donc le
 * déroulement d'une graine, ne dépend pas de la tactique choisie.
 */
export function creer_drones(scenario, registre, cibles, hasard, rayonApparition) {
  const {rouge, theatre} = scenario;
  const comportement = algo(registre, rouge.comportement, "comportement");
  const contexte = {
    rouge, cibles, rayon_apparition: rayonApparition, origine: theatre.origine,
    caps: cibles.map(() => hasard.uniforme(0, 2 * Math.PI)),
    cap_commun: hasard.uniforme(0, 2 * Math.PI),
  };
  return repartir_drones(scenario, hasard, cibles.length).map((cible, id) => {
    const {position, route, depart} = comportement.planifier_drone(contexte, cible, hasard, OUTILS);
    const geo = {...position, alt: rouge.altitude};
    // Chaque point de route garde son ECEF à l'altitude du drone : un pas ne coûte qu'un changement de repère.
    const points = route.map((point) => ({geo: point, ecef: vers_ecef({...point, alt: rouge.altitude})}));
    return {
      id, cible, vivant: true, arrive: false, vise: false, detection: null, connu: null, depart, route: points,
      geo, ecef: vers_ecef(geo), vitesse: {x: 0, y: 0, z: 0},
    };
  });
}

/**
 * Faire avancer chaque drone actif de `dt` s par son algorithme de mouvement ; au bout de sa route, il frappe.
 * Un drone réactif visé par un tir air esquive et progresse moins (MODELE § 22.4).
 */
export function avancer_drones(monde, dt) {
  const {rouge} = monde.scenario;
  const mouvement = algo(monde.registre, rouge.algos.mouvement, "mouvement");
  const {perte_vitesse: perte} = effet_esquive(monde);
  for (const drone of monde.drones) {
    if (!est_actif(drone, monde.t)) continue;
    const avant = drone.ecef;
    const pas = rouge.vitesse * dt * (drone.vise ? 1 - perte : 1);
    const suivant = mouvement.avancer(drone, drone.route, pas, OUTILS);
    drone.geo = suivant.geo;
    drone.ecef = suivant.ecef;
    if (suivant.atteints) drone.route.splice(0, suivant.atteints);
    drone.vitesse = {x: (drone.ecef.x - avant.x) / dt, y: (drone.ecef.y - avant.y) / dt, z: (drone.ecef.z - avant.z) / dt};
    if (drone.route.length === 0) {
      drone.arrive = true;
      monde.fuites[drone.cible]++;
      journaliser(monde, {type: "impact", cible: drone.cible});
    }
  }
}

/**
 * Journaliser une détection (MODELE § 17) : le drone, le radar qui le voit, et l'instant où l'information atteint
 * le PC (null : elle n'y arrivera pas). Le drone garde son radar d'origine pour l'inspecteur.
 */
function noter_detection(monde, drone, radar, connu) {
  drone.radar ??= radar;
  journaliser(monde, {type: "detection", drone: drone.id, radar, connu: connu === null || !Number.isFinite(connu) ? null : connu});
}

/**
 * Marquer l'instant où chaque drone est détecté (`detection`) et celui où la conduite l'apprend (`connu`). En réseau
 * complet, c'est le même instant ; en liaisons, l'information part de chaque radar qui le voit et arrive après la
 * latence de son chemin jusqu'à la conduite, jamais si ce radar n'y est pas relié (MODELE § 15.2).
 */
export function detecter_drones(monde) {
  const detection = algo(monde.registre, monde.scenario.radar.algos.detection, "detection");
  const {reseau} = monde;
  for (const drone of monde.drones) {
    if (!est_actif(drone, monde.t)) continue;
    if (reseau.simple) {
      // Après une panne, un drone déjà vu peut rester inconnu : c'est `connu` qui décide de regarder encore.
      if (drone.connu === null && detection.detecte(monde.couverture, drone, OUTILS)) {
        const premiere = drone.detection === null;
        [drone.detection, drone.connu] = [drone.detection ?? monde.t, monde.t];
        // Réseau complet : tous les centres le savent en même temps (une situation par centre devient inutile).
        drone.connus = undefined;
        // Le radar d'origine ne sert qu'au journal (rejeu) : on ne le cherche pas en campagne.
        if (premiere && monde.evenements) noter_detection(monde, drone, radar_le_plus_proche(reseau, drone), monde.t);
      }
      continue;
    }
    // On regarde encore tant qu'un centre en état ne connaît pas le drone (MODELE § 18.1).
    if (drone.connu !== null && reseau.centres.every((c, k) => c.hs || (connu_du_centre(drone, k) ?? Infinity) <= monde.t)) continue;
    const voyants = radars_voyants(detection, monde.couverture, reseau, drone, OUTILS);
    if (!voyants.length) continue;
    // Vu physiquement, même si l'information ne va nulle part.
    const premiere = drone.detection === null;
    drone.detection ??= monde.t;
    const avant = drone.connu;
    drone.connus ??= reseau.centres.map(() => (drone.connu ?? null));
    for (const i of voyants) {
      reseau.latences_centres.forEach((latences, c) => {
        const arrivee = monde.t + latences[i];
        if (Number.isFinite(arrivee) && arrivee < (drone.connus[c] ?? Infinity)) drone.connus[c] = arrivee;
        if (Number.isFinite(arrivee) && arrivee < (drone.connu ?? Infinity)) [drone.connu, drone.radar] = [arrivee, i];
      });
    }
    if (premiere || drone.connu !== avant) noter_detection(monde, drone, drone.connu !== avant ? drone.radar : voyants[0], drone.connu);
  }
}
