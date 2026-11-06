// Réaction de l'essaim (MODELE § 22) : ce que l'essaim apprend de ses pertes et de ses frappes, et les décisions
// que l'algorithme de réaction en tire. Sans algorithme (rouge.reaction null), rien ici ne tourne.
import {algo} from "./algos.js";
import {inverse, vers_ecef} from "./geodesie.js";
import {OUTILS} from "./outils.js";
import {journaliser} from "./tir.js";

/** Rendre l'état de connaissance de l'essaim pour `nombreCibles` cibles, ou null si l'essaim ne réagit pas. */
export function creer_essaim(scenario, nombreCibles) {
  if (!scenario.rouge.reaction) return null;
  return {
    foyers: [],
    bilans: Array.from({length: nombreCibles}, () => ({pertes: 0, frappes: 0})),
    // Faits en route dans le réseau maillé : connus de l'essaim à l'instant `t` (MODELE § 22.1).
    en_route: [],
    version: 0,
    version_decidee: 0,
    prochaine_decision: 0,
  };
}

/** Rendre les compteurs de réaction à ajouter au bilan : vide si l'essaim ne réagit pas (bilan d'avant inchangé). */
export const compteurs_reaction = (scenario) => (scenario.rouge.reaction ? {reaffectations: 0, detours: 0, esquives: 0} : {});

/** Mettre en route chaque perte et chaque frappe nouvelles : l'essaim les saura après le délai de son réseau. */
function emettre(monde) {
  const {essaim} = monde;
  const connu = monde.t + monde.scenario.rouge.reaction_delai;
  for (const drone of monde.drones) {
    if (drone.fait_emis) continue;
    if (!drone.vivant) essaim.en_route.push({t: connu, perte: {...drone.geo}});
    else if (drone.arrive) essaim.en_route.push({t: connu, frappe: drone.cible});
    else continue;
    drone.fait_emis = true;
  }
}

/** Ranger une perte dans le foyer le plus proche à moins de r_d, ou en fonder un ; la compter près de chaque cible. */
function ranger_perte(monde, geo) {
  const {essaim, cibles} = monde;
  const rayon = monde.scenario.rouge.reaction_rayon_danger;
  let foyer = null;
  let meilleure = rayon;
  for (const f of essaim.foyers) {
    const distance = inverse(f.geo, geo).distance;
    if (distance <= meilleure) [foyer, meilleure] = [f, distance];
  }
  if (foyer) foyer.pertes++;
  else essaim.foyers.push({geo, pertes: 1});
  cibles.forEach((cible, k) => {
    if (inverse(cible.geo, geo).distance <= rayon) essaim.bilans[k].pertes++;
  });
}

/** Faire connaître à l'essaim les faits arrivés à leur instant (MODELE § 22.1). */
function recevoir(monde) {
  const {essaim} = monde;
  const restants = [];
  for (const fait of essaim.en_route) {
    if (fait.t > monde.t) {
      restants.push(fait);
      continue;
    }
    if (fait.perte) ranger_perte(monde, fait.perte);
    else essaim.bilans[fait.frappe].frappes++;
    essaim.version++;
  }
  essaim.en_route = restants;
}

/** Appliquer à `drone` la réaction rendue par l'algorithme : réaffectation (dernier point de route) ou détour. */
function appliquer(monde, drone, reaction) {
  const {altitude} = monde.scenario.rouge;
  const point = (geo) => ({geo: {lat: geo.lat, lon: geo.lon, alt: altitude}, ecef: vers_ecef({...geo, alt: altitude})});
  if (reaction.cible !== undefined) {
    const avant = drone.cible;
    drone.route[drone.route.length - 1] = point(monde.cibles[reaction.cible].geo);
    drone.cible = reaction.cible;
    drone.reaffectations = (drone.reaffectations ?? 0) + 1;
    monde.compteurs.reaffectations++;
    journaliser(monde, {type: "reaction", nature: "reaffectation", drone: drone.id, de: avant, vers: reaction.cible});
    return;
  }
  drone.route.unshift(point(reaction.detour));
  drone.detours = (drone.detours ?? 0) + 1;
  monde.compteurs.detours++;
  const foyer = monde.essaim.foyers[reaction.foyer];
  journaliser(monde, {type: "reaction", nature: "detour", drone: drone.id, point: {...reaction.detour}, foyer: {geo: {...foyer.geo}, pertes: foyer.pertes}});
}

/** Faire décider chaque drone en vol, si la connaissance de l'essaim a changé depuis la dernière décision. */
function decider(monde) {
  const {essaim, scenario} = monde;
  const reaction = algo(monde.registre, scenario.rouge.reaction, "reaction");
  const contexte = {reglages: scenario.rouge, cibles: monde.cibles.map((c) => c.geo), foyers: essaim.foyers, bilans: essaim.bilans};
  for (const drone of monde.drones) {
    if (!drone.vivant || drone.arrive || monde.t < drone.depart) continue;
    const vue = {
      geo: drone.geo, cible: drone.cible, route: drone.route.map((p) => p.geo),
      reaffectations: drone.reaffectations ?? 0, detours: drone.detours ?? 0,
    };
    const choix = reaction.reagir(contexte, vue, OUTILS);
    if (choix) appliquer(monde, drone, choix);
  }
}

/** Faire réagir l'essaim à cet instant : émettre les faits nouveaux, recevoir ceux arrivés, décider au pas Δ_r. */
export function faire_reagir(monde) {
  const {essaim} = monde;
  emettre(monde);
  recevoir(monde);
  if (monde.t < essaim.prochaine_decision || essaim.version === essaim.version_decidee) return;
  essaim.prochaine_decision = monde.t + monde.scenario.rouge.reaction_pas;
  essaim.version_decidee = essaim.version;
  decider(monde);
}

/** Rendre l'effet de l'esquive pour le monde (§ 22.4) : {reduction, perte_vitesse}, nuls si l'essaim ne réagit pas. */
export function effet_esquive(monde) {
  if (!monde.essaim) return {reduction: 0, perte_vitesse: 0};
  return (monde.essaim.esquive ??= algo(monde.registre, monde.scenario.rouge.reaction, "reaction").esquive(monde.scenario.rouge));
}
