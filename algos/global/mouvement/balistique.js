// Trajectoire balistique simplifiée : arc parabolique au-dessus de la géodésique (MODELE § 27.3).

export const meta = {
  role: "mouvement",
  nom: "Arc balistique",
  fidelite: "notionnel",
  description: "Le mobile suit la géodésique du départ à la cible à vitesse au sol constante, à l'altitude d'une parabole dont le sommet est au milieu du trajet.",
  equations: ["h(s) = 4 H (s / L) (1 − s / L)"],
  hypotheses: ["Vitesse au sol constante", "Parabole symétrique : ni propulsion, ni rentrée atmosphérique, ni manœuvre"],
  domaine_validite: "Ordre de grandeur de l'altitude et du temps de vol, pour situer détection et engagement ; ne décrit aucun missile réel.",
  references: ["Égide, docs/MODELE.md § 27.3"],
  parametres: {},
  // Lit `mobile.trajectoire` et fait varier l'altitude : la conformité générale des mouvements ne s'y applique pas.
  trajectoire_propre: true,
};

/** Rendre la position {geo, ecef, atteints} après `distance` m de plus sur l'arc `mobile.trajectoire`. */
export function avancer(mobile, route, distance, outils) {
  const {depart, longueur, cap, apogee} = mobile.trajectoire;
  const parcouru = Math.min(outils.inverse(depart, mobile.geo).distance + distance, longueur);
  const fraction = parcouru / longueur;
  const {lat, lon} = outils.direct(depart, cap, parcouru);
  const geo = {lat, lon, alt: 4 * apogee * fraction * (1 - fraction)};
  return {geo, ecef: outils.vers_ecef(geo), atteints: fraction >= 1 ? route.length : 0};
}
