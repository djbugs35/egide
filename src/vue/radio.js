// Radio de la conduite (MODELE § 30) : le journal du moteur lu comme des échanges radio sous-titrés. Pur, testé.
// Indicatifs inventés : aucun n'appartient à une unité réelle.

import {t} from "../i18n.js";

const INDICATIFS = ["vue.radio.faucon", "vue.radio.busard", "vue.radio.milan", "vue.radio.epervier", "vue.radio.harfang", "vue.radio.autour", "vue.radio.circaete", "vue.radio.hobereau"];
const PRIORITES = {impact: 3, mission: 2, contact: 2, tir: 1, detection: 1};
export const INTERVALLE_RADIO_MS = 1500;

/** Rendre l'indicatif d'un avion : celui de son groupe et son rang dans le groupe (« Busard 2 »). */
export function indicatif(monde, idAvion) {
  const avion = monde.avions[idAvion];
  if (!avion) return t("vue.radio.inconnu");
  const groupe = monde.scenario.avions.indexOf(avion.groupe);
  const rang = monde.avions.filter((a) => a.groupe === avion.groupe && a.id <= avion.id).length;
  return `${t(INDICATIFS[groupe % INDICATIFS.length])} ${rang}`;
}

/** Rendre le message radio d'un évènement, ou null s'il ne se dit pas à la radio. */
function message(monde, e) {
  switch (e.type) {
    case "impact": return t("vue.radio.impact", {cible: monde.cibles[e.cible]?.conduite ? t("vue.journal.le_cdc") : `C${e.cible + 1}`});
    case "mission": return t(e.effectif ? "vue.radio.mission_pistes" : "vue.radio.mission", {qui: indicatif(monde, e.avion), n: e.effectif});
    case "contact": return t("vue.radio.contact", {qui: indicatif(monde, e.avion)});
    case "tir": return e.couche === "air" ? t(e.detruit ? "vue.radio.au_but" : "vue.radio.manque", {qui: indicatif(monde, e.tireur)}) : null;
    case "detection": return e.radar >= 0 ? t("vue.radio.detection", {n: e.radar + 1}) : null;
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
