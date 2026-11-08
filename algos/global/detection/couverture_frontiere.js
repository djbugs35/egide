// Couverture radar continue le long de la frontière, à l'horizon (MODELE § 2).

export const meta = {
  role: "detection",
  nom: "Couverture continue à la frontière",
  fidelite: "notionnel",
  description: "Des radars jalonnent la frontière : un drone est vu dès qu'il est à moins de l'horizon radar de la zone, mesuré au sol depuis le centre.",
  equations: ["d_h = √(2 k R_T) (√h_r + √h_c), k = 4/3", "vu ⇔ distance géodésique au centre ≤ R_zone + min(d_h, portée max)"],
  hypotheses: ["Radar parfait dans sa couverture : ni fausse alarme, ni perte de piste", "Relief ignoré", "Atmosphère standard (k = 4/3)"],
  domaine_validite: "Ordres de grandeur de délai de détection à basse altitude ; pas de masquage par le relief.",
  references: ["Égide, docs/MODELE.md § 2", "M. I. Skolnik, Introduction to Radar Systems, 3e éd., McGraw-Hill, 2001 — horizon radar"],
  parametres: {
    hauteur_antenne: {unite: "m", aide: "Hauteur des antennes."},
    portee_max: {unite: "m", aide: "Portée instrumentée."},
  },
};

/** Rendre l'état de la couverture : centre et rayon au sol au-delà duquel rien n'est vu. */
export function preparer(scenario, radar, outils) {
  const detection = outils.portee_contre_menace(radar, scenario.rouge.altitude, scenario.rouge.ser_m2);
  return {origine: scenario.theatre.origine, rayon_couverture: scenario.theatre.zone_rayon + detection, zone_rayon: scenario.theatre.zone_rayon, radar, groupes: scenario.rouge.groupes ?? []};
}

/** Rendre vrai si `drone` est dans la couverture. */
export function detecte(etat, drone, outils) {
  // MODELE § 27.2 : un groupe se détecte à sa propre altitude et selon sa propre SER.
  const rayon = drone.groupe === undefined ? etat.rayon_couverture : etat.zone_rayon + outils.portee_contre_menace(etat.radar, drone.geo.alt, etat.groupes[drone.groupe].ser_m2);
  return outils.inverse(etat.origine, drone.geo).distance <= rayon;
}
