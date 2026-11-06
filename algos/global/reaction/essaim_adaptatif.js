// Essaim adaptatif : l'essaim apprend de ses pertes, se réaffecte, contourne et esquive (MODELE § 22).
// Aucun import : géodésie en argument ; aucun tirage : la réaction ne consomme pas le hasard du monde.

export const meta = {
  role: "reaction",
  nom: "Essaim adaptatif (pertes partagées)",
  fidelite: "notionnel",
  description: "Chaque drone apprend par le réseau maillé de l'essaim où ses semblables tombent et où ils frappent : il quitte une cible qui tue pour une cible qui laisse passer, contourne les foyers de pertes sur sa route et manœuvre quand une roquette le vise.",
  equations: [
    "ŝ_k = (F_k + 1) / (F_k + P_k + 2) (succession de Laplace)",
    "réaffectation si F_k ≥ 1, ŝ_k − ŝ_c ≥ g et d_k ≤ (1 + a) d_c",
    "y = R asin(sin(d_f / R) sin(α_f − α_w)) ; x = R acos(cos(d_f / R) / cos(y / R))",
    "détour : azimut α_f ∓ asin(ρ / d_f), distance √(d_f² − ρ²), ρ = 1,3 r_d",
    "Pk esquivé = Pk (1 − e) ; progression × (1 − v_e) pendant le vol de la roquette",
  ],
  hypotheses: [
    "Réseau maillé connexe : toute perte et toute frappe sont connues de tout l'essaim après un délai",
    "L'essaim ne voit pas la défense, il n'apprend que par ses pertes",
    "Seuls les foyers autour d'une autre cible (sites défendus fixes) sont contournés",
    "Approximation sphérique (R = 6 371 km) pour la seule décision de contournement",
    "Esquive agrégée : Pk réduit, sans loi de guidage ni de manœuvre",
  ],
  domaine_validite: "Raids où les pertes se concentrent en quelques foyers (postes sur les cibles, orbites d'avions) ; décisions à l'échelle de la dizaine de kilomètres.",
  references: ["Égide, docs/MODELE.md § 22", "Laplace, Essai philosophique sur les probabilités (1814), règle de succession"],
  parametres: {
    reaction_delai: {unite: "s", aide: "Délai de diffusion d'une perte ou d'une frappe dans l'essaim (rouge.reaction_delai_s)."},
    reaction_pas: {unite: "s", aide: "Période des décisions de réaction (rouge.reaction_pas_s)."},
    reaction_rayon_danger: {unite: "m", aide: "Rayon d'un foyer de pertes (rouge.reaction_rayon_danger_km)."},
    reaction_seuil_pertes: {unite: "", aide: "Pertes à partir desquelles un foyer est tenu pour défendu (rouge.reaction_seuil_pertes)."},
    reaction_allongement_max: {unite: "", aide: "Allongement relatif accepté pour une réaffectation ou un détour (rouge.reaction_allongement_max)."},
    reaction_seuil_gain: {unite: "", aide: "Gain de survie estimée qui déclenche une réaffectation (rouge.reaction_seuil_gain)."},
    reaction_reaffectations_max: {unite: "", aide: "Réaffectations au plus par drone (rouge.reaction_reaffectations_max)."},
    reaction_detours_max: {unite: "", aide: "Détours au plus par drone (rouge.reaction_detours_max)."},
    reaction_esquive_reduction: {unite: "", aide: "Fraction du Pk air retirée par l'esquive (rouge.reaction_esquive_reduction)."},
    reaction_esquive_perte_vitesse: {unite: "", aide: "Fraction de progression perdue pendant l'esquive (rouge.reaction_esquive_perte_vitesse)."},
  },
};

// Rayon de la sphère locale de décision (MODELE § 22.3) : l'écart à l'ellipsoïde est sans effet à 10 km près.
const RAYON_TERRE = 6_371_000;
// Le détour passe à 1,3 r_d du centre du foyer : la branche suivante ne recoupe pas le cercle d'alerte.
const MARGE_DETOUR = 1.3;

/** Rendre la survie estimée au terminal de chaque cible : (F + 1) / (F + P + 2) (MODELE § 22.1). */
export const survies = (bilans) => bilans.map(({frappes, pertes}) => (frappes + 1) / (frappes + pertes + 2));

