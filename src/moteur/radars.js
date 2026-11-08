// Radars : disposition le long de la frontière ou sites placés (MODELE § 15.1).
import {direct} from "./geodesie.js";
import {horizon_radar} from "./geometrie.js";

/**
 * Rendre la portée au sol (m) de `radar` contre une menace à `altitude` m, de surface équivalente `ser` m² (MODELE § 27.1) :
 * horizon, borné par la portée instrumentée que l'équation du radar réduit selon la SER.
 */
export function portee_contre_menace(radar, altitude, ser) {
  const facteur = radar.ser_reference_m2 && ser ? (ser / radar.ser_reference_m2) ** 0.25 : 1;
  return Math.min(horizon_radar(radar.hauteur_antenne, altitude), radar.portee_max * facteur);
}

/** Rendre la portée au sol d'un radar contre l'essaim. */
export const portee_radar = (scenario) => portee_contre_menace(scenario.radar, scenario.rouge.altitude, scenario.rouge.ser_m2);

/**
 * Rendre les paramètres (hauteur d'antenne, portée instrumentée) du radar `i` : ceux de son unité propre si le site
 * en a une (déploiement, MODELE § 21.1), sinon ceux du radar commun.
 */
export const parametres_radar = (scenario, i) => (scenario.radar.disposition === "sites" && scenario.radar.sites_unites?.[i]) || scenario.radar;

/** Rendre la portée au sol du radar `i` contre l'essaim. */
export function portee_site(scenario, i) {
  return portee_contre_menace(parametres_radar(scenario, i), scenario.rouge.altitude, scenario.rouge.ser_m2);
}

/**
 * Rendre les positions des radars qui matérialisent la couverture « frontière » : sur le cercle de la zone, espacés
 * de √3 d au plus, si bien que tout drone qui franchit la frontière passe à moins de d de l'un d'eux. Ce sont ces
 * positions que l'éditeur rend déplaçables ; en déplacer un fait passer le scénario en disposition « sites ».
 */
export function sites_frontiere(scenario) {
  const rayon = scenario.theatre.zone_rayon;
  const nombre = Math.max(3, Math.ceil((2 * Math.PI * rayon) / (Math.sqrt(3) * portee_radar(scenario))));
  return Array.from({length: nombre}, (_, i) => ({...direct(scenario.theatre.origine, (2 * Math.PI * i) / nombre, rayon), alt: scenario.radar.hauteur_antenne}));
}

const memoire = new WeakMap();

/** Rendre les positions des radars du scénario résolu, quelle que soit la disposition (calculées une fois par scénario). */
export function positions_radars(scenario) {
  if (!memoire.has(scenario)) memoire.set(scenario, scenario.radar.disposition === "sites" ? scenario.radar.sites : sites_frontiere(scenario));
  return memoire.get(scenario);
}
