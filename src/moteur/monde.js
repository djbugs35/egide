// La simulation : état du monde, boucle à pas fixe, bilan (MODELE § 8 et § 9). Pur : ni DOM, ni réseau, ni horloge.
import {avancer_avions, brouiller, creer_avions, livrer_consignes, planifier_avions, resoudre_tirs_en_vol, tirer_air} from "./defense_air.js";
import {creer_postes, tirer_sol} from "./defense_sol.js";
import {algo} from "./algos.js";
import {direct, inverse, vers_ecef} from "./geodesie.js";
import {indexer_drones} from "./grille.js";
import {creer_hasard} from "./hasard.js";
import {avancer_drones, creer_drones, detecter_drones} from "./menace.js";
import {OUTILS} from "./outils.js";
import {compteurs_reaction, creer_essaim, faire_reagir} from "./reaction.js";
import {acces_avion, preparer_reseau} from "./reseau.js";
import {journaliser} from "./tir.js";
import {compter_incursions, preparer_zone} from "./zones.js";

// Les drones naissent 20 km avant la couverture radar : ils ne sont pas vus dès leur apparition.
const MARGE_APPARITION = 20_000;
// Garde-fou : un raid dure quelques minutes ; au-delà de 2 h, la simulation boucle sur un défaut.
const DUREE_MAXIMALE = 7_200;
const ESSAIS_PLACEMENT = 10_000;

/**
 * Rendre les cibles ({geo, ecef}) : d'abord celles placées à la main, puis des cibles tirées dans 70 % du rayon,
 * espacées d'au moins un cinquième du rayon de toutes les autres.
 */
export function placer_cibles(scenario, hasard) {
  const {origine, zone_rayon: rayon, cibles_nombre: nombre, cibles_placees: placees = []} = scenario.theatre;
  const cibles = placees.map((geo) => ({geo, ecef: vers_ecef(geo)}));
  let ecartMinimal = rayon / 5;
  for (let essai = 0; cibles.length < nombre; essai++) {
    // Zone trop petite pour l'écart demandé : on le réduit plutôt que de boucler sans fin.
    if (essai > 0 && essai % ESSAIS_PLACEMENT === 0) ecartMinimal /= 2;
    const distance = 0.7 * rayon * Math.sqrt(hasard.uniforme());
    const candidate = direct(origine, hasard.uniforme(0, 2 * Math.PI), distance);
    if (cibles.every((cible) => inverse(cible.geo, candidate).distance >= ecartMinimal)) {
      cibles.push({geo: candidate, ecef: vers_ecef(candidate)});
    }
  }
  return cibles;
}

/** Rendre les compteurs propres aux drones défensifs présents (MODELE § 19). */
function compteurs_defensifs(scenario) {
  const presents = scenario.avions.filter((g) => g.nombre > 0);
  return {
    ...(presents.some((g) => g.arme.type === "brouillage") ? {neutralises_brouillage: 0} : {}),
    ...(presents.some((g) => g.consomme_au_tir) ? {intercepteurs_perdus: 0} : {}),
  };
}

/**
 * Rendre un monde neuf pour un scénario résolu et le registre de ses algorithmes (voir ids_algos).
 * `journal` : tenir la liste des évènements (rejeu), inutile en campagne.
 */
export function creer_monde(scenario, {registre, journal = true}) {
  const hasard = creer_hasard(scenario.simulation.graine);
  const cibles = placer_cibles(scenario, hasard);
  // Le centre de conduite visé par l'essaim est une cible de plus, la dernière (MODELE § 15.4).
  const cibleConduite = scenario.reseau.conduite_ciblee ? cibles.push({geo: scenario.reseau.centre, ecef: vers_ecef(scenario.reseau.centre), conduite: true}) - 1 : null;
  const couverture = algo(registre, scenario.radar.algos.detection, "detection").preparer(scenario, scenario.radar, OUTILS);
  const rayonDetection = couverture.rayon_couverture;
  return {
    scenario, registre, hasard, t: 0, cibles, couverture, rayonDetection, reseau: preparer_reseau(scenario, new Set(), cibles.map((c) => c.geo)),
    cible_conduite: cibleConduite, conduite_detruite: null, hs_cle: "",
    drones: creer_drones(scenario, registre, cibles.map((cible) => cible.geo), hasard, rayonDetection + MARGE_APPARITION),
    avions: creer_avions(scenario, hasard),
    postes: creer_postes(scenario, cibles),
    tirs_en_vol: [],
    fuites: cibles.map(() => 0),
    // Les compteurs des drones défensifs n'apparaissent que s'il y en a : un bilan sans eux garde sa forme d'avant.
    compteurs: {tirs_air: 0, tirs_sol: 0, detruits_air: 0, detruits_sol: 0, ...compteurs_defensifs(scenario), ...compteurs_reaction(scenario)},
    // Connaissance de l'essaim réactif (MODELE § 22) ; null : l'essaim ne réagit pas.
    essaim: creer_essaim(scenario, cibles.length),
    brouilleurs: scenario.avions.some((g) => g.nombre > 0 && g.arme.type === "brouillage"),
    evenements: journal ? [] : null,
    prochaine_decision: 0,
    index: new Map(),
    zones: scenario.theatre.zones.map(preparer_zone),
    incursions: scenario.theatre.zones.map(() => new Set()),
    prochain_controle_zones: 0,
    ordres_appliques: 0,
  };
}