/** Rendre l'indice de la cible vers laquelle se réaffecter, ou null (MODELE § 22.2). */
function meilleure_cible(contexte, drone, outils) {
  const {reglages: r, cibles} = contexte;
  if (drone.reaffectations >= r.reaction_reaffectations_max) return null;
  const survie = survies(contexte.bilans);
  const distances = cibles.map((cible) => outils.inverse(drone.geo, cible).distance);
  const actuelle = distances[drone.cible];
  // Engagé sur sa cible : il n'en change plus.
  if (actuelle <= r.reaction_rayon_danger) return null;
  let retenue = null;
  let meilleure = survie[drone.cible] + r.reaction_seuil_gain;
  distances.forEach((distance, k) => {
    // Brèche avérée seulement : une cible encore jamais frappée n'est pas réputée ouverte.
    if (k === drone.cible || contexte.bilans[k].frappes === 0 || distance > (1 + r.reaction_allongement_max) * actuelle) return;
    if (survie[k] >= meilleure) [retenue, meilleure] = [k, survie[k]];
  });
  return retenue;
}

/** Rendre {x, y} (m) : abscisse le long de la branche d'azimut `azimut` et écart latéral (> 0 à droite) d'un point. */
function projeter(distance, azimutPoint, azimut) {
  const ecart = azimutPoint - azimut;
  const y = RAYON_TERRE * Math.asin(Math.sin(distance / RAYON_TERRE) * Math.sin(ecart));
  const x = RAYON_TERRE * Math.acos(Math.min(1, Math.cos(distance / RAYON_TERRE) / Math.cos(y / RAYON_TERRE)));
  return {x: Math.cos(ecart) > 0 ? x : -x, y};
}

/** Rendre le foyer défendu le plus proche sur la branche en cours, hors foyers de sa propre cible, ou null. */
function foyer_sur_le_chemin(contexte, drone, branche, outils) {
  const {reglages: r, foyers, cibles} = contexte;
  let retenu = null;
  for (const [indice, foyer] of foyers.entries()) {
    if (foyer.pertes < r.reaction_seuil_pertes) continue;
    // Seuls les sites défendus fixes valent un détour : les pertes dues aux avions suivent des avions qui bougent.
    const sites = cibles.flatMap((cible, k) => (outils.inverse(foyer.geo, cible).distance <= r.reaction_rayon_danger ? [k] : []));
    if (sites.length === 0 || sites.includes(drone.cible)) continue;
    const {distance, azimut_depart: azimut} = outils.inverse(drone.geo, foyer.geo);
    // Déjà dans le foyer : trop tard pour le contourner.
    if (distance <= r.reaction_rayon_danger) continue;
    const {x, y} = projeter(distance, azimut, branche.azimut_depart);
    if (x <= 0 || x >= branche.distance || Math.abs(y) >= r.reaction_rayon_danger) continue;
    if (!retenu || distance < retenu.distance) retenu = {indice, distance, azimut, y};
  }
  return retenu;
}

/** Rendre le point de détour autour de `foyer` (tangente au cercle ρ), ou null s'il allonge trop la branche. */
function point_de_detour(contexte, drone, branche, foyer, but, outils) {
  const rho = MARGE_DETOUR * contexte.reglages.reaction_rayon_danger;
  // Foyer à droite de la branche (y > 0) : on passe à gauche, et inversement.
  const azimut = foyer.azimut + (foyer.y > 0 ? -1 : 1) * Math.asin(Math.min(1, rho / foyer.distance));
  const point = outils.direct(drone.geo, azimut, Math.sqrt(Math.max(foyer.distance ** 2 - rho ** 2, 0)));
  const allonge = outils.inverse(drone.geo, point).distance + outils.inverse(point, but).distance - branche.distance;
  return allonge > contexte.reglages.reaction_allongement_max * branche.distance ? null : point;
}

/**
 * Rendre la réaction d'un drone, ou null : {cible} pour une réaffectation, {detour, foyer} pour un point de détour
 * à insérer avant le prochain point de route. `contexte` : {reglages (rouge, SI), cibles [geo], foyers
 * [{geo, pertes}], bilans [{pertes, frappes}] par cible} ; `drone` : {geo, cible, route [geo], reaffectations, detours}.
 */
export function reagir(contexte, drone, outils) {
  const cible = meilleure_cible(contexte, drone, outils);
  if (cible !== null) return {cible};
  if (drone.detours >= contexte.reglages.reaction_detours_max || drone.route.length === 0) return null;
  const but = drone.route[0];
  const branche = outils.inverse(drone.geo, but);
  const foyer = foyer_sur_le_chemin(contexte, drone, branche, outils);
  if (!foyer) return null;
  const detour = point_de_detour(contexte, drone, branche, foyer, but, outils);
  return detour ? {detour, foyer: foyer.indice} : null;
}

/** Rendre l'effet de l'esquive d'un drone visé par un tir air : {reduction du Pk, perte de progression} (§ 22.4). */
export const esquive = (reglages) => ({reduction: reglages.reaction_esquive_reduction, perte_vitesse: reglages.reaction_esquive_perte_vitesse});
