// Radars placés un à un sur la carte : chacun voit à son horizon (MODELE § 15.1).

export const meta = {
  role: "detection",
  nom: "Radars placés",
  fidelite: "notionnel",
  description: "Chaque radar est un site placé sur la carte ; un drone est vu dès qu'il entre dans la portée d'au moins l'un d'eux (distance oblique).",
  equations: [
    "d = min(√(2 k R_T) (√h_r + √h_c), portée max), k = 4/3",
    "vu ⇔ ∃ site : ‖P_drone − P_site‖² ≤ d² + (h_c − h_r)²  (positions ECEF)",
  ],
  hypotheses: ["Radar parfait dans sa portée : ni fausse alarme, ni perte de piste", "Relief ignoré", "Atmosphère standard (k = 4/3)", "Détection partagée par toute la défense (réseau entièrement connecté)"],
  domaine_validite: "Ordres de grandeur de couverture à basse altitude, sites au niveau du sol.",
  references: ["Égide, docs/MODELE.md § 2 et § 15.1", "M. I. Skolnik, Introduction to Radar Systems, 3e éd., McGraw-Hill, 2001 — horizon radar"],
  parametres: {
    hauteur_antenne: {unite: "m", aide: "Hauteur des antennes."},
    portee_max: {unite: "m", aide: "Portée instrumentée."},
    sites: {unite: "", aide: "Positions des radars (scénario : bleu.radar.sites)."},
    sites_unites: {unite: "", aide: "Unité propre de chaque site, s'il en a une (scénario : bleu.radar.sites[].unite) ; sinon celle du radar commun."},
  },
};

/** Rendre l'état de la couverture : sites en ECEF, seuils de distance, et rayon au-delà duquel rien n'est vu. */
export function preparer(scenario, radar, outils) {
  // Un site peut porter sa propre unité (déploiement, MODELE § 21.1) : sa hauteur d'antenne et sa portée priment.
  const sites = radar.sites.map((geo, i) => {
    const propre = radar.sites_unites?.[i] ?? radar;
    const portee = outils.portee_contre_menace(propre, scenario.rouge.altitude, scenario.rouge.ser_m2);
    return {geo, ecef: outils.vers_ecef(geo), portee, propre, seuil2: portee ** 2 + (scenario.rouge.altitude - geo.alt) ** 2};
  });
  const eloignement = sites.map((site) => outils.inverse(scenario.theatre.origine, site.geo).distance + site.portee);
  return {origine: scenario.theatre.origine, rayon_couverture: Math.max(scenario.theatre.zone_rayon, ...eloignement), sites, groupes: scenario.rouge.groupes ?? []};
}

/** Rendre le carré de la distance de détection de `site` contre `drone` : celle du groupe se calcule à son altitude du moment (MODELE § 27.2). */
function seuil_carre(etat, site, drone, outils) {
  if (drone.groupe === undefined) return site.seuil2;
  const portee = outils.portee_contre_menace(site.propre, drone.geo.alt, etat.groupes[drone.groupe].ser_m2);
  return portee ** 2 + (drone.geo.alt - site.geo.alt) ** 2;
}

/** Rendre les indices des sites dont la portée contient `drone` (réseau d'information, MODELE § 15.2). */
export function detecte_par(etat, drone, outils) {
  const {x, y, z} = drone.ecef;
  const voyants = [];
  etat.sites.forEach((site, i) => {
    const {ecef} = site;
    if ((x - ecef.x) ** 2 + (y - ecef.y) ** 2 + (z - ecef.z) ** 2 <= seuil_carre(etat, site, drone, outils)) voyants.push(i);
  });
  return voyants;
}

/** Rendre vrai si `drone` est dans la portée d'au moins un site. */
export function detecte(etat, drone, outils) {
  const {x, y, z} = drone.ecef;
  return etat.sites.some((site) => (x - site.ecef.x) ** 2 + (y - site.ecef.y) ** 2 + (z - site.ecef.z) ** 2 <= seuil_carre(etat, site, drone, outils));
}