/**
 * Appliquer les ordres dont l'instant est atteint : les avions cités (armés) rallient le point, et la conduite
 * ne les réaffecte plus avant leur arrivée (MODELE § 12.4).
 */
function appliquer_ordres(monde) {
  const {ordres} = monde.scenario;
  while (monde.ordres_appliques < ordres.length && ordres[monde.ordres_appliques].t <= monde.t) {
    const ordre = ordres[monde.ordres_appliques++];
    const concernes = ordre.avions.map((id) => monde.avions[id]).filter((avion) => avion && avion.munitions > 0);
    const recus = [];
    for (const avion of concernes) {
      // Un ordre part du centre de conduite : il n'atteint que les avions joignables, après la latence (MODELE § 15.2).
      const acces = monde.reseau.simple ? {latence: 0} : acces_avion(monde.reseau, avion, monde.scenario.avions.indexOf(avion.groupe));
      if (!acces) continue;
      recus.push(avion.id);
      if (acces.latence > 0) avion.consigne = {t: monde.t + acces.latence, point: ordre.point, ordre: true};
      else Object.assign(avion, {etat: "ralliement", point: {...ordre.point, alt: avion.geo.alt}, ordre: true});
    }
    journaliser(monde, {type: "ordre", avions: recus, point: ordre.point});
  }
}

/** Rendre les éléments en panne à l'instant du monde : pannes datées du scénario, centre de conduite détruit. */
function elements_hs(monde) {
  const hs = new Set(monde.scenario.reseau.pannes.filter((p) => p.t <= monde.t && (p.fin === null || monde.t < p.fin)).map((p) => p.element));
  if (monde.conduite_detruite !== null) hs.add("conduite");
  return hs;
}

/** Détruire le centre de conduite frappé, puis recalculer le réseau si l'ensemble des éléments en panne a changé. */
function appliquer_pannes(monde) {
  if (monde.cible_conduite !== null && monde.conduite_detruite === null && monde.fuites[monde.cible_conduite] > 0) {
    monde.conduite_detruite = monde.t;
    journaliser(monde, {type: "panne", element: "conduite", cause: "frappe"});
  }
  if (!monde.scenario.reseau.pannes.length && monde.conduite_detruite === null) return;
  const hs = elements_hs(monde);
  const cle = [...hs].sort().join(",");
  if (cle === monde.hs_cle) return;
  monde.hs_cle = cle;
  monde.reseau = preparer_reseau(monde.scenario, hs, monde.cibles.map((c) => c.geo));
  journaliser(monde, {type: "reseau", hs: [...hs]});
}

/**
 * Faire avancer le monde d'un pas de temps. L'ordre compte : on bouge, on voit, on obéit, on décide, on tire ;
 * puis l'essaim apprend ses pertes du pas et réagit (MODELE § 22).
 */
export function avancer_monde(monde) {
  const {simulation, conduite} = monde.scenario;
  monde.t += simulation.pas;
  avancer_drones(monde, simulation.pas);
  monde.index = indexer_drones(monde.drones, monde.t);
  appliquer_pannes(monde);
  detecter_drones(monde);
  compter_incursions(monde);
  appliquer_ordres(monde);
  livrer_consignes(monde);
  if (monde.t >= monde.prochaine_decision) {
    planifier_avions(monde);
    monde.prochaine_decision = monde.t + conduite.pas_decision;
  }
  avancer_avions(monde, simulation.pas);
  resoudre_tirs_en_vol(monde);
  tirer_sol(monde);
  tirer_air(monde);
  if (monde.brouilleurs) brouiller(monde, simulation.pas);
  if (monde.essaim) faire_reagir(monde);
}

/** Rendre vrai quand plus aucun drone ne vole et qu'aucun tir n'est en vol. */
export const est_termine = (monde) => monde.tirs_en_vol.length === 0 && monde.drones.every((drone) => !drone.vivant || drone.arrive);

/** Rendre le monde au terme du raid (`options` : voir creer_monde). */
export function simuler(scenario, options) {
  const monde = creer_monde(scenario, options);
  while (!est_termine(monde)) {
    if (monde.t > DUREE_MAXIMALE) throw new Error(`raid non terminé après ${DUREE_MAXIMALE} s : défaut de simulation`);
    avancer_monde(monde);
  }
  return monde;
}

/** Rendre le bilan chiffré d'un monde : fuites, destructions, tirs, munitions restantes, durée, incursions par zone. */
export function bilan(monde) {
  // Les incursions n'apparaissent que s'il y a des zones : un bilan sans zone garde sa forme d'avant le jalon 3.
  const incursions = monde.zones.length ? {incursions: monde.incursions.map((drones) => drones.size)} : {};
  return {
    ...incursions,
    fuites: monde.fuites.reduce((somme, n) => somme + n, 0),
    fuites_max_cible: Math.max(...monde.fuites),
    ...monde.compteurs,
    munitions_air_restantes: monde.avions.reduce((somme, avion) => somme + avion.munitions, 0),
    munitions_sol_restantes: monde.postes.reduce((somme, poste) => somme + poste.munitions, 0),
    duree: monde.t,
  };
}
