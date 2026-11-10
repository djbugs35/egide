// Radio de la conduite (MODELE § 30) : le journal du moteur lu comme des échanges radio sous-titrés. Pur, testé.
// Indicatifs inventés : aucun n'appartient à une unité réelle.

const INDICATIFS = ["Faucon", "Busard", "Milan", "Épervier", "Harfang", "Autour", "Circaète", "Hobereau"];
const PRIORITES = {impact: 3, mission: 2, contact: 2, tir: 1, detection: 1};
export const INTERVALLE_RADIO_MS = 1500;

/** Rendre l'indicatif d'un avion : celui de son groupe et son rang dans le groupe (« Busard 2 »). */
export function indicatif(monde, idAvion) {
  const avion = monde.avions[idAvion];
  if (!avion) return "Inconnu";
  const groupe = monde.scenario.avions.indexOf(avion.groupe);
  const rang = monde.avions.filter((a) => a.groupe === avion.groupe && a.id <= avion.id).length;
  return `${INDICATIFS[groupe % INDICATIFS.length]} ${rang}`;
}

/** Rendre le message radio d'un évènement, ou null s'il ne se dit pas à la radio. */
function message(monde, e) {
  switch (e.type) {
    case "impact": return `Égide, à tous : impact sur ${monde.cibles[e.cible]?.conduite ? "le CDC" : `C${e.cible + 1}`}.`;
    case "mission": return `Égide à ${indicatif(monde, e.avion)} : rejoignez la zone${e.effectif ? `, ${e.effectif} pistes` : ""}.`;
    case "contact": return `${indicatif(monde, e.avion)} : contact, j'engage.`;
    case "tir": return e.couche === "air" ? `${indicatif(monde, e.tireur)} : ${e.detruit ? "au but" : "manqué, je reprends"}.` : null;
    case "detection": return e.radar >= 0 ? `Vigie ${e.radar + 1} : nouvelle piste.` : null;
    default: return null;
  }
}

/** Rendre le message le plus important d'un lot d'évènements du journal, ou null (MODELE § 30). */
export function message_du_lot(monde, lot) {
  let meilleur = null;
  for (const e of lot) {
    const priorite = PRIORITES[e.type] ?? 0;
    if (!priorite || (meilleur && priorite <= meilleur.priorite)) continue;
    const texte = message(monde, e);
    if (texte) meilleur = {priorite, texte};
  }
  return meilleur?.texte ?? null;
}
